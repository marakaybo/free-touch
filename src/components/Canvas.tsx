import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { newButton, uid } from '../../shared/defaults';
import { ButtonFace, SliderFace, fillCss, sliderStateKey, usesClock } from '../../shared/render';
import type { Button, Page } from '../../shared/types';
import { useStore } from '../store';

export function fits(page: Page, x: number, y: number, w: number, h: number, ignore?: string) {
  if (x < 0 || y < 0 || x + w > page.cols || y + h > page.rows) return false;
  return !page.buttons.some((b) => b.id !== ignore && x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y);
}

export function firstFree(page: Page, w = 1, h = 1): { x: number; y: number } | null {
  for (let y = 0; y < page.rows; y++) for (let x = 0; x < page.cols; x++) if (fits(page, x, y, w, h)) return { x, y };
  return null;
}

type Drag = { id: string; kind: 'move' | 'resize'; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number; moved: boolean };

let clipboard: Button | null = null;

export function Canvas() {
  const { page, profile, states, selected, select, updatePage } = useStore();
  const wrap = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 600, h: 400 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; w: number; h: number; ok: boolean } | null>(null);
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

  // Размер ячейки — квадрат, как на телефоне.
  const PAD = 26;
  const gap = page.gap;
  // запас под рамку «телефона» и подсказку снизу
  const cell = Math.max(24, Math.min((box.w - PAD * 2 - 64 - gap * (page.cols - 1)) / page.cols, (box.h - PAD * 2 - 90 - gap * (page.rows - 1)) / page.rows, 170));
  const gw = cell * page.cols + gap * (page.cols - 1);
  const gh = cell * page.rows + gap * (page.rows - 1);
  const step = cell + gap;
  const pos = (x: number, y: number, w: number, h: number) => ({
    left: x * step, top: y * step, width: w * cell + (w - 1) * gap, height: h * cell + (h - 1) * gap,
  });

  // горячие клавиши холста
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      const sel = page.buttons.find((b) => b.id === selected);
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault();
        updatePage((p) => { p.buttons = p.buttons.filter((b) => b.id !== sel.id); });
        select(null);
      } else if (e.ctrlKey && e.code === 'KeyC' && sel) {
        clipboard = structuredClone(sel);
      } else if (e.ctrlKey && (e.code === 'KeyV' || e.code === 'KeyD')) {
        const src = e.code === 'KeyD' ? sel : clipboard;
        if (!src) return;
        e.preventDefault();
        const spot = firstFree(page, src.w, src.h) ?? firstFree(page);
        if (!spot) return;
        const w = fits(page, spot.x, spot.y, src.w, src.h) ? src.w : 1;
        const h = fits(page, spot.x, spot.y, src.w, src.h) ? src.h : 1;
        const copy: Button = { ...structuredClone(src), id: uid(), ...spot, w, h };
        updatePage((p) => { p.buttons.push(copy); });
        select(copy.id);
      } else if (e.key === 'Escape') {
        select(null);
      } else if (sel && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
        const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
        if (fits(page, sel.x + dx, sel.y + dy, sel.w, sel.h, sel.id)) {
          updatePage((p) => { const b = p.buttons.find((x) => x.id === sel.id)!; b.x += dx; b.y += dy; });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page, selected, select, updatePage]);

  const startDrag = (e: React.PointerEvent, b: Button, kind: Drag['kind']) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    select(b.id);
    setDrag({ id: b.id, kind, sx: e.clientX, sy: e.clientY, ox: b.x, oy: b.y, ow: b.w, oh: b.h, moved: false });
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const dx = Math.round((e.clientX - drag.sx) / step);
    const dy = Math.round((e.clientY - drag.sy) / step);
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
    if (!drag.moved) setDrag({ ...drag, moved: true });
    let g;
    if (drag.kind === 'move') {
      const x = Math.max(0, Math.min(page.cols - drag.ow, drag.ox + dx));
      const y = Math.max(0, Math.min(page.rows - drag.oh, drag.oy + dy));
      g = { x, y, w: drag.ow, h: drag.oh };
    } else {
      const w = Math.max(1, Math.min(page.cols - drag.ox, drag.ow + dx));
      const h = Math.max(1, Math.min(page.rows - drag.oy, drag.oh + dy));
      g = { x: drag.ox, y: drag.oy, w, h };
    }
    setGhost({ ...g, ok: fits(page, g.x, g.y, g.w, g.h, drag.id) });
  };

  const onUp = () => {
    if (drag && ghost && ghost.ok && drag.moved) {
      const g = ghost;
      updatePage((p) => {
        const b = p.buttons.find((x) => x.id === drag.id);
        if (b) Object.assign(b, { x: g.x, y: g.y, w: g.w, h: g.h });
      });
    }
    setDrag(null);
    setGhost(null);
  };

  const addAt = (x: number, y: number) => {
    const b = newButton(x, y);
    b.style.label = 'Кнопка';
    b.style.icon = { kind: 'lucide', name: 'Sparkles' };
    updatePage((p) => { p.buttons.push(b); });
    select(b.id);
  };

  const slots = [];
  for (let y = 0; y < page.rows; y++) {
    for (let x = 0; x < page.cols; x++) {
      if (fits(page, x, y, 1, 1)) {
        slots.push(
          <button key={`${x}-${y}`} className="slot" style={pos(x, y, 1, 1)} onClick={() => addAt(x, y)} title="Добавить кнопку">
            <Plus size={Math.max(14, cell * 0.2)} />
          </button>,
        );
      }
    }
  }

  return (
    <div className="canvas" ref={wrap} onPointerDown={(e) => e.target === e.currentTarget && select(null)}>
      <div className="device" style={{ ...fillCss(page.background), width: gw + PAD * 2, height: gh + PAD * 2 }} onPointerDown={(e) => e.target === e.currentTarget && select(null)}>
        <div className="grid-area" style={{ width: gw, height: gh }} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {slots}
          {page.buttons.map((b) => {
            const isSel = b.id === selected;
            const hidden = b.x + b.w > page.cols || b.y + b.h > page.rows;
            if (hidden) return null;
            const moving = drag?.id === b.id && drag.moved;
            return (
              <div
                key={b.id}
                className={`ft-cell ed-cell ${isSel ? 'sel' : ''} ${moving ? 'moving' : ''}`}
                style={pos(b.x, b.y, b.w, b.h)}
                onPointerDown={(e) => startDrag(e, b, 'move')}
              >
                {b.type === 'slider'
                  ? <SliderFace button={b} states={states} value={Number(states[sliderStateKey(b)] ?? 50)} />
                  : <ButtonFace button={b} states={states} accent={profile.accent} now={now} />}
                {isSel && <span className="rs-handle" onPointerDown={(e) => startDrag(e, b, 'resize')} title="Потяните, чтобы изменить размер" />}
              </div>
            );
          })}
          {ghost && drag?.moved && <div className={`drop-ghost ${ghost.ok ? '' : 'bad'}`} style={pos(ghost.x, ghost.y, ghost.w, ghost.h)} />}
        </div>
      </div>
      <div className="canvas-hint">
        Клик по пустой ячейке — новая кнопка · тяните кнопку, чтобы переставить · уголок — размер · Ctrl+D — копия · Delete — удалить
      </div>
    </div>
  );
}
