import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Download, Minus, Plus, Redo2, Settings as Gear, Smartphone, Square, Trash2, Undo2, X } from 'lucide-react';
import { newPage, uid } from '../shared/defaults';
import { on, win } from './api';
import { Canvas } from './components/Canvas';
import { Inspector } from './components/Inspector';
import { PairModal } from './components/PairModal';
import { SettingsModal } from './components/SettingsModal';
import { StoreProvider, useStore } from './store';
import { UpdateModal, useUpdater } from './updater';

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const { undo, redo, clients, settings: cfg } = useStore();
  const [pair, setPair] = useState(false);
  const [settings, setSettings] = useState(false);
  const upd = useUpdater(cfg.autoUpdate !== false);
  const [showUpd, setShowUpd] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea')) return;
      if (e.ctrlKey && e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (e.ctrlKey && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  useEffect(() => {
    const off = on('ft-open-pair', () => setPair(true));
    return () => { off.then((f) => f()); };
  }, []);

  // Первый запуск: сразу предлагаем подключить телефон.
  useEffect(() => {
    try {
      if (!localStorage.getItem('ft.welcomed')) {
        localStorage.setItem('ft.welcomed', '1');
        setPair(true);
      }
    } catch { /* нет хранилища */ }
  }, []);

  return (
    <div className="app">
      <TitleBar onPair={() => setPair(true)} onSettings={() => setSettings(true)} phones={clients.length} updateVersion={upd.update?.version} onUpdate={() => setShowUpd(true)} />
      <div className="main">
        <Sidebar />
        <Canvas />
        <Inspector />
      </div>
      {pair && <PairModal onClose={() => setPair(false)} />}
      {settings && (
        <SettingsModal
          onClose={() => setSettings(false)}
          checkUpdates={async () => {
            const r = await upd.check(true);
            if (r.update) { setSettings(false); setShowUpd(true); }
            return r;
          }}
        />
      )}
      {showUpd && upd.update && <UpdateModal update={upd.update} onClose={(skip) => { setShowUpd(false); upd.dismiss(skip); }} />}
    </div>
  );
}

function TitleBar({ onPair, onSettings, phones, updateVersion, onUpdate }: {
  onPair: () => void; onSettings: () => void; phones: number; updateVersion?: string; onUpdate: () => void;
}) {
  const { undo, redo, canUndo, canRedo, server, obs, settings } = useStore();
  const obsText = obs.connected ? 'OBS подключён' : settings.obs.enabled ? (obs.error ?? 'OBS не подключён') : 'OBS выключен';
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="brand" data-tauri-drag-region>
        <img src="/logo.svg" alt="" width="22" height="22" />
        <span>Free Touch</span>
      </div>
      <div className="status" data-tauri-drag-region>
        <span className={`pill ${server.running ? (phones ? 'ok' : '') : 'bad'}`} title={server.error ?? `Порт ${server.port}`}>
          <i />{server.running ? (phones ? `Телефонов: ${phones}` : 'Ждёт телефон') : server.error ?? 'Сервер остановлен'}
        </span>
        <span className={`pill ${obs.connected ? 'ok' : settings.obs.enabled ? 'warn' : ''}`} title={obs.error ?? ''} onClick={onSettings}>
          <i />{obsText}
        </span>
      </div>
      <div className="tb-right">
        {updateVersion && (
          <button className="upd-pill" onClick={onUpdate} title="Посмотреть, что нового">
            <Download size={14} /> Обновление {updateVersion}
          </button>
        )}
        <button className="icon-btn" disabled={!canUndo} onClick={undo} title="Отменить (Ctrl+Z)"><Undo2 size={16} /></button>
        <button className="icon-btn" disabled={!canRedo} onClick={redo} title="Вернуть (Ctrl+Y)"><Redo2 size={16} /></button>
        <button className="btn primary" onClick={onPair}><Smartphone size={15} /> Подключить телефон</button>
        <button className="icon-btn" onClick={onSettings} title="Настройки"><Gear size={17} /></button>
        <div className="winctl">
          <button onClick={() => win().then((w) => w.minimize())} title="Свернуть"><Minus size={15} /></button>
          <button onClick={() => win().then((w) => w.toggleMaximize())} title="Развернуть"><Square size={12} /></button>
          <button className="close" onClick={() => win().then((w) => w.close())} title="Закрыть в трей"><X size={16} /></button>
        </div>
      </div>
    </header>
  );
}

function Sidebar() {
  const { profile, pageId, setPageId, update, clients } = useStore();
  const addPage = () => {
    const p = newPage(`Страница ${profile.pages.length + 1}`);
    update((pr) => { pr.pages.push(p); });
    setPageId(p.id);
  };
  const move = (i: number, d: number) => update((pr) => { const [x] = pr.pages.splice(i, 1); pr.pages.splice(i + d, 0, x); });
  const dup = (i: number) => {
    const src = structuredClone(profile.pages[i]);
    src.id = uid();
    src.name = `${src.name} (копия)`;
    src.buttons.forEach((b) => { b.id = uid(); });
    update((pr) => { pr.pages.splice(i + 1, 0, src); });
    setPageId(src.id);
  };
  const del = (i: number) => {
    const p = profile.pages[i];
    if (profile.pages.length === 1) return;
    if (p.buttons.length && !confirm(`Удалить страницу «${p.name}» вместе с кнопками (${p.buttons.length})?`)) return;
    update((pr) => {
      pr.pages.splice(i, 1);
      if (pr.home === p.id) pr.home = pr.pages[0].id;
    });
    setPageId(profile.pages[i === 0 ? 1 : i - 1].id);
  };
  return (
    <nav className="side">
      <div className="side-head">
        <h4>Страницы</h4>
        <button className="icon-btn" onClick={addPage} title="Новая страница"><Plus size={16} /></button>
      </div>
      <div className="pages">
        {profile.pages.map((p, i) => (
          <div key={p.id} className={`page-item ${p.id === pageId ? 'on' : ''}`} onClick={() => setPageId(p.id)}>
            <span className="page-name">{p.name || 'Без названия'}{profile.home === p.id && <em>главная</em>}</span>
            <span className="page-meta">{p.cols}×{p.rows} · {p.buttons.length}</span>
            <span className="page-tools" onClick={(e) => e.stopPropagation()}>
              <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Выше"><ArrowUp size={13} /></button>
              <button className="icon-btn" disabled={i === profile.pages.length - 1} onClick={() => move(i, 1)} title="Ниже"><ArrowDown size={13} /></button>
              <button className="icon-btn" onClick={() => dup(i)} title="Копия"><Copy size={13} /></button>
              <button className="icon-btn danger" disabled={profile.pages.length === 1} onClick={() => del(i)} title="Удалить"><Trash2 size={13} /></button>
            </span>
          </div>
        ))}
      </div>
      <div className="side-head"><h4>Устройства</h4></div>
      <div className="devices">
        {clients.length === 0 && <div className="side-empty">Пока никого. Нажмите «Подключить телефон».</div>}
        {clients.map((c) => (
          <div key={c.id} className="device-item"><i />{c.name}<small>{c.addr}</small></div>
        ))}
      </div>
    </nav>
  );
}
