import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import NoSleep from 'nosleep.js';
import { normalizeProfile } from '../shared/defaults';
import { ButtonFace, SliderFace, cellStyle, fillCss, sliderStateKey, usesClock } from '../shared/render';
import type { Button, Page, Profile, States } from '../shared/types';

// ---------- подключение ----------

type Conn = 'connecting' | 'online' | 'offline' | 'unauthorized' | 'setup';

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* приватный режим */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* приватный режим */ } },
};

/** Страница открыта с самого ПК (браузер) или внутри отдельного приложения. */
const servedByPc = location.protocol.startsWith('http') && !/tauri\.localhost|^localhost:5191$/.test(location.host);

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
    const token = t || store.get(`ft.token.${location.host}`);
    return token ? { host: location.host, token } : null;
  }
  const saved = store.get('ft.target');
  if (saved) { try { return JSON.parse(saved) as Target; } catch { /* битая запись */ } }
  return null;
}

function deviceName(): string {
  const saved = store.get('ft.device');
  if (saved) return saved;
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : 'Устройство';
  const m = ua.match(/;\s*([^;)]+)\s+Build\//);
  return m ? `${m[1]}` : os;
}

const vibrate = (ms: number | number[]) => { try { navigator.vibrate?.(ms); } catch { /* нет вибро */ } };

// ---------- приложение ----------

export function App() {
  const [target, setTarget] = useState<Target | null>(initialTarget);
  const [conn, setConn] = useState<Conn>(target ? 'connecting' : 'setup');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [states, setStates] = useState<States>({});
  const [pcName, setPcName] = useState('');
  const [pageId, setPageId] = useState<string>(() => store.get('ft.page') || '');
  const [toast, setToast] = useState<string | null>(null);
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

  // Экран не гаснет, пока открыт пульт. Браузер разрешает это только после касания.
  const keepAwake = profile?.keepAwake ?? true;
  useEffect(() => {
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
        ws.send(JSON.stringify({ t: 'hello', name: deviceName() }));
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
    const onVis = () => {
      if (document.visibilityState === 'visible' && !wsRef.current) { clearTimeout(timer); open(); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop = true;
      clearTimeout(timer);
      clearInterval(ping);
      document.removeEventListener('visibilitychange', onVis);
      wsRef.current?.close();
    };
  }, [target, goto]);

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

  if (!target || conn === 'setup') return <Setup onConnect={connect} />;
  if (conn === 'unauthorized') {
    return (
      <Setup
        error="Код подключения устарел. Отсканируйте QR-код в программе на ПК заново."
        onConnect={connect}
      />
    );
  }

  return (
    <div className="pn-root" style={page ? fillCss(page.background) : undefined}>
      {page && profile ? (
        <PageView
          page={page}
          profile={profile}
          states={states}
          send={send}
          onSwipe={(dir) => profile.pages.length > 1 && goto(dir > 0 ? '@next' : '@prev')}
        />
      ) : (
        <div className="pn-center"><div className="pn-spinner" /></div>
      )}
      <BottomBar
        profile={profile}
        pageId={page?.id}
        online={conn === 'online'}
        pcName={pcName}
        onPage={(id) => goto(id)}
      />
      {conn !== 'online' && (
        <div className="pn-overlay">
          <div className="pn-spinner" />
          <div>{conn === 'connecting' ? 'Подключаюсь к ПК…' : 'Нет связи с ПК. Переподключаюсь…'}</div>
          <small>Проверьте, что Free Touch запущен и телефон в той же сети Wi-Fi</small>
        </div>
      )}
      {toast && <div className="pn-toast">{toast}</div>}
    </div>
  );
}

// ---------- сетка ----------

function useViewport() {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useLayoutEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vp;
}

const BAR = 34;
const PAD = 14;

function PageView({ page, profile, states, send, onSwipe }: {
  page: Page;
  profile: Profile;
  states: States;
  send: (m: object) => void;
  onSwipe: (dir: number) => void;
}) {
  const vp = useViewport();
  const [now, setNow] = useState(new Date());
  const clock = page.buttons.some((b) => usesClock(b.style.label));
  useEffect(() => {
    if (!clock) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [clock]);

  const availW = vp.w - PAD * 2;
  const availH = vp.h - PAD * 2 - BAR;
  const cell = Math.max(20, Math.min((availW - page.gap * (page.cols - 1)) / page.cols, (availH - page.gap * (page.rows - 1)) / page.rows));
  const gw = cell * page.cols + page.gap * (page.cols - 1);
  const gh = cell * page.rows + page.gap * (page.rows - 1);
  // Если в другой ориентации кнопки станут заметно крупнее — подскажем повернуть телефон.
  const rotW = vp.h - PAD * 2;
  const rotH = vp.w - PAD * 2 - BAR;
  const cellRot = Math.min((rotW - page.gap * (page.cols - 1)) / page.cols, (rotH - page.gap * (page.rows - 1)) / page.rows);
  const [hintOff, setHintOff] = useState(false);
  const rotateHint = !hintOff && cell < 110 && cellRot > cell * 1.4;

  // свайп по пустому месту — соседняя страница
  const swipe = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className="pn-stage"
      style={{ height: vp.h - BAR }}
      onPointerDown={(e) => {
        const el = e.target as HTMLElement;
        if (el === e.currentTarget || el.classList.contains('pn-grid')) swipe.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const s = swipe.current;
        swipe.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) onSwipe(dx < 0 ? 1 : -1);
      }}
    >
      {rotateHint && (
        <button className="pn-rotate" onClick={() => setHintOff(true)}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M3 12a9 9 0 0 1 3-6.7M21 12a9 9 0 0 1-3 6.7" /></svg>
          Поверните телефон — кнопки станут крупнее
        </button>
      )}
      <div className="pn-grid" style={{ width: gw, height: gh, gridTemplateColumns: `repeat(${page.cols}, 1fr)`, gridTemplateRows: `repeat(${page.rows}, 1fr)`, gap: page.gap }}>
        {page.buttons.map((b) =>
          b.type === 'slider' ? (
            <SliderCell key={b.id} b={b} page={page} states={states} send={send} />
          ) : (
            <ButtonCell key={b.id} b={b} page={page} states={states} send={send} accent={profile.accent} now={now} />
          ),
        )}
      </div>
    </div>
  );
}

const LONG_MS = 500;

function ButtonCell({ b, page, states, send, accent, now }: {
  b: Button; page: Page; states: States; send: (m: object) => void; accent: string; now: Date;
}) {
  const [pressed, setPressed] = useState(false);
  const [pulse, setPulse] = useState(0);
  const down = useRef(false);
  const longTimer = useRef<number | undefined>(undefined);
  const longFired = useRef(false);
  const hasLong = b.longActions.length > 0;
  const msg = (t: string) => send({ t, page: page.id, button: b.id });

  const release = (cancelled: boolean) => {
    if (!down.current) return;
    down.current = false;
    setPressed(false);
    if (hasLong) {
      clearTimeout(longTimer.current);
      // Короткое нажатие у кнопки с долгим срабатывает, когда палец отпустили.
      if (!longFired.current && !cancelled) { msg('down'); msg('up'); }
      return;
    }
    msg('up');
  };

  useEffect(() => () => clearTimeout(longTimer.current), []);

  return (
    <div
      className={`ft-cell ${hasLong && pressed ? 'is-holding' : ''}`}
      style={cellStyle(b)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        down.current = true;
        setPressed(true);
        setPulse((p) => p + 1);
        vibrate(12);
        if (hasLong) {
          longFired.current = false;
          longTimer.current = window.setTimeout(() => {
            longFired.current = true;
            vibrate([20, 40, 30]);
            setPulse((p) => p + 1);
            msg('long');
          }, LONG_MS);
        } else {
          msg('down');
        }
      }}
      onPointerUp={() => release(false)}
      onPointerCancel={() => release(true)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <ButtonFace button={b} states={states} accent={accent} pressed={pressed} pulse={pulse} now={now} />
      {hasLong && <span className="ft-long-mark" />}
    </div>
  );
}

function SliderCell({ b, page, states, send }: { b: Button; page: Page; states: States; send: (m: object) => void }) {
  const key = sliderStateKey(b);
  const remote = Number(states[key] ?? 0);
  const [local, setLocal] = useState<number | null>(null);
  const last = useRef(0);
  const ref = useRef<HTMLDivElement>(null);
  const vertical = b.slider?.vertical ?? true;

  const valueAt = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const v = vertical ? (r.bottom - e.clientY) / r.height : (e.clientX - r.left) / r.width;
    return Math.round(Math.max(0, Math.min(1, v)) * 100);
  };
  const push = (v: number, force = false) => {
    setLocal(v);
    const t = performance.now();
    if (force || t - last.current > 40) {
      last.current = t;
      send({ t: 'slide', page: page.id, button: b.id, value: v });
    }
  };

  // после отпускания держим своё значение, пока ПК не подтвердит
  useEffect(() => {
    if (local !== null && !ref.current?.dataset.drag && Math.abs(remote - local) <= 1) setLocal(null);
  }, [remote, local]);

  return (
    <div
      ref={ref}
      className="ft-cell"
      style={cellStyle(b)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        ref.current!.dataset.drag = '1';
        vibrate(8);
        push(valueAt(e), true);
      }}
      onPointerMove={(e) => { if (ref.current?.dataset.drag) push(valueAt(e)); }}
      onPointerUp={(e) => {
        delete ref.current!.dataset.drag;
        push(valueAt(e), true);
        setTimeout(() => setLocal(null), 1200);
      }}
      onPointerCancel={() => { delete ref.current!.dataset.drag; setLocal(null); }}
    >
      <SliderFace button={b} states={states} value={local ?? remote} />
    </div>
  );
}

// ---------- нижняя панель ----------

function BottomBar({ profile, pageId, online, pcName, onPage }: {
  profile: Profile | null; pageId?: string; online: boolean; pcName: string; onPage: (id: string) => void;
}) {
  const [fs, setFs] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFs = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch { /* браузер не разрешил */ }
  };
  return (
    <div className="pn-bar" style={{ height: BAR }}>
      <div className="pn-status"><span className={`pn-led ${online ? 'on' : ''}`} />{pcName}</div>
      <div className="pn-dots">
        {profile && profile.pageDots && profile.pages.length > 1 && profile.pages.map((p) => (
          <button key={p.id} className={p.id === pageId ? 'on' : ''} onClick={() => onPage(p.id)} aria-label={p.name}>
            <span />
          </button>
        ))}
      </div>
      <button className="pn-fs" onClick={toggleFs} aria-label="Во весь экран">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {fs
            ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
            : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
        </svg>
      </button>
    </div>
  );
}

// ---------- первый запуск ----------

function Setup({ onConnect, error }: { onConnect: (t: Target) => void; error?: string }) {
  const [link, setLink] = useState('');
  const [err, setErr] = useState(error ?? '');
  const submit = () => {
    const t = parsePairLink(link);
    if (!t) { setErr('Не похоже на ссылку подключения. Скопируйте её в программе на ПК.'); return; }
    onConnect(t);
  };
  return (
    <div className="pn-setup">
      <img src="./icon-192.png" alt="" width="84" height="84" />
      <h1>Free Touch</h1>
      <p>Откройте Free Touch на компьютере, нажмите «Подключить телефон» и отсканируйте QR-код камерой телефона.</p>
      {!servedByPc && (
        <div className="pn-form">
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="или вставьте ссылку http://192.168…" inputMode="url" />
          <button onClick={submit}>Подключиться</button>
        </div>
      )}
      {err && <div className="pn-err">{err}</div>}
    </div>
  );
}
