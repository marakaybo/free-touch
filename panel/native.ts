// Возможности приложения для Android (Capacitor). В браузере всё это молча не работает,
// а модули плагинов грузятся только внутри приложения.
import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

export const APP_VERSION: string = __APP_VERSION__;
export const RELEASES_URL = 'https://github.com/marakaybo/free-touch/releases/latest';
const APK_URL = 'https://github.com/marakaybo/free-touch/releases/latest/download/Free-Touch-Android.apk';

/**
 * Сканер QR-кода Google из Play Services — быстрый и без разрешения на камеру.
 * Если его нет (телефон без сервисов Google или модуль ещё не скачан),
 * возвращаем needCamera — тогда откроется свой сканер через камеру.
 */
export async function scanQr(): Promise<{ text: string | null; needCamera?: boolean }> {
  try {
    const { BarcodeScanner, BarcodeFormat } = await import('@capacitor-mlkit/barcode-scanning');
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) {
      BarcodeScanner.installGoogleBarcodeScannerModule().catch(() => {}); // пусть скачается на будущее
      return { text: null, needCamera: true };
    }
    const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
    return { text: barcodes[0]?.rawValue ?? null };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/cancel/i.test(msg)) return { text: null };
    return { text: null, needCamera: true };
  }
}

export async function keepAwake(on: boolean) {
  if (!isNative) return;
  const { KeepAwake } = await import('@capacitor-community/keep-awake');
  await (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep()).catch(() => {});
}

/** Лёгкий «щелчок» при нажатии, посильнее — при долгом. */
export async function haptic(kind: 'tap' | 'long' | 'tick') {
  if (!isNative) return;
  const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
  const style = kind === 'long' ? ImpactStyle.Heavy : kind === 'tap' ? ImpactStyle.Light : ImpactStyle.Light;
  Haptics.impact({ style }).catch(() => {});
}

/** Системная кнопка «Назад»: сначала листаем страницы пульта, потом сворачиваем приложение. */
export async function onBackButton(handler: () => boolean) {
  if (!isNative) return () => {};
  const { App } = await import('@capacitor/app');
  const h = await App.addListener('backButton', () => {
    if (!handler()) App.minimizeApp();
  });
  return () => h.remove();
}

function newer(a: string, b: string) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

/** Есть ли на GitHub версия новее установленной. */
export async function checkApkUpdate(): Promise<string | null> {
  if (!isNative) return null;
  try {
    const r = await fetch('https://api.github.com/repos/marakaybo/free-touch/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) return null;
    const j = await r.json();
    const v = String(j.tag_name ?? '').replace(/^v/, '');
    return v && newer(v, APP_VERSION) ? v : null;
  } catch {
    return null;
  }
}

/** Открыть скачивание APK в браузере телефона — Android сам предложит установить. */
export function downloadApk() {
  window.open(APK_URL, '_blank');
}
