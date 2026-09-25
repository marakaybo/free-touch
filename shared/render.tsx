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
  return { background: f.color };
}

export function isActive(rule: ActiveRule | null, states: States): boolean {
  if (!rule || !rule.state) return false;
  const v = states[rule.state];
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
    if (v === undefined || v === null) return '—';
    if (typeof v === 'boolean') return v ? 'вкл' : 'выкл';
    return String(v);
  });
}

export const usesClock = (text: string) => /\{(time|seconds|date|weekday)\}/.test(text);

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
  const plain = active && button.active && Object.keys(button.active.style).length === 0;
  const face: CSSProperties = {
    ...fillCss(live ? { type: 'solid', color: '#3A2325' } : s.fill),
    borderRadius: `${s.radius}cqmin`,
    color: live ? '#F2DADB' : plain ? '#ECEDEF' : s.textColor,
    fontFamily: FONT[s.font],
    fontWeight: s.bold ? 500 : 400,
    outline: s.borderWidth ? `${s.borderWidth * 0.8}cqmin solid ${s.borderColor}` : undefined,
    outlineOffset: s.borderWidth ? `-${s.borderWidth * 0.8}cqmin` : undefined,
  };
  const iconColor = live ? '#F2DADB' : plain ? '#ECEDEF' : s.iconColor;
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
  return `app.volume:${t.app.toLowerCase()}`;
}

/** Фейдер как на микшере: утопленная дорожка, колпачок с риской, значение моноширинным. */
export function SliderFace({ button, states, value, dragging }: { button: Button; states: States; value: number; dragging?: boolean }) {
  const s = button.style;
  const vertical = button.slider?.vertical ?? true;
  const v = Math.max(0, Math.min(100, value));
  const label = s.labelPos === 'hidden' ? '' : formatLabel(s.label, states);
  return (
    <div
      className={`ft-face ft-fader ${vertical ? 'is-vertical' : 'is-horizontal'} ${dragging ? 'is-dragging' : ''}`}
      style={{ borderRadius: `${Math.min(s.radius, 14)}cqmin`, ['--v' as string]: `${v}%`, ['--vn' as string]: v / 100, ['--acc' as string]: ACCENT }}
    >
      <span className="ft-fader-value">{Math.round(v)}</span>
      <div className="ft-fader-slot">
        <div className="ft-fader-track"><div className="ft-fader-level" /></div>
        <div className="ft-fader-cap"><i /></div>
      </div>
      {label && <span className="ft-fader-label" style={{ fontFamily: FONT[s.font] }}>{label}</span>}
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
