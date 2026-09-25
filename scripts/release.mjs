// Новая версия одной командой: npm run release 0.2.0
// Меняет версию во всех файлах, проверяет CHANGELOG.md, делает коммит и тег.
// С флагом --push сразу отправляет на GitHub — там соберётся и выйдет релиз.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
const push = process.argv.includes('--push');
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Укажите версию: npm run release 0.2.0 [-- --push]');
  process.exit(1);
}
const changelog = readFileSync('CHANGELOG.md', 'utf8');
if (!new RegExp(`^## \[?v?${version.replace(/\./g, '\.')}`, 'm').test(changelog)) {
  console.error(`В CHANGELOG.md нет раздела «## ${version}». Опишите, что нового, — это увидят пользователи в окне обновления.`);
  process.exit(1);
}

const edit = (file, fn) => writeFileSync(file, fn(readFileSync(file, 'utf8')));
edit('package.json', (s) => s.replace(/"version": "[^"]+"/, `"version": "${version}"`));
edit('src-tauri/tauri.conf.json', (s) => s.replace(/"version": "[^"]+"/, `"version": "${version}"`));
edit('src-tauri/Cargo.toml', (s) => s.replace(/^version = "[^"]+"/m, `version = "${version}"`));

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
run('cargo update -p free-touch --manifest-path src-tauri/Cargo.toml --offline');
run('git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock CHANGELOG.md');
run(`git commit -m "Версия ${version}"`);
run(`git tag v${version}`);
if (push) {
  run('git push');
  run(`git push origin v${version}`);
  console.log(`Готово. Сборка идёт на GitHub, через ~10 минут программа предложит обновиться.`);
} else {
  console.log(`Коммит и тег v${version} готовы. Отправить: git push && git push origin v${version}`);
}
