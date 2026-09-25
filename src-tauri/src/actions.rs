//! Действия кнопок и их выполнение.

use crate::core::CoreRef;
use crate::obs::{pct_to_db, Obs};
use crate::{audio, input, sound, winsys};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;

#[derive(Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Action {
    Hotkey {
        #[serde(default)]
        keys: Vec<String>,
        #[serde(default)]
        hold: bool,
    },
    Text {
        #[serde(default)]
        text: String,
    },
    Open {
        #[serde(default)]
        target: String,
        #[serde(default)]
        args: String,
    },
    Command {
        #[serde(default)]
        command: String,
    },
    Media {
        #[serde(default)]
        key: String,
    },
    Volume {
        #[serde(default)]
        mode: String,
        #[serde(default)]
        value: f64,
        #[serde(default)]
        app: String,
    },
    Obs {
        #[serde(default)]
        op: String,
        #[serde(default)]
        mode: String,
        #[serde(default)]
        scene: String,
        #[serde(default)]
        input: String,
        #[serde(default)]
        source: String,
        #[serde(default)]
        collection: String,
        #[serde(default)]
        filter: String,
    },
    Page {
        #[serde(default)]
        page: String,
    },
    Delay {
        #[serde(default)]
        ms: u64,
    },
    Sound {
        #[serde(default)]
        file: String,
        #[serde(default = "hundred")]
        volume: f64,
        #[serde(default)]
        device: String,
        #[serde(default)]
        mode: String,
    },
    StopSounds,
    Device {
        #[serde(default)]
        input: bool,
        #[serde(default)]
        devices: Vec<String>,
    },
    Counter {
        #[serde(default)]
        name: String,
        #[serde(default)]
        op: String,
        #[serde(default)]
        value: i64,
        #[serde(default)]
        file: String,
    },
    Timer {
        #[serde(default)]
        name: String,
        #[serde(default)]
        op: String,
    },
    System {
        #[serde(default)]
        op: String,
    },
    Mouse {
        #[serde(default)]
        op: String,
        #[serde(default)]
        amount: i32,
    },
    Http {
        #[serde(default)]
        method: String,
        #[serde(default)]
        url: String,
        #[serde(default)]
        body: String,
        #[serde(default)]
        headers: String,
    },
    #[serde(other)]
    Unknown,
}

fn hundred() -> f64 {
    100.0
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SliderTarget {
    pub kind: String,
    pub input: String,
    pub app: String,
}

/// Кнопка из профиля — только те поля, которые нужны серверу.
#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ButtonDef {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub actions: Vec<Action>,
    pub long_actions: Vec<Action>,
    pub slider: Option<SliderDef>,
    /// Два состояния: нажатия по очереди выполняют actions и off_actions.
    pub toggle: bool,
    pub off_actions: Vec<Action>,
}

impl ButtonDef {
    pub fn toggle_key(&self) -> String {
        format!("toggle:{}", self.id)
    }

    /// Что выполнить при нажатии. Для кнопки с двумя состояниями — по очереди.
    pub fn press_actions(&self, core: &CoreRef) -> Vec<Action> {
        if !self.toggle {
            return self.actions.clone();
        }
        let key = self.toggle_key();
        let on = core.state_bool(&key);
        core.set_state(&key, json!(!on));
        if on { self.off_actions.clone() } else { self.actions.clone() }
    }
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SliderDef {
    pub target: SliderTarget,
}

pub fn find_button(core: &CoreRef, page: &str, button: &str) -> Option<ButtonDef> {
    let p = core.profile.read().unwrap();
    let pages = p["pages"].as_array()?;
    let pg = pages.iter().find(|x| x["id"] == page)?;
    let b = pg["buttons"].as_array()?.iter().find(|x| x["id"] == button)?;
    serde_json::from_value(b.clone()).ok()
}

fn media_code(key: &str) -> &'static str {
    match key {
        "next" => "MediaTrackNext",
        "prev" => "MediaTrackPrevious",
        "stop" => "MediaStop",
        "volUp" => "AudioVolumeUp",
        "volDown" => "AudioVolumeDown",
        "mute" => "AudioVolumeMute",
        _ => "MediaPlayPause",
    }
}

/// Выполнить список действий. `client` — кто нажал (для переходов по страницам
/// и удерживаемых клавиш), `hold_key` — ключ кнопки для удержания.
pub async fn run(core: &CoreRef, obs: &Arc<Obs>, actions: Vec<Action>, client: Option<u64>, hold_key: Option<String>) -> Vec<String> {
    let mut errors = Vec::new();
    for a in actions {
        if let Err(e) = run_one(core, obs, a, client, hold_key.as_deref()).await {
            errors.push(e);
        }
    }
    errors
}

async fn blocking<F: FnOnce() + Send + 'static>(f: F) {
    let _ = tokio::task::spawn_blocking(f).await;
}

async fn run_one(core: &CoreRef, obs: &Arc<Obs>, a: Action, client: Option<u64>, hold_key: Option<&str>) -> Result<(), String> {
    match a {
        Action::Hotkey { keys, hold } => {
            if keys.is_empty() {
                return Ok(());
            }
            if hold {
                if let (Some(c), Some(k)) = (client, hold_key) {
                    // Запись о кнопке создаётся сразу при нажатии (см. arm_hold). Если палец
                    // уже убран, записи нет: зажимать нельзя — клавиши залипнут, поэтому
                    // просто нажимаем и отпускаем.
                    {
                        let mut held = core.held.lock().unwrap();
                        if let Some(v) = held.get_mut(&(c, k.to_string())) {
                            input::keys_down(&keys);
                            v.extend(keys);
                            return Ok(());
                        }
                    }
                    blocking(move || input::tap(&keys)).await;
                    return Ok(());
                }
            }
            blocking(move || input::tap(&keys)).await;
        }
        Action::Text { text } => blocking(move || input::type_text(&text)).await,
        Action::Open { target, args } => {
            if target.trim().is_empty() {
                return Err("Не указано, что открыть".into());
            }
            blocking(move || open(&target, &args)).await;
        }
        Action::Command { command } => {
            if command.trim().is_empty() {
                return Ok(());
            }
            let mut cmd = std::process::Command::new("cmd");
            cmd.args(["/C", &command]);
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x0800_0000);
            }
            cmd.spawn().map_err(|e| format!("Команда не запустилась: {e}"))?;
        }
        Action::Media { key } => {
            let code = vec![media_code(&key).to_string()];
            blocking(move || input::tap(&code)).await;
        }
        Action::Volume { mode, value, app } => {
            let core2 = core.clone();
            blocking(move || volume(&core2, &mode, value, &app)).await;
        }
        Action::Obs { op, mode, scene, input, source, collection, filter } => {
            obs_action(obs, &op, &mode, &scene, &input, &source, &collection, &filter).await?;
        }
        Action::Sound { file, volume, device, mode } => {
            let core = core.clone();
            tokio::task::spawn_blocking(move || sound::play(&core, &file, volume, &device, &mode))
                .await
                .map_err(|e| e.to_string())??;
        }
        Action::StopSounds => sound::stop_all(core),
        Action::Device { input, devices } => {
            let name = tokio::task::spawn_blocking(move || winsys::switch_device(input, &devices))
                .await
                .map_err(|e| e.to_string())??;
            core.set_state(if input { "system.input" } else { "system.output" }, json!(name));
            // Громкость и выключение звука у нового устройства свои.
            let core2 = core.clone();
            blocking(move || audio::publish(&core2)).await;
        }
        Action::Counter { name, op, value, file } => {
            if name.trim().is_empty() {
                return Err("У счётчика нет имени".into());
            }
            let op = if op.is_empty() { "add".to_string() } else { op };
            let value = if op == "add" && value == 0 { 1 } else { value };
            core.counter(&name, &op, value, &file);
        }
        Action::Timer { name, op } => {
            if name.trim().is_empty() {
                return Err("У секундомера нет имени".into());
            }
            core.timer(&name, if op.is_empty() { "toggle" } else { &op });
        }
        Action::System { op } => system(&op).await?,
        Action::Mouse { op, amount } => blocking(move || input::mouse(&op, amount)).await,
        Action::Http { method, url, body, headers } => http(&method, &url, &body, &headers).await?,
        Action::Page { page } => {
            if let Some(c) = client {
                core.send_to(c, &json!({ "t": "goto", "page": page }));
            }
        }
        Action::Delay { ms } => tokio::time::sleep(Duration::from_millis(ms.min(60_000))).await,
        Action::Unknown => {}
    }
    Ok(())
}

fn volume(core: &CoreRef, mode: &str, value: f64, app: &str) {
    let app = app.trim();
    if app == "@mic" {
        return mic(core, mode, value);
    }
    let cur = if app.is_empty() {
        audio::master().map(|(v, m)| (v as f64 * 100.0, m))
    } else {
        audio::apps().into_iter().find(|a| a.exe == app.to_lowercase()).map(|a| (a.volume as f64 * 100.0, a.muted))
    };
    let Some((cur, muted)) = cur else { return };
    let step = if value > 0.0 { value } else { 5.0 };
    let (vol, mute) = match mode {
        "set" => (Some(value), None),
        "up" => (Some(cur + step), None),
        "down" => (Some(cur - step), None),
        "mute" => (None, Some(true)),
        "unmute" => (None, Some(false)),
        _ => (None, Some(!muted)),
    };
    if app.is_empty() {
        if let Some(v) = vol {
            audio::set_master((v / 100.0) as f32);
        }
        if let Some(m) = mute {
            audio::set_master_mute(m);
        }
    } else {
        audio::set_app(app, vol.map(|v| (v / 100.0) as f32), mute);
    }
    audio::publish(core);
}

/// Микрофон Windows (устройство записи по умолчанию).
fn mic(core: &CoreRef, mode: &str, value: f64) {
    let Some((cur, muted)) = winsys::mic() else { return };
    let cur = cur as f64 * 100.0;
    let step = if value > 0.0 { value } else { 5.0 };
    match mode {
        "set" => winsys::set_mic((value / 100.0) as f32),
        "up" => winsys::set_mic(((cur + step) / 100.0) as f32),
        "down" => winsys::set_mic(((cur - step) / 100.0) as f32),
        "mute" => winsys::set_mic_mute(true),
        "unmute" => winsys::set_mic_mute(false),
        _ => winsys::set_mic_mute(!muted),
    }
    winsys::publish_audio(core);
}

fn shutdown_cmd(args: &[&str]) -> Result<(), String> {
    let mut cmd = std::process::Command::new("shutdown");
    cmd.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

async fn system(op: &str) -> Result<(), String> {
    match op {
        "lock" => blocking(winsys::lock).await,
        "sleep" => blocking(winsys::sleep).await,
        "monitorOff" => blocking(winsys::monitor_off).await,
        "shutdown" => shutdown_cmd(&["/s", "/t", "0"])?,
        "restart" => shutdown_cmd(&["/r", "/t", "0"])?,
        "logoff" => shutdown_cmd(&["/l"])?,
        _ => {}
    }
    Ok(())
}

async fn http(method: &str, url: &str, body: &str, headers: &str) -> Result<(), String> {
    let url = url.trim();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("Адрес должен начинаться с http:// или https://".into());
    }
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent(concat!("FreeTouch/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    let m = reqwest::Method::from_bytes(method.trim().to_uppercase().as_bytes()).unwrap_or(reqwest::Method::GET);
    let has_body = !body.trim().is_empty() && m != reqwest::Method::GET;
    let mut req = client.request(m, url);
    let mut typed = false;
    for line in headers.lines() {
        if let Some((k, v)) = line.split_once(':') {
            typed |= k.trim().eq_ignore_ascii_case("content-type");
            req = req.header(k.trim(), v.trim());
        }
    }
    if has_body {
        if !typed {
            let t = body.trim_start();
            let ct = if t.starts_with('{') || t.starts_with('[') { "application/json" } else { "text/plain; charset=utf-8" };
            req = req.header("Content-Type", ct);
        }
        req = req.body(body.to_string());
    }
    let r = req.send().await.map_err(|e| {
        if e.is_timeout() { "Адрес не ответил за 10 секунд".to_string() } else { "Запрос не прошёл: нет связи с адресом".to_string() }
    })?;
    if !r.status().is_success() {
        return Err(format!("Адрес ответил ошибкой {}", r.status().as_u16()));
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn obs_action(
    obs: &Arc<Obs>,
    op: &str,
    mode: &str,
    scene: &str,
    input: &str,
    source: &str,
    collection: &str,
    filter: &str,
) -> Result<(), String> {
    let pick = |base: &str| match mode {
        "start" => format!("Start{base}"),
        "stop" => format!("Stop{base}"),
        _ => format!("Toggle{base}"),
    };
    match op {
        "scene" => obs.call("SetCurrentProgramScene", json!({ "sceneName": scene })).await.map(|_| ()),
        "collection" => {
            obs.call("SetCurrentSceneCollection", json!({ "sceneCollectionName": collection })).await.map(|_| ())
        }
        "stream" => obs.call(&pick("Stream"), json!({})).await.map(|_| ()),
        "record" => obs.call(&pick("Record"), json!({})).await.map(|_| ()),
        "recordPause" => obs.call("ToggleRecordPause", json!({})).await.map(|_| ()),
        "replay" => obs.call(&pick("ReplayBuffer"), json!({})).await.map(|_| ()),
        "saveReplay" => obs.call("SaveReplayBuffer", json!({})).await.map(|_| ()),
        "virtualcam" => obs.call(&pick("VirtualCam"), json!({})).await.map(|_| ()),
        "mute" => match mode {
            "start" => obs.call("SetInputMute", json!({ "inputName": input, "inputMuted": true })).await.map(|_| ()),
            "stop" => obs.call("SetInputMute", json!({ "inputName": input, "inputMuted": false })).await.map(|_| ()),
            _ => obs.call("ToggleInputMute", json!({ "inputName": input })).await.map(|_| ()),
        },
        "source" => {
            let id = obs.call("GetSceneItemId", json!({ "sceneName": scene, "sourceName": source })).await?["sceneItemId"]
                .as_i64()
                .ok_or("Источник не найден")?;
            let enabled = match mode {
                "start" => true,
                "stop" => false,
                _ => {
                    let cur = obs.call("GetSceneItemEnabled", json!({ "sceneName": scene, "sceneItemId": id })).await?;
                    !cur["sceneItemEnabled"].as_bool().unwrap_or(false)
                }
            };
            obs.call("SetSceneItemEnabled", json!({ "sceneName": scene, "sceneItemId": id, "sceneItemEnabled": enabled }))
                .await
                .map(|_| ())
        }
        "filter" => {
            let enabled = match mode {
                "start" => true,
                "stop" => false,
                _ => {
                    let cur = obs.call("GetSourceFilter", json!({ "sourceName": source, "filterName": filter })).await?;
                    !cur["filterEnabled"].as_bool().unwrap_or(false)
                }
            };
            obs.call("SetSourceFilterEnabled", json!({ "sourceName": source, "filterName": filter, "filterEnabled": enabled }))
                .await
                .map(|_| ())
        }
        _ => Ok(()),
    }
}

/// Слайдер двигают на телефоне.
pub async fn slide(core: &CoreRef, obs: &Arc<Obs>, t: &SliderTarget, value: f64) {
    let v = value.clamp(0.0, 100.0);
    match t.kind.as_str() {
        "obsInput" => {
            let _ = obs.call("SetInputVolume", json!({ "inputName": t.input, "inputVolumeDb": pct_to_db(v) })).await;
        }
        "mic" => {
            blocking(move || winsys::set_mic((v / 100.0) as f32)).await;
            core.set_state("system.micVolume", json!(v.round() as i64));
        }
        "app" => {
            let app = t.app.clone();
            blocking(move || audio::set_app(&app, Some((v / 100.0) as f32), None)).await;
            core.set_state(&format!("app.volume:{}", t.app.to_lowercase()), json!(v.round() as i64));
        }
        _ => {
            blocking(move || audio::set_master((v / 100.0) as f32)).await;
            core.set_state("system.volume", json!(v.round() as i64));
        }
    }
}

/// Кнопку нажали: если в ней есть удерживаемые клавиши, заводим запись заранее,
/// пока действия ещё не начали выполняться.
pub fn arm_hold(core: &CoreRef, client: u64, button: &ButtonDef) {
    if !button.toggle && button.actions.iter().any(|a| matches!(a, Action::Hotkey { hold: true, .. })) {
        core.held.lock().unwrap().insert((client, button.id.clone()), Vec::new());
    }
}

/// Отпустить клавиши, которые кнопка держала зажатыми.
pub fn release(core: &CoreRef, client: u64, key: Option<&str>) {
    let mut h = core.held.lock().unwrap();
    let ks: Vec<(u64, String)> =
        h.keys().filter(|(c, k)| *c == client && key.map_or(true, |kk| kk == k)).cloned().collect();
    for k in ks {
        if let Some(keys) = h.remove(&k) {
            input::keys_up(&keys);
        }
    }
}

#[cfg(windows)]
fn open(target: &str, args: &str) {
    use windows::core::HSTRING;
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE};
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
        let args = if args.trim().is_empty() { None } else { Some(HSTRING::from(args)) };
        let path = std::path::Path::new(target);
        let dir = if path.is_file() { path.parent().map(|p| HSTRING::from(p.as_os_str())) } else { None };
        let _ = ShellExecuteW(
            None,
            &HSTRING::from("open"),
            &HSTRING::from(target),
            args.as_ref().map(|a| a as &HSTRING).unwrap_or(&HSTRING::new()),
            dir.as_ref().map(|d| d as &HSTRING).unwrap_or(&HSTRING::new()),
            SW_SHOWNORMAL,
        );
    }
}

#[cfg(not(windows))]
fn open(target: &str, _args: &str) {
    let _ = std::process::Command::new("xdg-open").arg(target).spawn();
}
