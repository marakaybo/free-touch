// Раскладки страницы: горизонтальная (основная) и вертикальная — для телефона в руке.
// Клавиши одни и те же, у каждой раскладки свои сетка и места клавиш.
import type { CSSProperties } from 'react';
import type { Button, Page, Pos } from './types';

export type Orient = 'landscape' | 'portrait';

export interface Layout {
  cols: number;
  rows: number;
  pos: Record<string, Pos>;
  /** Клавиши, которым не хватило места в этой раскладке. */
  hidden: string[];
}

/** Вертикальная раскладка по умолчанию — горизонтальная, повёрнутая на бок. */
export function autoPortrait(page: Page): { cols: number; rows: number; pos: Record<string, Pos> } {
  const pos: Record<string, Pos> = {};
  for (const b of page.buttons) pos[b.id] = { x: b.y, y: b.x, w: b.h, h: b.w };
  return { cols: page.rows, rows: page.cols, pos };
}

export function fitsIn(l: { cols: number; rows: number; pos: Record<string, Pos> }, x: number, y: number, w: number, h: number, ignore?: string) {
  if (x < 0 || y < 0 || x + w > l.cols || y + h > l.rows) return false;
  return !Object.entries(l.pos).some(([id, p]) => id !== ignore && x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y);
}

export function firstFreeIn(l: { cols: number; rows: number; pos: Record<string, Pos> }, w = 1, h = 1): { x: number; y: number } | null {
  for (let y = 0; y < l.rows; y++) for (let x = 0; x < l.cols; x++) if (fitsIn(l, x, y, w, h)) return { x, y };
  return null;
}

export function layoutOf(page: Page, orient: Orient): Layout {
  if (orient === 'landscape') {
    const pos: Record<string, Pos> = {};
    const hidden: string[] = [];
    for (const b of page.buttons) {
      if (b.x + b.w <= page.cols && b.y + b.h <= page.rows) pos[b.id] = { x: b.x, y: b.y, w: b.w, h: b.h };
      else hidden.push(b.id);
    }
    return { cols: page.cols, rows: page.rows, pos, hidden };
  }
  const base = page.portrait ?? autoPortrait(page);
  const l: Layout = { cols: base.cols, rows: base.rows, pos: {}, hidden: [] };
  const ids = new Set(page.buttons.map((b) => b.id));
  for (const [id, p] of Object.entries(base.pos)) {
    if (ids.has(id) && p.x + p.w <= l.cols && p.y + p.h <= l.rows) l.pos[id] = p;
  }
  // Новые клавиши, которых ещё нет в вертикальной раскладке, — в первые свободные места.
  for (const b of page.buttons) {
    if (l.pos[b.id]) continue;
    const spot = firstFreeIn(l, b.h, b.w) ?? firstFreeIn(l);
    if (!spot) { l.hidden.push(b.id); continue; }
    const big = fitsIn(l, spot.x, spot.y, b.h, b.w);
    l.pos[b.id] = { ...spot, w: big ? b.h : 1, h: big ? b.w : 1 };
  }
  return l;
}

/**
 * Размер ячеек под экран. Обычно клавиши растягиваются на весь экран;
 * с `square` — остаются квадратными, сетка по центру.
 */
export function computeGrid(availW: number, availH: number, cols: number, rows: number, gap: number, square: boolean) {
  let cw = Math.max(16, (availW - gap * (cols - 1)) / cols);
  let ch = Math.max(16, (availH - gap * (rows - 1)) / rows);
  if (square) cw = ch = Math.min(cw, ch);
  return { cw, ch, gw: cw * cols + gap * (cols - 1), gh: ch * rows + gap * (rows - 1) };
}

export const posStyle = (p: Pos): CSSProperties => ({
  gridColumn: `${p.x + 1} / span ${p.w}`,
  gridRow: `${p.y + 1} / span ${p.h}`,
});

/** Отступы пульта на телефоне — одинаковые в пульте и в предпросмотре редактора. */
export const PANEL_PAD = 14;
export const PANEL_BAR = 34;

/** Экран телефона по умолчанию (CSS-пиксели, вертикально), если телефон ещё не подключался. */
export const DEFAULT_SCREEN = { w: 412, h: 915 };

// ---------- правка раскладок (редактор) ----------

/** Вертикальная раскладка при первой правке перестаёт быть «повёрнутой» и становится своей. */
export function materializePortrait(page: Page) {
  if (page.portrait) return;
  const l = layoutOf(page, 'portrait');
  page.portrait = { cols: l.cols, rows: l.rows, pos: { ...l.pos } };
}

export function setPos(page: Page, orient: Orient, id: string, p: Pos) {
  if (orient === 'landscape') {
    const b = page.buttons.find((x) => x.id === id);
    if (b) Object.assign(b, p);
    return;
  }
  materializePortrait(page);
  page.portrait!.pos[id] = { ...p };
}

export function setGrid(page: Page, orient: Orient, cols: number, rows: number) {
  if (orient === 'landscape') {
    page.cols = cols;
    page.rows = rows;
    return;
  }
  materializePortrait(page);
  page.portrait!.cols = cols;
  page.portrait!.rows = rows;
}

/**
 * Добавить клавишу: в текущей раскладке — на указанное место, в другой — в первое свободное.
 * Если в горизонтальной места нет, добавляем ей строку.
 */
export function placeNew(page: Page, orient: Orient, b: Button, at: Pos) {
  if (orient === 'landscape') {
    Object.assign(b, at);
    page.buttons.push(b);
    return;
  }
  materializePortrait(page);
  const land = layoutOf(page, 'landscape');
  let spot = firstFreeIn(land, at.h, at.w) ?? firstFreeIn(land);
  if (!spot && page.rows < 10) {
    page.rows += 1;
    spot = { x: 0, y: page.rows - 1 };
  }
  const big = spot ? fitsIn(layoutOf(page, 'landscape'), spot.x, spot.y, at.h, at.w) : false;
  Object.assign(b, spot ?? { x: 0, y: 0 }, { w: big ? at.h : 1, h: big ? at.w : 1 });
  page.buttons.push(b);
  page.portrait!.pos[b.id] = { ...at };
}

export function removeButton(page: Page, id: string) {
  page.buttons = page.buttons.filter((b) => b.id !== id);
  if (page.portrait) delete page.portrait.pos[id];
}

/** Место для копии клавиши в текущей раскладке (по возможности того же размера). */
export function spotForCopy(page: Page, orient: Orient, p: Pos): Pos | null {
  const l = layoutOf(page, orient);
  const spot = firstFreeIn(l, p.w, p.h);
  if (spot) return { ...spot, w: p.w, h: p.h };
  const one = firstFreeIn(l);
  return one ? { ...one, w: 1, h: 1 } : null;
}
