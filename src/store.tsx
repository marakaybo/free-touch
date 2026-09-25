import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { defaultProfile } from '../shared/defaults';
import type { Button, ClientInfo, ObsMeta, Page, Profile, ServerStatus, Settings, States } from '../shared/types';
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
  const [pageId, setPageId] = useState('');
  const [selected, select] = useState<string | null>(null);
  const past = useRef<{ p: Profile; key?: string; t: number }[]>([]);
  const future = useRef<Profile[]>([]);
  const [, bump] = useState(0);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    api.bootstrap().then((b) => {
      let p = b.profile;
      if (!p || !Array.isArray(p.pages) || p.pages.length === 0) {
        p = defaultProfile();
        api.saveProfile(p);
      }
      setBoot(b);
      setProfile(p);
      setSettings(b.settings);
      setStates(b.states);
      setObs(b.obs);
      setClients(b.clients);
      setServer(b.server);
      setIps(b.ips);
      setPageId(p.home || p.pages[0].id);
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
    ];
    return () => { offs.forEach((o) => o.then((f) => f())); };
  }, []);

  const commit = useCallback((next: Profile) => {
    setProfile(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => api.saveProfile(next), 250);
  }, []);

  const update = useCallback((fn: (p: Profile) => void, merge?: string) => {
    setProfile((cur) => {
      if (!cur) return cur;
      const next = structuredClone(cur);
      fn(next);
      const last = past.current[past.current.length - 1];
      const now = Date.now();
      // Серию мелких правок одного поля (ползунок, ввод текста) склеиваем в один шаг отмены.
      if (!(merge && last && last.key === merge && now - last.t < 1500)) {
        past.current.push({ p: cur, key: merge, t: now });
        if (past.current.length > 150) past.current.shift();
      } else {
        last.t = now;
      }
      future.current = [];
      clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => api.saveProfile(next), 250);
      return next;
    });
    bump((x) => x + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev || !profile) return;
    future.current.push(profile);
    commit(prev.p);
    bump((x) => x + 1);
  }, [profile, commit]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next || !profile) return;
    past.current.push({ p: profile, t: 0 });
    commit(next);
    bump((x) => x + 1);
  }, [profile, commit]);

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

  const replaceProfile = useCallback((p: Profile) => {
    update((cur) => { Object.assign(cur, p); });
    setPageId(p.home || p.pages[0]?.id);
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
    canRedo: future.current.length > 0,
    saveSettings,
    setSettingsLocal: setSettings,
    refreshIps,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
