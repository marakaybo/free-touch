// Собирает shared/phosphor.ts — таблицу «имя значка → код символа» для шрифтов Phosphor.
// Запуск: node scripts/gen-icons.mjs (нужно только после обновления @phosphor-icons/core).
import { writeFileSync, copyFileSync } from 'node:fs';
import { icons } from '@phosphor-icons/core';

const entries = icons.map((i) => `${JSON.stringify(i.name)}:${i.codepoint}`).join(',');
const tags = icons.map((i) => `${JSON.stringify(i.name)}:${JSON.stringify([...i.tags.filter((t) => t !== '*new*'), ...i.categories].join(' '))}`).join(',');
writeFileSync('shared/phosphor.ts',
  '// Сгенерировано scripts/gen-icons.mjs из @phosphor-icons/core (MIT). Не править руками.\n' +
  `export const PH: Record<string, number> = {${entries}};\n`);
writeFileSync('src/phosphor-tags.ts',
  '// Сгенерировано scripts/gen-icons.mjs — слова для поиска значков в редакторе.\n' +
  `export const PH_TAGS: Record<string, string> = {${tags}};\n`);
for (const [from, to] of [['fill/Phosphor-Fill.woff2', 'Phosphor-Fill.woff2'], ['regular/Phosphor.woff2', 'Phosphor.woff2']]) {
  copyFileSync(`node_modules/@phosphor-icons/web/src/${from}`, `shared/fonts/${to}`);
}
console.log('icons:', icons.length);
