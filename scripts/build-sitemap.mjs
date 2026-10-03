#!/usr/bin/env node
/**
 * sitemap.xml + robots.txt uretir.
 *
 * Neden: depo "arsiv" -> "versuchers.github.io" olarak yeniden adlandirildi
 * ve site KOKTE yayinlaniyor. Google'in tarayacagi net adresleri (sitemap)
 * ve "burayi tarama" kuralini (robots.txt) veren iki dosya depoda yoktu;
 * /favicon.txt ve /sitemap.xml istekleri 404 donuyordu.
 *
 * Kapsam bilincli olarak dar: kok sayfa, dort liste, dort dizin sayfasi ve
 * TUM detay sayfalari (945 kayit). Filtre (/kitap/filtre/...), etiket, tur ve
 * kisi sayfalari eklenmedi: binlerce URL, degerler her veri yenilemede
 * degisiyor ve Google bunlari zaten site haritasi yuzunden buluyor.
 *
 * SITE_ORIGIN ortam degiskeniyle degistirilebilir (varsayilan kok adres).
 * Bagimlilik yok.   node scripts/build-sitemap.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = (process.env.SITE_ORIGIN || 'https://versuchers.github.io').replace(/\/$/, '');
const TYPES = ['books', 'films', 'series', 'playlists'];

const data = {};
let newest = '';
for (const type of TYPES) {
  const payload = JSON.parse(readFileSync(join(ROOT, 'data', `${type}.json`), 'utf8'));
  data[type] = payload.items || [];
  if (payload.generatedAt && (!newest || payload.generatedAt > newest)) newest = payload.generatedAt;
}

const VIEW = { books: '/books', films: '/films', series: '/series', playlists: '/lists' };
const urls = ['/', '/books', '/films', '/series', '/lists', '/favs', '/tur', '/etiket', '/yazarlar', '/yonetenler'];
const counts = {};
for (const type of TYPES) {
  let n = 0;
  for (const item of data[type]) {
    if (!item || !item.route) continue;
    urls.push(item.route);
    n++;
  }
  counts[type] = n;
}

const lastmod = (newest ? new Date(newest) : new Date()).toISOString().slice(0, 10);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const body = urls.map((u) => `  <url><loc>${esc(ORIGIN + u)}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<!-- scripts/build-sitemap.mjs tarafindan uretilir; elle duzenlenmemeli.
     Kapsam: kok sayfa + 4 liste + 4 dizin + ${urls.length - 10} detay sayfasi.
     Filtre/etiket/tur/kisi sayfalari bilincli olarak disarida. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
writeFileSync(join(ROOT, 'sitemap.xml'), sitemap, 'utf8');

const robots = `# scripts/build-sitemap.mjs tarafindan uretilir; elle duzenlenmemeli.
# Tum sayfalar acik; yalnizca veri dosyalari ve arac dosyalar tarama disi.
User-agent: *
Allow: /
Disallow: /data/
Disallow: /scripts/
Disallow: /.github/

Sitemap: ${ORIGIN}/sitemap.xml
`;
writeFileSync(join(ROOT, 'robots.txt'), robots, 'utf8');

console.log(`sitemap.xml  yazildi: ${urls.length} adres (${TYPES.map((t) => `${t}:${counts[t]}`).join(' ')}, lastmod ${lastmod})`);
console.log(`robots.txt   yazildi: ${ORIGIN}/sitemap.xml`);