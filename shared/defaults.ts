import { PH } from './phosphor';
import type { Action, ActiveRule, Button, ButtonStyle, Fill, IconRef, Page, Profile, Rect } from './types';

export const uid = () => Math.random().toString(36).slice(2, 10);

/** Единственный акцент интерфейса. */
export const ACCENT = '#3D7BFF';
/** Красный — только эфир и запись. */
export const LIVE = '#E5484D';
export const LIVE_STATES = ['obs.streaming', 'obs.recording'];

export const KEY_TEXT = '#F2F3F6';
export const DIM_TEXT = '#7D8290';

export const baseStyle = (): ButtonStyle => ({
  fill: { type: 'solid', color: '#2B2E36' },
  radius: 18,
  borderWidth: 0,
  borderColor: '#FFFFFF26',
  shadow: 'key',
  label: '',
  labelPos: 'bottom',
  font: 'sans',
  fontSize: 13,
  bold: true,
  textColor: KEY_TEXT,
  icon: { kind: 'none' },
  iconSize: 36,
  iconColor: KEY_TEXT,
  press: 'press',
});

export interface KeyColor {
  id: string;
  name: string;
  fill: string;
  text: string;
}

/** Цвета клавиш: насыщенные, но не кислотные. Красного нет — он занят эфиром. */
export const KEY_COLORS: KeyColor[] = [
  { id: 'graphite', name: 'Графит', fill: '#2B2E36', text: KEY_TEXT },
  { id: 'blue', name: 'Синий', fill: '#3D7BFF', text: '#FFFFFF' },
  { id: 'teal', name: 'Бирюза', fill: '#0FA394', text: '#FFFFFF' },
  { id: 'green', name: 'Зелёный', fill: '#2E9E57', text: '#FFFFFF' },
  { id: 'amber', name: 'Янтарь', fill: '#F2A93B', text: '#2B1C05' },
  { id: 'orange', name: 'Оранжевый', fill: '#EC5F00', text: '#FFFFFF' },
  { id: 'wine', name: 'Вино', fill: '#8E2B3A', text: '#FFFFFF' },
  { id: 'white', name: 'Белый', fill: '#E6E8ED', text: '#1B1D22' },
];

export const keyColorStyle = (c: KeyColor): Partial<ButtonStyle> => ({
  fill: { type: 'solid', color: c.fill },
  textColor: c.text,
  iconColor: c.text,
});

export const PAGE_BACKGROUNDS: Fill[] = [
  { type: 'solid', color: '#0F1115' },
  { type: 'gradient', from: '#0F1115', to: '#162038', angle: 165 },
  { type: 'gradient', from: '#0F1115', to: '#241820', angle: 165 },
  { type: 'gradient', from: '#0E1213', to: '#0F2624', angle: 165 },
  { type: 'gradient', from: '#11100E', to: '#2A1C10', angle: 165 },
  { type: 'solid', color: '#1A1D23' },
];

export const newButton = (x: number, y: number, patch: Partial<Button> = {}): Button => ({
  id: uid(),
  x,
  y,
  w: 1,
  h: 1,
  type: 'button',
  style: baseStyle(),
  actions: [],
  longActions: [],
  active: null,
  slider: null,
  ...patch,
});

export const withStyle = (patch: Partial<ButtonStyle>): ButtonStyle => ({ ...baseStyle(), ...patch });

export const icon = (name: string): IconRef => ({ kind: 'icon', name });

export const newPage = (name: string, cols = 4, rows = 3): Page => ({
  id: uid(),
  name,
  cols,
  rows,
  gap: 12,
  background: { type: 'gradient', from: '#0F1115', to: '#162038', angle: 165 },
  buttons: [],
  portrait: null,
  square: false,
  mode: 'grid',
  free: null,
  tab: { icon: { kind: 'none' }, color: ACCENT },
});

export const defaultAction = (type: Action['type']): Action => {
  switch (type) {
    case 'hotkey': return { type, keys: [], hold: false };
    case 'text': return { type, text: '' };
    case 'open': return { type, target: '', args: '' };
    case 'command': return { type, command: '' };
    case 'media': return { type, key: 'playPause' };
    case 'volume': return { type, mode: 'toggleMute', value: 5, app: '' };
    case 'obs': return { type, op: 'scene', mode: 'toggle', scene: '', input: '', source: '', collection: '' };
    case 'page': return { type, page: '@back' };
    case 'delay': return { type, ms: 300 };
  }
};

/** «Выключено»: значок перечёркнут, подпись и значок гаснут. */
const offStyle = (name: string): Partial<ButtonStyle> => ({ icon: icon(name), textColor: DIM_TEXT, iconColor: DIM_TEXT });

/** Подсветка по умолчанию для действия: сцена в эфире, идёт стрим, микрофон выключен… */
export const suggestActive = (a: Action): ActiveRule | null => {
  if (a.type === 'obs') {
    switch (a.op) {
      case 'scene': return a.scene ? { state: 'obs.scene', equals: a.scene, style: {}, dot: true } : null;
      case 'collection': return a.collection ? { state: 'obs.collection', equals: a.collection, style: {}, dot: true } : null;
      case 'stream': return { state: 'obs.streaming', equals: '', style: { label: 'В эфире' }, dot: true };
      case 'record': return { state: 'obs.recording', equals: '', style: { label: 'Запись' }, dot: true };
      case 'recordPause': return { state: 'obs.recordPaused', equals: '', style: {}, dot: true };
      case 'replay': return { state: 'obs.replay', equals: '', style: {}, dot: true };
      case 'virtualcam': return { state: 'obs.virtualcam', equals: '', style: {}, dot: true };
      case 'mute': return a.input ? { state: `obs.mute:${a.input}`, equals: '', style: offStyle('microphone-slash'), dot: false } : null;
      case 'source': return a.scene && a.source ? { state: `obs.source:${a.scene}/${a.source}`, equals: '', style: {}, dot: true } : null;
      default: return null;
    }
  }
  if (a.type === 'volume' && (a.mode === 'toggleMute' || a.mode === 'mute')) {
    return { state: a.app ? `app.muted:${a.app.toLowerCase()}` : 'system.muted', equals: '', style: offStyle('speaker-x'), dot: false };
  }
  return null;
};

export function defaultProfile(): Profile {
  const stream = newPage('Стрим', 4, 3);
  const media = newPage('Медиа', 4, 3);

  const obsBtn = (x: number, y: number, label: string, ic: string, op: 'stream' | 'record' | 'saveReplay' | 'virtualcam') => {
    const a: Action = { ...(defaultAction('obs') as Extract<Action, { type: 'obs' }>), op };
    return newButton(x, y, { style: withStyle({ label, icon: icon(ic) }), actions: [a], active: suggestActive(a) });
  };

  stream.buttons = [
    { ...obsBtn(0, 0, 'Эфир', 'broadcast', 'stream'), style: withStyle({ label: 'Эфир', icon: icon('broadcast'), fill: { type: 'solid', color: '#3D7BFF' }, textColor: '#FFFFFF', iconColor: '#FFFFFF' }) },
    obsBtn(1, 0, 'Запись', 'record', 'record'),
    obsBtn(2, 0, 'Повтор', 'rewind', 'saveReplay'),
    newButton(0, 1, {
      style: withStyle({ label: 'Звук', icon: icon('speaker-high') }),
      actions: [{ type: 'volume', mode: 'toggleMute', value: 5, app: '' }],
      active: suggestActive({ type: 'volume', mode: 'toggleMute', value: 5, app: '' }),
    }),
    newButton(1, 1, {
      style: withStyle({ label: 'Скриншот', icon: icon('camera') }),
      actions: [{ type: 'hotkey', keys: ['MetaLeft', 'ShiftLeft', 'KeyS'], hold: false }],
    }),
    newButton(2, 1, {
      style: withStyle({ label: 'Диспетчер', icon: icon('pulse') }),
      actions: [{ type: 'hotkey', keys: ['ControlLeft', 'ShiftLeft', 'Escape'], hold: false }],
    }),
    newButton(0, 2, {
      w: 2,
      style: withStyle({ label: '{time}', labelPos: 'center', font: 'mono', fontSize: 24, shadow: 'flat', fill: { type: 'solid', color: '#1A1D23' } }),
    }),
    newButton(2, 2, {
      style: withStyle({ label: 'Медиа', icon: icon('music-notes') }),
      actions: [{ type: 'page', page: media.id }],
    }),
    newButton(3, 0, {
      h: 3,
      type: 'slider',
      style: withStyle({ label: 'Громкость' }),
      slider: { target: { kind: 'master', input: '', app: '' }, vertical: true, color: ACCENT },
    }),
  ];

  const mediaBtn = (x: number, y: number, label: string, ic: string, key: Extract<Action, { type: 'media' }>['key']) =>
    newButton(x, y, { style: withStyle({ label, icon: icon(ic) }), actions: [{ type: 'media', key }] });

  media.buttons = [
    mediaBtn(0, 0, 'Назад', 'skip-back', 'prev'),
    { ...mediaBtn(1, 0, 'Пауза', 'play-pause', 'playPause'), style: withStyle({ label: 'Пауза', icon: icon('play-pause'), fill: { type: 'solid', color: '#3D7BFF' }, textColor: '#FFFFFF', iconColor: '#FFFFFF' }) },
    mediaBtn(2, 0, 'Вперёд', 'skip-forward', 'next'),
    mediaBtn(0, 1, 'Тише', 'speaker-low', 'volDown'),
    mediaBtn(1, 1, 'Громче', 'speaker-high', 'volUp'),
    mediaBtn(2, 1, 'Без звука', 'speaker-x', 'mute'),
    newButton(0, 2, {
      style: withStyle({ label: 'Назад', icon: icon('arrow-left'), shadow: 'flat', fill: { type: 'solid', color: '#22252D' } }),
      actions: [{ type: 'page', page: '@back' }],
    }),
    newButton(1, 2, {
      w: 2,
      style: withStyle({ label: 'ЦП {system.cpu}%  ОЗУ {system.ram}%', labelPos: 'center', font: 'mono', fontSize: 13, shadow: 'flat', fill: { type: 'solid', color: '#1A1D23' } }),
    }),
    newButton(3, 0, {
      h: 3,
      type: 'slider',
      style: withStyle({ label: 'Громкость' }),
      slider: { target: { kind: 'master', input: '', app: '' }, vertical: true, color: ACCENT },
    }),
  ];

  stream.tab = { icon: icon('broadcast'), color: ACCENT };
  media.tab = { icon: icon('music-notes'), color: '#0FA394' };
  return { version: 1, name: 'Мой пульт', accent: ACCENT, pageDots: true, nav: 'tabs', keepAwake: true, home: stream.id, pages: [stream, media] };
}

// ---------- проверка профиля ----------
// Профиль мог прийти из файла, от старой версии программы или быть отредактирован руками.
// Всё, чего не хватает, дозаполняем, устаревшее переводим, мусор отбрасываем.

/* eslint-disable @typescript-eslint/no-explicit-any */
const int = (v: any, min: number, max: number, def: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

const ACTION_TYPES: Action['type'][] = ['hotkey', 'text', 'open', 'command', 'media', 'volume', 'obs', 'page', 'delay'];

function normActions(list: any): Action[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((a) => a && ACTION_TYPES.includes(a.type))
    .map((a) => ({ ...defaultAction(a.type), ...a }) as Action);
}

function normFill(f: any, def: Fill, allowGradient = false): Fill {
  if (f?.type === 'solid' && typeof f.color === 'string') return f;
  if (f?.type === 'gradient' && typeof f.from === 'string') {
    // На клавишах градиентов нет: берём первый цвет. Фону страницы градиент можно.
    return allowGradient ? { type: 'gradient', from: f.from, to: String(f.to ?? f.from), angle: Number(f.angle) || 0 } : { type: 'solid', color: f.from };
  }
  if (f?.type === 'image' && typeof f.src === 'string') return { type: 'image', src: f.src, dim: Number(f.dim) || 0 };
  return def;
}

const LUCIDE: Record<string, string> = {
  Play: 'play', Pause: 'pause', Gamepad2: 'game-controller', Gamepad: 'game-controller', Coffee: 'coffee', Flag: 'flag',
  Monitor: 'monitor', Ghost: 'ghost', Pickaxe: 'cube', Clapperboard: 'film-slate', Mic: 'microphone',
  MicOff: 'microphone-slash', Radio: 'broadcast', Circle: 'record', Music: 'music-notes', Rewind: 'rewind',
  VolumeX: 'speaker-x', Camera: 'camera', Activity: 'pulse', Volume2: 'speaker-high', Volume1: 'speaker-low',
  Volume: 'speaker-none', SkipBack: 'skip-back', SkipForward: 'skip-forward', ArrowLeft: 'arrow-left',
  Sparkles: 'sparkle', Square: 'stop', Video: 'video-camera', Headphones: 'headphones', Settings: 'gear',
  Home: 'house', Zap: 'lightning', MessageSquare: 'chat', Trash2: 'trash', Unlock: 'lock-open', EyeOff: 'eye-slash',
  Smile: 'smiley', Mouse: 'mouse', Timer: 'timer', Keyboard: 'keyboard', Globe: 'globe',
};

function normIcon(i: any): IconRef {
  if (!i || typeof i !== 'object') return { kind: 'none' };
  if (i.kind === 'lucide' || (i.kind === 'icon' && !(i.name in PH))) {
    const kebab = String(i.name ?? '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Za-z])(\d)/g, '$1-$2').toLowerCase();
    const name = LUCIDE[i.name] ?? (kebab in PH ? kebab : 'square');
    return { kind: 'icon', name };
  }
  if (i.kind === 'icon' || i.kind === 'brand') return { kind: i.kind, name: String(i.name) };
  if (i.kind === 'emoji') return { kind: 'emoji', value: String(i.value ?? '') };
  if (i.kind === 'image' && typeof i.src === 'string') return { kind: 'image', src: i.src };
  return { kind: 'none' };
}

const FONTS: Record<string, ButtonStyle['font']> = { onest: 'condensed', unbounded: 'sans', condensed: 'condensed', sans: 'sans', mono: 'mono' };

/** Стиль из первой версии (до «железа»): у него было поле glowColor. */
function migrateOldStyle(raw: any): any {
  if (!raw || !('glowColor' in raw)) return raw;
  const r = { ...raw };
  if (r.radius > 24) r.radius = 18;
  r.font = r.font === 'mono' ? 'mono' : 'sans';
  if (r.fill?.type === 'solid' && /^#23252F$/i.test(r.fill.color)) r.fill = { type: 'solid', color: '#2B2E36' };
  if (r.fill?.type === 'solid' && /^#FFFFFF(0D|10|14)$/i.test(r.fill.color)) { r.fill = { type: 'solid', color: '#1A1D23' }; r.shadow = 'none'; }
  if (/^#ECEDF3$/i.test(r.textColor)) r.textColor = KEY_TEXT;
  if (/^#ECEDF3$/i.test(r.iconColor)) r.iconColor = KEY_TEXT;
  return r;
}

function normStyle(raw0: any): ButtonStyle {
  const b = baseStyle();
  const raw = migrateOldStyle(raw0);
  const s = { ...b, ...(raw ?? {}) } as ButtonStyle & Record<string, unknown>;
  s.fill = normFill(s.fill, b.fill);
  s.icon = normIcon(s.icon);
  s.font = FONTS[s.font as string] ?? 'condensed';
  s.shadow = (s.shadow as string) === 'none' || s.shadow === 'flat' ? 'flat' : 'key';
  s.press = s.press === 'none' ? 'none' : 'press';
  delete s.glowColor;
  return s;
}

/** Старая «подсветка» красила клавишу в красный — теперь красный только у эфира и записи. */
function normActive(a: any): ActiveRule | null {
  if (!a || typeof a.state !== 'string') return null;
  const style: Partial<ButtonStyle> & Record<string, unknown> = { ...(a.style ?? {}) };
  if (style.fill) style.fill = normFill(style.fill, { type: 'solid', color: '#2B2E36' });
  if (style.icon) style.icon = normIcon(style.icon);
  const redFill = (style.fill as Fill | undefined)?.type === 'solid' && /^#E5484D/i.test((style.fill as { color: string }).color);
  if (redFill) {
    delete style.fill;
    if (style.textColor === '#FFFFFF') delete style.textColor;
    if (style.iconColor === '#FFFFFF') delete style.iconColor;
  }
  const muteState = /^(obs\.mute:|app\.muted:|system\.muted$)/.test(a.state);
  if (muteState && redFill) {
    style.textColor = DIM_TEXT;
    style.iconColor = DIM_TEXT;
    if (!style.icon) style.icon = icon(a.state.startsWith('obs.mute:') ? 'microphone-slash' : 'speaker-x');
  }
  delete style.glowColor;
  if (style.shadow) style.shadow = (style.shadow as string) === 'none' || style.shadow === 'flat' ? 'flat' : 'key';
  return { state: a.state, equals: String(a.equals ?? ''), style, dot: !!a.dot };
}

export function normalizeProfile(raw: any): Profile {
  if (!raw || !Array.isArray(raw.pages) || raw.pages.length === 0) return defaultProfile();
  const pages: Page[] = raw.pages.filter(Boolean).map((pg: any) => {
    const base = newPage('');
    const cols = int(pg.cols, 1, 12, 4);
    const rows = int(pg.rows, 1, 10, 3);
    const buttons: Button[] = (Array.isArray(pg.buttons) ? pg.buttons : []).filter(Boolean).map((b: any) => {
      const x = int(b.x, 0, cols - 1, 0);
      const y = int(b.y, 0, rows - 1, 0);
      const type = b.type === 'slider' ? 'slider' : 'button';
      return {
        id: typeof b.id === 'string' && b.id ? b.id : uid(),
        x,
        y,
        w: int(b.w, 1, cols - x, 1),
        h: int(b.h, 1, rows - y, 1),
        type,
        style: normStyle(b.style),
        actions: normActions(b.actions),
        longActions: normActions(b.longActions),
        active: normActive(b.active),
        slider: type === 'slider'
          ? { target: { kind: 'master', input: '', app: '' }, vertical: true, color: ACCENT, ...(b.slider ?? {}) }
          : null,
      } as Button;
    });
    const bg = normFill(pg.background, base.background, true);
    let portrait: Page['portrait'] = null;
    if (pg.portrait && typeof pg.portrait === 'object') {
      const pc = int(pg.portrait.cols, 1, 12, rows);
      const pr = int(pg.portrait.rows, 1, 12, cols);
      const pos: Record<string, { x: number; y: number; w: number; h: number }> = {};
      for (const [id, p] of Object.entries(pg.portrait.pos ?? {}) as [string, any][]) {
        if (!p) continue;
        const x = int(p.x, 0, pc - 1, 0);
        const y = int(p.y, 0, pr - 1, 0);
        pos[id] = { x, y, w: int(p.w, 1, pc - x, 1), h: int(p.h, 1, pr - y, 1) };
      }
      portrait = { cols: pc, rows: pr, pos };
    }
    const rects = (m: any): Record<string, Rect> => {
      const out: Record<string, Rect> = {};
      for (const [id, r] of Object.entries(m ?? {}) as [string, any][]) {
        if (!r) continue;
        const n = (v: any, d: number) => (Number.isFinite(Number(v)) ? Math.min(100, Math.max(0, Number(v))) : d);
        const w = Math.max(2, n(r.w, 20));
        const h = Math.max(2, n(r.h, 20));
        out[id] = { x: Math.min(100 - w, n(r.x, 0)), y: Math.min(100 - h, n(r.y, 0)), w, h };
      }
      return out;
    };
    return {
      id: typeof pg.id === 'string' && pg.id ? pg.id : uid(),
      name: String(pg.name ?? 'Страница'),
      cols,
      rows,
      gap: int(pg.gap, 0, 40, 12),
      background: bg,
      buttons,
      portrait,
      square: pg.square === true,
      mode: pg.mode === 'free' ? 'free' : 'grid',
      free: pg.free ? { landscape: rects(pg.free.landscape), portrait: rects(pg.free.portrait) } : null,
      tab: {
        icon: normIcon(pg.tab?.icon),
        color: typeof pg.tab?.color === 'string' ? pg.tab.color : ACCENT,
      },
    };
  });
  const home = pages.some((p) => p.id === raw.home) ? raw.home : pages[0].id;
  return {
    version: 1,
    name: String(raw.name ?? 'Мой пульт'),
    accent: ACCENT,
    pageDots: raw.pageDots !== false,
    nav: ['tabs', 'icons', 'dots', 'none'].includes(raw.nav) ? raw.nav : raw.pageDots === false ? 'none' : 'tabs',
    keepAwake: raw.keepAwake !== false,
    home,
    pages,
  };
}
