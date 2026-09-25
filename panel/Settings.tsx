// Настройки на телефоне. Открываются и до подключения к ПК — там же обновление приложения.
import { useEffect, useState } from 'react';
import { Ph } from '../shared/render';
import { APP_VERSION, RELEASES_URL, checkApkUpdate, downloadApk, isNative } from './native';
import { applyOrientation, usePrefs, type OrientLock } from './prefs';

export interface ConnInfo {
  pcName: string;
  via: 'USB' | 'Wi-Fi' | '';
  online: boolean;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="st-row"><span>{label}</span><div>{children}</div></div>;
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={`st-switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <i />
    </button>
  );
}

export function Settings({ conn, profileKeepAwake, onClose, onForget, onRename }: {
  conn: ConnInfo | null;
  profileKeepAwake: boolean;
  onClose: () => void;
  onForget?: () => void;
  onRename: (name: string) => void;
}) {
  const [prefs, setPrefs] = usePrefs();
  const [name, setName] = useState(prefs.deviceName);
  const [upd, setUpd] = useState<{ state: 'idle' | 'checking' | 'latest' | 'found' | 'error'; version?: string }>({ state: 'idle' });
  const [fs, setFs] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  // Сразу проверяем, нет ли новой версии приложения.
  useEffect(() => {
    if (!isNative) return;
    setUpd({ state: 'checking' });
    checkApkUpdate().then((v) => setUpd(v ? { state: 'found', version: v } : { state: 'latest' })).catch(() => setUpd({ state: 'error' }));
  }, []);

  const saveName = () => {
    const n = name.trim().slice(0, 40);
    if (!n || n === prefs.deviceName) return;
    setPrefs({ deviceName: n });
    onRename(n);
  };

  const setOrient = (o: OrientLock) => {
    setPrefs({ orientation: o });
    applyOrientation(o);
  };

  return (
    <div className="st-bg">
      <div className="st">
        <div className="st-head">
          <button className="st-back" onClick={onClose} aria-label="Назад"><Ph name="caret-left" size={22} /></button>
          <h2>Настройки</h2>
        </div>

        <div className="st-body">
          {isNative && (
            <section>
              <h3>Приложение</h3>
              <Row label="Версия"><b className="mono">{APP_VERSION}</b></Row>
              {upd.state === 'found' ? (
                <button className="pn-btn primary" onClick={downloadApk}>
                  <Ph name="cloud-arrow-down" size={18} /> Скачать версию {upd.version}
                </button>
              ) : (
                <button
                  className="pn-btn"
                  disabled={upd.state === 'checking'}
                  onClick={() => {
                    setUpd({ state: 'checking' });
                    checkApkUpdate().then((v) => setUpd(v ? { state: 'found', version: v } : { state: 'latest' }));
                  }}
                >
                  {upd.state === 'checking' ? 'Проверяю…' : upd.state === 'latest' ? <><Ph name="check-circle" size={18} /> Последняя версия</> : 'Проверить обновления'}
                </button>
              )}
              {upd.state === 'found' && <small>Файл скачается в браузере — откройте его, и Android предложит обновить приложение. Настройки и подключение сохранятся.</small>}
            </section>
          )}

          <section>
            <h3>Подключение</h3>
            {conn ? (
              <>
                <Row label="Компьютер"><b className="mono">{conn.pcName || '—'}</b></Row>
                <Row label="Связь">
                  <b className="st-conn"><i className={`pn-led ${conn.online ? 'on' : ''}`} /> {conn.online ? (conn.via || 'Wi-Fi') : 'нет связи'}</b>
                </Row>
              </>
            ) : (
              <small>Телефон ещё не подключён к ПК.</small>
            )}
            {onForget && conn && <button className="pn-btn" onClick={onForget}>Подключить другой ПК</button>}
          </section>

          <section>
            <h3>Этот телефон</h3>
            <label className="st-field">
              <span>Имя в программе на ПК</span>
              <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} maxLength={40} />
            </label>
            <Row label="Вибрация при нажатии"><Switch on={prefs.haptics} onChange={(v) => setPrefs({ haptics: v })} /></Row>
            <Row label="Не гасить экран"><Switch on={prefs.keepAwake ?? profileKeepAwake} onChange={(v) => setPrefs({ keepAwake: v })} /></Row>
            <Row label="Сам открывать страницу игры"><Switch on={prefs.autoPages} onChange={(v) => setPrefs({ autoPages: v })} /></Row>
            <div className="st-col">
              <span>Поворот экрана</span>
              <div className="st-seg">
                {([['auto', 'Авто'], ['portrait', 'Вертикально'], ['landscape', 'Горизонтально']] as [OrientLock, string][]).map(([v, l]) => (
                  <button key={v} className={prefs.orientation === v ? 'on' : ''} onClick={() => setOrient(v)}>{l}</button>
                ))}
              </div>
            </div>
            {!isNative && (
              <Row label="Во весь экран">
                <Switch
                  on={fs}
                  onChange={async (v) => {
                    try {
                      if (v) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
                      else await document.exitFullscreen();
                    } catch { /* браузер не разрешил */ }
                  }}
                />
              </Row>
            )}
          </section>

          <section>
            <h3>О программе</h3>
            <button className="pn-btn ghost" onClick={() => window.open(RELEASES_URL.replace('/releases/latest', ''), '_blank')}>
              <Ph name="github-logo" size={18} /> Free Touch на GitHub
            </button>
            <small>Бесплатный пульт для ПК с открытым кодом.</small>
          </section>
        </div>
      </div>
    </div>
  );
}
