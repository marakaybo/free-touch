import { useEffect, useState } from 'react';
import { Ph } from '../shared/render';
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
  const { undo, redo, canUndo, canRedo, server, obs, settings, clients, dirty } = useStore();
  const obsText = obs.connected ? 'подключён' : settings.obs.enabled ? 'нет связи' : 'выключен';
  const phoneText = !server.running ? 'сервер остановлен' : phones === 0 ? 'нет' : phones === 1 ? clients[0].name : `${phones} шт.`;
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="brand" data-tauri-drag-region>
        <img src="/logo.svg" alt="" width="18" height="18" />
        <span>Free Touch</span>
      </div>
      <div className="status" data-tauri-drag-region>
        <span className="st" title={server.error ?? `Сервер для телефонов, порт ${server.port}`}>
          <i className={`led ${server.running && phones ? 'on' : ''}`} />Телефон <b className={phones ? 'mono' : ''}>{phoneText}</b>
        </span>
        <button className="st" title={obs.error ?? 'Настройки OBS'} onClick={onSettings}>
          <i className={`led ${obs.connected ? 'on' : ''}`} />OBS <b>{obsText}</b>
        </button>
        <span className="st" title={dirty ? 'Изменения сохраняются…' : 'Все изменения сохранены и отправлены на телефоны'}>
          <i className={`led ${dirty ? 'pending' : ''}`} /><b>{dirty ? 'Не сохранено' : 'Сохранено'}</b>
        </span>
      </div>
      <div className="tb-right">
        {updateVersion && (
          <button className="st upd" onClick={onUpdate} title="Посмотреть, что нового">
            <i className="led on" />Обновление <b className="mono">{updateVersion}</b>
          </button>
        )}
        <button className="icon-btn" disabled={!canUndo} onClick={undo} title="Отменить (Ctrl+Z)"><Ph name="arrow-counter-clockwise" size={16} /></button>
        <button className="icon-btn" disabled={!canRedo} onClick={redo} title="Вернуть (Ctrl+Y)"><Ph name="arrow-clockwise" size={16} /></button>
        <button className="btn primary" onClick={onPair}><Ph name="device-mobile" size={15} /> Подключить телефон</button>
        <button className="icon-btn" onClick={onSettings} title="Настройки"><Ph name="gear" size={17} /></button>
        <div className="winctl">
          <button onClick={() => win().then((w) => w.minimize())} title="Свернуть"><Ph name="minus" size={15} /></button>
          <button onClick={() => win().then((w) => w.toggleMaximize())} title="Развернуть"><Ph name="square" size={12} /></button>
          <button className="close" onClick={() => win().then((w) => w.close())} title="Закрыть в трей"><Ph name="x" size={16} /></button>
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
        <button className="icon-btn" onClick={addPage} title="Новая страница"><Ph name="plus" size={16} /></button>
      </div>
      <div className="pages">
        {profile.pages.map((p, i) => (
          <div key={p.id} className={`page-item ${p.id === pageId ? 'on' : ''}`} onClick={() => setPageId(p.id)}>
            <span className="page-name">
              {p.name || 'Без названия'}
              {profile.home === p.id && <span title="Главная — открывается первой"><Ph name="house" size={13} /></span>}
            </span>
            <span className="page-meta mono">{p.cols}×{p.rows}  {p.buttons.length} кл.</span>
            <span className="page-tools" onClick={(e) => e.stopPropagation()}>
              <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Выше"><Ph name="arrow-up" size={13} /></button>
              <button className="icon-btn" disabled={i === profile.pages.length - 1} onClick={() => move(i, 1)} title="Ниже"><Ph name="arrow-down" size={13} /></button>
              <button className="icon-btn" onClick={() => dup(i)} title="Копия"><Ph name="copy" size={13} /></button>
              <button className="icon-btn danger" disabled={profile.pages.length === 1} onClick={() => del(i)} title="Удалить"><Ph name="trash" size={13} /></button>
            </span>
          </div>
        ))}
      </div>
      <div className="side-head"><h4>Устройства</h4></div>
      <div className="devices">
        {clients.length === 0 && <div className="side-empty">Телефоны не подключены</div>}
        {clients.map((c) => (
          <div key={c.id} className="device-item"><i className="led on" /><span>{c.name}</span><small className="mono">{c.addr}</small></div>
        ))}
      </div>
    </nav>
  );
}
