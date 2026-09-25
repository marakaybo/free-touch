import { useMemo, useState } from 'react';
import { BRANDS } from '../../shared/brands';
import { PH } from '../../shared/phosphor';
import { IconView, Ph } from '../../shared/render';
import { PH_TAGS } from '../phosphor-tags';
import type { IconRef } from '../../shared/types';
import { Seg, loadImage } from './ui';

const EMOJI = '🎮 🎧 🎤 🎙️ 🔇 🔊 📷 🎬 📺 🎵 🎶 ⏯️ ⏭️ ⏮️ ⏸️ ⏺️ 🔴 🟢 🟡 🔵 ⚫ ⚪ ⭐ 🔥 💥 ✨ ⚡ 💡 🚀 🎯 🏆 👑 💎 ❤️ 💜 💙 💚 🧡 🖤 👍 👎 👏 🙌 🤝 😂 😎 😱 🤯 😴 🥳 💀 👻 🤖 👾 🎃 🐱 🐶 🦊 🐸 🍕 ☕ 🍿 🌙 ☀️ 🌈 ❄️ 💬 📢 🔔 🔕 ⏰ ⏱️ 📌 🔒 🔓 🛑 ⛔ ✅ ❌ ❓ ❗ ➕ ➖ 🔁 🔀 💻 🖥️ ⌨️ 🖱️ 📱 🗂️ 📁 🗑️ ⚙️ 🛠️ 🧰 🎲 🃏 🧩 🪄'.split(' ');

export function IconPicker({ value, onChange }: { value: IconRef; onChange: (i: IconRef) => void }) {
  const [tab, setTab] = useState<'icon' | 'brand' | 'emoji' | 'image'>(value.kind === 'none' ? 'icon' : value.kind);
  const [q, setQ] = useState('');
  const names = useMemo(() => Object.keys(PH), []);
  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return names.slice(0, 180);
    // Сначала совпадения по имени, потом по словам-тегам (play, stream, mute…).
    const byName = names.filter((n) => n.includes(s));
    const byTag = names.filter((n) => !n.includes(s) && PH_TAGS[n]?.includes(s));
    return [...byName, ...byTag].slice(0, 180);
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
            { v: 'icon', label: 'Значки' },
            { v: 'brand', label: 'Бренды' },
            { v: 'emoji', label: 'Эмодзи' },
            { v: 'image', label: 'Своя' },
          ]}
        />
        <button type="button" className="icon-btn" onClick={() => onChange({ kind: 'none' })} title="Убрать значок"><Ph name="prohibit" size={16} /></button>
      </div>
      {(tab === 'icon' || tab === 'brand') && (
        <input className="inp" placeholder={tab === 'icon' ? 'Поиск по-английски: mic, play, camera' : 'Поиск: discord, obs'} value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      <div className="ipk-grid">
        {tab === 'icon' && found.map((n) => (
          <button key={n} type="button" title={n} className={value.kind === 'icon' && value.name === n ? 'on' : ''} onClick={() => onChange({ kind: 'icon', name: n })}>
            <Ph name={n} size={20} weight="fill" />
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
      {tab === 'icon' && found.length === 180 && <span className="fld-hint">Показаны первые 180 из <span className="mono">{names.length}</span> — уточните поиск.</span>}
    </div>
  );
}
