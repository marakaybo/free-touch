// Отрисовка кнопок и слайдеров. Один и тот же код в редакторе и на телефоне,
// поэтому предпросмотр выглядит точно как пульт.
import { icons as lucideIcons } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { BRANDS } from './brands';
import type { ActiveRule, Button, ButtonStyle, Fill, IconRef, Page, States } from './types';

export function fillCss(f: Fill): CSSProperties {
  switch (f.type) {
    case 'solid':
      return { background: f.color };
    case 'gradient':
      return { background: `linear-gradient(${f.angle}deg, ${f.from}, ${f.to})` };
    case 'image':
      return {
        backgroundImage: `linear-gradient(rgba(0,0,0,${f.dim}), rgba(0,0,0,${f.dim})), url("${f.src}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
  }
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

export function IconView({ icon, color, size }: { icon: IconRef; color: string; size: string }): ReactNode {
  const box: CSSProperties = { width: size, height: size, flex: 'none', display: 'grid', placeItems: 'center' };
  switch (icon.kind) {
    case 'none':
      return null;
    case 'emoji':
      return <span style={{ ...box, fontSize: `calc(${size} * 0.86)`, lineHeight: 1 }}>{icon.value}</span>;
    case 'lucide': {
      const C = (lucideIcons as Record<string, React.ComponentType<{ size?: string | number; color?: string; strokeWidth?: number }>>)[icon.name];
      if (!C) return null;
      return <span style={box}><C size="100%" color={color} strokeWidth={2} /></span>;
    }
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
      return <img src={icon.src} alt="" draggable={false} style={{ ...box, objectFit: 'contain', borderRadius: '12%' }} />;
  }
}

export function resolveStyle(b: Button, states: States): { style: ButtonStyle; active: boolean } {
  const active = isActive(b.active, states);
  if (!active || !b.active) return { style: b.style, active };
  return { style: { ...b.style, ...b.active.style }, active };
}

function shadowCss(s: ButtonStyle): string {
  switch (s.shadow) {
    case 'soft': return '0 6px 16px -8px rgba(0,0,0,.55)';
    case 'lift': return '0 12px 22px -12px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.22)';
    case 'glow': return `0 0 18px -3px ${s.glowColor}, inset 0 0 14px -6px ${s.glowColor}`;
    default: return 'none';
  }
}

const FONT: Record<ButtonStyle['font'], string> = {
  onest: "'Onest Variable', system-ui, sans-serif",
  unbounded: "'Unbounded Variable', system-ui, sans-serif",
  mono: "'JetBrains Mono Variable', ui-monospace, monospace",
};

export interface FaceProps {
  button: Button;
  states: States;
  accent: string;
  pressed?: boolean;
  /** Счётчик нажатий: меняется — проигрывается «волна». */
  pulse?: number;
  now?: Date;
  children?: ReactNode;
}

/** Внешний вид обычной кнопки. Родитель должен иметь container-type: size. */
export function ButtonFace({ button, states, accent, pressed, pulse, now }: FaceProps) {
  const { style: s, active } = resolveStyle(button, states);
  const label = s.labelPos === 'hidden' ? '' : formatLabel(s.label, states, now);
  const ring = active && button.active && Object.keys(button.active.style).length === 0;
  const shadow = [shadowCss(s), ring ? `0 0 0 2.5cqmin ${accent}` : ''].filter((x) => x && x !== 'none').join(', ') || 'none';
  const face: CSSProperties = {
    ...fillCss(s.fill),
    borderRadius: `${s.radius}cqmin`,
    border: s.borderWidth ? `${s.borderWidth * 0.8}cqmin solid ${s.borderColor}` : undefined,
    boxShadow: shadow,
    color: s.textColor,
    fontFamily: FONT[s.font],
    fontWeight: s.bold ? 700 : 500,
  };
  const hasIcon = s.icon.kind !== 'none';
  const iconEl = hasIcon ? <IconView icon={s.icon} color={s.iconColor} size={`${s.iconSize}cqmin`} /> : null;
  const labelEl = label ? (
    <span className="ft-label" style={{ fontSize: `${s.fontSize}cqmin` }}>{label}</span>
  ) : null;
  const cls = ['ft-face', `ft-press-${s.press}`, pressed ? 'is-pressed' : '', active ? 'is-active' : '', `ft-lp-${s.labelPos}`].join(' ');
  return (
    <div className={cls} style={face}>
      {s.labelPos === 'top' && labelEl}
      {iconEl && <div className="ft-icon-wrap">{iconEl}</div>}
      {!iconEl && s.labelPos !== 'center' && <div className="ft-spacer" />}
      {(s.labelPos === 'bottom' || s.labelPos === 'center') && labelEl}
      {active && button.active?.dot && <span className="ft-dot" />}
      {s.press === 'ripple' && pulse ? <span key={pulse} className="ft-ripple" /> : null}
    </div>
  );
}

export function sliderStateKey(b: Button): string {
  const t = b.slider?.target;
  if (!t || t.kind === 'master') return 'system.volume';
  if (t.kind === 'obsInput') return `obs.volume:${t.input}`;
  return `app.volume:${t.app.toLowerCase()}`;
}

/** Внешний вид слайдера. `value` — 0..100. */
export function SliderFace({ button, states, value }: { button: Button; states: States; value: number }) {
  const s = button.style;
  const vertical = button.slider?.vertical ?? true;
  const color = button.slider?.color || '#8F6BFF';
  const v = Math.max(0, Math.min(100, value));
  const label = formatLabel(s.label, states);
  const fill: CSSProperties = vertical
    ? { left: 0, right: 0, bottom: 0, height: `${v}%` }
    : { top: 0, bottom: 0, left: 0, width: `${v}%` };
  return (
    <div
      className={`ft-face ft-slider ${vertical ? 'is-vertical' : 'is-horizontal'}`}
      style={{
        ...fillCss(s.fill),
        borderRadius: `${s.radius}cqmin`,
        border: s.borderWidth ? `${s.borderWidth * 0.8}cqmin solid ${s.borderColor}` : undefined,
        boxShadow: shadowCss(s),
        color: s.textColor,
        fontFamily: FONT[s.font],
      }}
    >
      <div className="ft-slider-fill" style={{ ...fill, background: `linear-gradient(${vertical ? '0deg' : '90deg'}, ${color}CC, ${color})` }} />
      <div className="ft-slider-info">
        {s.icon.kind !== 'none' && <IconView icon={s.icon} color={s.iconColor} size={vertical ? '34cqw' : '34cqh'} />}
        <span className="ft-slider-value">{Math.round(v)}</span>
        {label && s.labelPos !== 'hidden' && <span className="ft-slider-label">{label}</span>}
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
