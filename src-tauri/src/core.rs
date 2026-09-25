//! Общее состояние приложения: профиль, настройки, живые состояния и клиенты.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use tauri::{AppHandle, Emitter};
use tokio::sync::{broadcast, mpsc, watch};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct ObsSettings {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
    pub password: String,
}

impl Default for ObsSettings {
    fn default() -> Self {
        Self { enabled: true, host: "127.0.0.1".into(), port: 4455, password: String::new() }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub port: u16,
    pub token: String,
    pub obs: ObsSettings,
    pub start_minimized: bool,
    pub close_to_tray: bool,
    pub preferred_ip: String,
    /// Настройки OBS уже подтягивались из конфига obs-websocket.
    pub obs_autodetected: bool,
    /// Проверять обновления на GitHub при запуске.
    pub auto_update: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            port: 7474,
            token: String::new(),
            obs: ObsSettings::default(),
            start_minimized: false,
            close_to_tray: true,
            preferred_ip: String::new(),
            obs_autodetected: false,
            auto_update: true,
        }
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClientInfo {
    pub id: u64,
    pub name: String,
    pub addr: String,
    #[serde(skip)]
    pub tx: mpsc::UnboundedSender<String>,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub running: bool,
    pub port: u16,
    pub error: Option<String>,
}

pub struct Core {
    pub app: AppHandle,
    pub dir: PathBuf,
    pub profile: RwLock<Value>,
    pub settings: RwLock<Settings>,
    states: Mutex<HashMap<String, Value>>,
    /// Сообщения всем телефонам сразу (уже в JSON).
    pub bus: broadcast::Sender<Arc<str>>,
    pub clients: Mutex<HashMap<u64, ClientInfo>>,
    pub server: Mutex<ServerStatus>,
    /// Меняется при сохранении настроек — сервер и OBS перечитывают их.
    pub settings_rev: watch::Sender<u64>,
    /// Зажатые кнопками клавиши: (клиент, кнопка) → коды.
    pub held: Mutex<HashMap<(u64, String), Vec<String>>>,
}

pub type CoreRef = Arc<Core>;

impl Core {
    pub fn new(app: AppHandle, dir: PathBuf) -> CoreRef {
        let _ = std::fs::create_dir_all(&dir);
        let mut settings: Settings = read_json(&dir.join("settings.json")).unwrap_or_default();
        if settings.token.len() < 16 {
            settings.token = new_token();
        }
        let profile: Value = read_json(&dir.join("profile.json")).unwrap_or(Value::Null);
        // Копия профиля с прошлого запуска — на случай, если что-то испортится.
        if !profile.is_null() {
            let _ = std::fs::copy(dir.join("profile.json"), dir.join("profile.backup.json"));
        }
        let (bus, _) = broadcast::channel(256);
        let (settings_rev, _) = watch::channel(0);
        let core = Arc::new(Core {
            app,
            dir,
            profile: RwLock::new(profile),
            settings: RwLock::new(settings),
            states: Mutex::new(HashMap::new()),
            bus,
            clients: Mutex::new(HashMap::new()),
            server: Mutex::new(ServerStatus::default()),
            settings_rev,
            held: Mutex::new(HashMap::new()),
        });
        core.save_settings_file();
        core
    }

    /// Версия из tauri.conf.json — по ней же работает автообновление.
    pub fn version(&self) -> String {
        self.app.package_info().version.to_string()
    }

    pub fn settings(&self) -> Settings {
        self.settings.read().unwrap().clone()
    }

    pub fn set_settings(&self, s: Settings) {
        *self.settings.write().unwrap() = s;
        self.save_settings_file();
        self.settings_rev.send_modify(|v| *v += 1);
    }

    fn save_settings_file(&self) {
        let s = self.settings.read().unwrap().clone();
        write_json(&self.dir.join("settings.json"), &s);
    }

    pub fn set_profile(&self, p: Value) {
        write_json(&self.dir.join("profile.json"), &p);
        *self.profile.write().unwrap() = p.clone();
        self.broadcast(&json!({ "t": "profile", "profile": p }));
    }

    pub fn broadcast(&self, msg: &Value) {
        let _ = self.bus.send(Arc::from(msg.to_string()));
    }

    pub fn send_to(&self, client: u64, msg: &Value) {
        if let Some(c) = self.clients.lock().unwrap().get(&client) {
            let _ = c.tx.send(msg.to_string());
        }
    }

    // ---- живые состояния ----

    pub fn set_state(&self, key: &str, value: Value) {
        {
            let mut st = self.states.lock().unwrap();
            if st.get(key) == Some(&value) {
                return;
            }
            st.insert(key.to_string(), value.clone());
        }
        let msg = json!({ "t": "state", "key": key, "value": value });
        self.broadcast(&msg);
        let _ = self.app.emit("ft-state", json!({ "key": key, "value": value }));
    }

    pub fn remove_states_with_prefix(&self, prefix: &str) {
        let keys: Vec<String> = {
            let st = self.states.lock().unwrap();
            st.keys().filter(|k| k.starts_with(prefix)).cloned().collect()
        };
        for k in keys {
            self.states.lock().unwrap().remove(&k);
            let msg = json!({ "t": "state", "key": k, "value": Value::Null });
            self.broadcast(&msg);
            let _ = self.app.emit("ft-state", json!({ "key": k, "value": Value::Null }));
        }
    }

    pub fn states_snapshot(&self) -> HashMap<String, Value> {
        self.states.lock().unwrap().clone()
    }

    pub fn emit_clients(&self) {
        let list: Vec<ClientInfo> = self.clients.lock().unwrap().values().cloned().collect();
        let _ = self.app.emit("ft-clients", list);
    }
}

pub fn new_token() -> String {
    use rand::Rng;
    let mut rng = rand::rng();
    (0..24).map(|_| format!("{:x}", rng.random_range(0..16u8))).collect()
}

pub fn read_json<T: serde::de::DeserializeOwned>(p: &PathBuf) -> Option<T> {
    let s = std::fs::read_to_string(p).ok()?;
    serde_json::from_str(&s).ok()
}

pub fn write_json<T: Serialize>(p: &PathBuf, v: &T) {
    if let Ok(s) = serde_json::to_string_pretty(v) {
        let tmp = p.with_extension("tmp");
        if std::fs::write(&tmp, s).is_ok() {
            let _ = std::fs::rename(&tmp, p);
        }
    }
}
