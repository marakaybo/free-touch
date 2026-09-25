import { useMemo, useState } from 'react';
import { icons as lucideIcons } from 'lucide-react';
import { BRANDS } from '../../shared/brands';
import { IconView } from '../../shared/render';
import type { IconRef } from '../../shared/types';
import { Seg, loadImage } from './ui';

const EMOJI = '🎮 🎧 🎤 🎙️ 🔇 🔊 📷 🎬 📺 🎵 🎶 ⏯️ ⏭️ ⏮️ ⏸️ ⏺️ 🔴 🟢 🟡 🔵 ⚫ ⚪ ⭐ 🔥 💥 ✨ ⚡ 💡 🚀 🎯 🏆 👑 💎 ❤️ 💜 💙 💚 🧡 🖤 👍 👎 👏 🙌 🤝 😂 😎 😱 🤯 😴 🥳 💀 👻 🤖 👾 🎃 🐱 🐶 🦊 🐸 🍕 ☕ 🍿 🌙 ☀️ 🌈 ❄️ 💬 📢 🔔 🔕 ⏰ ⏱️ 📌 🔒 🔓 🛑 ⛔ ✅ ❌ ❓ ❗ ➕ ➖ 🔁 🔀 💻 🖥️ ⌨️ 🖱️ 📱 🗂️ 📁 🗑️ ⚙️ 🛠️ 🧰 🎲 🃏 🧩 🪄'.split(' ');

export function IconPicker({ value, onChange }: { value: IconRef; onChange: (i: IconRef) => void }) {
  const [tab, setTab] = useState<'lucide' | 'brand' | 'emoji' | 'image'>(value.kind === 'none' ? 'lucide' : (value.kind as 'lucide'));
  const [q, setQ] = useState('');
  const names = useMemo(() => Object.keys(lucideIcons), []);
  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? names.filter((n) => n.toLowerCase().includes(s)) : names).slice(0, 180);
  }, [q, names]);
  const brandList = useMemo(() => {
    const s = q.trim().toLowerCase();
    return Object.entries(BRANDS).filter(([k, b]) => !s || k.includes(s) || b.title.toLowerCase().includes(s));
  }, [q]);

  return (
    <div className="ipk">
      <div className="ipk-top">
        <Seg
          value={tab}
          onChange={setTab}
          options={[
            { v: 'lucide', label: 'Значки' },
            { v: 'brand', label: 'Бренды' },
            { v: 'emoji', label: 'Эмодзи' },
            { v: 'image', label: 'Своя' },
          ]}
        />
        <button type="button" className="btn ghost sm" onClick={() => onChange({ kind: 'none' })} disabled={value.kind === 'none'}>Убрать</button>
      </div>
      {(tab === 'lucide' || tab === 'brand') && (
        <input className="inp" placeholder={tab === 'lucide' ? 'Поиск по-английски: mic, play, camera…' : 'Поиск: discord, obs…'} value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      <div className="ipk-grid">
        {tab === 'lucide' && found.map((n) => (
          <button key={n} type="button" title={n} className={value.kind === 'lucide' && value.name === n ? 'on' : ''} onClick={() => onChange({ kind: 'lucide', name: n })}>
            <IconView icon={{ kind: 'lucide', name: n }} color="currentColor" size="20px" />
          </button>
        ))}
        {tab === 'brand' && brandList.map(([k, b]) => (
          <button key={k} type="button" title={b.title} className={value.kind === 'brand' && value.name === k ? 'on' : ''} onClick={() => onChange({ kind: 'brand', name: k })}>
            <IconView icon={{ kind: 'brand', name: k }} color="currentColor" size="22px" />
          </button>
        ))}
        {tab === 'emoji' && EMOJI.map((e) => (
          <button key={e} type="button" className={`emo ${value.kind === 'emoji' && value.value === e ? 'on' : ''}`} onClick={() => onChange({ kind: 'emoji', value: e })}>{e}</button>
        ))}
      </div>
      {tab === 'emoji' && (
        <input className="inp" placeholder="Или вставьте любой эмодзи" maxLength={8} onChange={(e) => e.target.value && onChange({ kind: 'emoji', value: e.target.value })} />
      )}
      {tab === 'image' && (
        <div className="ipk-img">
          {value.kind === 'image' && <img src={value.src} alt="" />}
          <button type="button" className="btn" onClick={() => loadImage(320).then((src) => src && onChange({ kind: 'image', src }))}>
            Выбрать PNG, JPG, GIF, SVG…
          </button>
          <span className="fld-hint">GIF остаётся анимированным. Остальное уменьшается до 320 px.</span>
        </div>
      )}
      {tab === 'lucide' && found.length === 180 && <span className="fld-hint">Показаны первые 180 — уточните поиск. Всего значков: {names.length}.</span>}
    </div>
  );
}
