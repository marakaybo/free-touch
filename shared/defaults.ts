import { PH } from './phosphor';
import type { Action, ActiveRule, Button, ButtonStyle, Fill, IconRef, Page, Profile } from './types';

export const uid = () => Math.random().toString(36).slice(2, 10);

/** Единственный акцент интерфейса. */
export const ACCENT = '#3D7BFF';
/** Красный — только эфир и запись. */
export const LIVE = '#E5484D';
export const LIVE_STATES = ['obs.streaming', 'obs.recording'];

export const KEY_TEXT = '#C9CBCF';
export const DIM_TEXT = '#6B6E75';

export const baseStyle = (): ButtonStyle => ({
  fill: { type: 'solid', color: '#2A2C30' },
  radius: 11,
  borderWidth: 0,
  borderColor: '#FFFFFF26',
  shadow: 'key',
  label: '',
  labelPos: 'bottom',
  font: 'condensed',
  fontSize: 14,
  bold: false,
  textColor: KEY_TEXT,
  icon: { kind: 'none' },
  iconSize: 34,
  iconColor: KEY_TEXT,
  press: 'press',
});

export interface KeyColor {
  id: string;
  name: string;
  fill: string;
  text: string;
}

/** «Пластики» для клавиш: плоские приглушённые тона. */
export const KEY_COLORS: KeyColor[] = [
  { id: 'graphite', name: 'Графит', fill: '#2A2C30', text: KEY_TEXT },
  { id: 'coal', name: 'Уголь', fill: '#1E1F22', text: '#B4B7BC' },
  { id: 'steel', name: 'Сталь', fill: '#353B44', text: '#D2D6DC' },
  { id: 'olive', name: 'Олива', fill: '#394030', text: '#D3D8C8' },
  { id: 'ochre', name: 'Охра', fill: '#4E4428', text: '#E0D6BC' },
  { id: 'rust', name: 'Ржавчина', fill: '#4A3326', text: '#E2CFC2' },
  { id: 'plum', name: 'Слива', fill: '#3A2A37', text: '#DCCCD8' },
  { id: 'sand', name: 'Песок', fill: '#BDB6A8', text: '#26272A' },
];

export const keyColorStyle = (c: KeyColor): Partial<ButtonStyle> => ({
  fill: { type: 'solid', color: c.fill },
  textColor: c.text,
  iconColor: c.text,
});

export const PAGE_BACKGROUNDS: Fill[] = [
  { type: 'solid', color: '#121314' },
  { type: 'solid', color: '#0E0F10' },
  { type: 'solid', color: '#16171A' },
  { type: 'solid', color: '#1A1B1E' },
  { type: 'solid', color: '#1B1A18' },
  { type: 'solid', color: '#15181B' },
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
  background: { type: 'solid', color: '#121314' },
  buttons: [],
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
    obsBtn(0, 0, 'Эфир', 'broadcast', 'stream'),
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
      style: withStyle({ label: '{time}', labelPos: 'center', font: 'mono', fontSize: 24, shadow: 'flat', fill: { type: 'solid', color: '#1A1B1E' } }),
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
    mediaBtn(1, 0, 'Пауза', 'play-pause', 'playPause'),
    mediaBtn(2, 0, 'Вперёд', 'skip-forward', 'next'),
    mediaBtn(0, 1, 'Тише', 'speaker-low', 'volDown'),
    mediaBtn(1, 1, 'Громче', 'speaker-high', 'volUp'),
    mediaBtn(2, 1, 'Без звука', 'speaker-x', 'mute'),
    newButton(0, 2, {
      style: withStyle({ label: 'Назад', icon: icon('arrow-left'), shadow: 'flat', fill: { type: 'solid', color: '#1E1F22' } }),
      actions: [{ type: 'page', page: '@back' }],
    }),
    newButton(1, 2, {
      w: 2,
      style: withStyle({ label: 'ЦП {system.cpu}%  ОЗУ {system.ram}%', labelPos: 'center', font: 'mono', fontSize: 13, shadow: 'flat', fill: { type: 'solid', color: '#1A1B1E' } }),
    }),
    newButton(3, 0, {
      h: 3,
      type: 'slider',
      style: withStyle({ label: 'Громкость' }),
      slider: { target: { kind: 'master', input: '', app: '' }, vertical: true, color: ACCENT },
    }),
  ];

  return { version: 1, name: 'Мой пульт', accent: ACCENT, pageDots: true, keepAwake: true, home: stream.id, pages: [stream, media] };
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

function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

/** Приглушить цвет до «пластика»: меньше насыщенности, тёмный тон. */
export function mute(hex: string): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return '#2A2C30';
  const [h, s, l] = hsl;
  if (l > 0.72) return hslToHex(h, Math.min(s, 0.12), 0.7);
  return hslToHex(h, Math.min(s, 0.26), Math.min(0.26, Math.max(0.14, l * 0.55)));
}

function normFill(f: any, def: Fill): Fill {
  if (f?.type === 'solid' && typeof f.color === 'string') return f;
  if (f?.type === 'gradient' && typeof f.from === 'string') return { type: 'solid', color: mute(f.from) };
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
  r.radius = 11;
  r.bold = false;
  r.font = 'condensed';
  if (r.fontSize === 13) r.fontSize = 14;
  if (r.iconSize === 38) r.iconSize = 34;
  if (r.fill?.type === 'solid' && /^#23252F$/i.test(r.fill.color)) r.fill = { type: 'solid', color: '#2A2C30' };
  if (r.fill?.type === 'solid' && /^#FFFFFF(0D|10|14)$/i.test(r.fill.color)) { r.fill = { type: 'solid', color: '#1A1B1E' }; r.shadow = 'none'; }
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
  if (style.fill) style.fill = normFill(style.fill, { type: 'solid', color: '#2A2C30' });
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
          ? { target: { kind: 'master', input: '', app: '' }, vertical: true, ...(b.slider ?? {}), color: ACCENT }
          : null,
      } as Button;
    });
    const bg = normFill(pg.background, base.background);
    return {
      id: typeof pg.id === 'string' && pg.id ? pg.id : uid(),
      name: String(pg.name ?? 'Страница'),
      cols,
      rows,
      gap: int(pg.gap, 0, 40, 12),
      // Страница — ровный тёмный фон; старые цветные фоны сводим к тёмному тону.
      background: bg.type === 'solid' && pg.background?.type === 'gradient' ? { type: 'solid', color: '#121314' } : bg,
      buttons,
    };
  });
  const home = pages.some((p) => p.id === raw.home) ? raw.home : pages[0].id;
  return {
    version: 1,
    name: String(raw.name ?? 'Мой пульт'),
    accent: ACCENT,
    pageDots: raw.pageDots !== false,
    keepAwake: raw.keepAwake !== false,
    home,
    pages,
  };
}
