//! HTTP + WebSocket сервер для телефонов. Раздаёт веб-пульт и принимает нажатия.

use crate::actions;
use crate::core::{ClientInfo, CoreRef};
use crate::obs::Obs;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, Query, State};
use axum::http::{header, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use futures_util::{SinkExt, StreamExt};
use rust_embed::Embed;
use serde::Deserialize;
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::mpsc;

#[derive(Embed)]
#[folder = "../dist-panel/"]
struct Panel;

#[derive(Clone)]
struct Ctx {
    core: CoreRef,
    obs: Arc<Obs>,
}

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

pub fn pc_name() -> String {
    std::env::var("COMPUTERNAME").unwrap_or_else(|_| "ПК".into())
}

pub fn spawn(core: CoreRef, obs: Arc<Obs>) {
    tauri::async_runtime::spawn(async move {
        let mut rev = core.settings_rev.subscribe();
        loop {
            let port = core.settings().port;
            let app = Router::new()
                .route("/ws", get(ws_handler))
                .route("/api/ping", get(ping))
                .fallback(get(static_file))
                .with_state(Ctx { core: core.clone(), obs: obs.clone() });
            match tokio::net::TcpListener::bind(("0.0.0.0", port)).await {
                Ok(listener) => {
                    set_status(&core, true, port, None);
                    let mut rev2 = rev.clone();
                    let core2 = core.clone();
                    let server = axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
                        .with_graceful_shutdown(async move {
                            loop {
                                if rev2.changed().await.is_err() {
                                    return;
                                }
                                if core2.settings().port != port {
                                    return;
                                }
                            }
                        });
                    if let Err(e) = server.await {
                        set_status(&core, false, port, Some(e.to_string()));
                    }
                    rev.mark_unchanged();
                }
                Err(e) => {
                    let msg = if e.kind() == std::io::ErrorKind::AddrInUse {
                        format!("Порт {port} занят другой программой")
                    } else {
                        e.to_string()
                    };
                    set_status(&core, false, port, Some(msg));
                    let _ = rev.changed().await;
                }
            }
        }
    });
}

fn set_status(core: &CoreRef, running: bool, port: u16, error: Option<String>) {
    let st = {
        let mut s = core.server.lock().unwrap();
        s.running = running;
        s.port = port;
        s.error = error;
        s.clone()
    };
    let _ = core.app.emit("ft-server", st);
}

async fn ping() -> Json<Value> {
    Json(json!({ "app": "free-touch", "version": env!("CARGO_PKG_VERSION"), "pc": pc_name() }))
}

async fn static_file(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let (file, name) = match Panel::get(path) {
        Some(f) if !path.is_empty() => (f, path.to_string()),
        _ => match Panel::get("index.html") {
            Some(f) => (f, "index.html".to_string()),
            None => return (StatusCode::NOT_FOUND, "Пульт не собран: запустите npm run build:panel").into_response(),
        },
    };
    let mime = mime_guess::from_path(&name).first_or_octet_stream();
    let cache = if name.starts_with("assets/") { "public, max-age=31536000, immutable" } else { "no-cache" };
    ([(header::CONTENT_TYPE, mime.as_ref().to_string()), (header::CACHE_CONTROL, cache.to_string())], file.data.into_owned())
        .into_response()
}

#[derive(Deserialize)]
struct WsQuery {
    token: Option<String>,
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(q): Query<WsQuery>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(ctx): State<Ctx>,
) -> Response {
    let token = ctx.core.settings().token;
    let ok = q.token.as_deref() == Some(token.as_str());
    ws.on_upgrade(move |socket| async move {
        if ok {
            client_loop(socket, addr, ctx).await
        } else {
            reject(socket).await
        }
    })
}

async fn reject(mut socket: WebSocket) {
    let _ = socket.send(Message::Text(json!({ "t": "unauthorized" }).to_string().into())).await;
    let _ = socket.close().await;
}

async fn client_loop(socket: WebSocket, addr: SocketAddr, ctx: Ctx) {
    let core = ctx.core.clone();
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    core.clients.lock().unwrap().insert(
        id,
        ClientInfo { id, name: "Устройство".into(), addr: addr.ip().to_string(), tx: tx.clone() },
    );
    core.emit_clients();

    let (mut sink, mut stream) = socket.split();
    let mut bus = core.bus.subscribe();
    let mut rev = core.settings_rev.subscribe();
    let (token, port) = { let st = core.settings(); (st.token, st.port) };

    let hello = json!({ "t": "hello", "pc": pc_name(), "version": env!("CARGO_PKG_VERSION"), "client": id });
    let profile = json!({ "t": "profile", "profile": core.profile.read().unwrap().clone() });
    let states = json!({ "t": "states", "states": core.states_snapshot() });
    for m in [hello, profile, states] {
        if sink.send(Message::Text(m.to_string().into())).await.is_err() {
            cleanup(&core, id);
            return;
        }
    }

    loop {
        tokio::select! {
            m = bus.recv() => match m {
                Ok(s) => { if sink.send(Message::Text(s.to_string().into())).await.is_err() { break; } }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                    // Телефон не успевал — отдаём свежий снимок целиком.
                    let st = json!({ "t": "states", "states": core.states_snapshot() });
                    if sink.send(Message::Text(st.to_string().into())).await.is_err() { break; }
                }
                Err(_) => break,
            },
            m = rx.recv() => match m {
                Some(s) => { if sink.send(Message::Text(s.into())).await.is_err() { break; } }
                None => break,
            },
            r = rev.changed() => {
                let st = core.settings();
                if r.is_err() || st.token != token {
                    let _ = sink.send(Message::Text(json!({ "t": "unauthorized" }).to_string().into())).await;
                    break;
                }
                if st.port != port {
                    break;
                }
            },
            m = stream.next() => match m {
                Some(Ok(Message::Text(t))) => handle(&ctx, id, &t),
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                _ => {}
            },
        }
    }
    let _ = sink.close().await;
    cleanup(&core, id);
}

fn cleanup(core: &CoreRef, id: u64) {
    actions::release(core, id, None);
    core.clients.lock().unwrap().remove(&id);
    core.emit_clients();
}

fn handle(ctx: &Ctx, id: u64, text: &str) {
    let Ok(v) = serde_json::from_str::<Value>(text) else { return };
    let core = &ctx.core;
    let s = |k: &str| v[k].as_str().unwrap_or("").to_string();
    match v["t"].as_str().unwrap_or("") {
        "hello" => {
            let name: String = s("name").chars().take(40).collect();
            if !name.is_empty() {
                if let Some(c) = core.clients.lock().unwrap().get_mut(&id) {
                    c.name = name;
                }
                core.emit_clients();
            }
        }
        "ping" => core.send_to(id, &json!({ "t": "pong" })),
        "down" => {
            let (page, button) = (s("page"), s("button"));
            let Some(b) = actions::find_button(core, &page, &button) else { return };
            if b.kind == "slider" {
                return;
            }
            let ctx = ctx.clone();
            tokio::spawn(async move {
                let errs = actions::run(&ctx.core, &ctx.obs, b.actions, Some(id), Some(button)).await;
                if let Some(e) = errs.first() {
                    ctx.core.send_to(id, &json!({ "t": "toast", "text": e }));
                }
            });
        }
        "up" => actions::release(core, id, Some(&s("button"))),
        "slide" => {
            let Some(b) = actions::find_button(core, &s("page"), &s("button")) else { return };
            let Some(sl) = b.slider else { return };
            let value = v["value"].as_f64().unwrap_or(0.0);
            let ctx = ctx.clone();
            tokio::spawn(async move { actions::slide(&ctx.core, &ctx.obs, &sl.target, value).await });
        }
        _ => {}
    }
}
