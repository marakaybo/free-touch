// Настройки самого телефона: хранятся на телефоне и работают даже без подключения к ПК.
import { useCallback, useEffect, useState } from 'react';
import { isNative } from './native';

export const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* приватный режим */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* приватный режим */ } },
};

export type OrientLock = 'auto' | 'portrait' | 'landscape';

export interface Prefs {
  /** Имя телефона, которое видно в программе на ПК. */
  deviceName: string;
  /** Вибрация при нажатии. */
  haptics: boolean;
  /** Не гасить экран. null — как задано в пульте на ПК. */
  keepAwake: boolean | null;
  /** Поворот экрана. */
  orientation: OrientLock;
}

function defaultName(): string {
  const ua = navigator.userAgent;
  const m = ua.match(/;\s*([^;)]+)\s+Build\//);
  if (m) return m[1];
  return /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : 'Телефон';
}

function load(): Prefs {
  let saved: Partial<Prefs> = {};
  try { saved = JSON.parse(store.get('ft.prefs') ?? '{}'); } catch { /* битая запись */ }
  return {
    deviceName: saved.deviceName || store.get('ft.device') || defaultName(),
    haptics: saved.haptics !== false,
    keepAwake: typeof saved.keepAwake === 'boolean' ? saved.keepAwake : null,
    orientation: saved.orientation === 'portrait' || saved.orientation === 'landscape' ? saved.orientation : 'auto',
  };
}

let current = load();
const listeners = new Set<(p: Prefs) => void>();

export const getPrefs = () => current;

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const [p, setP] = useState(current);
  useEffect(() => {
    listeners.add(setP);
    return () => { listeners.delete(setP); };
  }, []);
  const update = useCallback((patch: Partial<Prefs>) => {
    current = { ...current, ...patch };
    store.set('ft.prefs', JSON.stringify(current));
    listeners.forEach((l) => l(current));
  }, []);
  return [p, update];
}

/** Закрепить поворот экрана. В браузере работает только во весь экран. */
export async function applyOrientation(o: OrientLock) {
  try {
    if (isNative) {
      const { ScreenOrientation } = await import('@capacitor/screen-orientation');
      if (o === 'auto') await ScreenOrientation.unlock();
      else await ScreenOrientation.lock({ orientation: o });
      return;
    }
    const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (o === 'auto') so.unlock?.();
    else await so.lock?.(o);
  } catch { /* не поддерживается */ }
}
