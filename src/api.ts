// Мост к Rust. В обычном браузере (npm run dev без Tauri) работает на заглушках.
import type { ClientInfo, ObsMeta, Profile, ServerStatus, Settings, States, UsbStatus } from '../shared/types';

export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface NetIp { ip: string; name: string; lan: boolean }
export interface AudioDevice { id: string; name: string; default: boolean }

export interface Bootstrap {
  version: string;
  pc: string;
  profile: Profile | null;
  settings: Settings;
  states: States;
  server: ServerStatus;
  obs: ObsMeta;
  clients: ClientInfo[];
  ips: NetIp[];
  usb: UsbStatus;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!inTauri) return mock(cmd, args) as T;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

export const api = {
  bootstrap: () => invoke<Bootstrap>('bootstrap'),
  saveProfile: (profile: Profile) => invoke<void>('save_profile', { profile }),
  saveSettings: (settings: Settings) => invoke<Settings>('save_settings', { settings }),
  regenerateToken: () => invoke<Settings>('regenerate_token'),
  netIps: () => invoke<NetIp[]>('net_ips'),
  pairQr: (url: string) => invoke<string>('pair_qr', { url }),
  testActions: (actions: unknown[]) => invoke<string[]>('test_actions', { actions }),
  obsDetect: () => invoke<{ port: number; password: string; enabled: boolean } | null>('obs_detect'),
  audioApps: () => invoke<string[]>('audio_apps'),
  audioDevices: (input: boolean) => invoke<AudioDevice[]>('audio_devices', { input }),
  soundOutputs: () => invoke<string[]>('sound_outputs'),
  windowApps: () => invoke<string[]>('window_apps'),
  readText: (path: string) => invoke<string>('read_text', { path }),
  writeText: (path: string, text: string) => invoke<void>('write_text', { path, text }),
  readImage: (path: string) => invoke<string>('read_image', { path }),
  allowFirewall: () => invoke<void>('allow_firewall'),
  usbInstallAdb: () => invoke<void>('usb_install_adb'),
  usbPlainPhones: () => invoke<string[]>('usb_plain_phones'),
  quit: () => invoke<void>('quit'),
};

export async function on<T>(event: string, cb: (payload: T) => void): Promise<() => void> {
  if (!inTauri) return () => {};
  const { listen } = await import('@tauri-apps/api/event');
  return listen<T>(event, (e) => cb(e.payload));
}

export async function win() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

export async function pickFile(filters: { name: string; extensions: string[] }[]): Promise<string | null> {
  if (!inTauri) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const r = await open({ multiple: false, filters });
  return typeof r === 'string' ? r : null;
}

export async function saveFile(name: string, filters: { name: string; extensions: string[] }[]): Promise<string | null> {
  if (!inTauri) return null;
  const { save } = await import('@tauri-apps/plugin-dialog');
  return save({ defaultPath: name, filters });
}

export async function openUrl(url: string) {
  if (!inTauri) { window.open(url, '_blank'); return; }
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(url);
}

export async function autostart(enable?: boolean): Promise<boolean> {
  if (!inTauri) return false;
  const a = await import('@tauri-apps/plugin-autostart');
  if (enable === true) await a.enable();
  if (enable === false) await a.disable();
  return a.isEnabled();
}

// ---------- заглушки для разработки в браузере ----------
function mock(cmd: string, args?: Record<string, unknown>): unknown {
  switch (cmd) {
    case 'bootstrap':
      return {
        version: 'dev', pc: 'DEV-PC', profile: JSON.parse(localStorage.getItem('mock.profile') || 'null'),
        settings: { port: 7474, token: 'devtoken0000000000000000', obs: { enabled: true, host: '127.0.0.1', port: 4455, password: '' }, startMinimized: false, closeToTray: true, preferredIp: '', obsAutodetected: true },
        states: { 'obs.connected': true, 'obs.scene': 'Игра', 'obs.streaming': true, 'system.muted': true, 'system.volume': 42, 'system.cpu': 17, 'system.ram': 48, 'media.title': 'Blinding Lights', 'media.artist': 'The Weeknd', 'media.playing': true, 'obs.streamTime': '01:12:40', 'counter:Смерти': 7, 'system.output': 'Динамики (Logitech PRO X Gaming Headset)', 'system.micMuted': false, 'system.micVolume': 80 },
        server: { running: true, port: 7474, error: null },
        obs: { connected: true, error: null, version: '5.6', scenes: ['Начало', 'Игра', 'Отойду', 'Конец'], collections: ['Хоррор', 'Minecraft'], audioInputs: ['Микрофон', 'Звук рабочего стола'], inputs: ['Микрофон', 'Звук рабочего стола', 'Аватар'], sources: { Игра: ['Аватар', 'Микрофон'] } },
        clients: [{ id: 1, name: 'Pixel 7', addr: '192.168.1.40' }],
        ips: [{ ip: '192.168.1.10', name: 'Wi-Fi', lan: true }, { ip: '10.8.0.2', name: 'WireGuard', lan: false }],
        usb: { enabled: true, adb: 'C:/adb.exe', devices: [{ serial: 'R5CT123', state: 'device', model: 'SM S918B', ready: true }], error: null, installing: false },
      };
    case 'save_profile': localStorage.setItem('mock.profile', JSON.stringify(args?.profile)); return null;
    case 'save_settings': return args?.settings;
    case 'pair_qr': return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#fff"/><rect x="2" y="2" width="6" height="6" fill="#000"/></svg>';
    case 'net_ips': return [{ ip: '192.168.1.10', name: 'Wi-Fi', lan: true }];
    case 'usb_plain_phones': return ['Galaxy A51'];
    case 'audio_apps': return ['chrome.exe', 'discord.exe', 'obs64.exe', 'spotify.exe'];
    case 'test_actions': return [];
    case 'audio_devices': return args?.input
      ? [{ id: '1', name: 'Микрофон (fifine Microphone)', default: true }]
      : [{ id: '2', name: 'Динамики (Realtek(R) Audio)', default: false }, { id: '3', name: 'Динамики (Logitech PRO X Gaming Headset)', default: true }];
    case 'sound_outputs': return ['Динамики (Realtek(R) Audio)', 'Динамики (Logitech PRO X Gaming Headset)', 'CABLE Input (VB-Audio Virtual Cable)'];
    case 'window_apps': return ['discord.exe', 'minecraft.exe', 'obs64.exe', 'telegram.exe'];
    default: return null;
  }
}
