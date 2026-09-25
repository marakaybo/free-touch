// Страница пульта: клавиши по сетке или в свободной раскладке.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { NAV_HEIGHT, PANEL_PAD, computeGrid, freeRectsOf, layoutOf, posStyle, rectStyle, type Orient } from '../shared/layout';
import { ButtonFace, SliderFace, sliderStateKey, usesClock } from '../shared/render';
import type { Button, NavStyle, Page, States } from '../shared/types';
import { haptic, isNative } from './native';
import { getPrefs } from './prefs';

export const vibrate = (ms: number | number[]) => {
  if (!getPrefs().haptics) return;
  if (isNative) { haptic(Array.isArray(ms) ? 'long' : ms > 10 ? 'tap' : 'tick'); return; }
  try { navigator.vibrate?.(ms); } catch { /* нет вибро */ }
};

export function useViewport() {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useLayoutEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vp;
}

type Send = (m: object) => void;

export function PageView({ page, nav, states, send, onSwipe }: {
  page: Page;
  nav: NavStyle;
  states: States;
  send: Send;
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

  // Телефон вертикально — вертикальная раскладка страницы, горизонтально — горизонтальная.
  const orient: Orient = vp.h > vp.w ? 'portrait' : 'landscape';
  const navH = NAV_HEIGHT[nav];
  const areaW = vp.w - PANEL_PAD * 2;
  const areaH = vp.h - PANEL_PAD * 2 - navH;

  const layout = useMemo(() => layoutOf(page, orient), [page, orient]);
  const rects = useMemo(() => (page.mode === 'free' ? freeRectsOf(page, orient, areaW, areaH) : null), [page, orient, areaW, areaH]);
  const grid = computeGrid(areaW, areaH, layout.cols, layout.rows, page.gap, page.square);

  // свайп по пустому месту — соседняя страница
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const cells = page.buttons.map((b) => {
    let style: CSSProperties;
    let vertical: boolean;
    if (rects) {
      const r = rects[b.id];
      if (!r) return null;
      style = rectStyle(r);
      vertical = r.h * areaH >= r.w * areaW;
    } else {
      const p = layout.pos[b.id];
      if (!p) return null;
      style = posStyle(p);
      vertical = p.h * grid.ch >= p.w * grid.cw;
    }
    return b.type === 'slider'
      ? <SliderCell key={b.id} b={b} style={style} vertical={vertical} page={page} states={states} send={send} />
      : <ButtonCell key={b.id} b={b} style={style} page={page} states={states} send={send} now={now} />;
  });

  return (
    <div
      className="pn-stage"
      style={{ height: vp.h - navH }}
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
      {rects ? (
        <div className="pn-grid pn-free" style={{ width: areaW, height: areaH }}>{cells}</div>
      ) : (
        <div
          className="pn-grid"
          style={{
            width: grid.gw,
            height: grid.gh,
            gridTemplateColumns: `repeat(${layout.cols}, ${grid.cw}px)`,
            gridTemplateRows: `repeat(${layout.rows}, ${grid.ch}px)`,
            gap: page.gap,
          }}
        >
          {cells}
        </div>
      )}
    </div>
  );
}

const LONG_MS = 500;

function ButtonCell({ b, style, page, states, send, now }: {
  b: Button; style: CSSProperties; page: Page; states: States; send: Send; now: Date;
}) {
  const [pressed, setPressed] = useState(false);
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
      style={style}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        down.current = true;
        setPressed(true);
        vibrate(12);
        if (hasLong) {
          longFired.current = false;
          longTimer.current = window.setTimeout(() => {
            longFired.current = true;
            vibrate([20, 40, 30]);
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
      <ButtonFace button={b} states={states} pressed={pressed} now={now} />
      {hasLong && <span className="ft-long-mark" />}
    </div>
  );
}

function SliderCell({ b, style, vertical, page, states, send }: {
  b: Button; style: CSSProperties; vertical: boolean; page: Page; states: States; send: Send;
}) {
  const remote = Number(states[sliderStateKey(b)] ?? 0);
  const [local, setLocal] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const last = useRef(0);
  const ref = useRef<HTMLDivElement>(null);

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
      style={style}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        ref.current!.dataset.drag = '1';
        setDragging(true);
        vibrate(8);
        push(valueAt(e), true);
      }}
      onPointerMove={(e) => { if (ref.current?.dataset.drag) push(valueAt(e)); }}
      onPointerUp={(e) => {
        delete ref.current!.dataset.drag;
        setDragging(false);
        push(valueAt(e), true);
        setTimeout(() => setLocal(null), 1200);
      }}
      onPointerCancel={() => { delete ref.current!.dataset.drag; setDragging(false); setLocal(null); }}
    >
      <SliderFace button={b} states={states} value={local ?? remote} dragging={dragging} vertical={vertical} />
    </div>
  );
}
