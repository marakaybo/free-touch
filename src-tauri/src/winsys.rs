//! Windows: микрофон, звуковые устройства по умолчанию, активная программа,
//! «что сейчас играет», питание ПК.

use crate::core::CoreRef;
use serde::Serialize;
use serde_json::json;

#[derive(Serialize, Clone, Debug)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub default: bool,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NowPlaying {
    pub title: String,
    pub artist: String,
    pub playing: bool,
    pub app: String,
}

#[cfg(windows)]
#[allow(non_snake_case)]
mod imp {
    use super::{AudioDevice, NowPlaying};
    use std::ffi::c_void;
    use windows::core::{interface, IUnknown, IUnknown_Vtbl, Result, GUID, HRESULT, PCWSTR, PWSTR};
    use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
    use windows::Win32::Foundation::{CloseHandle, LPARAM, WPARAM};
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::*;
    use windows::Win32::System::Com::StructuredStorage::PropVariantToBSTR;
    use windows::Win32::System::Com::*;
    use windows::Win32::System::Threading::*;
    use windows::core::BOOL;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetForegroundWindow, GetWindowTextLengthW, GetWindowThreadProcessId, IsWindowVisible, PostMessageW, HWND_BROADCAST,
        SC_MONITORPOWER, WM_SYSCOMMAND,
    };

    fn com() {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
    }

    fn enumerator() -> Result<IMMDeviceEnumerator> {
        com();
        unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }
    }

    fn flow(input: bool) -> EDataFlow {
        if input { eCapture } else { eRender }
    }

    fn mic_endpoint() -> Result<IAudioEndpointVolume> {
        unsafe { enumerator()?.GetDefaultAudioEndpoint(eCapture, eConsole)?.Activate(CLSCTX_ALL, None) }
    }

    pub fn mic() -> Option<(f32, bool)> {
        let ep = mic_endpoint().ok()?;
        unsafe { Some((ep.GetMasterVolumeLevelScalar().ok()?, ep.GetMute().ok()?.as_bool())) }
    }

    pub fn set_mic(v: f32) {
        if let Ok(ep) = mic_endpoint() {
            unsafe {
                let _ = ep.SetMasterVolumeLevelScalar(v.clamp(0.0, 1.0), std::ptr::null());
            }
        }
    }

    pub fn set_mic_mute(m: bool) {
        if let Ok(ep) = mic_endpoint() {
            unsafe {
                let _ = ep.SetMute(m, std::ptr::null());
            }
        }
    }

    fn pwstr(p: PWSTR) -> String {
        let s = unsafe { p.to_string().unwrap_or_default() };
        unsafe { CoTaskMemFree(Some(p.0 as *const c_void)) };
        s
    }

    fn name_of(d: &IMMDevice) -> String {
        unsafe {
            let Ok(store) = d.OpenPropertyStore(STGM_READ) else { return String::new() };
            let Ok(v) = store.GetValue(&PKEY_Device_FriendlyName) else { return String::new() };
            PropVariantToBSTR(&v).map(|b| b.to_string()).unwrap_or_default()
        }
    }

    pub fn devices(input: bool) -> Vec<AudioDevice> {
        let mut out = Vec::new();
        let Ok(en) = enumerator() else { return out };
        unsafe {
            let def = en.GetDefaultAudioEndpoint(flow(input), eConsole).ok().and_then(|d| d.GetId().ok()).map(pwstr);
            let Ok(list) = en.EnumAudioEndpoints(flow(input), DEVICE_STATE_ACTIVE) else { return out };
            for i in 0..list.GetCount().unwrap_or(0) {
                let Ok(d) = list.Item(i) else { continue };
                let Ok(id) = d.GetId().map(pwstr) else { continue };
                out.push(AudioDevice { name: name_of(&d), default: def.as_deref() == Some(id.as_str()), id });
            }
        }
        out
    }

    /// Недокументированный, но стабильный с Windows 7 интерфейс — им пользуются
    /// все переключатели звука. Нужен только SetDefaultEndpoint, остальные методы —
    /// чтобы совпала таблица функций.
    #[interface("f8679f50-850a-41cf-9c72-430f290290c8")]
    unsafe trait IPolicyConfig: IUnknown {
        fn GetMixFormat(&self, id: PCWSTR, f: *mut *mut c_void) -> HRESULT;
        fn GetDeviceFormat(&self, id: PCWSTR, d: i32, f: *mut *mut c_void) -> HRESULT;
        fn ResetDeviceFormat(&self, id: PCWSTR) -> HRESULT;
        fn SetDeviceFormat(&self, id: PCWSTR, a: *mut c_void, b: *mut c_void) -> HRESULT;
        fn GetProcessingPeriod(&self, id: PCWSTR, d: i32, a: *mut i64, b: *mut i64) -> HRESULT;
        fn SetProcessingPeriod(&self, id: PCWSTR, a: *mut i64) -> HRESULT;
        fn GetShareMode(&self, id: PCWSTR, a: *mut c_void) -> HRESULT;
        fn SetShareMode(&self, id: PCWSTR, a: *mut c_void) -> HRESULT;
        fn GetPropertyValue(&self, id: PCWSTR, fx: i32, k: *const c_void, v: *mut c_void) -> HRESULT;
        fn SetPropertyValue(&self, id: PCWSTR, fx: i32, k: *const c_void, v: *mut c_void) -> HRESULT;
        fn SetDefaultEndpoint(&self, id: PCWSTR, role: ERole) -> HRESULT;
        fn SetEndpointVisibility(&self, id: PCWSTR, visible: i32) -> HRESULT;
    }

    const POLICY_CONFIG_CLIENT: GUID = GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9);

    pub fn set_default(id: &str) -> std::result::Result<(), String> {
        com();
        unsafe {
            let pc: IPolicyConfig = CoCreateInstance(&POLICY_CONFIG_CLIENT, None, CLSCTX_ALL).map_err(|e| e.to_string())?;
            let w = windows::core::HSTRING::from(id);
            for role in [eConsole, eMultimedia, eCommunications] {
                pc.SetDefaultEndpoint(PCWSTR(w.as_ptr()), role).ok().map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }

    pub fn exe_of(pid: u32) -> Option<String> {
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

    pub fn foreground_exe() -> Option<String> {
        unsafe {
            let w = GetForegroundWindow();
            if w.0.is_null() {
                return None;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(w, Some(&mut pid));
            if pid == 0 {
                return None;
            }
            exe_of(pid)
        }
    }

    unsafe extern "system" fn collect(w: HWND, l: LPARAM) -> BOOL {
        let list = unsafe { &mut *(l.0 as *mut Vec<u32>) };
        unsafe {
            if IsWindowVisible(w).as_bool() && GetWindowTextLengthW(w) > 0 {
                let mut pid = 0u32;
                GetWindowThreadProcessId(w, Some(&mut pid));
                if pid != 0 && !list.contains(&pid) {
                    list.push(pid);
                }
            }
        }
        BOOL(1)
    }

    /// Программы с открытыми окнами — для выбора, где включать страницу.
    pub fn window_apps() -> Vec<String> {
        let mut pids: Vec<u32> = Vec::new();
        unsafe {
            let _ = EnumWindows(Some(collect), LPARAM(&mut pids as *mut Vec<u32> as isize));
        }
        let mut out: Vec<String> = pids.into_iter().filter_map(exe_of).collect();
        out.sort();
        out.dedup();
        out
    }

    pub fn lock() {
        unsafe {
            let _ = windows::Win32::System::Shutdown::LockWorkStation();
        }
    }

    pub fn sleep() {
        unsafe {
            let _ = windows::Win32::System::Power::SetSuspendState(false, false, false);
        }
    }

    pub fn monitor_off() {
        unsafe {
            let _ = PostMessageW(Some(HWND_BROADCAST), WM_SYSCOMMAND, WPARAM(SC_MONITORPOWER as usize), LPARAM(2));
        }
    }

    /// Читатель «что сейчас играет»: менеджер сессий создаётся один раз.
    pub struct Media {
        mgr: Option<windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager>,
    }

    impl Media {
        pub fn new() -> Self {
            com();
            let mgr = windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
                .and_then(|op| op.get())
                .ok();
            Self { mgr }
        }

        pub fn read(&self) -> Option<NowPlaying> {
            use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus as St;
            let s = self.mgr.as_ref()?.GetCurrentSession().ok()?;
            let props = s.TryGetMediaPropertiesAsync().ok()?.get().ok()?;
            let playing = s.GetPlaybackInfo().ok()?.PlaybackStatus().ok()? == St::Playing;
            let app = s.SourceAppUserModelId().map(|h| h.to_string()).unwrap_or_default();
            // AUMID: «Spotify.exe», «Chrome» или «Microsoft.WhatsApp_8wekyb3d8bbwe!App».
            let app = app.split('!').next().unwrap_or("");
            let app = app.rsplit('\\').next().unwrap_or(app).trim_end_matches(".exe");
            let app = app.split('_').next().unwrap_or(app);
            let app = app.rsplit('.').next().unwrap_or(app).to_string();
            Some(NowPlaying {
                title: props.Title().map(|h| h.to_string()).unwrap_or_default(),
                artist: props.Artist().map(|h| h.to_string()).unwrap_or_default(),
                playing,
                app,
            })
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::{AudioDevice, NowPlaying};
    pub fn mic() -> Option<(f32, bool)> { None }
    pub fn set_mic(_: f32) {}
    pub fn set_mic_mute(_: bool) {}
    pub fn devices(_: bool) -> Vec<AudioDevice> { Vec::new() }
    pub fn set_default(_: &str) -> Result<(), String> { Err("Только Windows".into()) }
    pub fn foreground_exe() -> Option<String> { None }
    pub fn window_apps() -> Vec<String> { Vec::new() }
    pub fn lock() {}
    pub fn sleep() {}
    pub fn monitor_off() {}
    pub struct Media;
    impl Media {
        pub fn new() -> Self { Media }
        pub fn read(&self) -> Option<NowPlaying> { None }
    }
}

pub use imp::{devices, foreground_exe, window_apps, lock, mic, monitor_off, set_default, set_mic, set_mic_mute, sleep, Media};

/// Сменить устройство по умолчанию. `names` — по кругу: если сейчас стоит одно
/// из списка, включается следующее; иначе первое. Имя сравнивается по вхождению,
/// чтобы «Наушники» находили «Наушники (Realtek Audio)».
pub fn switch_device(input: bool, names: &[String]) -> Result<String, String> {
    let list = devices(input);
    let names: Vec<String> = names.iter().map(|n| n.trim().to_lowercase()).filter(|n| !n.is_empty()).collect();
    if names.is_empty() {
        return Err("Не выбрано устройство".into());
    }
    let find = |n: &str| list.iter().find(|d| d.name.to_lowercase() == n).or_else(|| list.iter().find(|d| d.name.to_lowercase().contains(n)));
    let cur = list.iter().find(|d| d.default).map(|d| d.name.to_lowercase()).unwrap_or_default();
    let cur_idx = names.iter().position(|n| cur == *n || cur.contains(n.as_str()));
    let start = cur_idx.map(|i| i + 1).unwrap_or(0);
    for k in 0..names.len() {
        let n = &names[(start + k) % names.len()];
        if let Some(d) = find(n) {
            set_default(&d.id)?;
            return Ok(d.name.clone());
        }
    }
    Err("Устройство не найдено — оно подключено?".into())
}

pub fn publish_audio(core: &CoreRef) {
    if let Some((v, m)) = mic() {
        core.set_state("system.micVolume", json!((v * 100.0).round() as i64));
        core.set_state("system.micMuted", json!(m));
    }
    if let Some(d) = devices(false).into_iter().find(|d| d.default) {
        core.set_state("system.output", json!(d.name));
    }
    if let Some(d) = devices(true).into_iter().find(|d| d.default) {
        core.set_state("system.input", json!(d.name));
    }
}

/// Раз в полсекунды: активная программа (для автосмены страниц) и
/// раз в секунду — что играет в плеере.
pub fn spawn_poller(core: CoreRef) {
    std::thread::spawn(move || {
        let media = Media::new();
        let mut last = NowPlaying::default();
        let mut tick = 0u64;
        loop {
            if let Some(exe) = foreground_exe() {
                core.set_foreground(&exe);
            }
            if tick % 2 == 0 {
                let np = media.read().unwrap_or_default();
                if np != last {
                    core.set_state("media.title", json!(np.title));
                    core.set_state("media.artist", json!(np.artist));
                    core.set_state("media.playing", json!(np.playing));
                    core.set_state("media.app", json!(np.app));
                    last = np;
                }
            }
            if tick % 3 == 0 {
                publish_audio(&core);
            }
            tick += 1;
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    });
}

#[cfg(test)]
mod tests {
    #[test]
    #[ignore]
    fn probe() {
        println!("outputs: {:?}", super::devices(false));
        println!("inputs: {:?}", super::devices(true));
        println!("mic: {:?}", super::mic());
        println!("fg: {:?}", super::foreground_exe());
        println!("media: {:?}", super::Media::new().read());
        println!("sound outs: {:?}", crate::sound::outputs());
        println!("windows: {:?}", super::window_apps());
    }
}
