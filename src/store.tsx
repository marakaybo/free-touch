import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { normalizeProfile } from '../shared/defaults';
import type { Button, ClientInfo, ObsMeta, Page, Profile, ServerStatus, Settings, States, UsbStatus } from '../shared/types';
import { api, on, type Bootstrap, type NetIp } from './api';

interface Ctx {
  ready: boolean;
  version: string;
  pc: string;
  profile: Profile;
  settings: Settings;
  states: States;
  obs: ObsMeta;
  clients: ClientInfo[];
  server: ServerStatus;
  ips: NetIp[];
  usb: UsbStatus;
  pageId: string;
  page: Page;
  selected: string | null;
  selectedButton: Button | null;
  setPageId: (id: string) => void;
  select: (id: string | null) => void;
  /** Изменить профиль. Каждое изменение попадает в историю для Ctrl+Z. */
  update: (fn: (p: Profile) => void, merge?: string) => void;
  updatePage: (fn: (p: Page) => void, merge?: string) => void;
  updateButton: (id: string, fn: (b: Button) => void, merge?: string) => void;
  replaceProfile: (p: Profile) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  /** Есть правки, которые ещё не записаны на диск и не ушли на телефоны. */
  dirty: boolean;
  canRedo: boolean;
  saveSettings: (s: Settings) => Promise<void>;
  setSettingsLocal: (s: Settings) => void;
  refreshIps: () => Promise<void>;
}

const C = createContext<Ctx | null>(null);
export const useStore = () => useContext(C)!;

const EMPTY_OBS: ObsMeta = { connected: false, error: null, version: '', scenes: [], collections: [], audioInputs: [], inputs: [], sources: {} };

export function StoreProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [states, setStates] = useState<States>({});
  const [obs, setObs] = useState<ObsMeta>(EMPTY_OBS);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [server, setServer] = useState<ServerStatus>({ running: false, port: 0, error: null });
  const [ips, setIps] = useState<NetIp[]>([]);
  const [usb, setUsb] = useState<UsbStatus>({ enabled: false, adb: null, devices: [], error: null, installing: false });
  const [pageId, setPageId] = useState('');
  const [selected, select] = useState<string | null>(null);
  const past = useRef<{ p: Profile; key?: string; t: number }[]>([]);
  const future = useRef<Profile[]>([]);
  const [, bump] = useState(0);
  const saveTimer = useRef<number | undefined>(undefined);

  // Текущий профиль в ref: история отмены и автосохранение не зависят от того,
  // сколько раз React вызовет функции обновления состояния.
  const profileRef = useRef<Profile | null>(null);

  useEffect(() => {
    api.bootstrap().then((b) => {
      const p = normalizeProfile(b.profile);
      if (JSON.stringify(p) !== JSON.stringify(b.profile)) api.saveProfile(p);
      profileRef.current = p;
      setBoot(b);
      setProfile(p);
      setSettings(b.settings);
      setStates(b.states);
      setObs(b.obs);
      setClients(b.clients);
      setServer(b.server);
      setIps(b.ips);
      if (b.usb) setUsb(b.usb);
      setPageId(p.home);
    });
    const offs = [
      on<{ key: string; value: unknown }>('ft-state', ({ key, value }) =>
        setStates((s) => {
          if (value === null) { const n = { ...s }; delete n[key]; return n; }
          return { ...s, [key]: value };
        })),
      on<ObsMeta>('ft-obs', setObs),
      on<ClientInfo[]>('ft-clients', setClients),
      on<ServerStatus>('ft-server', setServer),
      on<UsbStatus>('ft-usb', setUsb),
    ];
    return () => { offs.forEach((o) => o.then((f) => f())); };
  }, []);

  const [dirty, setDirty] = useState(false);
  const commit = useCallback((next: Profile) => {
    profileRef.current = next;
    setProfile(next);
    setDirty(true);
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = undefined;
      api.saveProfile(next).then(() => { if (profileRef.current === next) setDirty(false); });
    }, 400);
    bump((x) => x + 1);
  }, []);

  // Не теряем последнюю правку, если окно закрывают сразу после неё.
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current !== undefined && profileRef.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = undefined;
        const p = profileRef.current;
        api.saveProfile(p).then(() => { if (profileRef.current === p) setDirty(false); });
      }
    };
    window.addEventListener('blur', flush);
    window.addEventListener('beforeunload', flush);
    return () => { window.removeEventListener('blur', flush); window.removeEventListener('beforeunload', flush); };
  }, []);

  const update = useCallback((fn: (p: Profile) => void, merge?: string) => {
    const cur = profileRef.current;
    if (!cur) return;
    const next = structuredClone(cur);
    fn(next);
    const last = past.current[past.current.length - 1];
    const now = Date.now();
    // Серию мелких правок одного поля (ползунок, ввод текста) склеиваем в один шаг отмены.
    if (merge && last && last.key === merge && now - last.t < 1500) {
      last.t = now;
    } else {
      past.current.push({ p: cur, key: merge, t: now });
      if (past.current.length > 150) past.current.shift();
    }
    future.current = [];
    commit(next);
  }, [commit]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    const cur = profileRef.current;
    if (!prev || !cur) return;
    future.current.push(cur);
    commit(prev.p);
  }, [commit]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    const cur = profileRef.current;
    if (!next || !cur) return;
    past.current.push({ p: cur, t: 0 });
    commit(next);
  }, [commit]);

  const page = useMemo(() => {
    if (!profile) return null;
    return profile.pages.find((p) => p.id === pageId) ?? profile.pages[0];
  }, [profile, pageId]);

  const updatePage = useCallback((fn: (p: Page) => void, merge?: string) => {
    update((p) => {
      const pg = p.pages.find((x) => x.id === (page?.id ?? ''));
      if (pg) fn(pg);
    }, merge);
  }, [update, page?.id]);

  const updateButton = useCallback((id: string, fn: (b: Button) => void, merge?: string) => {
    update((p) => {
      for (const pg of p.pages) {
        const b = pg.buttons.find((x) => x.id === id);
        if (b) { fn(b); return; }
      }
    }, merge ? `${id}:${merge}` : undefined);
  }, [update]);

  const replaceProfile = useCallback((raw: Profile) => {
    const p = normalizeProfile(raw);
    update((cur) => { Object.assign(cur, p); });
    setPageId(p.home);
    select(null);
  }, [update]);

  const saveSettings = useCallback(async (s: Settings) => {
    const saved = await api.saveSettings(s);
    setSettings(saved);
  }, []);

  const refreshIps = useCallback(async () => setIps(await api.netIps()), []);

  if (!boot || !profile || !settings || !page) {
    return <div className="boot"><div className="boot-logo" /></div>;
  }

  const selectedButton = page.buttons.find((b) => b.id === selected) ?? null;

  const value: Ctx = {
    ready: true,
    version: boot.version,
    pc: boot.pc,
    profile,
    settings,
    states,
    obs,
    clients,
    server,
    ips,
    usb,
    pageId: page.id,
    page,
    selected: selectedButton ? selected : null,
    selectedButton,
    setPageId: (id) => { setPageId(id); select(null); },
    select,
    update,
    updatePage,
    updateButton,
    replaceProfile,
    undo,
    redo,
    canUndo: past.current.length > 0,
    dirty,
    canRedo: future.current.length > 0,
    saveSettings,
    setSettingsLocal: setSettings,
    refreshIps,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
