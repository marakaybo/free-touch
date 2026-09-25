import type { CapacitorConfig } from '@capacitor/cli';

// Приложение для Android: тот же пульт, что открывается в браузере, плюс
// сканер QR-кода, полный экран и экран, который не гаснет.
const config: CapacitorConfig = {
  appId: 'io.github.marakaybo.freetouch.remote',
  appName: 'Free Touch',
  webDir: 'dist-panel',
  server: {
    // Пульт ходит на ПК по ws:// в локальной сети — поэтому страница тоже http.
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#0F1115',
  },
};

export default config;
