import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NoSleep from 'nosleep.js';
import { normalizeProfile } from '../shared/defaults';
import { Ph, fillCss } from '../shared/render';
import type { Page, Profile, States } from '../shared/types';
import { PageNav } from './Nav';
import { PageView } from './PageView';
import { QrCamera } from './QrCamera';
import { Settings } from './Settings';
import { APP_VERSION, checkApkUpdate, isNative, keepAwake as nativeKeepAwake, onBackButton, scanQr } from './native';
import { applyOrientation, getPrefs, store, usePrefs } from './prefs';

// ---------- подключение ----------

type Conn = 'connecting' | 'online' | 'offline' | 'unauthorized' | 'setup';

/** Страница открыта с самого ПК (браузер) или внутри отдельного приложения. */
const servedByPc = !isNative && location.protocol.startsWith('http') && !/tauri\.localhost|^localhost:5191$/.test(location.host);

interface Target { host: string; token: string }

function parsePairLink(text: string): Target | null {
  try {
    const u = new URL(text.trim());
    const token = u.searchParams.get('t');
    if (!token) return null;
    return { host: u.host, token };
  } catch {
    return null;
  }
}

function initialTarget(): Target | null {
  const qs = new URLSearchParams(location.search);
  const t = qs.get('t');
  if (servedByPc) {
    if (t) {
      store.set(`ft.token.${location.host}`, t);
      history.replaceState(null, '', location.pathname);
    }
    const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(location.host);
    const token = t || store.get(`ft.token.${location.host}`) || (local ? '' : null);
    return token !== null ? { host: location.host, token } : null;
  }
  const saved = store.get('ft.target');
  if (saved) { try { return JSON.parse(saved) as Target; } catch { /* битая запись */ } }
  return null;
}

// ---------- приложение ----------

export function App() {
  const [prefs] = usePrefs();
  const [savedTarget, setTarget] = useState<Target | null>(initialTarget);
  // Приложение: если ПК доступен по USB-кабелю (adb reverse), подключаемся через него.
  const [usbTarget, setUsbTarget] = useState<Target | null>(null);
  const target = usbTarget ?? savedTarget;
  const [conn, setConn] = useState<Conn>(initialTarget() ? 'connecting' : 'setup');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [states, setStates] = useState<States>({});
  const [pcName, setPcName] = useState('');
  const [pageId, setPageId] = useState<string>(() => store.get('ft.page') || '');
  const [toast, setToast] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const historyRef = useRef<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const profileRef = useRef<Profile | null>(null);
  profileRef.current = profile;

  const pageRef = useRef(pageId);
  pageRef.current = pageId;

  const goto = useCallback((p: string) => {
    const prof = profileRef.current;
    if (!prof) return;
    const cur = pageRef.current;
    const ids = prof.pages.map((x) => x.id);
    const idx = Math.max(0, ids.indexOf(cur));
    let next = cur;
    if (p === '@back') next = historyRef.current.pop() ?? prof.home;
    else if (p === '@home') next = prof.home;
    else if (p === '@next') next = ids[(idx + 1) % ids.length];
    else if (p === '@prev') next = ids[(idx - 1 + ids.length) % ids.length];
    else next = p;
    if (p !== '@back' && next !== cur) {
      historyRef.current.push(cur);
      if (historyRef.current.length > 30) historyRef.current.shift();
    }
    pageRef.current = next;
    store.set('ft.page', next);
    setPageId(next);
  }, []);

  // Поворот экрана — как выбрано в настройках телефона.
  useEffect(() => { applyOrientation(getPrefs().orientation); }, []);

  // Экран не гаснет, пока открыт пульт. Браузер разрешает это только после касания.
  const keepAwake = prefs.keepAwake ?? profile?.keepAwake ?? true;
  useEffect(() => {
    if (isNative) {
      nativeKeepAwake(keepAwake);
      return () => { nativeKeepAwake(false); };
    }
    const ns = new NoSleep();
    if (!keepAwake) return;
    const on = () => { if (!ns.isEnabled) ns.enable().catch(() => {}); };
    document.addEventListener('pointerdown', on, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', on, { capture: true });
      ns.disable();
    };
  }, [keepAwake]);

  // WebSocket с переподключением
  const targetKey = target ? `${target.host}|${target.token}` : '';
  useEffect(() => {
    if (!target) return;
    let stop = false;
    let retry = 0;
    let timer: number | undefined;
    let ping: number | undefined;
    const open = () => {
      if (stop) return;
      setConn((c) => (c === 'online' ? 'offline' : c === 'unauthorized' ? c : 'connecting'));
      const ws = new WebSocket(`ws://${target.host}/ws?token=${encodeURIComponent(target.token)}`);
      wsRef.current = ws;
      let unauthorized = false;
      ws.onopen = () => {
        retry = 0;
        ws.send(JSON.stringify({ t: 'hello', name: getPrefs().deviceName, w: window.innerWidth, h: window.innerHeight }));
        ping = window.setInterval(() => ws.readyState === 1 && ws.send('{"t":"ping"}'), 15000);
      };
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        switch (m.t) {
          case 'hello': setPcName(m.pc); setConn('online'); break;
          case 'profile': setProfile(normalizeProfile(m.profile)); break;
          case 'states': setStates(m.states); break;
          case 'state': setStates((s) => ({ ...s, [m.key]: m.value })); break;
          case 'goto': goto(m.page); break;
          case 'toast': setToast(m.text); break;
          case 'unauthorized': unauthorized = true; setConn('unauthorized'); break;
        }
      };
      ws.onclose = () => {
        clearInterval(ping);
        if (wsRef.current === ws) wsRef.current = null;
        if (stop || unauthorized) return;
        setConn('offline');
        retry = Math.min(retry + 1, 6);
        timer = window.setTimeout(open, 400 * retry);
      };
    };
    open();
    let rt: number | undefined;
    const onResize = () => {
      clearTimeout(rt);
      rt = window.setTimeout(() => {
        const ws = wsRef.current;
        if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'screen', w: window.innerWidth, h: window.innerHeight }));
      }, 400);
    };
    window.addEventListener('resize', onResize);
    const onVis = () => {
      if (document.visibilityState === 'visible' && !wsRef.current) { clearTimeout(timer); open(); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop = true;
      clearTimeout(timer);
      clearInterval(ping);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
      clearTimeout(rt);
      wsRef.current?.close();
    };
  }, [targetKey, goto]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const send = useCallback((m: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
  }, []);

  const page: Page | undefined = useMemo(() => {
    if (!profile) return undefined;
    return profile.pages.find((p) => p.id === pageId) ?? profile.pages.find((p) => p.id === profile.home) ?? profile.pages[0];
  }, [profile, pageId]);

  const connect = (t: Target) => {
    store.set('ft.target', JSON.stringify(t));
    setTarget(t);
    setConn('connecting');
  };

  // Приложение: отключиться от этого ПК и подключить другой.
  const forget = () => {
    store.del('ft.target');
    setTarget(null);
    setProfile(null);
    setSettings(false);
    setConn('setup');
  };

  // Кнопка «Назад» Android: закрывает настройки, листает страницы назад, потом сворачивает.
  const settingsRef = useRef(false);
  settingsRef.current = settings;
  useEffect(() => {
    let off: (() => void) | undefined;
    onBackButton(() => {
      if (settingsRef.current) { setSettings(false); return true; }
      if (historyRef.current.length === 0) return false;
      goto('@back');
      return true;
    }).then((f) => { off = f; });
    return () => off?.();
  }, [goto]);

  // Кабель: раз в 3 секунды проверяем 127.0.0.1. Нашли — переходим на USB, пропал — назад на Wi-Fi.
  const port = savedTarget?.host.split(':')[1] ?? '7474';
  useEffect(() => {
    if (!isNative) return;
    let alive = true;
    const probe = async () => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 800);
      let ok = false;
      // no-cors: ответ читать не нужно — сам факт ответа значит, что ПК доступен по кабелю.
      try { await fetch(`http://127.0.0.1:${port}/api/ping`, { signal: ctl.signal, mode: 'no-cors', cache: 'no-store' }); ok = true; } catch { ok = false; }
      clearTimeout(t);
      if (!alive) return;
      setUsbTarget((cur) => (ok ? cur ?? { host: `127.0.0.1:${port}`, token: '' } : null));
    };
    probe();
    const iv = setInterval(probe, 3000);
    return () => { alive = false; clearInterval(iv); };
  }, [port]);
  useEffect(() => {
    if (usbTarget && (conn === 'setup' || conn === 'unauthorized')) setConn('connecting');
  }, [usbTarget, conn]);

  // Новая версия приложения на GitHub — точка на кнопке настроек.
  const [apkUpdate, setApkUpdate] = useState<string | null>(null);
  useEffect(() => { checkApkUpdate().then(setApkUpdate); }, []);

  const via: 'USB' | 'Wi-Fi' | '' = !target ? '' : usbTarget || /^(localhost|127\.0\.0\.1)/.test(target.host) ? 'USB' : 'Wi-Fi';
  const settingsView = settings && (
    <Settings
      conn={target ? { pcName, via, online: conn === 'online' } : null}
      profileKeepAwake={profile?.keepAwake ?? true}
      onClose={() => setSettings(false)}
      onForget={isNative ? forget : undefined}
      onRename={(name) => send({ t: 'hello', name })}
    />
  );

  if (!target || conn === 'setup' || conn === 'unauthorized') {
    return (
      <>
        <Setup
          error={conn === 'unauthorized' ? 'Код подключения устарел. Отсканируйте QR-код в программе на ПК заново.' : undefined}
          update={apkUpdate}
          onConnect={connect}
          onSettings={() => setSettings(true)}
        />
        {settingsView}
      </>
    );
  }

  const nav = profile?.nav ?? 'tabs';
  return (
    <div className={`pn-root ${conn === 'online' ? '' : 'is-offline'}`} style={page ? fillCss(page.background) : undefined}>
      {page && profile ? (
        <PageView
          page={page}
          nav={nav}
          states={states}
          send={send}
          onSwipe={(dir) => profile.pages.length > 1 && goto(dir > 0 ? '@next' : '@prev')}
        />
      ) : (
        <div className="pn-center"><div className="pn-spinner" /></div>
      )}
      <PageNav
        profile={profile}
        pageId={page?.id}
        online={conn === 'online'}
        via={via === 'USB' ? 'USB' : ''}
        update={!!apkUpdate}
        onPage={(id) => goto(id)}
        onMenu={() => setSettings(true)}
      />
      {conn !== 'online' && !settings && (
        <div className="pn-overlay">
          <div className="pn-spinner" />
          <div>{conn === 'connecting' ? 'Подключаюсь к ПК…' : 'Нет связи с ПК. Переподключаюсь…'}</div>
          <small>Проверьте, что Free Touch запущен и телефон в той же сети Wi-Fi</small>
          <div className="pn-overlay-actions">
            {isNative && <button className="pn-link" onClick={forget}>Подключить другой ПК</button>}
            <button className="pn-link" onClick={() => setSettings(true)}>Настройки</button>
          </div>
        </div>
      )}
      {settingsView}
      {toast && <div className="pn-toast">{toast}</div>}
    </div>
  );
}

// ---------- первый запуск ----------

function Setup({ onConnect, onSettings, error, update }: {
  onConnect: (t: Target) => void; onSettings: () => void; error?: string; update: string | null;
}) {
  const [link, setLink] = useState('');
  const [err, setErr] = useState(error ?? '');
  const [camera, setCamera] = useState(false);
  const submit = (text: string) => {
    const t = parsePairLink(text);
    if (!t) { setErr('Не похоже на ссылку подключения. Скопируйте её в программе на ПК.'); return; }
    onConnect(t);
  };
  return (
    <div className="pn-setup">
      <button className="pn-setup-gear" onClick={onSettings} aria-label="Настройки">
        {update && <span className="pn-upd-dot" />}
        <Ph name="gear-six" size={22} />
      </button>
      <img src="./icon-192.png" alt="" width="72" height="72" />
      <h1>Free Touch</h1>
      {isNative ? (
        <>
          <p>Откройте Free Touch на компьютере, нажмите «Подключить телефон» и отсканируйте QR-код. Или подключите телефон USB-кабелем — приложение найдёт ПК само.</p>
          <button
            className="pn-btn primary big"
            onClick={async () => {
              setErr('');
              const r = await scanQr();
              if (r.needCamera) setCamera(true);
              else if (r.text) submit(r.text);
            }}
          ><Ph name="qr-code" size={20} /> Сканировать QR-код</button>
          {camera && (
            <QrCamera
              onClose={() => setCamera(false)}
              onResult={(text) => { setCamera(false); submit(text); }}
            />
          )}
        </>
      ) : (
        <p>Откройте Free Touch на компьютере, нажмите «Подключить телефон» и отсканируйте QR-код камерой телефона.</p>
      )}
      {!servedByPc && (
        <div className="pn-form">
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="или вставьте ссылку http://192.168…" inputMode="url" />
          <button onClick={() => submit(link)}>Подключиться</button>
        </div>
      )}
      {err && <div className="pn-err">{err}</div>}
      {update && <button className="pn-link" onClick={onSettings}>Вышла версия {update} — обновить</button>}
      {isNative && <small className="pn-ver mono">версия {APP_VERSION}</small>}
    </div>
  );
}
