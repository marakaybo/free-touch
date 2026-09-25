// Отрисовка клавиш и фейдеров. Один и тот же код в редакторе и на телефоне,
// поэтому предпросмотр выглядит точно как пульт.
import type { CSSProperties, ReactNode } from 'react';
import { BRANDS } from './brands';
import { ACCENT, LIVE_STATES } from './defaults';
import { PH } from './phosphor';
import type { ActiveRule, Button, ButtonStyle, Fill, IconRef, Page, States } from './types';

export function fillCss(f: Fill): CSSProperties {
  if (f.type === 'image') {
    return {
      backgroundImage: `linear-gradient(rgba(0,0,0,${f.dim}), rgba(0,0,0,${f.dim})), url("${f.src}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  if (f.type === 'gradient') return { backgroundImage: `linear-gradient(${f.angle}deg, ${f.from}, ${f.to})` };
  // Цвет — отдельным свойством, чтобы поверх лёг блик клавиши из CSS.
  return { backgroundColor: f.color };
}

/** Секундомер: {base, since} — накоплено и когда запущен. */
type TimerState = { base: number; since: number | null };
const isTimer = (v: unknown): v is TimerState => !!v && typeof v === 'object' && 'base' in (v as object);

export function timerMs(v: unknown, now = Date.now()): number {
  if (!isTimer(v)) return 0;
  return v.base + (v.since ? Math.max(0, now - v.since) : 0);
}

export function formatDuration(ms: number): string {
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function isActive(rule: ActiveRule | null, states: States): boolean {
  if (!rule || !rule.state) return false;
  const v = states[rule.state];
  if (isTimer(v)) return !!v.since;
  // Устройство звука ищем по вхождению: «Наушники» совпадают с «Наушники (Realtek)».
  if (rule.equals !== '' && (rule.state === 'system.output' || rule.state === 'system.input')) {
    return typeof v === 'string' && v.toLowerCase().includes(rule.equals.toLowerCase());
  }
  if (rule.equals !== '') return v !== undefined && v !== null && String(v) === rule.equals;
  return v === true || (typeof v === 'number' && v !== 0) || (typeof v === 'string' && v !== '' && v !== 'false');
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatLabel(text: string, states: States, now = new Date()): string {
  if (!text.includes('{')) return text;
  return text.replace(/\{([^{}]+)\}/g, (_, key: string) => {
    switch (key) {
      case 'time': return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      case 'seconds': return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      case 'date': return now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      case 'weekday': return now.toLocaleDateString('ru-RU', { weekday: 'long' });
    }
    const v = states[key];
    if (key.startsWith('timer:')) return formatDuration(timerMs(v, now.getTime()));
    if (key.startsWith('counter:') && v === undefined) return '0';
    if (v === undefined || v === null) return '—';
    if (typeof v === 'boolean') return v ? 'вкл' : 'выкл';
    return String(v);
  });
}

export const usesClock = (text: string) => /\{(time|seconds|date|weekday|timer:[^}]+)\}/.test(text);

/** Значок Phosphor из шрифта. fill — для клавиш, regular — для интерфейса. */
export function Ph({ name, size = 16, color, weight = 'regular', className = '' }: {
  name: string; size?: number | string; color?: string; weight?: 'regular' | 'fill'; className?: string;
}) {
  const cp = PH[name];
  if (!cp) return null;
  return (
    <i
      className={`ph-i ${className}`}
      aria-hidden="true"
      style={{ fontFamily: weight === 'fill' ? 'Phosphor-Fill' : 'Phosphor', fontSize: size, color, width: size, height: size }}
    >
      {String.fromCodePoint(cp)}
    </i>
  );
}

export function IconView({ icon, color, size }: { icon: IconRef; color: string; size: string }): ReactNode {
  const box: CSSProperties = { width: size, height: size, flex: 'none', display: 'grid', placeItems: 'center' };
  switch (icon.kind) {
    case 'none':
      return null;
    case 'icon':
      return <Ph name={icon.name} size={size} color={color} weight="fill" />;
    case 'emoji':
      return <span style={{ ...box, fontSize: `calc(${size} * 0.86)`, lineHeight: 1 }}>{icon.value}</span>;
    case 'brand': {
      const b = BRANDS[icon.name];
      if (!b) return null;
      return (
        <span style={box}>
          <svg viewBox="0 0 24 24" width="84%" height="84%" fill={color} aria-label={b.title}>
            <path d={b.path} />
          </svg>
        </span>
      );
    }
    case 'image':
      return <img src={icon.src} alt="" draggable={false} style={{ ...box, objectFit: 'contain', borderRadius: '10%' }} />;
  }
}

export function resolveStyle(b: Button, states: States): { style: ButtonStyle; active: boolean } {
  const active = isActive(b.active, states);
  if (!active || !b.active) return { style: b.style, active };
  return { style: { ...b.style, ...b.active.style }, active };
}

const FONT: Record<ButtonStyle['font'], string> = {
  condensed: "'IBM Plex Sans Condensed', 'IBM Plex Sans', system-ui, sans-serif",
  sans: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
};

/** Состояние эфира или записи — единственное место, где появляется красный. */
export const isLive = (b: Button) => !!b.active && LIVE_STATES.includes(b.active.state);

export interface FaceProps {
  button: Button;
  states: States;
  pressed?: boolean;
  now?: Date;
}

/** Клавиша. Родитель должен иметь container-type: size (класс ft-cell). */
export function ButtonFace({ button, states, pressed, now }: FaceProps) {
  const { style: s, active } = resolveStyle(button, states);
  const label = s.labelPos === 'hidden' ? '' : formatLabel(s.label, states, now);
  const live = active && isLive(button) && !button.active?.style.fill;
  const face: CSSProperties = {
    ...fillCss(live ? { type: 'solid', color: '#D93A40' } : s.fill),
    borderRadius: `${s.radius}cqmin`,
    color: live ? '#FFFFFF' : s.textColor,
    fontFamily: FONT[s.font],
    fontWeight: s.bold ? 600 : 400,
    outline: s.borderWidth ? `${s.borderWidth * 0.8}cqmin solid ${s.borderColor}` : undefined,
    outlineOffset: s.borderWidth ? `-${s.borderWidth * 0.8}cqmin` : undefined,
  };
  const iconColor = live ? '#FFFFFF' : s.iconColor;
  const hasIcon = s.icon.kind !== 'none';
  const iconEl = hasIcon ? <IconView icon={s.icon} color={iconColor} size={`${s.iconSize}cqmin`} /> : null;
  const labelEl = label ? <span className="ft-label" style={{ fontSize: `${s.fontSize}cqmin` }}>{label}</span> : null;
  const led = button.active?.dot;
  const cls = [
    'ft-face',
    s.shadow === 'flat' ? 'is-flat' : 'is-key',
    s.press === 'press' && pressed ? 'is-pressed' : '',
    s.press === 'none' && pressed ? 'is-touched' : '',
    `ft-lp-${s.labelPos}`,
  ].join(' ');
  return (
    <div className={cls} style={face}>
      {led && <span className={`ft-led ${active ? (isLive(button) ? 'is-live' : 'is-on') : ''}`} />}
      {s.labelPos === 'top' && labelEl}
      {iconEl && <div className="ft-icon-wrap">{iconEl}</div>}
      {!iconEl && s.labelPos !== 'center' && <div className="ft-spacer" />}
      {(s.labelPos === 'bottom' || s.labelPos === 'center') && labelEl}
    </div>
  );
}

export function sliderStateKey(b: Button): string {
  const t = b.slider?.target;
  if (!t || t.kind === 'master') return 'system.volume';
  if (t.kind === 'obsInput') return `obs.volume:${t.input}`;
  if (t.kind === 'mic') return 'system.micVolume';
  return `app.volume:${t.app.toLowerCase()}`;
}

/** Громкость: клавиша, которая заливается цветом по уровню. Край заливки — «ручка». */
export function SliderFace({ button, states, value, dragging, vertical = true }: {
  button: Button; states: States; value: number; dragging?: boolean;
  /** Направление заливки — по форме клавиши: высокая заливается снизу, широкая слева. */
  vertical?: boolean;
}) {
  const s = button.style;
  const color = button.slider?.color || ACCENT;
  const v = Math.max(0, Math.min(100, value));
  const label = s.labelPos === 'hidden' ? '' : formatLabel(s.label, states);
  return (
    <div
      className={`ft-face is-key ft-fader ${vertical ? 'is-vertical' : 'is-horizontal'} ${dragging ? 'is-dragging' : ''}`}
      style={{ ...fillCss(s.fill), borderRadius: `${s.radius}cqmin`, color: s.textColor, fontFamily: FONT[s.font], ['--v' as string]: `${v}%`, ['--fc' as string]: color }}
    >
      <div className="ft-fader-level" />
      <div className="ft-fader-info">
        {s.icon.kind !== 'none' && <IconView icon={s.icon} color={s.iconColor} size={vertical ? '30cqmin' : '44cqmin'} />}
        <span className="ft-fader-value">{Math.round(v)}</span>
        {label && <span className="ft-fader-label">{label}</span>}
      </div>
    </div>
  );
}

export function gridStyle(page: Page): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${page.cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${page.rows}, minmax(0, 1fr))`,
    gap: page.gap,
  };
}

export const cellStyle = (b: Button): CSSProperties => ({
  gridColumn: `${b.x + 1} / span ${b.w}`,
  gridRow: `${b.y + 1} / span ${b.h}`,
});
