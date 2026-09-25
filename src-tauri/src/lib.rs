mod actions;
mod audio;
mod core;
mod input;
mod obs;
mod server;

use crate::core::{Core, CoreRef, Settings};
use crate::obs::Obs;
use serde::Serialize;
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

struct AppState {
    core: CoreRef,
    obs: Arc<Obs>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NetIp {
    ip: String,
    name: String,
    /// Похоже на домашнюю сеть (Wi-Fi/Ethernet), а не на VPN.
    lan: bool,
}

fn lan_ips() -> Vec<NetIp> {
    let vpn_words = ["vpn", "wireguard", "amnezia", "warp", "cloudflare", "tap", "tun", "wintun", "vethernet", "virtual", "hyper-v", "vmware", "virtualbox", "zerotier", "hamachi", "radmin", "tailscale", "outline", "sing", "xray", "loopback"];
    let mut out: Vec<NetIp> = local_ip_address::list_afinet_netifas()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|(name, ip)| match ip {
            std::net::IpAddr::V4(v4) if !v4.is_loopback() && !v4.is_link_local() => {
                let o = v4.octets();
                let private = o[0] == 10 || (o[0] == 192 && o[1] == 168) || (o[0] == 172 && (16..32).contains(&o[1]));
                let lname = name.to_lowercase();
                let vpnish = vpn_words.iter().any(|w| lname.contains(w));
                Some(NetIp { ip: v4.to_string(), name, lan: private && !vpnish })
            }
            _ => None,
        })
        .collect();
    // Сначала домашняя сеть, внутри неё — 192.168.*.
    out.sort_by_key(|n| (!n.lan, !n.ip.starts_with("192.168."), n.ip.clone()));
    out.dedup_by(|a, b| a.ip == b.ip);
    out
}

#[tauri::command]
fn bootstrap(st: State<AppState>) -> Value {
    let core = &st.core;
    json!({
        "version": core.version(),
        "pc": server::pc_name(),
        "profile": core.profile.read().unwrap().clone(),
        "settings": core.settings(),
        "states": core.states_snapshot(),
        "server": core.server.lock().unwrap().clone(),
        "obs": st.obs.meta.lock().unwrap().clone(),
        "clients": core.clients.lock().unwrap().values().cloned().collect::<Vec<_>>(),
        "ips": lan_ips(),
    })
}

#[tauri::command]
fn save_profile(profile: Value, st: State<AppState>) {
    st.core.set_profile(profile);
}

#[tauri::command]
fn save_settings(settings: Settings, st: State<AppState>) -> Settings {
    let mut s = settings;
    if s.token.len() < 16 {
        s.token = st.core.settings().token;
    }
    if s.port < 1024 {
        s.port = 7474;
    }
    st.core.set_settings(s.clone());
    s
}

#[tauri::command]
fn regenerate_token(st: State<AppState>) -> Settings {
    let mut s = st.core.settings();
    s.token = core::new_token();
    st.core.set_settings(s.clone());
    s
}

#[tauri::command]
fn net_ips() -> Vec<NetIp> {
    lan_ips()
}

#[tauri::command]
fn pair_qr(url: String) -> Result<String, String> {
    let code = qrcode::QrCode::with_error_correction_level(url.as_bytes(), qrcode::EcLevel::M).map_err(|e| e.to_string())?;
    Ok(code
        .render::<qrcode::render::svg::Color>()
        .min_dimensions(240, 240)
        .quiet_zone(true)
        .dark_color(qrcode::render::svg::Color("#0C0D11"))
        .light_color(qrcode::render::svg::Color("#FFFFFF"))
        .build())
}

#[tauri::command]
async fn test_actions(actions: Vec<Value>, st: State<'_, AppState>) -> Result<Vec<String>, String> {
    let list: Vec<actions::Action> = actions.into_iter().filter_map(|a| serde_json::from_value(a).ok()).collect();
    Ok(actions::run(&st.core, &st.obs, list, None, None).await)
}

#[tauri::command]
fn obs_detect() -> Option<Value> {
    obs::detect().map(|(port, password, enabled)| json!({ "port": port, "password": password, "enabled": enabled }))
}

#[tauri::command]
fn audio_apps() -> Vec<String> {
    audio::apps().into_iter().map(|a| a.exe).collect()
}

#[tauri::command]
fn read_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text(path: String, text: String) -> Result<(), String> {
    std::fs::write(&path, text).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_image(path: String) -> Result<String, String> {
    use base64::Engine;
    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    if data.len() > 12 * 1024 * 1024 {
        return Err("Файл больше 12 МБ".into());
    }
    let mime = mime_guess::from_path(&path).first_or_octet_stream();
    Ok(format!("data:{};base64,{}", mime, base64::engine::general_purpose::STANDARD.encode(data)))
}

/// Правило брандмауэра для входящих подключений телефонов. Нужны права
/// администратора, поэтому Windows покажет запрос UAC.
#[tauri::command]
fn allow_firewall() -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::core::HSTRING;
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_HIDE;
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let rule = "name=\"Free Touch\"";
        let cmd = format!(
            "/S /C \"netsh advfirewall firewall delete rule {rule} >nul 2>&1 & netsh advfirewall firewall add rule {rule} dir=in action=allow program=\"{}\" enable=yes profile=any\"",
            exe.display()
        );
        let r = unsafe {
            ShellExecuteW(None, &HSTRING::from("runas"), &HSTRING::from("cmd.exe"), &HSTRING::from(cmd), &HSTRING::new(), SW_HIDE)
        };
        if (r.0 as isize) <= 32 {
            return Err("Разрешение не выдано".into());
        }
    }
    Ok(())
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn spawn_sysmon(core: CoreRef) {
    std::thread::spawn(move || {
        let mut sys = sysinfo::System::new();
        loop {
            sys.refresh_cpu_usage();
            sys.refresh_memory();
            core.set_state("system.cpu", json!(sys.global_cpu_usage().round() as i64));
            let total = sys.total_memory().max(1);
            core.set_state("system.ram", json!(((sys.used_memory() as f64 / total as f64) * 100.0).round() as i64));
            std::thread::sleep(std::time::Duration::from_secs(2));
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .setup(|app| {
            let handle = app.handle().clone();
            let dir = app.path().app_data_dir()?;
            let core = Core::new(handle.clone(), dir);

            // Первый запуск: подтягиваем порт и пароль из конфига OBS.
            let mut s = core.settings();
            if !s.obs_autodetected {
                if let Some((port, password, _)) = obs::detect() {
                    s.obs.port = port;
                    s.obs.password = password;
                }
                s.obs_autodetected = true;
                core.set_settings(s.clone());
            }

            let obs = Obs::new();
            server::spawn(core.clone(), obs.clone());
            obs::spawn(core.clone(), obs.clone());
            audio::spawn_poller(core.clone());
            spawn_sysmon(core.clone());
            app.manage(AppState { core: core.clone(), obs });

            let open = MenuItem::with_id(app, "open", "Открыть Free Touch", true, None::<&str>)?;
            let pair = MenuItem::with_id(app, "pair", "Подключить телефон", true, None::<&str>)?;
            let exit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &pair, &exit])?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().cloned().unwrap())
                .tooltip("Free Touch")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "open" => show_main(app),
                    "pair" => {
                        show_main(app);
                        let _ = app.emit("ft-open-pair", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            let hidden = std::env::args().any(|a| a == "--hidden") || s.start_minimized;
            if !hidden {
                show_main(&handle);
            }
            Ok(())
        })
        .on_window_event(|w, e| {
            if let WindowEvent::CloseRequested { api, .. } = e {
                let st = w.state::<AppState>();
                if st.core.settings().close_to_tray {
                    api.prevent_close();
                    let _ = w.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            save_profile,
            save_settings,
            regenerate_token,
            net_ips,
            pair_qr,
            test_actions,
            obs_detect,
            audio_apps,
            read_text,
            write_text,
            read_image,
            allow_firewall,
            quit
        ])
        .run(tauri::generate_context!())
        .expect("error while running Free Touch");
}
