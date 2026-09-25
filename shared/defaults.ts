import type { Action, ActiveRule, Button, ButtonStyle, Fill, Page, Profile } from './types';

export const uid = () => Math.random().toString(36).slice(2, 10);

export const ACCENT = '#7C6CFF';

export const baseStyle = (): ButtonStyle => ({
  fill: { type: 'solid', color: '#23252F' },
  radius: 22,
  borderWidth: 0,
  borderColor: '#FFFFFF33',
  shadow: 'soft',
  glowColor: ACCENT,
  label: '',
  labelPos: 'bottom',
  font: 'onest',
  fontSize: 13,
  bold: true,
  textColor: '#ECEDF3',
  icon: { kind: 'none' },
  iconSize: 38,
  iconColor: '#ECEDF3',
  press: 'scale',
});

export interface StylePreset {
  id: string;
  name: string;
  style: Partial<ButtonStyle>;
}

export const STYLE_PRESETS: StylePreset[] = [
  { id: 'graphite', name: 'Графит', style: { fill: { type: 'solid', color: '#23252F' }, borderWidth: 0, shadow: 'soft', textColor: '#ECEDF3', iconColor: '#ECEDF3' } },
  { id: 'accent', name: 'Акцент', style: { fill: { type: 'gradient', from: '#8F6BFF', to: '#1FD6C1', angle: 135 }, borderWidth: 0, shadow: 'lift', textColor: '#FFFFFF', iconColor: '#FFFFFF' } },
  { id: 'glass', name: 'Стекло', style: { fill: { type: 'solid', color: '#FFFFFF14' }, borderWidth: 1, borderColor: '#FFFFFF26', shadow: 'none', textColor: '#FFFFFF', iconColor: '#FFFFFF' } },
  { id: 'neon', name: 'Неон', style: { fill: { type: 'solid', color: '#0E1016' }, borderWidth: 2, borderColor: '#22D3C5', shadow: 'glow', glowColor: '#22D3C5', textColor: '#7FF5E9', iconColor: '#22D3C5' } },
  { id: 'sunset', name: 'Закат', style: { fill: { type: 'gradient', from: '#FF5F6D', to: '#FFC371', angle: 150 }, borderWidth: 0, shadow: 'lift', textColor: '#2A1215', iconColor: '#2A1215' } },
  { id: 'ocean', name: 'Океан', style: { fill: { type: 'gradient', from: '#2F6BFF', to: '#12C2E9', angle: 160 }, borderWidth: 0, shadow: 'lift', textColor: '#FFFFFF', iconColor: '#FFFFFF' } },
  { id: 'outline', name: 'Контур', style: { fill: { type: 'solid', color: '#00000000' }, borderWidth: 2, borderColor: '#FFFFFF3D', shadow: 'none', textColor: '#ECEDF3', iconColor: '#ECEDF3' } },
  { id: 'paper', name: 'Бумага', style: { fill: { type: 'solid', color: '#F1EEE7' }, borderWidth: 0, shadow: 'lift', textColor: '#1B1C21', iconColor: '#1B1C21' } },
  { id: 'lava', name: 'Лава', style: { fill: { type: 'gradient', from: '#3A0CA3', to: '#F72585', angle: 135 }, borderWidth: 0, shadow: 'lift', textColor: '#FFFFFF', iconColor: '#FFFFFF' } },
  { id: 'forest', name: 'Лес', style: { fill: { type: 'gradient', from: '#134E3A', to: '#3FB27F', angle: 160 }, borderWidth: 0, shadow: 'soft', textColor: '#EFFFF6', iconColor: '#EFFFF6' } },
];

export const PAGE_BACKGROUNDS = [
  { type: 'solid', color: '#0C0D11' },
  { type: 'gradient', from: '#11121A', to: '#1B1535', angle: 160 },
  { type: 'gradient', from: '#0B1320', to: '#0E2A2E', angle: 160 },
  { type: 'gradient', from: '#1A0F14', to: '#2B1520', angle: 160 },
  { type: 'solid', color: '#16171D' },
  { type: 'solid', color: '#EDEAE3' },
] as const;

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

export const newPage = (name: string, cols = 4, rows = 3): Page => ({
  id: uid(),
  name,
  cols,
  rows,
  gap: 12,
  background: { type: 'gradient', from: '#11121A', to: '#1B1535', angle: 160 },
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

/** Подсветка по умолчанию для действия: сцена в эфире, идёт стрим, микрофон выключен… */
export const suggestActive = (a: Action): ActiveRule | null => {
  const red = { fill: { type: 'solid', color: '#E5484D' } as const, textColor: '#FFFFFF', iconColor: '#FFFFFF' };
  if (a.type === 'obs') {
    switch (a.op) {
      case 'scene': return a.scene ? { state: 'obs.scene', equals: a.scene, style: {}, dot: true } : null;
      case 'collection': return a.collection ? { state: 'obs.collection', equals: a.collection, style: {}, dot: true } : null;
      case 'stream': return { state: 'obs.streaming', equals: '', style: red, dot: true };
      case 'record': return { state: 'obs.recording', equals: '', style: red, dot: true };
      case 'recordPause': return { state: 'obs.recordPaused', equals: '', style: {}, dot: true };
      case 'replay': return { state: 'obs.replay', equals: '', style: {}, dot: true };
      case 'virtualcam': return { state: 'obs.virtualcam', equals: '', style: {}, dot: true };
      case 'mute': return a.input ? { state: `obs.mute:${a.input}`, equals: '', style: red, dot: false } : null;
      case 'source': return a.scene && a.source ? { state: `obs.source:${a.scene}/${a.source}`, equals: '', style: {}, dot: true } : null;
      default: return null;
    }
  }
  if (a.type === 'volume' && (a.mode === 'toggleMute' || a.mode === 'mute')) {
    return { state: a.app ? `app.muted:${a.app.toLowerCase()}` : 'system.muted', equals: '', style: red, dot: false };
  }
  return null;
};

export function defaultProfile(): Profile {
  const stream = newPage('Стрим', 4, 3);
  const media = newPage('Медиа', 4, 3);
  media.background = { type: 'gradient', from: '#0B1320', to: '#0E2A2E', angle: 160 };

  const obsBtn = (x: number, y: number, label: string, icon: string, op: 'stream' | 'record' | 'saveReplay' | 'virtualcam', preset: Partial<ButtonStyle> = {}) => {
    const a: Action = { ...(defaultAction('obs') as Extract<Action, { type: 'obs' }>), op };
    return newButton(x, y, {
      style: withStyle({ label, icon: { kind: 'lucide', name: icon }, ...preset }),
      actions: [a],
      active: suggestActive(a),
    });
  };

  stream.buttons = [
    obsBtn(0, 0, 'Эфир', 'Radio', 'stream', { fill: { type: 'gradient', from: '#8F6BFF', to: '#1FD6C1', angle: 135 }, shadow: 'lift' }),
    obsBtn(1, 0, 'Запись', 'Circle', 'record'),
    obsBtn(2, 0, 'Повтор', 'Rewind', 'saveReplay'),
    newButton(0, 1, {
      style: withStyle({ label: 'Звук', icon: { kind: 'lucide', name: 'VolumeX' } }),
      actions: [{ type: 'volume', mode: 'toggleMute', value: 5, app: '' }],
      active: { state: 'system.muted', equals: '', style: { fill: { type: 'solid', color: '#E5484D' } }, dot: false },
    }),
    newButton(1, 1, {
      style: withStyle({ label: 'Скриншот', icon: { kind: 'lucide', name: 'Camera' } }),
      actions: [{ type: 'hotkey', keys: ['MetaLeft', 'ShiftLeft', 'KeyS'], hold: false }],
    }),
    newButton(2, 1, {
      style: withStyle({ label: 'Диспетчер', icon: { kind: 'lucide', name: 'Activity' } }),
      actions: [{ type: 'hotkey', keys: ['ControlLeft', 'ShiftLeft', 'Escape'], hold: false }],
    }),
    newButton(0, 2, {
      w: 2,
      style: withStyle({ label: '{time}', labelPos: 'center', font: 'unbounded', fontSize: 22, fill: { type: 'solid', color: '#FFFFFF0D' }, shadow: 'none' }),
    }),
    newButton(2, 2, {
      style: withStyle({ label: 'Медиа', icon: { kind: 'lucide', name: 'Music' } }),
      actions: [{ type: 'page', page: media.id }],
    }),
    newButton(3, 0, {
      h: 3,
      type: 'slider',
      style: withStyle({ label: 'Громкость', icon: { kind: 'lucide', name: 'Volume2' } }),
      slider: { target: { kind: 'master', input: '', app: '' }, vertical: true, color: '#8F6BFF' },
    }),
  ];

  const mediaBtn = (x: number, y: number, label: string, icon: string, key: Extract<Action, { type: 'media' }>['key']) =>
    newButton(x, y, { style: withStyle({ label, icon: { kind: 'lucide', name: icon } }), actions: [{ type: 'media', key }] });

  media.buttons = [
    mediaBtn(0, 0, 'Назад', 'SkipBack', 'prev'),
    newButton(1, 0, {
      style: withStyle({ label: 'Пауза', icon: { kind: 'lucide', name: 'Play' }, fill: { type: 'gradient', from: '#2F6BFF', to: '#12C2E9', angle: 160 }, shadow: 'lift' }),
      actions: [{ type: 'media', key: 'playPause' }],
    }),
    mediaBtn(2, 0, 'Вперёд', 'SkipForward', 'next'),
    mediaBtn(0, 1, 'Тише', 'Volume1', 'volDown'),
    mediaBtn(1, 1, 'Громче', 'Volume2', 'volUp'),
    mediaBtn(2, 1, 'Без звука', 'VolumeX', 'mute'),
    newButton(0, 2, {
      style: withStyle({ label: 'Назад', icon: { kind: 'lucide', name: 'ArrowLeft' }, fill: { type: 'solid', color: '#FFFFFF10' }, shadow: 'none' }),
      actions: [{ type: 'page', page: '@back' }],
    }),
    newButton(1, 2, {
      w: 2,
      style: withStyle({ label: 'ЦП {system.cpu}% · ОЗУ {system.ram}%', labelPos: 'center', fontSize: 14, fill: { type: 'solid', color: '#FFFFFF0D' }, shadow: 'none' }),
    }),
    newButton(3, 0, {
      h: 3,
      type: 'slider',
      style: withStyle({ label: 'Громкость', icon: { kind: 'lucide', name: 'Volume2' } }),
      slider: { target: { kind: 'master', input: '', app: '' }, vertical: true, color: '#12C2E9' },
    }),
  ];

  return { version: 1, name: 'Мой пульт', accent: ACCENT, pageDots: true, keepAwake: true, home: stream.id, pages: [stream, media] };
}

// ---------- проверка профиля ----------
// Профиль мог прийти из файла, от старой версии программы или быть отредактирован руками.
// Всё, чего не хватает, дозаполняем, мусор отбрасываем — редактор и пульт не должны падать.

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

function normFill(f: any, def: Fill): Fill {
  if (f?.type === 'solid' && typeof f.color === 'string') return f;
  if (f?.type === 'gradient' && typeof f.from === 'string' && typeof f.to === 'string') return { ...f, angle: Number(f.angle) || 0 };
  if (f?.type === 'image' && typeof f.src === 'string') return { ...f, dim: Number(f.dim) || 0 };
  return def;
}

export function normalizeProfile(raw: any): Profile {
  if (!raw || !Array.isArray(raw.pages) || raw.pages.length === 0) return defaultProfile();
  const pages: Page[] = raw.pages.filter(Boolean).map((pg: any) => {
    const base = newPage('');
    const cols = int(pg.cols, 1, 12, 4);
    const rows = int(pg.rows, 1, 10, 3);
    const buttons: Button[] = (Array.isArray(pg.buttons) ? pg.buttons : []).filter(Boolean).map((b: any) => {
      const style = { ...baseStyle(), ...(b.style ?? {}) } as ButtonStyle;
      style.fill = normFill(style.fill, baseStyle().fill);
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
        style,
        actions: normActions(b.actions),
        longActions: normActions(b.longActions),
        active: b.active && typeof b.active.state === 'string'
          ? { state: b.active.state, equals: String(b.active.equals ?? ''), style: b.active.style ?? {}, dot: !!b.active.dot }
          : null,
        slider: type === 'slider'
          ? { target: { kind: 'master', input: '', app: '' }, vertical: true, color: '#8F6BFF', ...(b.slider ?? {}) }
          : null,
      } as Button;
    });
    return {
      id: typeof pg.id === 'string' && pg.id ? pg.id : uid(),
      name: String(pg.name ?? 'Страница'),
      cols,
      rows,
      gap: int(pg.gap, 0, 40, 12),
      background: normFill(pg.background, base.background),
      buttons,
    };
  });
  const home = pages.some((p) => p.id === raw.home) ? raw.home : pages[0].id;
  return {
    version: 1,
    name: String(raw.name ?? 'Мой пульт'),
    accent: typeof raw.accent === 'string' ? raw.accent : ACCENT,
    pageDots: raw.pageDots !== false,
    keepAwake: raw.keepAwake !== false,
    home,
    pages,
  };
}
