import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const rects = JSON.parse(readFileSync(`${root}src/lib/brandMark.json`, 'utf-8'))

const BRAND = '#8499B1'

const glyph = (translate, scale) =>
  [
    `  <g transform="translate(${translate}, ${translate}) scale(${scale})" fill="white">`,
    ...rects.map((r) => `    <rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${r.rx}"/>`),
    '  </g>',
  ].join('\n')

const svg = (size, body) =>
  [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    ...body,
    '</svg>',
    '',
  ].join('\n')

const splash = (background) =>
  svg(2732, [
    `  <rect width="2732" height="2732" fill="${background}"/>`,
    `  <rect x="1066" y="1066" width="600" height="600" rx="120" fill="${BRAND}"/>`,
    glyph(1141, 18.75),
  ])

const files = {
  'public/favicon.svg': svg(48, [`  <rect width="48" height="48" rx="10" fill="${BRAND}"/>`, glyph(6, 1.5)]),
  'assets/icon-only.svg': svg(1024, [`  <rect width="1024" height="1024" rx="200" fill="${BRAND}"/>`, glyph(128, 32)]),
  'assets/icon-foreground.svg': svg(1024, [glyph(232, 23.33)]),
  'assets/icon-background.svg': svg(1024, [`  <rect width="1024" height="1024" fill="${BRAND}"/>`]),
  'assets/splash.svg': splash('#F3F4F6'),
  'assets/splash-dark.svg': splash('#181818'),
}

for (const [path, content] of Object.entries(files)) {
  writeFileSync(`${root}${path}`, content)
  console.log(`wrote ${path}`)
}
