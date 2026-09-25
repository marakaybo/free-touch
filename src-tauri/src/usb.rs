//! Подключение телефона по USB-кабелю через adb: для каждого телефона с включённой
//! отладкой по USB делаем `adb reverse`, и телефон видит программу как 127.0.0.1.
//! Задержка по кабелю — единицы миллисекунд, Wi-Fi не нужен.

use crate::core::CoreRef;
use serde::Serialize;
use std::collections::HashSet;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Emitter;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsbDevice {
    pub serial: String,
    /// device — готов, unauthorized — ждёт «Разрешить отладку» на телефоне, offline — нет связи.
    pub state: String,
    pub model: String,
    /// Проброс порта сделан — приложение на телефоне может подключаться.
    pub ready: bool,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsbStatus {
    pub enabled: bool,
    /// Путь к adb, если нашёлся.
    pub adb: Option<String>,
    pub devices: Vec<UsbDevice>,
    pub error: Option<String>,
    pub installing: bool,
}

pub struct Usb {
    pub status: Mutex<UsbStatus>,
}

impl Usb {
    pub fn new() -> Usb {
        Usb { status: Mutex::new(UsbStatus::default()) }
    }
}

fn no_window(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    cmd
}

fn adb_name() -> &'static str {
    if cfg!(windows) { "adb.exe" } else { "adb" }
}

/// Где искать adb: наш собственный (скачанный программой), Android SDK, PATH.
pub fn find_adb(core: &CoreRef) -> Option<PathBuf> {
    let own = core.dir.join("platform-tools").join(adb_name());
    if own.exists() {
        return Some(own);
    }
    for var in ["ANDROID_HOME", "ANDROID_SDK_ROOT"] {
        if let Ok(h) = std::env::var(var) {
            let p = PathBuf::from(h).join("platform-tools").join(adb_name());
            if p.exists() {
                return Some(p);
            }
        }
    }
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path).map(|d| d.join(adb_name())).find(|p| p.exists())
}

fn run(adb: &PathBuf, args: &[&str]) -> Result<String, String> {
    let out = no_window(Command::new(adb).args(args)).output().map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&out.stdout).to_string();
    if out.status.success() {
        Ok(text)
    } else {
        Err(format!("{}{}", text, String::from_utf8_lossy(&out.stderr)).trim().to_string())
    }
}

fn parse_devices(text: &str) -> Vec<UsbDevice> {
    text.lines()
        .skip(1)
        .filter_map(|l| {
            let mut parts = l.split_whitespace();
            let serial = parts.next()?.to_string();
            let state = parts.next()?.to_string();
            let model = parts
                .find_map(|p| p.strip_prefix("model:"))
                .map(|m| m.replace('_', " "))
                .unwrap_or_default();
            Some(UsbDevice { serial, state, model, ready: false })
        })
        .collect()
}

fn publish(core: &CoreRef, usb: &Usb, st: UsbStatus) {
    let changed = {
        let mut cur = usb.status.lock().unwrap();
        let changed = *cur != st;
        *cur = st.clone();
        changed
    };
    if changed {
        let _ = core.app.emit("ft-usb", st);
    }
}

pub fn spawn(core: CoreRef, usb: std::sync::Arc<Usb>) {
    std::thread::spawn(move || {
        // (серийный номер, порт), для которых проброс уже сделан
        let mut reversed: HashSet<(String, u16)> = HashSet::new();
        let mut server_started = false;
        loop {
            let s = core.settings();
            let installing = usb.status.lock().unwrap().installing;
            if !s.usb_enabled {
                publish(&core, &usb, UsbStatus { enabled: false, installing, ..Default::default() });
                reversed.clear();
                std::thread::sleep(Duration::from_secs(2));
                continue;
            }
            let Some(adb) = find_adb(&core) else {
                publish(&core, &usb, UsbStatus { enabled: true, installing, ..Default::default() });
                std::thread::sleep(Duration::from_secs(3));
                continue;
            };
            if !server_started {
                let _ = run(&adb, &["start-server"]);
                server_started = true;
            }
            let mut st = UsbStatus { enabled: true, adb: Some(adb.display().to_string()), installing, ..Default::default() };
            match run(&adb, &["devices", "-l"]) {
                Ok(text) => {
                    let mut devices = parse_devices(&text);
                    let present: HashSet<String> = devices.iter().map(|d| d.serial.clone()).collect();
                    reversed.retain(|(serial, _)| present.contains(serial));
                    for d in devices.iter_mut() {
                        if d.state != "device" {
                            continue;
                        }
                        let key = (d.serial.clone(), s.port);
                        if !reversed.contains(&key) {
                            let port = format!("tcp:{}", s.port);
                            match run(&adb, &["-s", &d.serial, "reverse", &port, &port]) {
                                Ok(_) => {
                                    reversed.insert(key);
                                }
                                Err(e) => st.error = Some(e),
                            }
                        }
                        d.ready = reversed.contains(&(d.serial.clone(), s.port));
                    }
                    st.devices = devices;
                }
                Err(e) => {
                    st.error = Some(e);
                    server_started = false;
                }
            }
            publish(&core, &usb, st);
            std::thread::sleep(Duration::from_secs(2));
        }
    });
}

/// Скачать Android platform-tools (adb) с сайта Google в папку программы.
pub fn install_adb(core: &CoreRef, usb: &Usb) -> Result<(), String> {
    usb.status.lock().unwrap().installing = true;
    let dir = core.dir.clone();
    let zip = dir.join("platform-tools.zip");
    let url = if cfg!(windows) {
        "https://dl.google.com/android/repository/platform-tools-latest-windows.zip"
    } else if cfg!(target_os = "macos") {
        "https://dl.google.com/android/repository/platform-tools-latest-darwin.zip"
    } else {
        "https://dl.google.com/android/repository/platform-tools-latest-linux.zip"
    };
    let script = format!(
        "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri '{url}' -OutFile '{zip}'; \
         if (Test-Path '{target}') {{ Remove-Item -Recurse -Force '{target}' }}; \
         Expand-Archive -Force -Path '{zip}' -DestinationPath '{dir}'; Remove-Item -Force '{zip}'",
        url = url,
        zip = zip.display(),
        target = dir.join("platform-tools").display(),
        dir = dir.display(),
    );
    let res = no_window(Command::new("powershell").args(["-NoProfile", "-NonInteractive", "-Command", &script]))
        .output()
        .map_err(|e| e.to_string())
        .and_then(|o| if o.status.success() { Ok(()) } else { Err(String::from_utf8_lossy(&o.stderr).trim().to_string()) });
    usb.status.lock().unwrap().installing = false;
    if res.is_ok() && !dir.join("platform-tools").join(adb_name()).exists() {
        return Err("adb не появился после распаковки".into());
    }
    res.map_err(|e| format!("Не удалось скачать adb: {}", e.lines().next().unwrap_or("")))
}
