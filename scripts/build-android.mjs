// Сборка приложения для Android: npm run android [-- --debug]
// Нужны JDK 21 и Android SDK. По умолчанию берутся из ~/.android-tools
// (или из JAVA_HOME / ANDROID_HOME). APK кладётся в dist-android/.
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const debug = process.argv.includes('--debug');
const tools = join(homedir(), '.android-tools');
const env = { ...process.env };
if (!env.JAVA_HOME && existsSync(join(tools, 'jdk21'))) env.JAVA_HOME = join(tools, 'jdk21');
if (!env.ANDROID_HOME && existsSync(join(tools, 'sdk'))) env.ANDROID_HOME = join(tools, 'sdk');
if (!env.JAVA_HOME || !env.ANDROID_HOME) {
  console.error('Не найдены JDK 21 и Android SDK. Укажите JAVA_HOME и ANDROID_HOME.');
  process.exit(1);
}
writeFileSync('android/local.properties', `sdk.dir=${env.ANDROID_HOME.split('\\').join('/')}\n`);

const run = (cmd, cwd = '.') => execSync(cmd, { stdio: 'inherit', env, cwd });
run('npm run build:panel');
run('npx cap sync android');
const gradlew = join(process.cwd(), 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
run(`"${gradlew}" ${debug ? 'assembleDebug' : 'assembleRelease'} --console=plain`, 'android');

const name = debug ? 'Free-Touch-Android-debug.apk' : 'Free-Touch-Android.apk';
const from = join('android/app/build/outputs/apk', debug ? 'debug' : 'release', name);
mkdirSync('dist-android', { recursive: true });
copyFileSync(from, join('dist-android', name));
console.log(`Готово: dist-android/${name}`);
