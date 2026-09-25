// Рендер логотипа в PNG для иконок (npm run icons).
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync('assets/logo.svg', 'utf8');
for (const size of [1024, 512, 192]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(`assets/icon-${size}.png`, png);
}
console.log('ok');
