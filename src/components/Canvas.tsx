import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { newButton, uid } from '../../shared/defaults';
import {
  DEFAULT_SCREEN, NAV_HEIGHT, PANEL_PAD, computeGrid, findFreeRect, firstFreeIn, fitsIn, freeRectsOf, layoutOf, placeNew,
  removeButton, setGrid, setPos, setRect, spotForCopy, toFree, workArea, type Orient,
} from '../../shared/layout';
import { ButtonFace, Ph, SliderFace, fillCss, sliderStateKey, usesClock } from '../../shared/render';
import type { Button, NavStyle, Page, Pos, Rect } from '../../shared/types';
import { PageNav } from '../../panel/Nav';
import { useStore } from '../store';
import { Seg } from './ui';

let clipboard: Button | null = null;

/** Экран телефона в CSS-пикселях: берём у подключённого телефона, иначе типичный. */
export function useScreen() {
  const { clients } = useStore();
  const c = clients.find((x) => x.screen);
  const [a, b] = c?.screen ?? [DEFAULT_SCREEN.w, DEFAULT_SCREEN.h];
  return { short: Math.min(a, b), long: Math.max(a, b), device: c?.name ?? null };
}

export type Areas = Record<Orient, { w: number; h: number }>;

/** Рабочая область пульта в обеих ориентациях — для свободной раскладки. */
export function useAreas(): Areas {
  const { profile } = useStore();
  const sc = useScreen();
  return {
    landscape: workArea(sc.long, sc.short, profile.nav),
    portrait: workArea(sc.short, sc.long, profile.nav),
  };
}

const other = (o: Orient): Orient => (o === 'landscape' ? 'portrait' : 'landscape');

/** Добавить клавишу в свободной раскладке: здесь — на место r, в другой ориентации — в свободное место. */
export function placeNewFree(p: Page, orient: Orient, b: Button, r: Rect, areas: Areas) {
  const spot = firstFreeIn(layoutOf(p, 'landscape')) ?? { x: 0, y: 0 };
  Object.assign(b, spot, { w: 1, h: 1 });
  const o = other(orient);
  const rest = Object.values(freeRectsOf(p, o, areas[o].w, areas[o].h));
  p.buttons.push(b);
  setRect(p, orient, b.id, r);
  const w = Math.min(90, r.w);
  setRect(p, o, b.id, findFreeRect(rest, w, Math.min(90, (w * areas[o].w) / areas[o].h)));
}

/** Копия клавиши рядом с оригиналом — в сетке или в свободной раскладке. */
export function duplicate(p: Page, orient: Orient, src: Button, areas: Areas): string | null {
  const copy: Button = { ...structuredClone(src), id: uid() };
  if (p.mode === 'free') {
    const r = freeRectsOf(p, orient, areas[orient].w, areas[orient].h)[src.id] ?? { x: 0, y: 0, w: 20, h: 20 };
    const n = { ...r, x: Math.min(100 - r.w, r.x + 3), y: Math.min(100 - r.h, r.y + 3) };
    placeNewFree(p, orient, copy, n, areas);
    return copy.id;
  }
  const cur = layoutOf(p, orient).pos[src.id] ?? { x: 0, y: 0, w: 1, h: 1 };
  const spot = spotForCopy(p, orient, cur);
  if (!spot) return null;
  placeNew(p, orient, copy, spot);
  return copy.id;
}

type Drag = { id: string; kind: 'move' | 'resize'; sx: number; sy: number; o: Pos | Rect; moved: boolean };
type Ghost = (Pos & { ok: boolean; swap?: string }) | null;

const SNAP = 1.4; // проценты: насколько близко край прилипает к краю соседа

/** Прилипание к краям и центрам других клавиш и к краям экрана. Возвращает сдвиг и линии-подсказки. */
function snapAxis(edges: number[], targets: number[]): { d: number; line: number | null } {
  let best = { d: 0, line: null as number | null, dist: SNAP };
  for (const e of edges) for (const t of targets) {
    const dist = Math.abs(t - e);
    if (dist < best.dist) best = { d: t - e, line: t, dist };
  }
  return { d: best.d, line: best.line };
}

export function Canvas() {
  const { page, profile, states, selected, select, updatePage, orient, setOrient, setPageId } = useStore();
  const screen = useScreen();
  const areas = useAreas();
  const wrap = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 600, h: 400 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [ghost, setGhost] = useState<Ghost>(null);
  const [freeDraft, setFreeDraft] = useState<{ id: string; r: Rect; gx: number | null; gy: number | null } | null>(null);
  const [now, setNow] = useState(new Date());

  useLayoutEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const clock = page.buttons.some((b) => usesClock(b.style.label));
  useEffect(() => {
    if (!clock) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [clock]);

  const free = page.mode === 'free';
  const nav: NavStyle = profile.nav;
  const layout = useMemo(() => layoutOf(page, orient), [page, orient]);

  // Экран телефона в его пикселях — считаем раскладку ровно как пульт, потом масштабируем.
  const PW = orient === 'landscape' ? screen.long : screen.short;
  const PH = orient === 'landscape' ? screen.short : screen.long;
  const navH = NAV_HEIGHT[nav];
  const area = areas[orient];
  const grid = computeGrid(area.w, area.h, layout.cols, layout.rows, page.gap, page.square);
  const s = Math.max(0.2, Math.min((box.w - 48) / PW, (box.h - 40) / PH, 2));
  const rects = useMemo(() => (free ? freeRectsOf(page, orient, area.w, area.h) : {}), [free, page, orient, area.w, area.h]);

  // сетка: ячейки
  const gap = page.gap * s;
  const cw = grid.cw * s;
  const ch = grid.ch * s;
  const stepX = cw + gap;
  const stepY = ch + gap;
  const posPx = (p: Pos) => ({ left: p.x * stepX, top: p.y * stepY, width: p.w * cw + (p.w - 1) * gap, height: p.h * ch + (p.h - 1) * gap });
  // свободно: проценты рабочей области
  const AW = area.w * s;
  const AH = area.h * s;
  const rectPx = (r: Rect) => ({ left: (r.x / 100) * AW, top: (r.y / 100) * AH, width: (r.w / 100) * AW, height: (r.h / 100) * AH });

  // горячие клавиши холста
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable], .insp, .modal-bg')) return;
      const sel = page.buttons.find((b) => b.id === selected);
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault();
        updatePage((p) => removeButton(p, sel.id));
        select(null);
      } else if (e.ctrlKey && e.code === 'KeyC' && sel) {
        clipboard = structuredClone(sel);
      } else if (e.ctrlKey && (e.code === 'KeyV' || e.code === 'KeyD')) {
        const src = e.code === 'KeyD' ? sel : clipboard;
        if (!src) return;
        e.preventDefault();
        let id: string | null = null;
        updatePage((p) => { id = duplicate(p, orient, src, areas); });
        if (id) select(id);
      } else if (e.key === 'Escape') {
        select(null);
      } else if (sel && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
        const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
        if (free) {
          const r = rects[sel.id];
          if (!r) return;
          const k = e.shiftKey ? 5 : 1;
          const n = { ...r, x: Math.max(0, Math.min(100 - r.w, r.x + dx * k)), y: Math.max(0, Math.min(100 - r.h, r.y + dy * k)) };
          updatePage((p) => setRect(p, orient, sel.id, n), `nudge-${sel.id}`);
          return;
        }
        const selPos = layout.pos[sel.id];
        if (!selPos) return;
        const np = { ...selPos, x: selPos.x + dx, y: selPos.y + dy };
        if (fitsIn(layout, np.x, np.y, np.w, np.h, sel.id)) updatePage((p) => setPos(p, orient, sel.id, np));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page, layout, rects, free, orient, areas, selected, select, updatePage]);

  const startDrag = (e: React.PointerEvent, b: Button, kind: Drag['kind']) => {
    e.stopPropagation();
    const o = free ? rects[b.id] : layout.pos[b.id];
    if (!o) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    select(b.id);
    setDrag({ id: b.id, kind, sx: e.clientX, sy: e.clientY, o, moved: false });
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
    if (!drag.moved) setDrag({ ...drag, moved: true });

    if (free) {
      const o = drag.o as Rect;
      const dx = ((e.clientX - drag.sx) / AW) * 100;
      const dy = ((e.clientY - drag.sy) / AH) * 100;
      const others = Object.entries(rects).filter(([id]) => id !== drag.id).map(([, r]) => r);
      const tx = [0, 50, 100, ...others.flatMap((r) => [r.x, r.x + r.w, r.x + r.w / 2])];
      const ty = [0, 50, 100, ...others.flatMap((r) => [r.y, r.y + r.h, r.y + r.h / 2])];
      let r: Rect;
      let gx: number | null = null;
      let gy: number | null = null;
      if (drag.kind === 'move') {
        let x = Math.max(0, Math.min(100 - o.w, o.x + dx));
        let y = Math.max(0, Math.min(100 - o.h, o.y + dy));
        if (!e.altKey) {
          const sx = snapAxis([x, x + o.w, x + o.w / 2], tx);
          const sy = snapAxis([y, y + o.h, y + o.h / 2], ty);
          x = Math.max(0, Math.min(100 - o.w, x + sx.d));
          y = Math.max(0, Math.min(100 - o.h, y + sy.d));
          gx = sx.line;
          gy = sy.line;
        }
        r = { ...o, x, y };
      } else {
        let w = Math.max(5, Math.min(100 - o.x, o.w + dx));
        let h = Math.max(5, Math.min(100 - o.y, o.h + dy));
        if (!e.altKey) {
          const sx = snapAxis([o.x + w], tx);
          const sy = snapAxis([o.y + h], ty);
          w = Math.max(5, Math.min(100 - o.x, w + sx.d));
          h = Math.max(5, Math.min(100 - o.y, h + sy.d));
          gx = sx.line;
          gy = sy.line;
        }
        r = { ...o, w, h };
      }
      setFreeDraft({ id: drag.id, r, gx, gy });
      return;
    }

    const o = drag.o as Pos;
    const dx = Math.round((e.clientX - drag.sx) / stepX);
    const dy = Math.round((e.clientY - drag.sy) / stepY);
    const g: Pos = drag.kind === 'move'
      ? { x: Math.max(0, Math.min(layout.cols - o.w, o.x + dx)), y: Math.max(0, Math.min(layout.rows - o.h, o.y + dy)), w: o.w, h: o.h }
      : { x: o.x, y: o.y, w: Math.max(1, Math.min(layout.cols - o.x, o.w + dx)), h: Math.max(1, Math.min(layout.rows - o.y, o.h + dy)) };
    let ok = fitsIn(layout, g.x, g.y, g.w, g.h, drag.id);
    let swap: string | undefined;
    if (!ok && drag.kind === 'move') {
      // Клавишу того же размера, стоящую ровно на месте, меняем местами с перетаскиваемой.
      const oth = Object.entries(layout.pos).find(([id, p]) => id !== drag.id && p.x === g.x && p.y === g.y && p.w === o.w && p.h === o.h);
      if (oth) {
        const rest = { ...layout, pos: Object.fromEntries(Object.entries(layout.pos).filter(([id]) => id !== oth[0])) };
        if (fitsIn(rest, g.x, g.y, g.w, g.h, drag.id) && fitsIn(rest, o.x, o.y, o.w, o.h, drag.id)) {
          ok = true;
          swap = oth[0];
        }
      }
    }
    setGhost({ ...g, ok, swap });
  };

  const onUp = () => {
    if (drag?.moved) {
      if (free && freeDraft) {
        const d = freeDraft;
        updatePage((p) => setRect(p, orient, d.id, d.r));
      } else if (!free && ghost?.ok) {
        const g = ghost;
        const o = drag.o as Pos;
        updatePage((p) => {
          if (g.swap) setPos(p, orient, g.swap, { ...layout.pos[g.swap], x: o.x, y: o.y });
          setPos(p, orient, drag.id, { x: g.x, y: g.y, w: g.w, h: g.h });
        });
      }
    }
    setDrag(null);
    setGhost(null);
    setFreeDraft(null);
  };

  const newKey = () => {
    const b = newButton(0, 0);
    b.style.label = 'Кнопка';
    return b;
  };

  const addAt = (x: number, y: number) => {
    const b = newKey();
    updatePage((p) => placeNew(p, orient, b, { x, y, w: 1, h: 1 }));
    select(b.id);
  };

  const addFree = () => {
    const b = newKey();
    const w = orient === 'landscape' ? 18 : 30;
    const r = findFreeRect(Object.values(rects), w, Math.min(90, (w * area.w) / area.h));
    updatePage((p) => placeNewFree(p, orient, b, r, areas));
    select(b.id);
  };

  const slots = [];
  if (!free) {
    for (let y = 0; y < layout.rows; y++) {
      for (let x = 0; x < layout.cols; x++) {
        if (fitsIn(layout, x, y, 1, 1)) {
          slots.push(
            <button key={`${x}-${y}`} className="slot" style={posPx({ x, y, w: 1, h: 1 })} onClick={() => addAt(x, y)} title="Добавить клавишу">
              <Ph name="plus" size={Math.max(14, Math.min(cw, ch) * 0.2)} />
            </button>,
          );
        }
      }
    }
  }

  const deselect = (e: React.PointerEvent) => { if (e.target === e.currentTarget) select(null); };
  const hiddenCount = free ? 0 : layout.hidden.length;
  const setCR = (cols: number, rows: number) => updatePage((p) => setGrid(p, orient, cols, rows));
  const placed = Object.values(layout.pos);
  const minCols = Math.max(1, ...placed.map((p) => p.x + p.w));
  const minRows = Math.max(1, ...placed.map((p) => p.y + p.h));

  const areaStyle = free
    ? { left: PANEL_PAD * s, top: PANEL_PAD * s, width: AW, height: AH }
    : { left: ((PW - grid.gw) / 2) * s, top: ((PH - navH - grid.gh) / 2) * s, width: grid.gw * s, height: grid.gh * s };

  return (
    <div className="canvas" onPointerDown={deselect}>
      <div className="canvas-bar">
        <div className="orient-seg">
          <Seg<Orient>
            value={orient}
            onChange={(o) => { setOrient(o); select(null); }}
            options={[
              { v: 'landscape', label: <><Ph name="device-mobile" size={15} className="rot90" /> Горизонтально</>, title: 'Телефон лежит горизонтально' },
              { v: 'portrait', label: <><Ph name="device-mobile" size={15} /> Вертикально</>, title: 'Телефон в руке вертикально' },
            ]}
          />
        </div>
        <div className="mode-seg">
          <Seg<'grid' | 'free'>
            value={page.mode}
            onChange={(m) => updatePage((p) => { if (m === 'free') toFree(p, areas.landscape, areas.portrait); else p.mode = 'grid'; })}
            options={[
              { v: 'grid', label: <><Ph name="squares-four" size={15} /> Сетка</>, title: 'Клавиши встают по сетке' },
              { v: 'free', label: <><Ph name="selection-plus" size={15} /> Свободно</>, title: 'Любое место и любой размер' },
            ]}
          />
        </div>
        {free ? (
          <button className="btn sm" onClick={addFree}><Ph name="plus" size={14} /> Клавиша</button>
        ) : (
          <div className="steppers">
            <Stepper label="Столбцы" value={layout.cols} min={minCols} max={12} onChange={(v) => setCR(v, layout.rows)} />
            <Stepper label="Строки" value={layout.rows} min={minRows} max={12} onChange={(v) => setCR(layout.cols, v)} />
          </div>
        )}
        <span className="dim screen-note" title="Пропорции экрана — от подключённого телефона">
          {screen.device ?? 'Телефон'} <span className="mono">{PW}×{PH}</span>
        </span>
        <HelpButton free={free} />
      </div>

      <div className="canvas-stage" ref={wrap} onPointerDown={deselect}>
      <div className="phone" style={{ ...fillCss(page.background), width: PW * s, height: PH * s }} onPointerDown={deselect}>
        <div className={`grid-area ${free ? 'is-free' : ''}`} style={areaStyle} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {slots}
          {page.buttons.map((b) => {
            let st: { left: number; top: number; width: number; height: number };
            if (free) {
              const r = freeDraft?.id === b.id ? freeDraft.r : rects[b.id];
              if (!r) return null;
              st = rectPx(r);
            } else {
              const p = layout.pos[b.id];
              if (!p) return null;
              st = posPx(p);
            }
            const isSel = b.id === selected;
            const moving = !free && drag?.id === b.id && drag.moved;
            return (
              <div
                key={b.id}
                className={`ft-cell ed-cell ${isSel ? 'is-selected' : ''} ${moving ? 'moving' : ''}`}
                style={st}
                onPointerDown={(e) => startDrag(e, b, 'move')}
              >
                {b.type === 'slider'
                  ? <SliderFace button={b} states={states} value={Number(states[sliderStateKey(b)] ?? 50)} vertical={st.height >= st.width} />
                  : <ButtonFace button={b} states={states} now={now} />}
                {b.type === 'button' && b.longActions.length > 0 && <span className="ft-long-mark" title="Есть долгое нажатие" />}
                {isSel && <span className="rs-handle" onPointerDown={(e) => startDrag(e, b, 'resize')} title="Потяните, чтобы изменить размер" />}
              </div>
            );
          })}
          {!free && ghost && drag?.moved && <div className={`drop-ghost ${ghost.ok ? '' : 'bad'}`} style={posPx(ghost)} />}
          {free && freeDraft?.gx != null && <div className="guide v" style={{ left: (freeDraft.gx / 100) * AW }} />}
          {free && freeDraft?.gy != null && <div className="guide h" style={{ top: (freeDraft.gy / 100) * AH }} />}
        </div>
        <div className="phone-nav" style={{ width: PW, height: navH, top: (PH - navH) * s, transform: `scale(${s})` }}>
          <PageNav profile={profile} pageId={page.id} online via="" update={false} onPage={(id) => setPageId(id)} onMenu={() => {}} />
        </div>
      </div>
      </div>
      {hiddenCount > 0 && (
        <div className="canvas-warn">
          {hiddenCount === 1 ? 'Одна клавиша не поместилась' : `Не поместилось клавиш: ${hiddenCount}`} — добавьте строк или столбцов.
        </div>
      )}
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper" title={label}>
      <span>{label}</span>
      <button disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Меньше: ${label}`}><Ph name="minus" size={12} /></button>
      <b className="mono">{value}</b>
      <button disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`Больше: ${label}`}><Ph name="plus" size={12} /></button>
    </div>
  );
}

const HELP_GRID: [string, string][] = [
  ['Горизонтально / Вертикально', 'Раскладка для каждого положения телефона'],
  ['Клик по пустому гнезду', 'Новая клавиша'],
  ['Перетащить клавишу', 'Переставить'],
  ['Перетащить на другую клавишу', 'Поменять местами'],
  ['Уголок выделенной клавиши', 'Изменить размер'],
  ['Стрелки', 'Сдвинуть выделенную'],
];
const HELP_FREE: [string, string][] = [
  ['Горизонтально / Вертикально', 'Раскладка для каждого положения телефона'],
  ['«+ Клавиша»', 'Новая клавиша в свободном месте'],
  ['Перетащить клавишу', 'Любое место; края прилипают к соседям'],
  ['Уголок выделенной клавиши', 'Любой размер'],
  ['Alt при перетаскивании', 'Без прилипания'],
  ['Стрелки / Shift+стрелки', 'Сдвиг на 1% / 5%'],
];
const HELP_COMMON: [string, string][] = [
  ['Ctrl+D', 'Копия клавиши'],
  ['Ctrl+C / Ctrl+V', 'Копировать и вставить'],
  ['Delete', 'Удалить клавишу'],
  ['Ctrl+Z / Ctrl+Y', 'Отменить и вернуть'],
  ['Esc', 'Снять выделение'],
];

function HelpButton({ free }: { free: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.help')) setOpen(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="help">
      <button className={`icon-btn ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} title="Управление">
        <Ph name="question" size={17} />
      </button>
      {open && (
        <div className="help-pop">
          <h4>Управление</h4>
          <table>
            <tbody>
              {[...(free ? HELP_FREE : HELP_GRID), ...HELP_COMMON].map(([k, v]) => (
                <tr key={k}><td>{/^(Ctrl|Delete|Esc|Стрелки|Alt)/.test(k) ? <kbd>{k}</kbd> : k}</td><td>{v}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
