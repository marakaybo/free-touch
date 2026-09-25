//! Эмуляция клавиатуры через SendInput. Клавиши приходят как KeyboardEvent.code
//! ("KeyA", "ControlLeft"), поэтому хоткеи не зависят от раскладки.

#[cfg(windows)]
mod imp {
    use std::mem::size_of;
    use windows::Win32::UI::Input::KeyboardAndMouse::*;

    struct K {
        vk: u16,
        ext: bool,
        /// Медиаклавиши шлём по коду VK, у них нет нормального скан-кода.
        by_vk: bool,
    }

    fn map(code: &str) -> Option<K> {
        let k = |vk: u16| K { vk, ext: false, by_vk: false };
        let e = |vk: u16| K { vk, ext: true, by_vk: false };
        let m = |vk: u16| K { vk, ext: true, by_vk: true };
        if let Some(c) = code.strip_prefix("Key") {
            let ch = c.chars().next()?;
            if c.len() == 1 && ch.is_ascii_uppercase() {
                return Some(k(ch as u16));
            }
        }
        if let Some(d) = code.strip_prefix("Digit") {
            let n: u16 = d.parse().ok()?;
            return Some(k(0x30 + n));
        }
        if let Some(d) = code.strip_prefix("Numpad") {
            if let Ok(n) = d.parse::<u16>() {
                return Some(k(0x60 + n));
            }
        }
        if let Some(d) = code.strip_prefix('F') {
            if let Ok(n) = d.parse::<u16>() {
                if (1..=24).contains(&n) {
                    return Some(k(0x6F + n));
                }
            }
        }
        Some(match code {
            "ControlLeft" => k(0xA2),
            "ControlRight" => e(0xA3),
            "ShiftLeft" => k(0xA0),
            "ShiftRight" => k(0xA1),
            "AltLeft" => k(0xA4),
            "AltRight" => e(0xA5),
            "MetaLeft" => e(0x5B),
            "MetaRight" => e(0x5C),
            "Enter" => k(0x0D),
            "NumpadEnter" => e(0x0D),
            "Escape" => k(0x1B),
            "Backspace" => k(0x08),
            "Tab" => k(0x09),
            "Space" => k(0x20),
            "CapsLock" => k(0x14),
            "Minus" => k(0xBD),
            "Equal" => k(0xBB),
            "BracketLeft" => k(0xDB),
            "BracketRight" => k(0xDD),
            "Backslash" => k(0xDC),
            "IntlBackslash" => k(0xE2),
            "Semicolon" => k(0xBA),
            "Quote" => k(0xDE),
            "Backquote" => k(0xC0),
            "Comma" => k(0xBC),
            "Period" => k(0xBE),
            "Slash" => k(0xBF),
            "ArrowUp" => e(0x26),
            "ArrowDown" => e(0x28),
            "ArrowLeft" => e(0x25),
            "ArrowRight" => e(0x27),
            "Home" => e(0x24),
            "End" => e(0x23),
            "PageUp" => e(0x21),
            "PageDown" => e(0x22),
            "Insert" => e(0x2D),
            "Delete" => e(0x2E),
            "PrintScreen" => e(0x2C),
            "ScrollLock" => k(0x91),
            "Pause" => k(0x13),
            "NumLock" => e(0x90),
            "ContextMenu" => e(0x5D),
            "NumpadMultiply" => k(0x6A),
            "NumpadAdd" => k(0x6B),
            "NumpadSubtract" => k(0x6D),
            "NumpadDecimal" => k(0x6E),
            "NumpadDivide" => e(0x6F),
            "MediaPlayPause" => m(0xB3),
            "MediaTrackNext" => m(0xB0),
            "MediaTrackPrevious" => m(0xB1),
            "MediaStop" => m(0xB2),
            "AudioVolumeUp" => m(0xAF),
            "AudioVolumeDown" => m(0xAE),
            "AudioVolumeMute" => m(0xAD),
            _ => return None,
        })
    }

    fn key_input(k: &K, up: bool) -> INPUT {
        let mut flags = KEYBD_EVENT_FLAGS(0);
        let mut scan = 0u16;
        if !k.by_vk {
            scan = unsafe { MapVirtualKeyW(k.vk as u32, MAPVK_VK_TO_VSC) } as u16;
            if scan != 0 {
                flags |= KEYEVENTF_SCANCODE;
            }
        }
        if k.ext {
            flags |= KEYEVENTF_EXTENDEDKEY;
        }
        if up {
            flags |= KEYEVENTF_KEYUP;
        }
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT { wVk: VIRTUAL_KEY(k.vk), wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: 0 },
            },
        }
    }

    fn send(inputs: &[INPUT]) {
        if inputs.is_empty() {
            return;
        }
        unsafe {
            SendInput(inputs, size_of::<INPUT>() as i32);
        }
    }

    pub fn keys_down(codes: &[String]) {
        let v: Vec<INPUT> = codes.iter().filter_map(|c| map(c)).map(|k| key_input(&k, false)).collect();
        send(&v);
    }

    pub fn keys_up(codes: &[String]) {
        let v: Vec<INPUT> = codes.iter().rev().filter_map(|c| map(c)).map(|k| key_input(&k, true)).collect();
        send(&v);
    }

    pub fn type_text(text: &str) {
        let mut v = Vec::new();
        for unit in text.encode_utf16() {
            for up in [false, true] {
                let mut flags = KEYEVENTF_UNICODE;
                if up {
                    flags |= KEYEVENTF_KEYUP;
                }
                v.push(INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: INPUT_0 {
                        ki: KEYBDINPUT { wVk: VIRTUAL_KEY(0), wScan: unit, dwFlags: flags, time: 0, dwExtraInfo: 0 },
                    },
                });
            }
        }
        // Большие тексты шлём порциями, иначе часть символов теряется.
        for chunk in v.chunks(200) {
            send(chunk);
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
    }

    fn mouse_input(flags: MOUSE_EVENT_FLAGS, data: i32) -> INPUT {
        INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 { mi: MOUSEINPUT { dx: 0, dy: 0, mouseData: data as u32, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
        }
    }

    /// Щелчок или прокрутка там, где сейчас стоит курсор.
    pub fn mouse(op: &str, amount: i32) {
        let click = |d: MOUSE_EVENT_FLAGS, u: MOUSE_EVENT_FLAGS| vec![mouse_input(d, 0), mouse_input(u, 0)];
        let v = match op {
            "right" => click(MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
            "middle" => click(MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
            "double" => {
                let mut v = click(MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP);
                v.extend(click(MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP));
                v
            }
            "scrollUp" => vec![mouse_input(MOUSEEVENTF_WHEEL, 120 * amount.max(1))],
            "scrollDown" => vec![mouse_input(MOUSEEVENTF_WHEEL, -120 * amount.max(1))],
            _ => click(MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
        };
        send(&v);
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn keys_down(_: &[String]) {}
    pub fn keys_up(_: &[String]) {}
    pub fn type_text(_: &str) {}
    pub fn mouse(_: &str, _: i32) {}
}

pub use imp::{keys_down, keys_up, mouse, type_text};

/// Нажать и отпустить комбинацию. Пауза нужна: OBS и игры опрашивают
/// клавиатуру не на каждом событии и мгновенное нажатие пропускают.
pub fn tap(codes: &[String]) {
    keys_down(codes);
    std::thread::sleep(std::time::Duration::from_millis(45));
    keys_up(codes);
}
