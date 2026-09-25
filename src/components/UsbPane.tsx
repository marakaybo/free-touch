import { useEffect, useState } from 'react';
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
  // Телефон подключён кабелем как «передача файлов», а adb его не видит — отладка выключена.
  const [plain, setPlain] = useState<string[]>([]);
  const noAdbDevices = !!usb.adb && usb.devices.length === 0;
  useEffect(() => {
    if (!noAdbDevices) { setPlain([]); return; }
    const check = () => api.usbPlainPhones().then(setPlain).catch(() => {});
    check();
    const t = setInterval(check, 4000);
    return () => clearInterval(t);
  }, [noAdbDevices]);

  return (
    <div className="usb">
      <div className="usb-main">
        <ol className="steps">
          <li>
            <b>Включите отладку по USB на телефоне</b> — один раз:
            <ul className="usb-how">
              <li>Samsung: Настройки → Сведения о телефоне → Сведения о ПО → 7 раз нажмите «Номер сборки», затем Настройки → Параметры разработчика → «Отладка по USB».</li>
              <li>Xiaomi, Redmi, POCO: Настройки → О телефоне → 7 раз «Версия MIUI/HyperOS», затем Расширенные настройки → Для разработчиков → «Отладка по USB».</li>
              <li>Другие: Настройки → О телефоне → 7 раз «Номер сборки», затем «Для разработчиков» → «Отладка по USB».</li>
            </ul>
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
            {usb.devices.length === 0 && plain.length === 0 && <div className="side-empty">Телефон по кабелю не найден</div>}
            {usb.devices.length === 0 && plain.map((name) => (
              <div key={name} className="usb-dev">
                <i className="led pending" />
                <span>{name}</span>
                <small>подключён кабелем, но отладка по USB выключена — шаг 1</small>
              </div>
            ))}
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
