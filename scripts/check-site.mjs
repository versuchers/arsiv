#!/usr/bin/env node
/**
 * Rota denemesi: siteyi GitHub Pages gibi sunar (bilinmeyen yol -> 404.html,
 * 404 durum kodu ile) ve secilen rotalari bassiz bir tarayicida acar.
 *
 * Amac, "detay sayfasinda yenileme veri hatasi veriyor" gibi regresyonlari
 * insan gozune degil makineye birakmak. Bu turun buldugu gerileme tam olarak
 * boyle bir seydi: veri dosyalari goreli yoldan cekildigi icin derin bir
 * detay adresi yenilendiginde 404 aliniyordu.
 *
 * Tarayici bulunamazsa ATLAR ve 0 doner (kimse yerelde calistirirken hata
 * gormesin). Bulundugu zaman her rota icin:
 *   - sayfa yuklenmis olmali (probe yazilmamis olmamali)
 *   - JavaScript hatasi olmamali
 *   - "veri yuklenemedi / bulunamadi" uyarisi olmamali
 *   - beklenen baslik ve kart sayisi eslesmeli
 *
 * Bagimlilik yok.   node scripts/check-site.mjs
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = '/arsiv';
const TYPES = ['books', 'films', 'series', 'playlists'];
const log = (message) => console.log(message);

/* ------------------------------------------------------------------ *
 * Tarayici bul
 * ------------------------------------------------------------------ */
/** Edge, surum klasoruyle birlikte gelir ("EdgeCore\154...\msedge.exe"); klasor taranir. */
function edgeInstalls() {
  const found = [];
  for (const base of ['C:\\Program Files (x86)\\Microsoft\\EdgeCore', 'C:\\Program Files\\Microsoft\\EdgeCore']) {
    if (!existsSync(base)) continue;
    try {
      for (const entry of readdirSync(base)) {
        const exe = join(base, entry, 'msedge.exe');
        if (existsSync(exe)) found.push(exe);
      }
    } catch { /* okunamadi, atla */ }
  }
  return found;
}

const CANDIDATES = [
  process.env.CHROME_PATH,
  'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser',
  'microsoft-edge', 'msedge',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ...edgeInstalls()
].filter(Boolean);

function findBrowser() {
  for (const candidate of CANDIDATES) {
    try {
      execFileSync(process.platform === 'win32' ? 'where' : 'which', [candidate], { stdio: 'ignore' });
      return candidate;
    } catch { /* sonraki */ }
    if (candidate.includes('\\') && existsSync(candidate)) return candidate;
  }
  return null;
}

const browser = findBrowser();
if (!browser) {
  log('!! Basli tarayici bulunamadi; rota denemesi ATLANDI (bu bir hata degil).');
  log('   CI icin: CHROME_PATH ortam degiskenini ayarla veya google-chrome kur.');
  process.exit(0);
}
log(`   Tarayici: ${browser}`);

/* ------------------------------------------------------------------ *
 * Rota listesi veriden uretilir
 * ------------------------------------------------------------------ */
const data = {};
for (const type of TYPES) {
  const file = join(ROOT, 'data', `${type}.json`);
  if (!existsSync(file)) { log(`x data/${type}.json yok; once build calistir`); process.exit(1); }
  data[type] = JSON.parse(readFileSync(file, 'utf8'));
}

/** Sitedeki slugPart ile ayni kural (kucuk harf, Turkce indirgeme, tire). */
function slugPart(value) {
  let s = String(value ?? '').toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/i/g, 'i').replace(/ö/g, 'o')
    .replace(/ç/g, 'c').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s;
}
const routePrefix = { books: 'kitap', films: 'film', series: 'dizi', playlists: 'playlist' };
function pick(type, index = 0) { return data[type].items[index]; }

const firstGenre = data.films.items.flatMap((i) => i.genres || [])[0] || 'drama';
const firstLabel = data.books.items.map((i) => i.mainLabel).filter(Boolean)[0];

const ROUTES = [
  { path: '', h1: /Film, dizi, kitap ve playlist/i, minCards: 1 },
  { path: 'films', h1: /^Filmler$/, minCards: 30 },
  { path: 'series', h1: /^Diziler$/, minCards: 30 },
  { path: 'books', h1: /^Kitaplar$/, minCards: 30 },
  { path: 'lists', h1: /^Playlistler$/, minCards: 30 },
  { path: 'concerts', h1: /^Konserler$/, minCards: 0 },
  /* Favoriler sayfasi artik kisitli: 10 yazar + 10 yonetmen + 5/5/5 tur,
     10 tur, 10 etiket, 10 muzik turu = 65 baglanti + 4 "daha fazla" baglantisi. */
  { path: 'favs', h1: /^Favoriler$/, minLinks: 40 },
  { path: 'tur', h1: /^Türler$/, minLinks: 50 },
  { path: 'etiket', h1: /^Main label$/, minLinks: 50 },
  { path: 'yazarlar', h1: /^Yazarlar$/, minLinks: 50 },
  { path: 'yonetenler', h1: /^Yönetmenler$/, minLinks: 50 },
  { path: `tur/${slugPart(firstGenre)}`, h1: /^Tür:/, minCards: 1 },
  { path: `etiket/${slugPart(firstLabel)}`, h1: /^Etiket:/, minCards: 1 },
  { path: pick('films').route.replace(/^\/film\//, 'film/'), h1: null, mustContain: pick('films').title, kind: 'detail' },
  { path: pick('series').route.replace(/^\/dizi\//, 'dizi/'), h1: null, mustContain: pick('series').title, kind: 'detail' },
  { path: pick('books').route.replace(/^\/kitap\//, 'kitap/'), h1: null, mustContain: pick('books').title, kind: 'detail' },
  { path: pick('playlists').route.replace(/^\/playlist\//, 'playlist/'), h1: null, mustContain: pick('playlists').title, kind: 'detail' },
  { path: 'film/boyle-bir-film-yok-12345', expectMissing: true },
  { path: 'ara?q=dune', h1: /^Arama$/, minCards: 1 },
  /* Yazar adiyla arama: "Isaac" tr-TR kucultmesiyle "ısaac" olurdu; foldText
     sayesinde "isaac" yazan kullanici da sonuc alir. */
  { path: 'ara?q=isaac', h1: /^Arama$/, minCards: 1 },
  { path: 'ara?q=buradaboylebirkitapyok', h1: /^Arama$/, minCards: 0, maxCards: 0 }
];

/* ------------------------------------------------------------------ *
 * GitHub Pages benzeri sunucu + probe ekleme
 * ------------------------------------------------------------------ */
const PROBE = `<script>
window.__E=[];
addEventListener('error',function(e){try{window.__E.push('ERR '+(e.message||e.error))}catch(_){}});
addEventListener('unhandledrejection',function(e){try{window.__E.push('REJ '+(e.reason&&e.reason.message||e.reason))}catch(_){}});
(function(){var t0=performance.now();
  var iv=setInterval(function(){
    if(document.getElementById('__probe'))return;
    var m=document.querySelector('main');
    if(!m)return;
    if(m.querySelector('.loading')&&performance.now()-t0<20000)return;
    if(performance.now()-t0>40000){clearInterval(iv)}
    var h1=document.querySelector('h1');
    var d=document.createElement('div');d.id='__probe';d.style.display='none';
    d.textContent=JSON.stringify({
      h1:h1?h1.textContent.trim():'',
      cards:document.querySelectorAll('a.poster').length,
      links:document.querySelectorAll('main a').length,
      detail:!!document.querySelector('.detail-page'),
      missing:/Kayıt bulunamadı/.test(m.innerText),
      dataError:/yüklenemedi|ulaşılamadı|okunamadı|Veri dosyaları/i.test(m.innerText),
      text:m.innerText.replace(/\\s+/g,' ').slice(0,1200),
      errs:window.__E
    });
    document.body.appendChild(d);
  },80);
})();
</script>`;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'
};

const server = createServer((req, res) => {
  let path = decodeURIComponent(req.url.split('?')[0]);
  if (path.startsWith(PREFIX)) path = path.slice(PREFIX.length);
  if (!path.startsWith('/')) path = '/' + path;
  if (path === '/' || path === '') path = '/index.html';
  const file = join(ROOT, path.replace(/^\/+/, ''));
  let body = null;
  let status = 200;
  let name = path;
  if (!existsSync(file) || statSync(file).isDirectory()) {
    name = '/404.html';
    status = 404; // GitHub Pages davranisi
  }
  const full = join(ROOT, name.replace(/^\/+/, ''));
  if (!existsSync(full)) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('yok'); return; }
  let content = readFileSync(full);
  if (extname(full) === '.html') {
    content = Buffer.from(content.toString('utf8').replace('</head>', `${PROBE}</head>`), 'utf8');
  }
  void body;
  res.writeHead(status, { 'content-type': MIME[extname(full)] || 'application/octet-stream' });
  res.end(content);
});

const port = await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});
log(`   Sunucu: http://127.0.0.1:${port}${PREFIX}/  (bilinmeyen yol -> 404.html, 404 kodu)`);

const profile = mkdtempSync(join(tmpdir(), 'check-site-'));
const failures = [];

async function check(route) {
  const url = `http://127.0.0.1:${port}${PREFIX}/${route.path}`;
  let dom = '';
  try {
    dom = execFileSync(browser, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      `--user-data-dir=${profile}`, '--virtual-time-budget=25000', '--dump-dom', url
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 90000, maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    failures.push(`${route.path}: tarayici calistirilamadi (${error.message.split('\n')[0]})`);
    return;
  }
  const match = dom.match(/<div id="__probe"[^>]*>([\s\S]*?)<\/div>/);
  if (!match) { failures.push(`${route.path}: sayfa yuklenmedi (probe yok)`); return; }
  const decode = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
  let probe;
  try { probe = JSON.parse(decode(match[1])); }
  catch { failures.push(`${route.path}: probe okunamadi`); return; }

  if (probe.errs && probe.errs.length) failures.push(`${route.path}: JavaScript hatasi -> ${probe.errs.join(' | ')}`);
  if (probe.dataError) failures.push(`${route.path}: veri yuklenemedi uyarisi var`);
  if (route.expectMissing) {
    if (!probe.missing) failures.push(`${route.path}: olmayan kayit "bulunamadi" demeliydi`);
    return;
  }
  if (probe.missing && !route.kind) failures.push(`${route.path}: "Kayit bulunamadi" gorunuyor`);
  if (route.kind === 'detail' && !probe.detail) failures.push(`${route.path}: detay sayfasi acilmadi`);
  if (route.kind === 'detail' && route.mustContain && !probe.text.includes(route.mustContain)) {
    failures.push(`${route.path}: detayda "${route.mustContain}" yazisi yok`);
  }
  if (route.h1 && !route.h1.test(probe.h1)) failures.push(`${route.path}: baslik "${probe.h1}" beklenen ${route.h1} degil`);
  if (route.minCards && probe.cards < route.minCards) failures.push(`${route.path}: ${probe.cards} kart, en az ${route.minCards} bekleniyordu`);
  if (route.maxCards != null && probe.cards > route.maxCards) failures.push(`${route.path}: ${probe.cards} kart, en fazla ${route.maxCards} bekleniyordu`);
  if (route.minLinks && probe.links < route.minLinks) failures.push(`${route.path}: ${probe.links} baglanti, en az ${route.minLinks} bekleniyordu`);
}

log('');
log(`== ${ROUTES.length} rota deneniyor ==`);
for (const route of ROUTES) {
  const before = failures.length;
  await check(route);
  const added = failures.length - before;
  log(`   ${added ? 'x' : 'v'} /${route.path}${added ? '  -> ' + failures[failures.length - 1] : ''}`);
}

await new Promise((resolve) => server.close(resolve));
try { rmSync(profile, { recursive: true, force: true }); } catch { /* temizlik onemsiz */ }

log('');
if (failures.length) {
  log(`== BASARISIZ: ${failures.length} sorun ==`);
  for (const message of failures) log(`   x ${message}`);
  process.exit(1);
}
log(`== TAMAM: ${ROUTES.length} rota sorunsuz ==`);
