import { useState } from 'react';
import { Ph } from '../../shared/render';
import { api, openUrl } from '../api';
import { useStore } from '../store';
import { REPO_URL } from './SettingsModal';
import { Toggle } from './ui';

const STATE_TEXT: Record<string, string> = {
  device: 'подключён',
  unauthorized: 'нажмите «Разрешить» на телефоне',
  offline: 'нет связи — переподключите кабель',
  'no permissions': 'нет прав на устройство',
};

/** Подключение по USB-кабелю: adb пробрасывает порт, телефон видит ПК как 127.0.0.1. */
export function UsbPane() {
  const { usb, settings, saveSettings, clients } = useStore();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const usbClients = clients.filter((c) => c.addr === 'USB');

  return (
    <div className="usb">
      <div className="usb-main">
        <ol className="steps">
          <li>
            <b>Включите отладку по USB на телефоне:</b> Настройки → О телефоне → 7 раз нажмите «Номер сборки»,
            затем Настройки → Для разработчиков → «Отладка по USB». Это делается один раз.
          </li>
          <li><b>Подключите телефон кабелем</b> и нажмите «Разрешить» в окне на телефоне.</li>
          <li>
            <b>Откройте приложение Free Touch</b> — оно подключится по кабелю само, QR-код не нужен.
            В браузере телефона можно открыть <span className="mono">http://localhost:{settings.port}</span>.
          </li>
        </ol>
        <p className="pair-apk">
          По кабелю задержка около 1–3 мс и не нужен Wi-Fi. Работает на Android.{' '}
          <button className="link" onClick={() => openUrl(`${REPO_URL}/releases/latest`)}>Скачать приложение</button>
        </p>
      </div>

      <div className="usb-side">
        <Toggle
          checked={settings.usbEnabled !== false}
          onChange={(usbEnabled) => saveSettings({ ...settings, usbEnabled })}
          label="Подключение по USB"
        />
        {settings.usbEnabled !== false && !usb.adb && (
          <div className="usb-box">
            <span>Нужна утилита adb от Google (около 7 МБ). Программа скачает её сама.</span>
            <button
              className="btn primary"
              disabled={busy || usb.installing}
              onClick={async () => {
                setBusy(true);
                setErr('');
                try { await api.usbInstallAdb(); } catch (e) { setErr(String(e)); }
                setBusy(false);
              }}
            >
              <Ph name="download-simple" size={14} /> {busy || usb.installing ? 'Скачиваю…' : 'Скачать adb'}
            </button>
            {err && <span className="fld-hint">{err}</span>}
          </div>
        )}
        {settings.usbEnabled !== false && usb.adb && (
          <div className="usb-list">
            {usb.devices.length === 0 && <div className="side-empty">Телефон по кабелю не найден</div>}
            {usb.devices.map((d) => (
              <div key={d.serial} className="usb-dev">
                <i className={`led ${d.ready ? 'on' : d.state === 'unauthorized' ? 'pending' : ''}`} />
                <span>{d.model || 'Android'}</span>
                <small>{d.ready ? (usbClients.length ? 'пульт открыт' : 'готов — откройте приложение') : STATE_TEXT[d.state] ?? d.state}</small>
              </div>
            ))}
          </div>
        )}
        {usb.error && <span className="fld-hint">{usb.error}</span>}
      </div>
    </div>
  );
}
