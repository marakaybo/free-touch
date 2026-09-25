import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { useStore } from '../store';
import { Modal, Select } from './ui';

export function PairModal({ onClose }: { onClose: () => void }) {
  const { settings, ips, server, clients, saveSettings, setSettingsLocal, refreshIps } = useStore();
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);

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
      <div className="pair">
        <div className="pair-qr">
          {qr ? <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} /> : <div className="qr empty">Нет сети</div>}
          {clients.length > 0 && <div className="pair-ok"><Check size={15} /> Подключено: {clients.map((c) => c.name).join(', ')}</div>}
        </div>
        <div className="pair-info">
          <ol className="steps">
            <li><b>Подключите телефон к той же Wi-Fi,</b> что и компьютер.</li>
            <li><b>Наведите камеру на QR-код</b> и откройте ссылку. Пульт откроется в браузере, ничего ставить не нужно.</li>
            <li>В меню браузера выберите <b>«Добавить на главный экран»</b>. Пульт станет отдельным значком и откроется на весь экран.</li>
          </ol>
          <div className="pair-link">
            <code>{url || '—'}</code>
            <button className="icon-btn" disabled={!url} onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }} title="Скопировать">
              {copied ? <Check size={15} /> : <Copy size={15} />}
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
              <li>При первом запуске Windows спрашивает разрешение для сети — разрешите для частных сетей. Если окно закрыли, разрешите Free Touch в «Брандмауэре Защитника Windows».</li>
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
          ><RefreshCw size={13} /> Сбросить код подключения</button>
        </div>
      </div>
    </Modal>
  );
}
