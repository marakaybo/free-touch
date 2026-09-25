import { useEffect, useState } from 'react';
import { IconView, Ph } from '../../shared/render';
import type { Profile, Settings } from '../../shared/types';
import { api, autostart, openUrl, pickFile, saveFile } from '../api';
import { useStore } from '../store';
import { Field, Modal, Num, Section, Text, Toggle } from './ui';

export const REPO_URL = 'https://github.com/marakaybo/free-touch';

export function SettingsModal({ onClose, checkUpdates }: {
  onClose: () => void;
  checkUpdates: () => Promise<{ update: unknown; error: string | null }>;
}) {
  const { settings, saveSettings, obs, profile, replaceProfile, version } = useStore();
  const [s, setS] = useState<Settings>(settings);
  const [auto, setAuto] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const dirty = JSON.stringify(s) !== JSON.stringify(settings);

  useEffect(() => { autostart().then(setAuto); }, []);

  const obsSet = (patch: Partial<Settings['obs']>) => setS({ ...s, obs: { ...s.obs, ...patch } });

  const exportProfile = async () => {
    const path = await saveFile(`${profile.name || 'пульт'}.freetouch.json`, [{ name: 'Профиль Free Touch', extensions: ['json'] }]);
    if (!path) return;
    await api.writeText(path, JSON.stringify(profile, null, 2));
    setMsg('Профиль сохранён');
  };
  const importProfile = async () => {
    const path = await pickFile([{ name: 'Профиль Free Touch', extensions: ['json'] }]);
    if (!path) return;
    try {
      const p = JSON.parse(await api.readText(path)) as Profile;
      if (!Array.isArray(p.pages) || !p.pages.length) throw new Error();
      if (!confirm(`Заменить текущий пульт профилем «${p.name ?? 'без названия'}»? Отменить можно через Ctrl+Z.`)) return;
      replaceProfile(p);
      setMsg('Профиль загружен');
    } catch {
      setMsg('Это не профиль Free Touch');
    }
  };

  return (
    <Modal title="Настройки" onClose={onClose}>
      <div className="settings">
        <Section title="OBS Studio">
          <Toggle checked={s.obs.enabled} onChange={(enabled) => obsSet({ enabled })} label="Подключаться к OBS" changed={s.obs.enabled !== settings.obs.enabled} />
          <div className="two">
            <Field label="Адрес" changed={s.obs.host !== settings.obs.host}><Text value={s.obs.host} onChange={(host) => obsSet({ host })} mono /></Field>
            <Field label="Порт" changed={s.obs.port !== settings.obs.port}><Num value={s.obs.port} min={1} max={65535} onChange={(port) => obsSet({ port })} /></Field>
          </div>
          <Field label="Пароль WebSocket" changed={s.obs.password !== settings.obs.password}><input className="inp mono" type="password" value={s.obs.password} onChange={(e) => obsSet({ password: e.target.value })} /></Field>
          <button
            className="btn"
            onClick={async () => {
              const d = await api.obsDetect();
              if (!d) { setMsg('Настройки OBS не найдены. OBS установлен?'); return; }
              obsSet({ host: '127.0.0.1', port: d.port, password: d.password });
              setMsg(d.enabled ? 'Нашёл порт и пароль OBS' : 'Нашёл настройки, но в OBS выключен WebSocket-сервер: Сервис → Настройки WebSocket-сервера');
            }}
          ><Ph name="magnifying-glass" size={14} /> Найти настройки OBS автоматически</button>
          <div className="note">
            <i className={`led ${obs.connected ? 'on' : ''}`} />
            <span>{obs.connected ? <>Подключено, obs-websocket <span className="mono">{obs.version}</span>, сцен: <span className="mono">{obs.scenes.length}</span></> : obs.error ?? 'Не подключено'}</span>
          </div>
        </Section>

        <Section title="Телефоны">
          <Field label="Порт сервера" changed={s.port !== settings.port} hint="Меняйте, только если 7474 занят другой программой."><Num value={s.port} min={1024} max={65535} onChange={(port) => setS({ ...s, port })} /></Field>
        </Section>

        <Section title="Запуск">
          <Toggle checked={auto} onChange={async (v) => setAuto(await autostart(v))} label="Запускать вместе с Windows (в трее)" />
          <Toggle checked={s.startMinimized} onChange={(startMinimized) => setS({ ...s, startMinimized })} label="Открываться свёрнутым в трей" changed={s.startMinimized !== settings.startMinimized} />
          <Toggle checked={s.closeToTray} onChange={(closeToTray) => setS({ ...s, closeToTray })} label="Крестик сворачивает в трей, а не закрывает" changed={s.closeToTray !== settings.closeToTray} />
        </Section>

        <Section title="Профиль">
          <div className="two">
            <button className="btn" onClick={exportProfile}><Ph name="download-simple" size={14} /> Сохранить в файл</button>
            <button className="btn" onClick={importProfile}><Ph name="upload-simple" size={14} /> Загрузить из файла</button>
          </div>
          <span className="fld-hint">Файлом можно поделиться — картинки и значки лежат внутри.</span>
        </Section>

        <Section title="Обновления">
          <Toggle checked={s.autoUpdate !== false} onChange={(autoUpdate) => setS({ ...s, autoUpdate })} label="Проверять обновления при запуске" changed={(s.autoUpdate !== false) !== (settings.autoUpdate !== false)} />
          <button
            className="btn"
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              const r = await checkUpdates();
              setChecking(false);
              if (!r.update) setMsg(r.error ?? `У вас последняя версия — ${version}`);
            }}
          ><Ph name="arrows-clockwise" size={14} className={checking ? 'spin' : ''} /> {checking ? 'Проверяю…' : 'Проверить сейчас'}</button>
        </Section>

        <Section title="О программе">
          <div className="about">
            <img src="/logo.svg" alt="" width="36" height="36" />
            <div>
              <b>Free Touch <span className="mono">{version}</span></b>
              <span>Бесплатный пульт для ПК с открытым кодом. Лицензия MIT.</span>
            </div>
            <button className="btn ghost sm" onClick={() => openUrl(REPO_URL)}><IconView icon={{ kind: 'brand', name: 'github' }} color="currentColor" size="14px" /> GitHub</button>
          </div>
          <button className="btn ghost sm" onClick={() => api.quit()}><Ph name="power" size={14} /> Полностью закрыть программу</button>
        </Section>

        {msg && <div className="note">{msg}</div>}
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Закрыть</button>
        {dirty && <span className="foot-note"><i className="chg" /> Есть несохранённые изменения</span>}
        <button className="btn primary" disabled={!dirty} onClick={async () => { await saveSettings(s); setMsg('Сохранено'); }}>Сохранить</button>
      </div>
    </Modal>
  );
}
