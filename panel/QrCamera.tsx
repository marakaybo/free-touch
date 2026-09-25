// Свой сканер QR-кода: камера телефона + jsQR. Работает без сервисов Google.
import { useEffect, useRef, useState } from 'react';
import { Ph } from '../shared/render';

export function QrCamera({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    (async () => {
      try {
        const { default: jsQR } = await import('jsqr');
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const tick = () => {
          if (stopped) return;
          if (v.videoWidth) {
            // Уменьшаем кадр: так распознаётся быстрее, а QR с экрана ПК крупный.
            const k = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
            canvas.width = Math.round(v.videoWidth * k);
            canvas.height = Math.round(v.videoHeight * k);
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (code?.data) {
              stopped = true;
              onResult(code.data);
              return;
            }
          }
          timer = window.setTimeout(tick, 120);
        };
        tick();
      } catch (e) {
        const name = (e as Error)?.name;
        setError(name === 'NotAllowedError'
          ? 'Нет доступа к камере. Разрешите его в настройках Android для Free Touch.'
          : 'Не удалось включить камеру. Вставьте ссылку из программы на ПК вручную.');
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  return (
    <div className="qr-cam">
      <video ref={video} playsInline muted />
      <div className="qr-frame" />
      <div className="qr-cam-bar">
        <span>{error || 'Наведите камеру на QR-код в программе на ПК'}</span>
        <button className="pn-btn" onClick={onClose}><Ph name="x" size={18} /> Отмена</button>
      </div>
    </div>
  );
}
