import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import type { Update } from '@tauri-apps/plugin-updater';
import { inTauri } from './api';
import { Modal } from './components/ui';

const SKIP_KEY = 'ft.skipVersion';
const EVERY = 6 * 60 * 60 * 1000;

export type CheckResult = { update: Update | null; error: string | null };

/** Проверка обновлений на GitHub: при запуске и раз в 6 часов. */
export function useUpdater(auto: boolean) {
  const [update, setUpdate] = useState<Update | null>(null);
  const busy = useRef(false);

  const check = useCallback(async (manual = false): Promise<CheckResult> => {
    if (!inTauri) return { update: null, error: 'Обновления работают только в установленной программе' };
    if (busy.current) return { update: null, error: null };
    busy.current = true;
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const u = await check({ timeout: 20000 });
      let skipped: string | null = null;
      try { skipped = localStorage.getItem(SKIP_KEY); } catch { /* нет хранилища */ }
      if (u && (manual || u.version !== skipped)) {
        setUpdate(u);
        return { update: u, error: null };
      }
      return { update: null, error: null };
    } catch (e) {
      return { update: null, error: humanError(String(e)) };
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!auto || !inTauri) return;
    const first = setTimeout(() => check(), 5000);
    const every = setInterval(() => check(), EVERY);
    return () => { clearTimeout(first); clearInterval(every); };
  }, [auto, check]);

  const dismiss = useCallback((skip: boolean) => {
    if (skip && update) {
      try { localStorage.setItem(SKIP_KEY, update.version); } catch { /* нет хранилища */ }
    }
    setUpdate(null);
  }, [update]);

  return { update, check, dismiss };
}

function humanError(e: string): string {
  if (/404|Not Found|Could not fetch a valid release JSON/i.test(e)) return 'На GitHub пока нет опубликованных версий';
  if (/timed out|timeout|dns|connect|network|error sending request/i.test(e)) return 'Нет связи с GitHub. Проверьте интернет или VPN.';
  if (/signature/i.test(e)) return 'Подпись обновления не совпала — установка отменена ради безопасности';
  return e;
}

function formatDate(d?: string): string {
  if (!d) return '';
  let t = new Date(d);
  if (Number.isNaN(t.getTime())) t = new Date(d.slice(0, 10));
  return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

/** Описание версии: строки «- …» превращаем в список. */
function Notes({ text }: { text: string }) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <div className="upd-notes">
      {lines.map((l, i) =>
        /^[-*•]\s/.test(l) ? <div key={i} className="upd-li">{l.replace(/^[-*•]\s+/, '').replace(/\*\*/g, '')}</div>
          : /^#+\s/.test(l) ? <h5 key={i}>{l.replace(/^#+\s+/, '')}</h5>
          : <p key={i}>{l.replace(/\*\*/g, '')}</p>,
      )}
    </div>
  );
}

export function UpdateModal({ update, onClose }: { update: Update; onClose: (skip: boolean) => void }) {
  const [stage, setStage] = useState<'idle' | 'download' | 'install' | 'error'>('idle');
  const [got, setGot] = useState(0);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState('');

  const start = async () => {
    setStage('download');
    try {
      await update.downloadAndInstall((ev) => {
        if (ev.event === 'Started') setTotal(ev.data.contentLength ?? 0);
        if (ev.event === 'Progress') setGot((g) => g + ev.data.chunkLength);
        if (ev.event === 'Finished') setStage('install');
      });
      // На Windows установщик сам закрывает программу и запускает её заново.
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e) {
      setErr(humanError(String(e)));
      setStage('error');
    }
  };

  const pct = total ? Math.min(100, Math.round((got / total) * 100)) : 0;
  const date = formatDate(update.date);

  return (
    <Modal title="Доступно обновление" onClose={() => stage === 'idle' || stage === 'error' ? onClose(false) : undefined}>
      <div className="upd">
        <div className="upd-ver">
          <span className="upd-old">{update.currentVersion}</span>
          <span className="upd-arrow">→</span>
          <span className="upd-new">{update.version}</span>
          {date && <span className="upd-date">{date}</span>}
        </div>
        {update.body ? <Notes text={update.body} /> : <p className="fld-hint">Описание не приложено.</p>}
        {stage !== 'idle' && stage !== 'error' && (
          <div className="upd-progress">
            <div className="upd-bar"><span style={{ width: `${stage === 'install' ? 100 : pct}%` }} /></div>
            <span>{stage === 'install' ? 'Устанавливаю, программа перезапустится…' : total ? `Скачиваю… ${pct}%` : 'Скачиваю…'}</span>
          </div>
        )}
        {stage === 'error' && <div className="note bad">{err}</div>}
        <span className="fld-hint">Пульт на телефонах переподключится сам. Кнопки и настройки сохранятся.</span>
      </div>
      <div className="modal-foot">
        {stage === 'idle' || stage === 'error' ? (
          <>
            <button className="btn ghost" onClick={() => onClose(true)}>Пропустить версию</button>
            <button className="btn" onClick={() => onClose(false)}>Позже</button>
            <button className="btn primary" onClick={start}>
              {stage === 'error' ? <><RefreshCw size={14} /> Ещё раз</> : <><Download size={14} /> Обновить</>}
            </button>
          </>
        ) : (
          <button className="btn" disabled>Не закрывайте программу</button>
        )}
      </div>
    </Modal>
  );
}
