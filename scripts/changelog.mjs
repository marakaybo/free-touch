// Печатает раздел CHANGELOG.md для версии: node scripts/changelog.mjs 0.2.0
import { readFileSync } from 'node:fs';

const version = process.argv[2];
const text = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const parts = text.split(/^## /m).slice(1);
const part = parts.find((p) => p.startsWith(version) || p.startsWith(`[${version}]`) || p.startsWith(`v${version}`));
console.log(part ? part.split('\n').slice(1).join('\n').trim() : `Free Touch ${version}`);
