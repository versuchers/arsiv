#!/usr/bin/env node
/**
 * Depo ici tutarlilik kontrolleri. Yayindan once calisir; bir kontrol basarisiz
 * olursa cikis kodu 1 doner ve workflow yayinlamayi birakir.
 *
 * Bagimlilik yok: sadece Node'un kendi modulleri. Tarayici gerektirmez.
 *
 *   node scripts/check-data.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = ['books', 'films', 'series', 'playlists'];
const PREFIX = { books: 'kitap', films: 'film', series: 'dizi', playlists: 'playlist' };

const problems = [];
const warnings = [];
const fail = (message) => problems.push(message);
const warn = (message) => warnings.push(message);
const log = (message) => console.log(message);

const read = (rel) => {
  const full = join(ROOT, rel);
  if (!existsSync(full)) { fail(`${rel} yok`); return null; }
  return readFileSync(full, 'utf8');
};
const readJson = (rel) => {
  const text = read(rel);
  if (text === null) return null;
  try { return JSON.parse(text); }
  catch (error) { fail(`${rel} gecerli JSON degil: ${error.message}`); return null; }
};

log('== 1. Veri dosyalari ==');
const data = {};
for (const type of TYPES) {
  const payload = readJson(`data/${type}.json`);
  if (!payload) continue;
  if (!Array.isArray(payload.items) || !payload.items.length) { fail(`data/${type}.json bos kayit listesi`); continue; }
  if (!payload.generatedAt) fail(`data/${type}.json generatedAt yok`);
  if (!payload.fingerprint) warn(`data/${type}.json fingerprint yok`);
  data[type] = payload;
  log(`   data/${type}.json  ${String(payload.items.length).padStart(4)} kayit  uretim=${payload.generatedAt}`);
}

log('');
log('== 2. Kayit butunlugu ve adres tutarliligi ==');
let total = 0;
const seenRoute = new Map();
for (const type of TYPES) {
  const items = data[type]?.items;
  if (!items) continue;
  const seenSlug = new Set();
  for (const [index, item] of items.entries()) {
    total++;
    const where = `${type}[${index}] "${item.title ?? ''}"`;
    if (!item.slug) fail(`${where}: slug yok`);
    if (!item.id) fail(`${where}: id yok`);
    if (item.sec !== type) fail(`${where}: sec="${item.sec}" olmali "${type}"`);
    if (typeof item.searchText !== 'string') fail(`${where}: searchText yok (arama bozulur)`);
    if (item.slug) {
      if (seenSlug.has(item.slug)) fail(`${where}: slug "${item.slug}" ayni tip icinde tekrarlaniyor`);
      seenSlug.add(item.slug);
    }
    const expected = `/${PREFIX[type]}/${item.slug}`;
    if (item.route !== expected) fail(`${where}: route="${item.route}" olmali "${expected}"`);
    if (item.route) {
      if (seenRoute.has(item.route)) fail(`${where}: route "${item.route}" baska bir kayitla ayni (${seenRoute.get(item.route)})`);
      else seenRoute.set(item.route, where);
    }
  }
}
log(`   toplam ${total} kayit, ${seenRoute.size} benzersiz adres`);

log('');
log('== 3. Site dosyalari ==');
const indexHtml = read('index.html');
const notFoundHtml = read('404.html');
if (indexHtml !== null && notFoundHtml !== null) {
  if (indexHtml === notFoundHtml) log('   index.html ve 404.html bayt bayt ayni');
  else fail('index.html ve 404.html farkli (workflow 404.html dosyasini index.html\'den uretiyor)');
}
if (existsSync(join(ROOT, 'arsiv-taslak-v6.html'))) {
  fail('arsiv-taslak-v6.html hala depoda; calisma dosyasi kaldirilmis olmali');
} else {
  log('   arsiv-taslak-v6.html kaldirilmis (dogru)');
}

log('');
log('== 4. Yayinlanabilirlik kontrolleri ==');
if (indexHtml !== null) {
  // Detay sayfasi yenileme regresyonu: veri dosyalari goreli yoldan cekilirse
  // /arsiv/film/<slug> yenilendiginde adres /arsiv/film/data/... olur ve 404 doner.
  const relativeFetch = [...indexHtml.matchAll(/fetch\(\s*'([^']*data\/[^']*)'/g)].map((m) => m[1]);
  if (relativeFetch.length) fail('index.html: veri dosyalari goreli yoldan cekiliyor -> ' + relativeFetch.join(', '));
  else log('   veri dosyalari goreli yoldan cekilmiyor (dataUrl/APP_BASE kullaniliyor)');

  // HTML butunlugu: etiketsiz kapanmis template veya yarim kod
  const opens = (indexHtml.match(/<script\b/g) || []).length;
  const closes = (indexHtml.match(/<\/script>/g) || []).length;
  if (opens !== closes) fail(`index.html: <script> ${opens} acilis / ${closes} kapanis`);
  else log(`   ${opens} script blogu dengeli`);

  if (/(?<!-)\bTODO\b|\bFIXME\b/.test(indexHtml)) warn('index.html icinde TODO/FIXME var');
}

// Cakisma isaretleri ve bozuk dosyalar
const scanDirs = ['data', 'scripts', '.github'];
const scanned = [];
for (const rel of ['index.html', '404.html']) if (existsSync(join(ROOT, rel))) scanned.push(rel);
for (const dir of scanDirs) {
  const full = join(ROOT, dir);
  if (!existsSync(full)) continue;
  for (const entry of readdirSync(full)) {
    const child = join(full, entry);
    if (!statSync(child).isFile()) continue;
    if (!/\.(json|mjs|js|yml|yaml|html)$/.test(entry)) continue;
    scanned.push(`${dir}/${entry}`);
  }
}
for (const rel of scanned) {
  const text = read(rel);
  if (text === null) continue;
  if (/^(<<<<<<< |=======$|>>>>>>> )/m.test(text)) fail(`${rel}: cakisma isareti var`);
}
log(`   ${scanned.length} dosya tarandi (cakisma isareti arandi)`);

log('');
log('== 5. Sutun eslestirme raporu (veri mi eksik, kod mu) ==');
const build = join(ROOT, 'scripts', 'build-data.mjs');
if (!existsSync(build)) {
  warn('scripts/build-data.mjs yok; sutun eslestirme raporu atlandi');
} else {
  const source = readFileSync(build, 'utf8');
  const schemaBlock = source.slice(source.indexOf('const SCHEMAS = {'), source.indexOf('const ROUTE_PREFIX'));
  for (const type of TYPES) {
    const at = schemaBlock.indexOf(`${type}: {`);
    if (at < 0) continue;
    const end = schemaBlock.indexOf('\n  },', at);
    const block = schemaBlock.slice(at, end < 0 ? schemaBlock.length : end);
    const fields = [...block.matchAll(/^\s{4}(\w+):\s*\[/gm)].map((m) => m[1]);
    const columns = data[type]?.columns || {};
    const missing = fields.filter((field) => !(field in columns));
    const log2 = fields.filter((field) => columns[field] === '');
    if (missing.length) log2.push(...missing.map((f) => `${f}=yok`));
    if (missing.length) {
      log(`   ${type}: eslesmeyen ${missing.length}/${fields.length} alan -> ${missing.join(', ')}`);
    } else {
      log(`   ${type}: ${fields.length} alanin hepsi eslesti`);
    }
  }
}

log('');
log('== 6. Kritik alan dolulugu ==');
const expect = [
  ['books', 'firstReadSort', 'kitap ilk okunma siralama anahtari'],
  ['books', 'firstReadLabel', 'kitap ilk okunma etiketi'],
  ['books', 'slug', 'adres'],
  ['films', 'slug', 'adres'],
  ['series', 'slug', 'adres'],
  ['playlists', 'slug', 'adres']
];
for (const [type, field, label] of expect) {
  const items = data[type]?.items;
  if (!items) continue;
  const filled = items.filter((item) => item[field] !== undefined && item[field] !== null && String(item[field]).trim() !== '').length;
  if (filled !== items.length) fail(`${type}.${field} (${label}) ${filled}/${items.length} dolu`);
  else log(`   ${type}.${field} (${label}) ${filled}/${items.length}`);
}

log('');
if (warnings.length) {
  log(`-- ${warnings.length} uyari --`);
  for (const message of warnings) log(`   ! ${message}`);
}
log('');
if (problems.length) {
  log(`== BASARISIZ: ${problems.length} sorun ==`);
  for (const message of problems) log(`   x ${message}`);
  process.exit(1);
}
log(`== TAMAM: tum kontroller gecti (${total} kayit) ==`);
