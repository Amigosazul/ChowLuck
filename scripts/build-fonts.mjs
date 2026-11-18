#!/usr/bin/env node
// Builds self-hosted, subsetted web fonts into public/fonts/ and writes src/client/styles/fonts.css.
// Run with `npm run fonts`. The first run downloads ~30 MB of source fonts into .cache/fonts.
//
// Each Chinese face is split in two by unicode-range, the way Google Fonts does it:
//   *-core   every character that appears in the app's own source (loads right away)
//   *-common the rest of GB2312 level 1 (3755 everyday hanzi), fetched by the browser
//            only when a custom dish or nickname actually uses one of them
import { mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import subsetFont from 'subset-font';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const CACHE = join(ROOT, '.cache', 'fonts');
const OUT = join(ROOT, 'public', 'fonts');
const CSS_OUT = join(ROOT, 'src', 'client', 'styles', 'fonts.css');
const GF = 'https://github.com/google/fonts/raw/main/ofl';

const SOURCES = {
  brush: { file: 'MaShanZheng-Regular.ttf', url: `${GF}/mashanzheng/MaShanZheng-Regular.ttf`, license: `${GF}/mashanzheng/OFL.txt` },
  serif: { file: 'NotoSerifSC-wght.ttf', url: `${GF}/notoserifsc/NotoSerifSC%5Bwght%5D.ttf`, license: `${GF}/notoserifsc/OFL.txt` },
  latin: { file: 'CormorantGaramond-wght.ttf', url: `${GF}/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf`, license: `${GF}/cormorantgaramond/OFL.txt` }
};

async function fetchCached(url, name) {
  const file = join(CACHE, name);
  try {
    if ((await stat(file)).size > 0) return readFile(file);
  } catch { /* not cached yet */ }
  process.stdout.write(`downloading ${name} ... `);
  let buf;
  if (process.platform === 'win32') {
    // Node's fetch ignores the Windows system proxy; PowerShell honours it.
    execFileSync('powershell', ['-NoProfile', '-Command',
      `$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing '${url}' -OutFile '${file}' -TimeoutSec 900`],
      { stdio: 'inherit' });
    buf = await readFile(file);
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    buf = Buffer.from(await res.arrayBuffer());
    await writeFile(file, buf);
  }
  console.log(`${(buf.length / 1048576).toFixed(1)} MB`);
  return buf;
}

async function walk(dir, exts) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p, exts));
    else if (exts.includes(extname(e.name))) out.push(p);
  }
  return out;
}

const isHan = cp => (cp >= 0x3400 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff);

/** Every character used anywhere in the app's source and markup. */
async function sourceChars() {
  const files = [...await walk(join(ROOT, 'src'), ['.ts', '.css']), join(ROOT, 'index.html')];
  const set = new Set();
  for (const f of files) for (const ch of await readFile(f, 'utf8')) set.add(ch.codePointAt(0));
  return set;
}

/** GB2312 level 1: rows 0xB0–0xD7, 94 cells each. */
function gb2312Level1() {
  const dec = new TextDecoder('gbk');
  const set = new Set();
  for (let hi = 0xb0; hi <= 0xd7; hi++) {
    for (let lo = 0xa1; lo <= 0xfe; lo++) {
      const cp = dec.decode(Uint8Array.of(hi, lo)).codePointAt(0);
      if (isHan(cp)) set.add(cp);
    }
  }
  return set;
}

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const ASCII = range(0x20, 0x7e);
const PUNCT = [...'，。、：；！？“”‘’（）《》〈〉【】「」·—…￥¥〇×→←'].map(c => c.codePointAt(0));

function unicodeRange(cps) {
  const sorted = [...cps].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    const hex = n => n.toString(16).toUpperCase();
    parts.push(i === j ? `U+${hex(sorted[i])}` : `U+${hex(sorted[i])}-${hex(sorted[j])}`);
    i = j;
  }
  return parts.join(', ');
}

async function build(name, source, cps, axes) {
  const text = String.fromCodePoint(...cps);
  const woff2 = await subsetFont(source, text, {
    targetFormat: 'woff2',
    ...(axes ? { variationAxes: axes } : {})
  });
  await writeFile(join(OUT, `${name}.woff2`), woff2);
  console.log(`${name}.woff2`.padEnd(22), `${cps.size} chars`.padStart(11), `${(woff2.length / 1024).toFixed(0)} KB`.padStart(9));
  return name;
}

await mkdir(CACHE, { recursive: true });
await mkdir(join(OUT, 'licenses'), { recursive: true });

const src = {};
for (const [key, s] of Object.entries(SOURCES)) {
  src[key] = await fetchCached(s.url, s.file);
  await writeFile(join(OUT, 'licenses', `${key}-OFL.txt`), await fetchCached(s.license, `${key}-OFL.txt`));
}

const used = await sourceChars();
const usedHan = new Set([...used].filter(isHan));
const common = new Set([...gb2312Level1()].filter(cp => !usedHan.has(cp)));
const serifCore = new Set([...usedHan, ...ASCII, ...PUNCT]);
const WGHT = { wght: { min: 400, max: 900, default: 400 } };

console.log('building subsets');
await build('brush-core', src.brush, usedHan);
await build('brush-common', src.brush, common);
await build('serif-core', src.serif, serifCore, WGHT);
await build('serif-common', src.serif, common, WGHT);
await build('latin', src.latin, new Set([...ASCII, 0xa5, 0xb7, 0x2013, 0x2014]), { wght: { min: 500, max: 600, default: 500 } });

const face = (family, file, cps, weight) => `@font-face {
  font-family: '${family}';
  src: url('/fonts/${file}.woff2') format('woff2');
  font-weight: ${weight};
  font-style: normal;
  font-display: swap;
  unicode-range: ${unicodeRange(cps)};
}`;

const css = `/* Generated by scripts/build-fonts.mjs. Do not edit by hand. */
/* Ma Shan Zheng, Noto Serif SC and Cormorant Garamond, SIL Open Font License 1.1 (see public/fonts/licenses). */
${face('ChowLuck Brush', 'brush-core', usedHan, 400)}
${face('ChowLuck Brush', 'brush-common', common, 400)}
${face('ChowLuck Serif', 'serif-core', serifCore, '400 900')}
${face('ChowLuck Serif', 'serif-common', common, '400 900')}
${face('ChowLuck Latin', 'latin', new Set([...ASCII, 0xa5, 0xb7, 0x2013, 0x2014]), '500 600')}
`;
await writeFile(CSS_OUT, css);
console.log(`wrote ${CSS_OUT.replace(ROOT, '')}`);
