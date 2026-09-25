import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { newButton, uid } from '../../shared/defaults';
import {
  DEFAULT_SCREEN, PANEL_BAR, PANEL_PAD, computeGrid, fitsIn, layoutOf, placeNew, removeButton, setPos, spotForCopy, type Orient,
} from '../../shared/layout';
import { ButtonFace, Ph, SliderFace, fillCss, sliderStateKey, usesClock } from '../../shared/render';
import type { Button, Pos } from '../../shared/types';
import { useStore } from '../store';
import { Seg } from './ui';

type Drag = { id: string; kind: 'move' | 'resize'; sx: number; sy: number; o: Pos; moved: boolean };

let clipboard: Button | null = null;

/** Экран телефона в CSS-пикселях: берём у подключённого телефона, иначе типичный. */
export function useScreen() {
  const { clients } = useStore();
  const c = clients.find((x) => x.screen);
  const [a, b] = c?.screen ?? [DEFAULT_SCREEN.w, DEFAULT_SCREEN.h];
  return { short: Math.min(a, b), long: Math.max(a, b), device: c?.name ?? null };
}

export function Canvas() {
  const { page, profile, states, selected, select, updatePage, orient, setOrient } = useStore();
  const screen = useScreen();
  const wrap = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 600, h: 400 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [ghost, setGhost] = useState<(Pos & { ok: boolean; swap?: string }) | null>(null);
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

  const layout = useMemo(() => layoutOf(page, orient), [page, orient]);

  // Экран телефона в его пикселях — считаем раскладку ровно как пульт, потом масштабируем.
  const PW = orient === 'landscape' ? screen.long : screen.short;
  const PH = orient === 'landscape' ? screen.short : screen.long;
  const grid = computeGrid(PW - PANEL_PAD * 2, PH - PANEL_PAD * 2 - PANEL_BAR, layout.cols, layout.rows, page.gap, page.square);
  const s = Math.max(0.2, Math.min((box.w - 48) / PW, (box.h - 96) / PH, 2));
  const gap = page.gap * s;
  const cw = grid.cw * s;
  const ch = grid.ch * s;
  const stepX = cw + gap;
  const stepY = ch + gap;
  const pos = (p: Pos) => ({ left: p.x * stepX, top: p.y * stepY, width: p.w * cw + (p.w - 1) * gap, height: p.h * ch + (p.h - 1) * gap });

  // горячие клавиши холста
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable], .insp, .modal-bg')) return;
      const sel = page.buttons.find((b) => b.id === selected);
      const selPos = sel ? layout.pos[sel.id] : undefined;
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
        const spot = spotForCopy(page, orient, selPos ?? { x: 0, y: 0, w: 1, h: 1 });
        if (!spot) return;
        const copy: Button = { ...structuredClone(src), id: uid() };
        updatePage((p) => placeNew(p, orient, copy, spot));
        select(copy.id);
      } else if (e.key === 'Escape') {
        select(null);
      } else if (sel && selPos && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
        const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
        const np = { ...selPos, x: selPos.x + dx, y: selPos.y + dy };
        if (fitsIn(layout, np.x, np.y, np.w, np.h, sel.id)) updatePage((p) => setPos(p, orient, sel.id, np));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page, layout, orient, selected, select, updatePage]);

  const startDrag = (e: React.PointerEvent, b: Button, kind: Drag['kind']) => {
    e.stopPropagation();
    const o = layout.pos[b.id];
    if (!o) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    select(b.id);
    setDrag({ id: b.id, kind, sx: e.clientX, sy: e.clientY, o, moved: false });
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const dx = Math.round((e.clientX - drag.sx) / stepX);
    const dy = Math.round((e.clientY - drag.sy) / stepY);
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
    if (!drag.moved) setDrag({ ...drag, moved: true });
    const o = drag.o;
    const g: Pos = drag.kind === 'move'
      ? { x: Math.max(0, Math.min(layout.cols - o.w, o.x + dx)), y: Math.max(0, Math.min(layout.rows - o.h, o.y + dy)), w: o.w, h: o.h }
      : { x: o.x, y: o.y, w: Math.max(1, Math.min(layout.cols - o.x, o.w + dx)), h: Math.max(1, Math.min(layout.rows - o.y, o.h + dy)) };
    let ok = fitsIn(layout, g.x, g.y, g.w, g.h, drag.id);
    let swap: string | undefined;
    if (!ok && drag.kind === 'move') {
      // Клавишу того же размера, стоящую ровно на месте, меняем местами с перетаскиваемой.
      const other = Object.entries(layout.pos).find(([id, p]) => id !== drag.id && p.x === g.x && p.y === g.y && p.w === o.w && p.h === o.h);
      if (other) {
        const rest = { ...layout, pos: Object.fromEntries(Object.entries(layout.pos).filter(([id]) => id !== other[0])) };
        if (fitsIn(rest, g.x, g.y, g.w, g.h, drag.id) && fitsIn(rest, o.x, o.y, o.w, o.h, drag.id)) {
          ok = true;
          swap = other[0];
        }
      }
    }
    setGhost({ ...g, ok, swap });
  };

  const onUp = () => {
    if (drag && ghost && ghost.ok && drag.moved) {
      const g = ghost;
      const o = drag.o;
      updatePage((p) => {
        if (g.swap) setPos(p, orient, g.swap, { ...layout.pos[g.swap], x: o.x, y: o.y });
        setPos(p, orient, drag.id, { x: g.x, y: g.y, w: g.w, h: g.h });
      });
    }
    setDrag(null);
    setGhost(null);
  };

  const addAt = (x: number, y: number) => {
    const b = newButton(x, y);
    b.style.label = 'Кнопка';
    updatePage((p) => placeNew(p, orient, b, { x, y, w: 1, h: 1 }));
    select(b.id);
  };

  const slots = [];
  for (let y = 0; y < layout.rows; y++) {
    for (let x = 0; x < layout.cols; x++) {
      if (fitsIn(layout, x, y, 1, 1)) {
        slots.push(
          <button key={`${x}-${y}`} className="slot" style={pos({ x, y, w: 1, h: 1 })} onClick={() => addAt(x, y)} title="Добавить клавишу">
            <Ph name="plus" size={Math.max(14, Math.min(cw, ch) * 0.2)} />
          </button>,
        );
      }
    }
  }

  const deselect = (e: React.PointerEvent) => { if (e.target === e.currentTarget) select(null); };
  const hiddenCount = layout.hidden.length;

  return (
    <div className="canvas" ref={wrap} onPointerDown={deselect}>
      <div className="canvas-bar">
        <span className="canvas-title">{page.name || 'Без названия'}</span>
        <span className="mono dim">{layout.cols}×{layout.rows}</span>
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
        <span className="dim screen-note" title="Пропорции экрана — от подключённого телефона">
          {screen.device ? screen.device : 'Телефон'} <span className="mono">{PW}×{PH}</span>
        </span>
        <HelpButton />
      </div>
      <div className="phone" style={{ ...fillCss(page.background), width: PW * s, height: PH * s }} onPointerDown={deselect}>
        <div
          className="grid-area"
          style={{ left: ((PW - grid.gw) / 2) * s, top: ((PH - PANEL_BAR - grid.gh) / 2) * s, width: grid.gw * s, height: grid.gh * s }}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {slots}
          {page.buttons.map((b) => {
            const p = layout.pos[b.id];
            if (!p) return null;
            const isSel = b.id === selected;
            const moving = drag?.id === b.id && drag.moved;
            return (
              <div
                key={b.id}
                className={`ft-cell ed-cell ${isSel ? 'is-selected' : ''} ${moving ? 'moving' : ''}`}
                style={pos(p)}
                onPointerDown={(e) => startDrag(e, b, 'move')}
              >
                {b.type === 'slider'
                  ? <SliderFace button={b} states={states} value={Number(states[sliderStateKey(b)] ?? 50)} vertical={p.h * grid.ch >= p.w * grid.cw} />
                  : <ButtonFace button={b} states={states} now={now} />}
                {b.type === 'button' && b.longActions.length > 0 && <span className="ft-long-mark" title="Есть долгое нажатие" />}
                {isSel && <span className="rs-handle" onPointerDown={(e) => startDrag(e, b, 'resize')} title="Потяните, чтобы изменить размер" />}
              </div>
            );
          })}
          {ghost && drag?.moved && <div className={`drop-ghost ${ghost.ok ? '' : 'bad'}`} style={pos(ghost)} />}
        </div>
        <div className="phone-bar" style={{ height: PANEL_BAR * s }}>
          {profile.pageDots && profile.pages.length > 1 && profile.pages.map((pg) => <i key={pg.id} className={pg.id === page.id ? 'on' : ''} />)}
        </div>
      </div>
      {hiddenCount > 0 && (
        <div className="canvas-warn">
          {hiddenCount === 1 ? 'Одна клавиша не поместилась' : `Не поместилось клавиш: ${hiddenCount}`} в эту раскладку — добавьте строк или столбцов справа.
        </div>
      )}
    </div>
  );
}

const HELP: [string, string][] = [
  ['Горизонтально / Вертикально', 'Раскладка для каждого положения телефона'],
  ['Клик по пустому гнезду', 'Новая клавиша'],
  ['Перетащить клавишу', 'Переставить'],
  ['Перетащить на другую клавишу', 'Поменять местами'],
  ['Уголок выделенной клавиши', 'Изменить размер'],
  ['Стрелки', 'Сдвинуть выделенную'],
  ['Ctrl+D', 'Копия клавиши'],
  ['Ctrl+C / Ctrl+V', 'Копировать и вставить'],
  ['Delete', 'Удалить клавишу'],
  ['Ctrl+Z / Ctrl+Y', 'Отменить и вернуть'],
  ['Esc', 'Снять выделение'],
];

function HelpButton() {
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
              {HELP.map(([k, v]) => (
                <tr key={k}><td>{/^(Ctrl|Delete|Esc|Стрелки)/.test(k) ? <kbd>{k}</kbd> : k}</td><td>{v}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
