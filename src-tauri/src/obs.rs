//! Клиент obs-websocket v5. Держит соединение, переподключается сам,
//! переводит события OBS в живые состояния для подсветки кнопок.

use crate::core::CoreRef;
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Emitter;
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::tungstenite::Message;

#[derive(Serialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ObsMeta {
    pub connected: bool,
    pub error: Option<String>,
    pub version: String,
    pub scenes: Vec<String>,
    pub collections: Vec<String>,
    /// Входы, у которых есть звук (их можно выключать и крутить громкость).
    pub audio_inputs: Vec<String>,
    pub inputs: Vec<String>,
    /// Сцена → источники в ней.
    pub sources: HashMap<String, Vec<String>>,
}

type Pending = Arc<Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>>;

pub struct Obs {
    out: Mutex<Option<mpsc::UnboundedSender<Message>>>,
    pending: Pending,
    seq: AtomicU64,
    pub meta: Mutex<ObsMeta>,
    /// (сцена, id элемента) → имя источника; нужно для событий видимости.
    items: Mutex<HashMap<(String, i64), String>>,
}

impl Obs {
    pub fn new() -> Arc<Obs> {
        Arc::new(Obs {
            out: Mutex::new(None),
            pending: Arc::new(Mutex::new(HashMap::new())),
            seq: AtomicU64::new(1),
            meta: Mutex::new(ObsMeta::default()),
            items: Mutex::new(HashMap::new()),
        })
    }

    pub async fn call(&self, rtype: &str, data: Value) -> Result<Value, String> {
        let tx = self.out.lock().unwrap().clone().ok_or("OBS не подключён")?;
        let id = format!("ft{}", self.seq.fetch_add(1, Ordering::Relaxed));
        let (rtx, rrx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id.clone(), rtx);
        let msg = json!({ "op": 6, "d": { "requestType": rtype, "requestId": id, "requestData": data } });
        tx.send(Message::Text(msg.to_string().into())).map_err(|_| "OBS отключился".to_string())?;
        match tokio::time::timeout(Duration::from_secs(5), rrx).await {
            Ok(Ok(r)) => r,
            _ => {
                self.pending.lock().unwrap().remove(&id);
                Err(format!("OBS не ответил на {rtype}"))
            }
        }
    }
}

fn auth_string(password: &str, salt: &str, challenge: &str) -> String {
    let b64 = base64::engine::general_purpose::STANDARD;
    let secret = b64.encode(Sha256::digest(format!("{password}{salt}").as_bytes()));
    b64.encode(Sha256::digest(format!("{secret}{challenge}").as_bytes()))
}

fn db_to_pct(db: f64) -> i64 {
    if db <= -60.0 {
        0
    } else {
        (((db + 60.0) / 60.0) * 100.0).round().clamp(0.0, 100.0) as i64
    }
}

pub fn pct_to_db(p: f64) -> f64 {
    if p <= 0.0 {
        -100.0
    } else {
        (p.clamp(0.0, 100.0) / 100.0) * 60.0 - 60.0
    }
}

fn emit_meta(core: &CoreRef, obs: &Obs) {
    let m = obs.meta.lock().unwrap().clone();
    let _ = core.app.emit("ft-obs", m);
}

fn set_error(core: &CoreRef, obs: &Obs, err: Option<String>) {
    {
        let mut m = obs.meta.lock().unwrap();
        if m.error == err && !m.connected {
            return;
        }
        *m = ObsMeta { error: err, ..Default::default() };
    }
    obs.items.lock().unwrap().clear();
    core.set_state("obs.connected", json!(false));
    emit_meta(core, obs);
}

pub fn spawn(core: CoreRef, obs: Arc<Obs>) {
    tauri::async_runtime::spawn(async move {
        let mut rev = core.settings_rev.subscribe();
        loop {
            let cfg = core.settings().obs;
            if !cfg.enabled {
                set_error(&core, &obs, Some("Выключено в настройках".into()));
                let _ = rev.changed().await;
                continue;
            }
            let res = tokio::select! {
                r = session(&core, &obs, &cfg.host, cfg.port, &cfg.password) => r,
                _ = rev.changed() => Err(String::new()),
            };
            *obs.out.lock().unwrap() = None;
            for (_, tx) in obs.pending.lock().unwrap().drain() {
                let _ = tx.send(Err("OBS отключился".into()));
            }
            match res {
                Err(e) if e.is_empty() => {
                    set_error(&core, &obs, None);
                    continue; // настройки поменялись — сразу пробуем снова
                }
                Err(e) => set_error(&core, &obs, Some(e)),
                Ok(()) => set_error(&core, &obs, Some("OBS закрыт".into())),
            }
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(3)) => {}
                _ = rev.changed() => {}
            }
        }
    });
}

async fn session(core: &CoreRef, obs: &Arc<Obs>, host: &str, port: u16, password: &str) -> Result<(), String> {
    let url = format!("ws://{host}:{port}");
    let (ws, _) = tokio::time::timeout(Duration::from_secs(4), tokio_tungstenite::connect_async(&url))
        .await
        .map_err(|_| "OBS не отвечает".to_string())?
        .map_err(|_| "OBS не запущен или WebSocket-сервер выключен".to_string())?;
    let (mut sink, mut stream) = ws.split();

    // Hello → Identify → Identified
    let hello = next_json(&mut stream).await?;
    if hello["op"] != 0 {
        return Err("Непонятный ответ OBS".into());
    }
    let d = &hello["d"];
    let mut ident = json!({ "rpcVersion": 1, "eventSubscriptions": 2047 });
    if let Some(a) = d.get("authentication") {
        if password.is_empty() {
            return Err("OBS просит пароль WebSocket".into());
        }
        ident["authentication"] =
            json!(auth_string(password, a["salt"].as_str().unwrap_or(""), a["challenge"].as_str().unwrap_or("")));
    }
    sink.send(Message::Text(json!({ "op": 1, "d": ident }).to_string().into()))
        .await
        .map_err(|e| e.to_string())?;
    let idd = next_json(&mut stream).await.map_err(|_| "Неверный пароль WebSocket OBS".to_string())?;
    if idd["op"] != 2 {
        return Err("Неверный пароль WebSocket OBS".into());
    }

    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    *obs.out.lock().unwrap() = Some(tx);
    let writer = tokio::spawn(async move {
        while let Some(m) = rx.recv().await {
            if sink.send(m).await.is_err() {
                break;
            }
        }
    });

    {
        let mut m = obs.meta.lock().unwrap();
        m.connected = true;
        m.error = None;
        m.version = d["obsWebSocketVersion"].as_str().unwrap_or("").to_string();
    }
    core.set_state("obs.connected", json!(true));

    let init_core = core.clone();
    let init_obs = obs.clone();
    tokio::spawn(async move { refresh_all(&init_core, &init_obs).await });

    // Время эфира и записи для подписей {obs.streamTime} и {obs.recordTime}.
    let tick_core = core.clone();
    let tick_obs = obs.clone();
    let ticker = tokio::spawn(async move {
        loop {
            for (flag, req, key) in [
                ("obs.streaming", "GetStreamStatus", "obs.streamTime"),
                ("obs.recording", "GetRecordStatus", "obs.recordTime"),
            ] {
                let text = if tick_core.state_bool(flag) {
                    match tick_obs.call(req, json!({})).await {
                        Ok(v) => v["outputTimecode"].as_str().unwrap_or("").split('.').next().unwrap_or("").to_string(),
                        Err(_) => continue,
                    }
                } else {
                    "00:00:00".to_string()
                };
                tick_core.set_state(key, json!(text));
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    });

    let result = loop {
        let Some(msg) = stream.next().await else { break Ok(()) };
        let msg = match msg {
            Ok(Message::Text(t)) => t,
            Ok(Message::Close(_)) => break Ok(()),
            Ok(_) => continue,
            Err(e) => break Err(e.to_string()),
        };
        let Ok(v) = serde_json::from_str::<Value>(&msg) else { continue };
        match v["op"].as_i64() {
            Some(7) => {
                let d = &v["d"];
                let id = d["requestId"].as_str().unwrap_or("");
                if let Some(tx) = obs.pending.lock().unwrap().remove(id) {
                    let st = &d["requestStatus"];
                    let r = if st["result"].as_bool() == Some(true) {
                        Ok(d.get("responseData").cloned().unwrap_or(Value::Null))
                    } else {
                        Err(st["comment"].as_str().unwrap_or("ошибка OBS").to_string())
                    };
                    let _ = tx.send(r);
                }
            }
            Some(5) => on_event(core, obs, &v["d"]),
            _ => {}
        }
    };
    writer.abort();
    ticker.abort();
    result.map_err(|_| "Связь с OBS потеряна".to_string())
}

async fn next_json<S>(stream: &mut S) -> Result<Value, String>
where
    S: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    loop {
        let m = tokio::time::timeout(Duration::from_secs(5), stream.next())
            .await
            .map_err(|_| "OBS не отвечает".to_string())?
            .ok_or("OBS закрыл соединение")?
            .map_err(|e| e.to_string())?;
        if let Message::Text(t) = m {
            return serde_json::from_str(&t).map_err(|e| e.to_string());
        }
        if let Message::Close(_) = m {
            return Err("OBS закрыл соединение".into());
        }
    }
}

fn names(v: &Value, list: &str, key: &str) -> Vec<String> {
    v[list]
        .as_array()
        .map(|a| a.iter().filter_map(|x| x[key].as_str().map(String::from)).collect())
        .unwrap_or_default()
}

/// Полная перечитка: после подключения и при смене коллекции сцен.
async fn refresh_all(core: &CoreRef, obs: &Arc<Obs>) {
    if let Ok(v) = obs.call("GetSceneCollectionList", json!({})).await {
        core.set_state("obs.collection", v["currentSceneCollectionName"].clone());
        obs.meta.lock().unwrap().collections =
            v["sceneCollections"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
    }
    if let Ok(v) = obs.call("GetSceneList", json!({})).await {
        let mut scenes = names(&v, "scenes", "sceneName");
        scenes.reverse(); // OBS отдаёт снизу вверх
        core.set_state("obs.scene", v["currentProgramSceneName"].clone());
        core.remove_states_with_prefix("obs.source:");
        obs.items.lock().unwrap().clear();
        let mut sources = HashMap::new();
        for s in &scenes {
            if let Ok(items) = obs.call("GetSceneItemList", json!({ "sceneName": s })).await {
                let mut list = Vec::new();
                for it in items["sceneItems"].as_array().cloned().unwrap_or_default() {
                    let name = it["sourceName"].as_str().unwrap_or("").to_string();
                    let id = it["sceneItemId"].as_i64().unwrap_or(-1);
                    let en = it["sceneItemEnabled"].as_bool().unwrap_or(false);
                    obs.items.lock().unwrap().insert((s.clone(), id), name.clone());
                    core.set_state(&format!("obs.source:{s}/{name}"), json!(en));
                    list.push(name);
                }
                sources.insert(s.clone(), list);
            }
        }
        let mut m = obs.meta.lock().unwrap();
        m.scenes = scenes;
        m.sources = sources;
    }
    refresh_inputs(core, obs).await;
    for (req, key) in [
        ("GetStreamStatus", "obs.streaming"),
        ("GetRecordStatus", "obs.recording"),
        ("GetReplayBufferStatus", "obs.replay"),
        ("GetVirtualCamStatus", "obs.virtualcam"),
    ] {
        match obs.call(req, json!({})).await {
            Ok(v) => core.set_state(key, json!(v["outputActive"].as_bool().unwrap_or(false))),
            Err(_) => core.set_state(key, json!(false)),
        }
    }
    if let Ok(v) = obs.call("GetRecordStatus", json!({})).await {
        core.set_state("obs.recordPaused", json!(v["outputPaused"].as_bool().unwrap_or(false)));
    }
    emit_meta(core, obs);
}

async fn refresh_inputs(core: &CoreRef, obs: &Arc<Obs>) {
    let Ok(v) = obs.call("GetInputList", json!({})).await else { return };
    let inputs = names(&v, "inputs", "inputName");
    core.remove_states_with_prefix("obs.mute:");
    core.remove_states_with_prefix("obs.volume:");
    let mut audio = Vec::new();
    for i in &inputs {
        if let Ok(m) = obs.call("GetInputMute", json!({ "inputName": i })).await {
            core.set_state(&format!("obs.mute:{i}"), json!(m["inputMuted"].as_bool().unwrap_or(false)));
            if let Ok(vol) = obs.call("GetInputVolume", json!({ "inputName": i })).await {
                core.set_state(&format!("obs.volume:{i}"), json!(db_to_pct(vol["inputVolumeDb"].as_f64().unwrap_or(0.0))));
            }
            audio.push(i.clone());
        }
    }
    let mut m = obs.meta.lock().unwrap();
    m.inputs = inputs;
    m.audio_inputs = audio;
}

fn on_event(core: &CoreRef, obs: &Arc<Obs>, d: &Value) {
    let data = &d["eventData"];
    let s = |k: &str| data[k].as_str().unwrap_or("").to_string();
    let b = |k: &str| data[k].as_bool().unwrap_or(false);
    match d["eventType"].as_str().unwrap_or("") {
        "CurrentProgramSceneChanged" => core.set_state("obs.scene", json!(s("sceneName"))),
        "StreamStateChanged" => core.set_state("obs.streaming", json!(b("outputActive"))),
        "RecordStateChanged" => {
            core.set_state("obs.recording", json!(b("outputActive")));
            let st = s("outputState");
            core.set_state("obs.recordPaused", json!(st == "OBS_WEBSOCKET_OUTPUT_PAUSED"));
        }
        "ReplayBufferStateChanged" => core.set_state("obs.replay", json!(b("outputActive"))),
        "VirtualcamStateChanged" => core.set_state("obs.virtualcam", json!(b("outputActive"))),
        "SourceFilterEnableStateChanged" => {
            core.set_state(&format!("obs.filter:{}/{}", s("sourceName"), s("filterName")), json!(b("filterEnabled")))
        }
        "InputMuteStateChanged" => core.set_state(&format!("obs.mute:{}", s("inputName")), json!(b("inputMuted"))),
        "InputVolumeChanged" => core.set_state(
            &format!("obs.volume:{}", s("inputName")),
            json!(db_to_pct(data["inputVolumeDb"].as_f64().unwrap_or(0.0))),
        ),
        "SceneItemEnableStateChanged" => {
            let scene = s("sceneName");
            let id = data["sceneItemId"].as_i64().unwrap_or(-1);
            let name = obs.items.lock().unwrap().get(&(scene.clone(), id)).cloned();
            if let Some(name) = name {
                core.set_state(&format!("obs.source:{scene}/{name}"), json!(b("sceneItemEnabled")));
            }
        }
        "CurrentSceneCollectionChanged" => {
            core.set_state("obs.collection", json!(s("sceneCollectionName")));
            spawn_refresh(core, obs, true);
        }
        "SceneListChanged" | "SceneCreated" | "SceneRemoved" | "SceneNameChanged" | "SceneItemCreated"
        | "SceneItemRemoved" | "SceneCollectionListChanged" => spawn_refresh(core, obs, true),
        "InputCreated" | "InputRemoved" | "InputNameChanged" => spawn_refresh(core, obs, false),
        _ => {}
    }
}

fn spawn_refresh(core: &CoreRef, obs: &Arc<Obs>, all: bool) {
    let core = core.clone();
    let obs = obs.clone();
    tokio::spawn(async move {
        // Во время смены коллекции OBS какое-то время отвечает ошибками.
        tokio::time::sleep(Duration::from_millis(600)).await;
        if all {
            refresh_all(&core, &obs).await;
        } else {
            refresh_inputs(&core, &obs).await;
            emit_meta(&core, &obs);
        }
    });
}

/// Настройки из конфига самого OBS: порт и пароль WebSocket-сервера.
pub fn detect() -> Option<(u16, String, bool)> {
    let appdata = std::env::var("APPDATA").ok()?;
    let p = std::path::Path::new(&appdata).join("obs-studio/plugin_config/obs-websocket/config.json");
    let v: Value = serde_json::from_str(&std::fs::read_to_string(p).ok()?).ok()?;
    let port = v["server_port"].as_u64().unwrap_or(4455) as u16;
    let pass = v["server_password"].as_str().unwrap_or("").to_string();
    let enabled = v["server_enabled"].as_bool().unwrap_or(false);
    let auth = v["auth_required"].as_bool().unwrap_or(true);
    Some((port, if auth { pass } else { String::new() }, enabled))
}
