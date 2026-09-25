import { useState } from 'react';
import { EXTRA_KEYS, keyName, sortKeys } from '../keys';

/** Запись сочетания: кликнуть и нажать клавиши. Win и медиаклавиши — из списка. */
export function HotkeyInput({ keys, onChange }: { keys: string[]; onChange: (k: string[]) => void }) {
  const [rec, setRec] = useState(false);
  const [held, setHeld] = useState<string[]>([]);

  return (
    <div className="hk">
      <button
        type="button"
        className={`hk-box ${rec ? 'rec' : ''}`}
        onClick={() => { setRec(true); setHeld([]); }}
        onBlur={() => setRec(false)}
        onKeyDown={(e) => {
          if (!rec) return;
          e.preventDefault();
          e.stopPropagation();
          const next = held.includes(e.code) ? held : [...held, e.code];
          setHeld(next);
          onChange(sortKeys(next));
        }}
        onKeyUp={(e) => {
          if (!rec) return;
          e.preventDefault();
          // Запись заканчивается, когда отпущены все клавиши.
          if (!e.getModifierState('Control') && !e.getModifierState('Alt') && !e.getModifierState('Shift')) setRec(false);
        }}
      >
        {keys.length === 0 && !rec && <span className="hk-ph">Нажмите и введите сочетание</span>}
        {rec && held.length === 0 && <span className="hk-ph">Жду клавиши…</span>}
        {keys.map((k, i) => (
          <span key={k + i} className="kbd">{keyName(k)}</span>
        ))}
      </button>
      <select
        className="inp sel hk-add"
        value=""
        onChange={(e) => e.target.value && onChange(sortKeys([...keys.filter((k) => k !== e.target.value), e.target.value]))}
        title="Добавить клавишу, которую нельзя нажать при записи"
      >
        <option value="">+ клавиша</option>
        {EXTRA_KEYS.map((k) => <option key={k} value={k}>{keyName(k)}</option>)}
      </select>
      {keys.length > 0 && <button type="button" className="icon-btn" onClick={() => onChange([])} title="Очистить">✕</button>}
    </div>
  );
}
