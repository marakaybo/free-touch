import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { Fill } from '../../shared/types';
import { pickFile, api } from '../api';
import { fillCss } from '../../shared/render';

export function Field({ label, hint, children, row }: { label: string; hint?: string; children: ReactNode; row?: boolean }) {
  return (
    <label className={`fld ${row ? 'fld-row' : ''}`}>
      <span className="fld-label">{label}</span>
      {children}
      {hint && <span className="fld-hint">{hint}</span>}
    </label>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="sec">
      <div className="sec-head"><h4>{title}</h4>{right}</div>
      <div className="sec-body">{children}</div>
    </section>
  );
}

export function Seg<T extends string>({ value, options, onChange }: {
  value: T; options: { v: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.v} type="button" title={o.title} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button type="button" className={`tgl ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="tgl-track"><span className="tgl-knob" /></span>
      <span>{label}</span>
    </button>
  );
}

export function Range({ value, min, max, step = 1, onChange, suffix = '' }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="rng">
      <input
        type="range" min={min} max={max} step={step} value={value}
        style={{ ['--p' as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="rng-val">{value}{suffix}</span>
    </div>
  );
}

export function Text({ value, onChange, placeholder, mono, list }: {
  value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; list?: string[];
}) {
  const id = useId();
  return (
    <>
      <input
        className={`inp ${mono ? 'mono' : ''}`}
        value={value}
        placeholder={placeholder}
        list={list ? id : undefined}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      {list && <datalist id={id}>{list.map((x) => <option key={x} value={x} />)}</datalist>}
    </>
  );
}

export function Num({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <input
      className="inp num" type="number" value={value} min={min} max={max}
      onChange={(e) => {
        let v = Number(e.target.value);
        if (Number.isNaN(v)) return;
        if (min !== undefined) v = Math.max(min, v);
        if (max !== undefined) v = Math.min(max, v);
        onChange(v);
      }}
    />
  );
}

export function Select<T extends string>({ value, options, onChange, placeholder }: {
  value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; placeholder?: string;
}) {
  const known = options.some((o) => o.v === value);
  return (
    <select className="inp sel" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {!known && value && <option value={value}>{value}</option>}
      {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  );
}

const QUICK = ['#23252F', '#0E1016', '#FFFFFF', '#E5484D', '#FF8A3D', '#F5C542', '#3DD68C', '#1FD6C1', '#2F6BFF', '#8F6BFF', '#E54DB2', '#00000000'];

/** Цвет с прозрачностью: #RRGGBB или #RRGGBBAA. */
export function Color({ value, onChange, compact }: { value: string; onChange: (v: string) => void; compact?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const hex = value.slice(0, 7);
  const alpha = value.length === 9 ? parseInt(value.slice(7), 16) : 255;
  const setAlpha = (a: number) => onChange(hex + (a >= 255 ? '' : Math.round(a).toString(16).padStart(2, '0')));
  return (
    <div className={`clr ${compact ? 'compact' : ''}`}>
      <button type="button" className="clr-sw" onClick={() => ref.current?.click()}>
        <span style={{ background: value }} />
      </button>
      <input ref={ref} type="color" value={hex} onChange={(e) => onChange(e.target.value + (alpha >= 255 ? '' : value.slice(7)))} hidden />
      <input className="inp mono clr-hex" value={value} onChange={(e) => /^#[0-9a-fA-F]{0,8}$/.test(e.target.value) && onChange(e.target.value)} />
      {!compact && (
        <>
          <input className="clr-alpha" type="range" min={0} max={255} value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} title="Прозрачность" style={{ ['--c' as string]: hex }} />
          <div className="clr-quick">
            {QUICK.map((c) => <button key={c} type="button" style={{ background: c }} className={c === value ? 'on' : ''} onClick={() => onChange(c)} />)}
          </div>
        </>
      )}
    </div>
  );
}

/** Картинку уменьшаем, чтобы профиль не разрастался. GIF оставляем как есть — он анимированный. */
export async function loadImage(maxSide: number): Promise<string | null> {
  const path = await pickFile([{ name: 'Картинки', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'] }]);
  if (!path) return null;
  const data = await api.readImage(path);
  if (/\.(gif|svg)$/i.test(path)) return data;
  const img = new Image();
  img.src = data;
  await img.decode();
  const k = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/webp', 0.88);
}

export function FillEditor({ fill, onChange, allowImage = true }: { fill: Fill; onChange: (f: Fill) => void; allowImage?: boolean }) {
  const setType = (t: Fill['type']) => {
    if (t === fill.type) return;
    const base = fill.type === 'solid' ? fill.color : fill.type === 'gradient' ? fill.from : '#23252F';
    if (t === 'solid') onChange({ type: 'solid', color: base });
    if (t === 'gradient') onChange({ type: 'gradient', from: base.slice(0, 7), to: '#1FD6C1', angle: 135 });
    if (t === 'image') {
      loadImage(900).then((src) => src && onChange({ type: 'image', src, dim: 0.25 }));
    }
  };
  return (
    <div className="fill-ed">
      <Seg
        value={fill.type}
        onChange={setType}
        options={[
          { v: 'solid', label: 'Цвет' },
          { v: 'gradient', label: 'Градиент' },
          ...(allowImage ? [{ v: 'image' as const, label: 'Картинка' }] : []),
        ]}
      />
      {fill.type === 'solid' && <Color value={fill.color} onChange={(color) => onChange({ ...fill, color })} />}
      {fill.type === 'gradient' && (
        <>
          <div className="grad-prev" style={fillCss(fill)} />
          <div className="two">
            <Color compact value={fill.from} onChange={(from) => onChange({ ...fill, from })} />
            <Color compact value={fill.to} onChange={(to) => onChange({ ...fill, to })} />
          </div>
          <Field label="Угол"><Range value={fill.angle} min={0} max={360} step={5} suffix="°" onChange={(angle) => onChange({ ...fill, angle })} /></Field>
        </>
      )}
      {fill.type === 'image' && (
        <>
          <div className="grad-prev" style={fillCss(fill)} />
          <div className="two">
            <button type="button" className="btn" onClick={() => loadImage(900).then((src) => src && onChange({ ...fill, src }))}>Другая картинка</button>
          </div>
          <Field label="Затемнение"><Range value={Math.round(fill.dim * 100)} min={0} max={90} suffix="%" onChange={(d) => onChange({ ...fill, dim: d / 100 })} /></Field>
        </>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
