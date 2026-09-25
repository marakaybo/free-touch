import { useEffect, useMemo, useState } from 'react';
import { Ph } from '../../shared/render';
import { api, openUrl } from '../api';
import { REPO_URL } from './SettingsModal';
import { useStore } from '../store';
import { Modal, Seg, Select } from './ui';
import { UsbPane } from './UsbPane';

export function PairModal({ onClose }: { onClose: () => void }) {
  const { settings, ips, server, clients, saveSettings, setSettingsLocal, refreshIps } = useStore();
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [fw, setFw] = useState('');
  const [mode, setMode] = useState<'wifi' | 'usb'>('wifi');

  useEffect(() => { refreshIps(); }, [refreshIps]);

  const ip = useMemo(() => {
    if (settings.preferredIp && ips.some((x) => x.ip === settings.preferredIp)) return settings.preferredIp;
    return ips[0]?.ip ?? '';
  }, [ips, settings.preferredIp]);

  const url = ip ? `http://${ip}:${settings.port}/?t=${settings.token}` : '';

  useEffect(() => {
    if (url) api.pairQr(url).then(setQr);
  }, [url]);

  const cur = ips.find((x) => x.ip === ip);

  return (
    <Modal title="Подключить телефон" onClose={onClose} wide>
      <div className="pair-mode">
        <Seg value={mode} onChange={setMode} options={[{ v: 'wifi', label: 'Wi-Fi' }, { v: 'usb', label: 'USB-кабель' }]} />
      </div>
      {mode === 'usb' ? <UsbPane /> : (
      <div className="pair">
        <div className="pair-qr">
          {qr ? <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} /> : <div className="qr empty">Нет сети</div>}
          {clients.length > 0 && <div className="pair-ok"><Ph name="check" size={15} /> Подключено: {clients.map((c) => c.name).join(', ')}</div>}
        </div>
        <div className="pair-info">
          <ol className="steps">
            <li><b>Подключите телефон к той же Wi-Fi,</b> что и компьютер.</li>
            <li><b>Наведите камеру на QR-код</b> и откройте ссылку. Пульт откроется в браузере, ничего ставить не нужно.</li>
            <li>В меню браузера выберите <b>«Добавить на главный экран»</b>. Пульт станет отдельным значком.</li>
          </ol>
          <p className="pair-apk">
            На Android удобнее приложение: весь экран, экран не гаснет, свой сканер QR.{' '}
            <button className="link" onClick={() => openUrl(`${REPO_URL}/releases/latest`)}>Скачать Free Touch для Android</button>
          </p>
          <div className="pair-link">
            <code>{url || '—'}</code>
            <button className="icon-btn" disabled={!url} onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }} title="Скопировать">
              {copied ? <Ph name="check" size={15} /> : <Ph name="copy" size={15} />}
            </button>
          </div>
          <div className="pair-net">
            <span>Сеть</span>
            <Select
              value={ip}
              onChange={(v) => {
                const s = { ...settings, preferredIp: v };
                setSettingsLocal(s);
                saveSettings(s);
              }}
              options={ips.map((x) => ({ v: x.ip, label: `${x.ip} — ${x.name}${x.lan ? '' : ' (похоже на VPN)'}` }))}
            />
          </div>
          {cur && !cur.lan && <div className="note warn">Выбран адрес VPN или виртуального адаптера. Телефон, скорее всего, его не увидит — выберите домашнюю сеть.</div>}
          {!server.running && <div className="note bad">Сервер не запущен: {server.error}. Смените порт в настройках.</div>}
          <details className="pair-help">
            <summary>Телефон не подключается?</summary>
            <ul>
              <li>
                Чаще всего мешает брандмауэр Windows.{' '}
                <button
                  className="link"
                  onClick={async () => {
                    try { await api.allowFirewall(); setFw('Готово. Обновите страницу на телефоне.'); }
                    catch { setFw('Windows не дала разрешение — нужно нажать «Да» в окне запроса.'); }
                  }}
                >Разрешить Free Touch в брандмауэре</button>
                {fw && <span className="fw-note">{fw}</span>}
              </li>
              <li>Выключите на телефоне VPN и мобильный интернет — иначе он может идти мимо домашней сети.</li>
              <li>Гостевая Wi-Fi часто запрещает устройствам видеть друг друга.</li>
            </ul>
          </details>
          <button
            className="btn ghost sm"
            onClick={async () => {
              if (!confirm('Сбросить код? Все подключённые телефоны отключатся, их нужно будет подключить заново.')) return;
              const s = await api.regenerateToken();
              setSettingsLocal(s);
            }}
          ><Ph name="arrows-clockwise" size={13} /> Сбросить код подключения</button>
        </div>
      </div>
      )}
    </Modal>
  );
}
