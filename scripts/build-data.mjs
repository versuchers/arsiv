#!/usr/bin/env node
/**
 * Google Sheets CSV -> data/{films,series,books}.json
 *
 * Bu betik GitHub Actions içinde (veya elle) çalışır. Tarayıcıda Sheets'e istek
 * atılmaz; veri burada bir kez indirilip JSON'a çevrilir.
 *
 * Kurallar:
 *   - İndirilen içerik CSV değilse (HTML hata/geri dönüş sayfası) iş KIRILIR.
 *   - Beklenen başlıklar bulunamazsa iş KIRILIR.
 *   - Satır sayısı önceki sürümün yarısının altındaysa iş KIRILIR.
 *   - Hata hâlinde mevcut JSON dosyalarına DOKUNULMAZ.
 *   - Veri gerçekten değişmediyse dosya yeniden yazılmaz (generatedAt korunur).
 *
 * Çıkış kodu: 0 = tamam (değişen dosya olabilir ya da olmayabilir), 1 = hata.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES_FILE = path.join(ROOT, 'scripts', 'sources.json');
const TIMEOUT_MS = 30000;
const MIN_ROWS = 1;
/** Yeni kayıt sayısı, önceki sürümün bu oranının altına düşerse reddedilir. */
const SHRINK_RATIO = 0.5;

/* ------------------------------------------------------------------ *
 * Kaynaklar
 * ------------------------------------------------------------------ */

const SOURCES = JSON.parse(await readFile(SOURCES_FILE, 'utf8'));

/**
 * Alan adı -> başlık adresleri. Eski ve yeni başlıklar birlikte tutulur, böylece
 * sayfa yeniden adlandırıldığında eşleme kırılmaz.
 */
const SCHEMAS = {
  books: {
    title: ['kitap türkçe ismi', 'kitap (türkçe isim)'],
    author: ['yazar'],
    originalTitle: ['kitap orijinal ismi', 'kitap (orijinal isim)'],
    image: ['kapak görseli', 'görsel linki'],
    bookScore: ['kitap puanı', 'kitap puan'],
    seriesScore: ['seri puanı', 'seri puan'],
    seriesName: ['seri adı'],
    mainLabel: ['main label'],
    reason: ['nasıl keşfettim / neden okudum'],
    goodreads: ['goodreads linki'],
    publisher: ['yayınevi'],
    translator: ['çevirmen'],
    character: ['baş karakter'],
    formats: ['okuduğum formatlar', 'okunan tüm formatlar'],
    acquisition: ['ilk erişim / edinim şekli'],
    genre: ['tür'],
    subgenre: ['alt tür'],
    authorOrigin: ['yazar köken'],
    fiction: ['kurgu mu', 'kurgu mu?'],
    owned: ['kitap bende var mı', 'kitap bende var mı?'],
    city: ['ilk okunan şehir'],
    readLanguage: ['okuduğum dil', 'okunduğu dil'],
    writtenLanguage: ['orijinal dili', 'yazıldığı dil'],
    authorScore: ['yazar puanı', 'yazar puan'],
    pages: ['sayfa sayısı'],
    reread: ['tekrar okur muyum', 'tekrar okur muyum?'],
    readCount: ['kaç kez okudum', 'kaç kez okundu'],
    authorBirth: ['yazar doğum tarihi'],
    originalDate: ['orijinal yayın yılı', 'orijinal yayın tarihi'],
    turkishPublishDate: ['türkiye yayın tarihi', 'türkiye yayın. tarihi'],
    firstReadDate: ['ilk okuduğum yıl', 'ilk kez okunan tarihi', 'ilk kez okunduğu tarih'],
    density: ['yoğunluk']
  },
  films: {
    title: ['film'],
    score: ['puan'],
    year: ['yapım yılı'],
    pre: ['ön ek'],
    mainLabel: ['main label'],
    reason: ['nasıl keşfettim / neden izledim'],
    genre: ['tür (letterboxd)', "tür (letterboxd'da yazanlar)", 'tür (letterboxd’da yazanlar)'],
    genreMain: ['tür'],
    platform: ['ilk izlediğim platform', 'ilk kez hangi platformda'],
    director: ['yönetmen'],
    image: ['film afişi linki'],
    originalTitle: ['film orjinal adı', 'film orijinal adı'],
    firstCity: ['ilk izlediğim şehir', 'ilk kez izlenen şehir'],
    watchDate: ['izleme tarihi', 'izlenme tarihi'],
    watchCount: ['kaç kez izledim', 'kaç kez izlendi'],
    seriesOrder: ['seri sıralaması'],
    country: ['yapım ülkesi'],
    directorOrigin: ['yönetmen köken', 'yönetmen nereli'],
    letterboxd: ['letterboxd linki'],
    tmdb: ['tmdb linki'],
    tmdbId: ['tmdb id'],
    adaptation: ['uyarlama kaynağı'],
    downloaded: ['afişi indirdim mi']
  },
  series: {
    title: ['dizi'],
    score: ['puan'],
    year: ['yapım yılı'],
    watchDate: ['başladığım tarih', 'izlenme tarihi'],
    mainLabel: ['main label'],
    reason: ['nasıl keşfettim / neden izledim'],
    genre: ['tür'],
    platform: ['ilk izlediğim platform', 'ilk kez hangi platformda'],
    image: ['afiş linki'],
    category: ['medium', 'kategori'],
    done: ['bitirdim mi', 'bitirildi mi?'],
    completionCount: ['kaç kez bitirdim', 'kaç kez bitirildi'],
    watched: ['ne kadarını izledim', 'ne kadarı izlendi'],
    country: ['yapım ülkesi'],
    status: ['durumu'],
    originalTitle: ['orijinal adı'],
    creator: ['creator / showrunner'],
    network: ['network'],
    language: ['dili'],
    format: ['format'],
    density: ['yoğunluk seviyesi'],
    adaptation: ['uyarlama kaynağı'],
    imdb: ['imdb'],
    tvmaze: ['tvmaze linki']
  }
};

const ROUTE_PREFIX = { books: 'kitap', films: 'film', series: 'dizi' };

/* ------------------------------------------------------------------ *
 * Yardımcılar (sitenin JS'iyle aynı davranış)
 * ------------------------------------------------------------------ */

const clean = (s) => String(s ?? '').replace(/\r/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
const missing = (s) => { const v = clean(s); return !v || /^[-–—]+$/.test(v); };

function numberValue(value) {
  const m = clean(value).match(/[+-]?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : null;
}
function yearValue(value) {
  const m = clean(value).match(/(?:18|19|20|21)\d{2}/);
  return m ? Number(m[0]) : null;
}
function splitList(value) {
  return clean(value).split(/\s*(?:\/\/|,|;)\s*/).map(clean).filter((v) => !missing(v));
}
function safeUrl(value) {
  const v = clean(value);
  if (/^https?:\/\//i.test(v)) return v;
  if (/^\/\//.test(v)) return 'https:' + v;
  if (/^(?:www\.|themoviedb\.org\/)/i.test(v)) return 'https://' + v;
  if (/^(?:\.{0,2}\/)/.test(v)) return v;
  return '';
}
function headerKey(value) {
  let s = clean(value).toLocaleLowerCase('tr-TR');
  const map = { 'ğ': 'g', 'ı': 'i', 'ş': 's', 'ö': 'o', 'ç': 'c', 'ü': 'u' };
  return s.replace(/[ğışöçü]/g, (c) => map[c]).replace(/[^a-z0-9]/g, '');
}
function slugPart(value) {
  let s = clean(value).toLocaleLowerCase('tr-TR');
  const map = {
    'ğ': 'g', 'Ğ': 'g', 'ı': 'i', 'İ': 'i', 'ö': 'o', 'Ö': 'o', 'ç': 'c', 'Ç': 'c',
    'ş': 's', 'Ş': 's', 'ü': 'u', 'Ü': 'u', 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss',
    'ð': 'd', 'þ': 'th', 'ł': 'l', 'đ': 'd', '³': '3', '²': '2'
  };
  s = s.replace(/[ğĞıİöÖçÇşŞüÜøæœßðþłđ³²]/g, (c) => map[c]).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return s.replace(/[’'`´]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function filmName(item) {
  const pre = clean(item.pre), title = clean(item.title);
  if (pre && !title.toLocaleLowerCase('tr-TR').startsWith((pre + ' ').toLocaleLowerCase('tr-TR'))) return pre + ' ' + title;
  return title || pre;
}
const displayName = (item) => (item.sec === 'films' ? filmName(item) : clean(item.title));

/* ------------------------------------------------------------------ *
 * CSV ayrıştırma ve başlık eşleme
 * ------------------------------------------------------------------ */

/** RFC 4180; tırnak içindeki satır sonlarını korur, BOM'u atar. */
function parseCSV(text) {
  const source = String(text ?? '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"') { if (source[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Sheets çıktısının başında "Son güncellenme tarihi" gibi satırlar olabilir. */
function findHeaderRow(rows, schema) {
  const aliases = Object.values(schema).flat();
  const titleKey = headerKey(schema.title[0]);
  let best = -1, bestScore = -1;
  rows.slice(0, 12).forEach((row, index) => {
    const keys = row.map(headerKey);
    if (!keys.includes(titleKey)) return;
    let score = 0;
    aliases.forEach((alias) => { if (keys.includes(headerKey(alias))) score++; });
    if (score > bestScore) { bestScore = score; best = index; }
  });
  return bestScore >= 2 ? best : -1;
}

function columnMap(headers, schema) {
  const keys = headers.map(headerKey);
  const map = {};
  for (const [field, aliases] of Object.entries(schema)) {
    const aliasKeys = aliases.map(headerKey);
    let index = keys.findIndex((key) => aliasKeys.includes(key));
    if (index < 0) {
      index = keys.findIndex((key) =>
        aliasKeys.some((alias) => alias.length >= 3 && key.length >= 3 && (key.includes(alias) || alias.includes(key))));
    }
    if (index >= 0) map[field] = index;
  }
  return map;
}

function stableSuffix(item) {
  const source = [item.author, item.title, item.pre, item.year, item.rawImage, item.goodreads, item.letterboxd, item.tmdb].join('|');
  let hash = 0;
  for (const c of source) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) | 0;
  return (hash >>> 0).toString(36);
}

function assignRoutes(type, items) {
  const used = new Set();
  items.forEach((item, index) => {
    let base;
    if (type === 'books') base = [item.author, item.title].filter(Boolean).map(slugPart).filter(Boolean).join('-');
    else if (type === 'films') base = [item.pre, item.title, item.yearNumber || item.year].filter(Boolean).map(slugPart).filter(Boolean).join('-');
    else base = [item.title, item.yearNumber || item.year].filter(Boolean).map(slugPart).filter(Boolean).join('-');
    const slug = base || `${ROUTE_PREFIX[type]}-${index + 1}`;
    let candidate = slug;
    if (used.has(candidate)) {
      candidate = `${slug}-${stableSuffix(item)}`;
      let n = 2;
      while (used.has(candidate)) candidate = `${slug}-${stableSuffix(item)}-${n++}`;
    }
    used.add(candidate);
    item.slug = candidate;
    item.route = `/${ROUTE_PREFIX[type]}/${candidate}`;
    item.id = `${type}:${candidate}`;
  });
}

/** Yalnızca derleme zamanında gereken, sitede okunmayan alanlar. */
const OMIT = new Set(['rawImage', 'scoreRaw']);

/** Boş string / null / undefined alanları atar; JSON'ı küçük tutar. */
function compact(object) {
  const out = {};
  for (const [key, value] of Object.entries(object)) {
    if (OMIT.has(key)) continue;
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && !value) continue;
    if (Array.isArray(value) && !value.length) continue;
    out[key] = value;
  }
  return out;
}

/** Veri değişti mi diye karşılaştırma imzası (dosyada verinin kopyası tutulmaz). */
const fingerprint = (items) => createHash('sha256').update(JSON.stringify(items)).digest('hex');

function makeItems(type, headers, rows) {
  const schema = SCHEMAS[type];
  const columns = columnMap(headers, schema);
  const items = [];
  for (const row of rows) {
    const get = (field) => (columns[field] == null ? '' : clean(row[columns[field]]));
    const title = get('title');
    if (missing(title)) continue;
    const yearRaw = type === 'books' ? get('originalDate') : get('year');
    const item = {
      sec: type,
      rowIndex: items.length,
      title,
      year: yearRaw,
      yearNumber: yearValue(yearRaw),
      scoreRaw: type === 'books' ? get('bookScore') : get('score'),
      score: type === 'books' ? numberValue(get('bookScore')) : numberValue(get('score')),
      image: safeUrl(get('image')),
      rawImage: get('image'),
      genres: splitList(get('genre')),
      subgenres: splitList(get('subgenre'))
    };
    if (type === 'books') {
      Object.assign(item, {
        firstReadDate: get('firstReadDate'),
        seriesScoreRaw: get('seriesScore'),
        seriesScore: numberValue(get('seriesScore')),
        seriesName: get('seriesName'),
        author: get('author'),
        originalTitle: get('originalTitle'),
        mainLabel: get('mainLabel'),
        reason: get('reason'),
        goodreads: get('goodreads'),
        publisher: get('publisher'),
        translator: get('translator'),
        character: get('character'),
        formats: get('formats'),
        acquisition: get('acquisition'),
        authorOrigin: get('authorOrigin'),
        fiction: get('fiction'),
        owned: get('owned'),
        city: get('city'),
        readLanguage: get('readLanguage'),
        writtenLanguage: get('writtenLanguage'),
        authorScoreRaw: get('authorScore'),
        authorScore: numberValue(get('authorScore')),
        pages: get('pages'),
        reread: get('reread'),
        readCountRaw: get('readCount'),
        readCount: numberValue(get('readCount')),
        authorBirth: get('authorBirth'),
        turkishPublishDate: get('turkishPublishDate'),
        density: get('density')
      });
    } else if (type === 'films') {
      Object.assign(item, {
        watchCountRaw: get('watchCount'),
        watchCount: numberValue(get('watchCount')),
        pre: get('pre'),
        mainLabel: get('mainLabel'),
        reason: get('reason'),
        platform: get('platform'),
        directorRaw: get('director'),
        directors: splitList(get('director')),
        originalTitle: get('originalTitle'),
        firstCity: get('firstCity'),
        watchDate: get('watchDate'),
        seriesOrder: get('seriesOrder'),
        countryRaw: get('country'),
        countries: splitList(get('country')),
        directorOrigin: get('directorOrigin'),
        letterboxd: get('letterboxd'),
        tmdb: get('tmdb'),
        tmdbId: get('tmdbId'),
        adaptation: get('adaptation'),
        downloaded: get('downloaded')
      });
    } else {
      const doneValue = clean(get('done'));
      const statusValue = clean(get('status'));
      const watchedValue = clean(get('watched'));
      const ongoing = /sürüyor|devam|izleniyor/i.test(statusValue) || /sürüyor|devam|izleniyor/i.test(doneValue);
      const done = /evet|yes|true/i.test(doneValue);
      const unwatched = /hiç|yok|izlenmedi/i.test(watchedValue);
      Object.assign(item, {
        watchDate: get('watchDate'),
        mainLabel: get('mainLabel'),
        reason: get('reason'),
        platform: get('platform'),
        category: get('category'),
        doneRaw: get('done'),
        done,
        ongoing,
        unwatched,
        partial: !!doneValue && !!watchedValue && !done && !ongoing && !unwatched,
        completionCountRaw: get('completionCount'),
        completionCount: numberValue(get('completionCount')),
        watched: get('watched'),
        countryRaw: get('country'),
        countries: splitList(get('country')),
        statusRaw: get('status'),
        originalTitle: get('originalTitle'),
        creator: get('creator'),
        network: get('network'),
        language: get('language'),
        format: get('format'),
        density: get('density'),
        adaptation: get('adaptation'),
        imdb: get('imdb'),
        tvmaze: get('tvmaze')
      });
    }
    items.push(item);
  }
  assignRoutes(type, items);
  return { items: items.map(compact), columns };
}

/* ------------------------------------------------------------------ *
 * İndirme ve doğrulama
 * ------------------------------------------------------------------ */

/** Yayınlanmış sayfanın HTML sürümü CSV uç noktasına çevrilir. */
function csvUrl(url) {
  if (/\/pubhtml(\?|$)/i.test(url)) {
    const fixed = url.replace(/\/pubhtml(\?|$)/i, '/pub$1');
    const withOutput = /[?&]output=csv/i.test(fixed) ? fixed : fixed + (fixed.includes('?') ? '&' : '?') + 'output=csv';
    console.log(`   · HTML sürümü CSV ucuna çevrildi: ${withOutput}`);
    return withOutput;
  }
  return url;
}

async function download(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'accept': 'text/csv,text/plain,*/*', 'user-agent': 'versucher-archive-data-build/1.0' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    const body = await response.text();
    return { body, contentType: response.headers.get('content-type') || '' };
  } finally {
    clearTimeout(timer);
  }
}

/** İndirilen şey gerçekten CSV mi? */
function assertCsv(type, body, contentType) {
  const head = body.slice(0, 400).trimStart();
  if (/^<(!doctype|html|\?xml)/i.test(head) || /^\{\s*"/.test(head)) {
    throw new Error(`${type}: indirilen içerik CSV değil (HTML/JSON yanıt). content-type="${contentType}"`);
  }
  if (/text\/html/i.test(contentType)) {
    throw new Error(`${type}: content-type text/html — CSV değil`);
  }
  if (body.replace(/^\uFEFF/, '').trim().length < 32) {
    throw new Error(`${type}: indirilen içerik boş`);
  }
}

async function readPrevious(file) {
  const full = path.join(ROOT, file);
  if (!existsSync(full)) return null;
  try {
    return JSON.parse(await readFile(full, 'utf8'));
  } catch (error) {
    console.log(`   ! ${file} okunamadı (${error.message}); sıfır kabul edilecek`);
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Ana akış
 * ------------------------------------------------------------------ */

const log = (message) => console.log(message);
const failures = [];
const changed = [];
const unchanged = [];

log('· Kaynaklar indiriliyor…');

for (const [type, source] of Object.entries(SOURCES)) {
  try {
    log(`\n[${type}] ${source.file}`);
    const url = csvUrl(source.url);
    const { body, contentType } = await download(url);
    assertCsv(type, body, contentType);

    const rows = parseCSV(body);
    const headerIndex = findHeaderRow(rows, SCHEMAS[type]);
    if (headerIndex < 0) {
      throw new Error(`${type}: başlık satırı bulunamadı (ilk 12 satır tarandı)`);
    }
    const headers = rows[headerIndex];
    const columns = columnMap(headers, SCHEMAS[type]);

    const missingRequired = (source.required || []).filter((field) => columns[field] == null);
    if (missingRequired.length) {
      throw new Error(`${type}: beklenen başlıklar eksik -> ${missingRequired.join(', ')} (bulunan: ${Object.keys(columns).join(', ')})`);
    }

    const { items } = makeItems(type, headers, rows.slice(headerIndex + 1));
    if (items.length < MIN_ROWS) {
      throw new Error(`${type}: kayıt yok (${items.length})`);
    }

    const previous = await readPrevious(source.file);
    const previousCount = previous && Array.isArray(previous.items) ? previous.items.length : null;
    if (previousCount && items.length < previousCount * SHRINK_RATIO) {
      throw new Error(
        `${type}: kayıt sayısı ${items.length}, önceki sürümün yarısının (${Math.floor(previousCount * SHRINK_RATIO)}) altında — eski JSON korunuyor`
      );
    }

    const print = fingerprint(items);
    if (previous && previous.fingerprint === print) {
      unchanged.push({ type, count: items.length, generatedAt: previous.generatedAt });
      log(`   = değişiklik yok (${items.length} kayıt, üretim: ${previous.generatedAt})`);
      continue;
    }

    const payload = {
      schema: 1,
      type,
      generatedAt: new Date().toISOString(),
      source: url,
      sourceHeaderRow: headerIndex,
      rowCount: items.length,
      columns: Object.fromEntries(Object.entries(columns).map(([field, index]) => [field, clean(headers[index])])),
      fingerprint: print,
      items
    };

    await writeFile(path.join(ROOT, source.file), JSON.stringify(payload) + '\n', 'utf8');
    changed.push({ type, count: items.length, file: source.file });
    log(`   + güncellendi (${items.length} kayıt, önceki: ${previousCount ?? 'yok'})`);
  } catch (error) {
    failures.push({ type, message: error.message });
    log(`   ✗ HATA: ${error.message}`);
  }
}

log('\n--- Özet ---');
log(`Değişen: ${changed.length ? changed.map((c) => `${c.type}(${c.count})`).join(', ') : 'yok'}`);
log(`Değişmeyen: ${unchanged.length ? unchanged.map((c) => `${c.type}(${c.count})`).join(', ') : 'yok'}`);

if (failures.length) {
  log('\nBAŞARISIZ — mevcut JSON dosyaları değiştirilmedi:');
  for (const failure of failures) log(`  · ${failure.type}: ${failure.message}`);
  process.exit(1);
}

log('\nTamam.');
