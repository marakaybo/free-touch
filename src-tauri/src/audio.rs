//! Громкость Windows: общая и по программам (микшер громкости).

use crate::core::CoreRef;
use serde_json::json;

#[derive(Clone, Debug)]
pub struct AppSession {
    pub exe: String,
    pub volume: f32,
    pub muted: bool,
}

#[cfg(windows)]
mod imp {
    use super::AppSession;
    use windows::core::{Interface, Result, PWSTR};
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::*;
    use windows::Win32::System::Com::*;
    use windows::Win32::System::Threading::*;

    fn com() {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
    }

    fn device() -> Result<IMMDevice> {
        com();
        unsafe {
            let en: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            en.GetDefaultAudioEndpoint(eRender, eConsole)
        }
    }

    fn endpoint() -> Result<IAudioEndpointVolume> {
        unsafe { device()?.Activate(CLSCTX_ALL, None) }
    }

    pub fn master() -> Option<(f32, bool)> {
        let ep = endpoint().ok()?;
        unsafe {
            let v = ep.GetMasterVolumeLevelScalar().ok()?;
            let m = ep.GetMute().ok()?.as_bool();
            Some((v, m))
        }
    }

    pub fn set_master(v: f32) {
        if let Ok(ep) = endpoint() {
            unsafe {
                let _ = ep.SetMasterVolumeLevelScalar(v.clamp(0.0, 1.0), std::ptr::null());
                if v > 0.0 {
                    let _ = ep.SetMute(false, std::ptr::null());
                }
            }
        }
    }

    pub fn set_master_mute(m: bool) {
        if let Ok(ep) = endpoint() {
            unsafe {
                let _ = ep.SetMute(m, std::ptr::null());
            }
        }
    }

    fn process_name(pid: u32) -> Option<String> {
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 1024];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
            let _ = CloseHandle(h);
            if !ok {
                return None;
            }
            let path = String::from_utf16_lossy(&buf[..len as usize]);
            Some(path.rsplit('\\').next().unwrap_or(&path).to_lowercase())
        }
    }

    /// Все звуковые сессии, в том числе нескольких процессов одной программы.
    fn sessions() -> Vec<(String, ISimpleAudioVolume)> {
        let mut out = Vec::new();
        let Ok(dev) = device() else { return out };
        unsafe {
            let Ok(mgr) = dev.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) else { return out };
            let Ok(en) = mgr.GetSessionEnumerator() else { return out };
            let n = en.GetCount().unwrap_or(0);
            for i in 0..n {
                let Ok(ctl) = en.GetSession(i) else { continue };
                let Ok(ctl2) = ctl.cast::<IAudioSessionControl2>() else { continue };
                let pid = ctl2.GetProcessId().unwrap_or(0);
                if pid == 0 {
                    continue;
                }
                let Some(name) = process_name(pid) else { continue };
                let Ok(vol) = ctl.cast::<ISimpleAudioVolume>() else { continue };
                out.push((name, vol));
            }
        }
        out
    }

    pub fn apps() -> Vec<AppSession> {
        let mut out: Vec<AppSession> = Vec::new();
        for (exe, vol) in sessions() {
            if out.iter().any(|a| a.exe == exe) {
                continue;
            }
            unsafe {
                let volume = vol.GetMasterVolume().unwrap_or(1.0);
                let muted = vol.GetMute().map(|b| b.as_bool()).unwrap_or(false);
                out.push(AppSession { exe, volume, muted });
            }
        }
        out.sort_by(|a, b| a.exe.cmp(&b.exe));
        out
    }

    pub fn set_app(exe: &str, volume: Option<f32>, mute: Option<bool>) {
        let exe = exe.to_lowercase();
        for (name, vol) in sessions() {
            if name != exe {
                continue;
            }
            unsafe {
                if let Some(v) = volume {
                    let _ = vol.SetMasterVolume(v.clamp(0.0, 1.0), std::ptr::null());
                }
                if let Some(m) = mute {
                    let _ = vol.SetMute(m, std::ptr::null());
                }
            }
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::AppSession;
    pub fn master() -> Option<(f32, bool)> { None }
    pub fn set_master(_: f32) {}
    pub fn set_master_mute(_: bool) {}
    pub fn apps() -> Vec<AppSession> { Vec::new() }
    pub fn set_app(_: &str, _: Option<f32>, _: Option<bool>) {}
}

pub use imp::{apps, master, set_app, set_master, set_master_mute};

fn pct(v: f32) -> i64 {
    (v * 100.0).round() as i64
}

/// Публикует громкость в живые состояния, чтобы слайдеры на телефоне
/// двигались, когда громкость меняют на самом ПК.
pub fn publish(core: &CoreRef) {
    if let Some((v, m)) = master() {
        core.set_state("system.volume", json!(pct(v)));
        core.set_state("system.muted", json!(m));
    }
    let list = apps();
    let mut seen = Vec::new();
    for a in &list {
        core.set_state(&format!("app.volume:{}", a.exe), json!(pct(a.volume)));
        core.set_state(&format!("app.muted:{}", a.exe), json!(a.muted));
        seen.push(a.exe.clone());
    }
    core.set_state("system.apps", json!(seen));
}

pub fn spawn_poller(core: CoreRef) {
    std::thread::spawn(move || loop {
        publish(&core);
        std::thread::sleep(std::time::Duration::from_millis(700));
    });
}
