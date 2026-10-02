#!/usr/bin/env node
/**
 * Sheets "son güncelleme" damgası kontrolü.
 *
 * Ne yapar: dört sheet'in CSV'sini indirir, her birinin A1 hücresindeki
 * "Son güncelleme tarihi: ..." damgasını okur ve data/sheet-stamps.json
 * ile karşılaştırır. Dördü de aynıysa saatlik koşunun tamamı
 * atlanabilir (build + deploy).
 *
 * Kullanım:
 *   node scripts/sheet-stamps.mjs            -> insana okunur rapor
 *   node scripts/sheet-stamps.mjs --check    -> GitHub Actions icin
 *                                                "skip=true|false" yazar
 *
 * KURALLAR (güvenlik):
 *   1. YALNIZCA zamanlanmış (schedule) koşuda atlama yapılabilir. Push'ta
 *      kod ya da veri değişmiş olabilir; workflow_dispatch'ta kullanıcı
 *      elle istemiştir. İkisi de daima tam çalışır.
 *   2. Damga okunamazsa / boşsa "değişti" sayılır. Eksik bilgiyle ASLA
 *      atlama yapılmaz — yanlışlıkla "değişiklik yok" demektense boşuna
 *      bir tam koşu çekmek yeğdir.
 *   3. Bu betik HİÇBİR ŞEY YAZMAZ. Damga dosyasını build-data.mjs yazar
 *      (CSV'leri zaten o indiriyor, ayrı indirme gerekmesin diye).
 *   4. Karşılaştırma HAM METİNLE yapılır; tarih ayrıştırılmaz. Böylece
 *      saat dilimi / yerel ayar / 12-24 saat biçimi tuzakları oluşmaz.
 *
 * Çıkış kodu her zaman 0'dır: bu bir karar aracıdır, hata aracı değil.
 * İndirme başarısız olursa da skip=false yazar (yani güvenli yönde).
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES_FILE = path.join(ROOT, 'scripts', 'sources.json');
const STAMPS_FILE = path.join(ROOT, 'data', 'sheet-stamps.json');
const TIMEOUT_MS = 30000;
const CHECK_MODE = process.argv.includes('--check');

const log = (m) => console.log(m);
const SOURCES = JSON.parse(await readFile(SOURCES_FILE, 'utf8'));

/** Yayınlanmış "pubhtml" adresini CSV ucuna cevirir (build-data ile aynı). */
function csvUrl(url) {
  let out = url.replace(/\/pubhtml(\?|$)/, '/pub$1');
  if (!/[?&]output=csv/.test(out)) out += (out.includes('?') ? '&' : '?') + 'output=csv';
  return out;
}

async function fetchFirstLine(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'accept': 'text/csv,text/plain,*/*', 'user-agent': 'versucher-archive-stamp-check/1.0' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    const body = await response.text();
    return body.replace(/^\uFEFF/, '').split(/\r?\n/)[0] || '';
  } finally {
    clearTimeout(timer);
  }
}

/** A1 hücresindeki damga metni.
 *  CSV'de tablo 36 sütuna kadar boş hücrelerle doldurulduğu için ilk satır
 *  "Son güncelleme tarihi: ...,,,,,,," biçiminde gelir. Virgülden ÖNCEKİ
 *  kısım alınır: aksi halde sütun sayısı değiştiğinde damga da değişmiş
 *  görünür ve saatte bir boşuna tam koşu çekilirdi. Etiket ("Son güncelleme
 *  tarihi: ...") virgül içermediği için bu güvenli. */
function stampFromCsv(csvText) {
  const first = (csvText.split(/\r?\n/)[0] || '').replace(/^﻿/, '');
  const value = first.split(',')[0].replace(/^"|"$/g, '').trim();
  return value;
}

async function readStamps() {
  if (!existsSync(STAMPS_FILE)) return null;
  try {
    const parsed = JSON.parse(await readFile(STAMPS_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed.stamps || parsed : null;
  } catch (error) {
    log(`   (damga dosyası okunamadı: ${error.message})`);
    return null;
  }
}

const current = {};
const problems = [];

log('· Sheet damgaları okunuyor…');
for (const [type, source] of Object.entries(SOURCES)) {
  try {
    const text = await fetchFirstLine(csvUrl(source.url));
    const stamp = stampFromCsv(text);
    if (!stamp) {
      problems.push(`${type}: A1 boş geldi`);
      log(`  ${type.padEnd(10)} A1 BOŞ  — değişmiş sayılıyor`);
      continue;
    }
    current[type] = stamp;
    log(`  ${type.padEnd(10)} ${stamp}`);
  } catch (error) {
    problems.push(`${type}: ${error.message}`);
    log(`  ${type.padEnd(10)} OKUNAMADI (${error.message}) — değişmiş sayılıyor`);
  }
}

const types = Object.keys(SOURCES);
const allRead = problems.length === 0 && types.every((t) => current[t]);
const previous = await readStamps();

log('');
if (!allRead) {
  log('Sonuç: damgaların hepsi okunamadı → ATLAMA YAPILMAZ (skip=false).');
  for (const p of problems) log(`  · ${p}`);
} else if (!previous) {
  log('Sonuç: damga dosyası yok (ilk koşu) → ATLAMA YAPILMAZ (skip=false).');
} else {
  const changedOnes = types.filter((t) => (previous[t] || '') !== current[t]);
  const unknown = types.filter((t) => !(t in previous));
  if (unknown.length) {
    log(`Sonuç: damga dosyasında eksik tür(ler) → ${unknown.join(', ')} → ATLAMA YAPILMAZ.`);
  } else if (!changedOnes.length) {
    log('Sonuç: dört damga da aynı → üretim ve yayın ATLANIR.');
    for (const t of types) log(`  · ${t.padEnd(10)} ${current[t]}`);
  } else {
    log(`Sonuç: değişen damga → ${changedOnes.join(', ')} → üretim yapılır.`);
    for (const t of changedOnes) log(`  · ${t.padEnd(10)} "${previous[t] || '(yok)'}"  ->  "${current[t]}"`);
  }
}

/* Karar: yalnızca zamanlanmış koşuda ve dört damga da birebir aynıysa atla. */
const onlyScheduled = process.env.GITHUB_EVENT_NAME === 'schedule';
const identical = allRead && previous && types.every((t) => (previous[t] || '') === current[t] && (t in previous));
const skip = Boolean(onlyScheduled && identical);

if (CHECK_MODE) {
  const decision = skip ? 'skip=true' : 'skip=false';
  /* GitHub Actions $GITHUB_OUTPUT'a yazar; yoksa stdout'a basar (yerel). */
  if (process.env.GITHUB_OUTPUT) {
    await writeFile(process.env.GITHUB_OUTPUT, decision + '\n', 'utf8');
  } else {
    log(decision);
  }
}

if (!onlyScheduled) {
  log(`Not: bu koşu "${process.env.GITHUB_EVENT_NAME || 'yerel'}" — yalnızca zamanlanmış koşuda atlama yapılır.`);
}
