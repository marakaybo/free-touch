//! Звуковая панель: проигрывание файлов (mp3, wav, ogg, flac) на выбранное устройство.

use crate::core::CoreRef;
use rodio::cpal::traits::{DeviceTrait, HostTrait};
use serde_json::json;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

/// Что сейчас играет: путь к файлу → флаги остановки каждого запуска.
fn playing() -> &'static Mutex<HashMap<String, Vec<Arc<AtomicBool>>>> {
    static P: OnceLock<Mutex<HashMap<String, Vec<Arc<AtomicBool>>>>> = OnceLock::new();
    P.get_or_init(Default::default)
}

pub fn state_key(path: &str) -> String {
    format!("sound:{}", path.trim())
}

pub fn outputs() -> Vec<String> {
    let host = rodio::cpal::default_host();
    let mut out: Vec<String> = host
        .output_devices()
        .map(|it| it.filter_map(|d| d.name().ok()).collect())
        .unwrap_or_default();
    out.dedup();
    out
}

fn stop_path(path: &str) -> bool {
    let mut p = playing().lock().unwrap();
    match p.remove(path) {
        Some(list) => {
            for f in list {
                f.store(true, Ordering::Relaxed);
            }
            true
        }
        None => false,
    }
}

pub fn stop_all(core: &CoreRef) {
    let keys: Vec<String> = playing().lock().unwrap().keys().cloned().collect();
    for k in keys {
        stop_path(&k);
        core.set_state(&state_key(&k), json!(false));
    }
}

/// mode: overlap — поверх уже играющего, restart — заново, toggle — второе нажатие останавливает.
pub fn play(core: &CoreRef, path: &str, volume: f64, device: &str, mode: &str) -> Result<(), String> {
    let path = path.trim().to_string();
    if path.is_empty() {
        return Err("Не выбран звуковой файл".into());
    }
    if !std::path::Path::new(&path).is_file() {
        return Err("Звуковой файл не найден".into());
    }
    match mode {
        "toggle" => {
            if stop_path(&path) {
                core.set_state(&state_key(&path), json!(false));
                return Ok(());
            }
        }
        "restart" => {
            stop_path(&path);
        }
        _ => {}
    }
    let stop = Arc::new(AtomicBool::new(false));
    playing().lock().unwrap().entry(path.clone()).or_default().push(stop.clone());
    core.set_state(&state_key(&path), json!(true));

    let core = core.clone();
    let device = device.trim().to_lowercase();
    let vol = (volume / 100.0).clamp(0.0, 2.0) as f32;
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    std::thread::spawn(move || {
        let r = (|| -> Result<(rodio::OutputStream, rodio::Sink), String> {
            let host = rodio::cpal::default_host();
            let dev = if device.is_empty() {
                None
            } else {
                host.output_devices().ok().and_then(|mut it| it.find(|d| d.name().map(|n| n.to_lowercase().contains(&device)).unwrap_or(false)))
            };
            let (stream, handle) = match dev {
                Some(d) => rodio::OutputStream::try_from_device(&d),
                None => rodio::OutputStream::try_default(),
            }
            .map_err(|_| "Нет устройства для звука".to_string())?;
            let sink = rodio::Sink::try_new(&handle).map_err(|e| e.to_string())?;
            let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
            let src = rodio::Decoder::new(std::io::BufReader::new(file)).map_err(|_| "Такой формат звука не поддерживается".to_string())?;
            sink.set_volume(vol);
            sink.append(src);
            Ok((stream, sink))
        })();
        match r {
            Ok((_stream, sink)) => {
                let _ = tx.send(Ok(()));
                while !sink.empty() && !stop.load(Ordering::Relaxed) {
                    std::thread::sleep(Duration::from_millis(30));
                }
                sink.stop();
            }
            Err(e) => {
                let _ = tx.send(Err(e));
            }
        }
        // Убираем свой запуск; если по этому файлу больше ничего не играет — гасим подсветку.
        let empty = {
            let mut p = playing().lock().unwrap();
            if let Some(list) = p.get_mut(&path) {
                list.retain(|f| !Arc::ptr_eq(f, &stop));
                if list.is_empty() {
                    p.remove(&path);
                    true
                } else {
                    false
                }
            } else {
                true
            }
        };
        if empty {
            core.set_state(&state_key(&path), json!(false));
        }
    });
    rx.recv_timeout(Duration::from_secs(5)).unwrap_or(Ok(()))
}

#[cfg(test)]
mod tests {
    use rodio::cpal::traits::{DeviceTrait, HostTrait};

    /// Тишина в WAV: проверяем декодер и открытие устройства, ничего не слышно.
    #[test]
    #[ignore]
    fn silent_playback() {
        let path = std::env::temp_dir().join("ft-silence.wav");
        let rate = 44100u32;
        let n = rate / 4;
        let mut w = Vec::new();
        w.extend(b"RIFF");
        w.extend((36 + n * 2).to_le_bytes());
        w.extend(b"WAVEfmt ");
        w.extend(16u32.to_le_bytes());
        w.extend(1u16.to_le_bytes());
        w.extend(1u16.to_le_bytes());
        w.extend(rate.to_le_bytes());
        w.extend((rate * 2).to_le_bytes());
        w.extend(2u16.to_le_bytes());
        w.extend(16u16.to_le_bytes());
        w.extend(b"data");
        w.extend((n * 2).to_le_bytes());
        w.extend(vec![0u8; (n * 2) as usize]);
        std::fs::write(&path, w).unwrap();
        let host = rodio::cpal::default_host();
        let dev = host.output_devices().unwrap().find(|d| d.name().unwrap_or_default().contains("Realtek")).unwrap();
        let (_s, h) = rodio::OutputStream::try_from_device(&dev).unwrap();
        let sink = rodio::Sink::try_new(&h).unwrap();
        sink.set_volume(0.0);
        sink.append(rodio::Decoder::new(std::io::BufReader::new(std::fs::File::open(&path).unwrap())).unwrap());
        let t = std::time::Instant::now();
        sink.sleep_until_end();
        println!("played {:?} on {}", t.elapsed(), dev.name().unwrap());
    }
}
