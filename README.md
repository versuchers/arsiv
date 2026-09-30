# Arşiv — film, dizi, kitap

Statik tek sayfa arşiv. Veri **tarayıcıda Google Sheets'ten çekilmez**; GitHub Actions
saatlik olarak CSV'leri indirip `data/*.json` üretir, site bu dosyaları `no-cache`
ile okur.

## Klasör yapısı

```
index.html                  site — tek dosya (HTML + CSS + JS, ~1180 satır)
404.html                    doğrudan detay adresi yenilendiğinde fallback
                            ⚠ ÜRETİLİR: workflow her koşuda index.html'den kopyalar
data/
  books.json                Kitaplar  (üretilir)
  films.json                Filmler   (üretilir)
  series.json               Diziler   (üretilir)
scripts/
  build-data.mjs            CSV -> JSON dönüştürücü + doğrulamalar
  sources.json              kaynak CSV adresleri ve zorunlu başlıklar
  check-data.mjs            veri + adres + HTML tutarlılık kontrolleri (tarayıcı gerektirmez)
  check-site.mjs            18 rotayı GitHub Pages benzeri sunumda başsız tarayıcıda açar
.github/workflows/
  update-and-deploy.yml     saatlik veri üretimi + Pages yayını
```

## Veri akışı

1. `scripts/sources.json` içindeki adreslerden CSV indirilir (UTF-8).
   Dizi adresi `pubhtml` biçiminde verilmişse betik `pub?...&output=csv` ucuna
   çevirir ve bunu günlüğe yazar.
2. CSV'de başlık satırı bulunur (Sheets çıktısının başında "Son güncellenme tarihi"
   gibi satırlar olabilir; ilk 12 satır taranır).
3. Sütunlar **başlık adına** göre eşlenir. `scripts/build-data.mjs` içindeki
   `SCHEMAS` her alan için birden fazla başlık adı (eski + yeni) tutar; sayfa
   yeniden adlandırılsa bile eşleme bozulmaz.
4. `data/<tip>.json` yazılır. Kayıt sırası, slug'lar ve rotalar burada hesaplanır.

### Doğrulama (başarısız olursa mevcut JSON korunur ve iş hata ile biter)

| Kontrol | Davranış |
|---|---|
| İndirilen içerik CSV değilse (HTML/JSON) | dosyaya dokunulmaz, `exit 1` |
| Beklenen başlıklar bulunamazsa | dosyaya dokunulmaz, `exit 1` |
| Yeni kayıt sayısı önceki sürümün **yarısının altındaysa** | dosyaya dokunulmaz, `exit 1` |
| Veri gerçekten değişmediyse | dosya yeniden yazılmaz, `generatedAt` korunur |

Değişiklik, `items` dizisinin SHA-256 parmak izi (`fingerprint`) ile karşılaştırılır.
Bu yüzden her saat çalışması, veri değişmese bile commit üretmez.

## GitHub kurulumu (bir kez)

1. Bu klasörü bir deponun **kök dizinine** gönderin (`index.html` kökte olmalı).
2. Depo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Actions sekmesinden iş akışını **elle tetikleyin** (`workflow_dispatch`) ve
   "Allow" verin. Saatlik çalışma için depo etkin olmalı.

Yayın `https://<kullanıcı>.github.io/<depo>/` adresine yapılır. Derleme adımı
başarısız olursa (örneğin Sheets geçici olarak hata sayfası dönerse) yayın da
yapılmaz; eski JSON'lar ve eski site yerinde kalır.

## Yerelde çalıştırma

```bash
# Veriyi yeniden üret
node scripts/build-data.mjs

# Değişiklikten önce kendi kendine kontrol et (ikisi de bağımlılıksız)
node scripts/check-data.mjs     # veri, adres, HTML, çakışma işareti
node scripts/check-site.mjs     # 18 rota, başsız tarayıcıda (tarayıcı yoksa atlar)

# Sitenin data/*.json okuyabilmesi için HTTP sunucusu şart (file:// çalışmaz)
python -m http.server 8000
# sonra: http://localhost:8000/
```

`file://` ile açıldığında tarayıcı `data/*.json` dosyalarını okuyamaz; site bunu
alt bilgide açıkça bildirir. Bu yüzden yerelde de bir HTTP sunucusu kullanın.

## Sitede ne değişti

- `DATA_URLS`, `SCHEMAS`, CSV ayrıştırıcı, sütun eşleyici ve 300 KB'lık gömülü kopya
  kaldırıldı. `index.html` 369 KB → 55 KB.
- Site yalnızca `data/*.json` okur, istekler `cache: 'no-store'` ile atılır.
- Alt bilgide üretilen dosyalar, toplam kayıt sayısı ve **son üretim zamanı**
  (Türkiye saati) gösterilir.
- Detay sayfalarındaki "Google Sheets'ten okunur" notu, yeni akışı anlatacak
  şekilde güncellendi.

## Ne zaman yayınlanır?

| Durum | Yayın |
|---|---|
| `main` dalına `index.html`, `404.html`, `data/`, `scripts/` veya bu workflow yüklenirse | **hemen** (push tetikleyicisi) |
| Sheets verisi değişirse | saatlik koşuda otomatik |
| Elle **Run workflow** | anında |

Yayından önce üç kontrol daha çalışır ve biri bile kırmızıysa **yayın yapılmaz**:
`404.html` yeniden üretilir ve `index.html` ile aynı olduğu doğrulanır,
`check-data.mjs` tutarlılıkları denetler, `check-site.mjs` rotaları gerçek bir
tarayıcıda açar.

> Push tetikleyicisi `paths` ile sınırlıdır; `README.md` gibi ilgisiz dosyalar
> yeni koşu başlatmaz.
>
> GitHub Pages yanıt başlıkları `max-age=600` verir. Yani bir dağıtımdan sonra
> **10 dakika boyunca** ziyaretçiler CDN'den eski HTML'i görebilir. Veri
> dosyaları ise sitede `no-store` ile okunduğu için her zaman günceldir.
## Playlistler

`data/playlists.json` dördüncü veri kaynağıdır ve tamamen film/dizi/kitapla aynı
mekanizmayı kullanır: CSV indirilir, başlık adına göre sütunlar eşlenir, JSON'a
çevrilir, saatlik job yeniden üretir.

| Sheets başlığı | JSON alanı | Yerde |
|---|---|---|
| `Name` | `title` | sayfa başlığı, kapak yazısı |
| `kapak linki` | `image` | kapak görseli |
| `playlist linki` | `spotify` | **Playlisti dinle** butonu |
| `Tracks` | `tracks` | kapak altında "N şarkı", detayda "Şarkı sayısı" |
| `Genre` | `genres` | tür filtresi ve çip linkleri |
| `Feeling` | `feeling` | "His" satırı |
| `Kategori` | `category` | kategori filtresi |

`Importancy` ve `Renk Kodu` bilerek kullanılmıyor.

- Rota öneki: `/playlist/<isim>` (ör. `/playlist/buluntu`)
- Liste sayfası: `/lists` — 6 sütun, "Şarkı sayısına göre" / "Ada göre" sıralama,
  tür ve kategori filtreleri. Puan sütunu playlistlerde yok, bu yüzden gizlidir.
- Spotify butonu `target="_blank" rel="noopener noreferrer"` ile açılır.
- Yeni sütun adları `SCHEMAS.playlists` içindeki alias listelerine eklenmelidir.
## Ana sayfa favorileri

Ana sayfadaki **Favori filmler / Favori diziler / Favori kitaplar** blokları, Sheets'teki
`anasayfa sıra` (dizilerde `anasayfa sıralama`) sütunundaki numaraya göre sıralanır.
Bu sütunda değeri olan kayıtlar favoridir; sütunu boş olanlar listelere girmez.

- Başlıklar iki yazım da tanınır (`anasayfa sıra` ve `anasayfa sıralama`).
- Değer JSON'da `homeOrder` alanı olarak sayıya çevrilir.
- Sıra numarası vermek için Sheets'teki hücreye `1`, `2`, `3` … yazmanız yeterli;
  bir sonraki saatlik çalışmada site kendiliğinden güncellenir.
- Şu an her kategoride 12 favori var (6 + 6 = iki satır).

## v1.10 degisiklikleri

**Sayfalama.** Film, dizi, kitap ve playlist listelerinde sayfa basina **30 kayit**
gosterilir; altta `1 2 3 ...` seklinde sayfa baglantilari vardir ve liste sonuna
gelindiginde sonraki sayfa kendiliginden eklenir. Sayfa adresin parcasidir:
`/films`, `/films/2`, `/series/3` ... Yeni liste sayfalari `gridView` kullandigi icin
otomatik olarak ayni davranisi alir.

**Gorsel hizi.** Sayfalama tek seferde 30 kapak indirdigi icin gorsellerin yavas
yuklenmesinin ana nedeni giderildi. Ayrica kartlara `content-visibility:auto`
eklendi; ekran disindaki kartlar cizilmiyor.

**Yeni alanlar.**

| Sheets | Sitede |
|---|---|
| `yogunluk` / `yogunluk seviyesi` (1-5) | "Yogunluk" satiri: cok dusuk / dusuk / orta / yuksek / cok yuksek |
| `tekrar okur muyum` (1-5) | "Tekrar okur muyum?": hayir / dusuk ihtimalle / belki / muhtemelen / kesinlikle |
| `tekrar izler miyim` (1-5) | "Tekrar izler miyim" - sutun eklendiginde otomatik dolar |
| `imdb` (dizi) | afis altinda dis link |
| `tmdb` (dizi) | afis altinda dis link |

**Tasarim.** Yalnizca `main label` kutulandi ve kalinlastirildi; tur, alt tur,
cevirmen gibi diger degerler kutusuz, alti cizili duz baglanti oldu. Dis sitelere
giden baglantilar (letterboxd, tmdb, imdb, tvmaze, goodreads) noktali alt cizgi +
ok isareti ile ayrildi. Playlist kapaklari kare, adlari kapak altinda. Basligin
altindaki yonetmen/yazar/creator 15px -> 30px.

**Site adi** "Arsiv" yerine "versucher"; adres `/arsiv` olarak kaliyor.

> Bilinen eksik: **filmler sayfasinda `imdb` sutunu yok**, bu yuzden film detayinda
> Letterboxd ve TMDB gorunuyor, IMDb yok. Sutunu eklediginizde otomatik gelir.
## v1.10 değişiklikleri

### Sayfalama
Film, dizi, kitap ve playlist listelerinde sayfa başına **30 kayıt** gösterilir;
altta `1 2 3 …` sayfa bağlantıları vardır ve liste sonuna gelindiğinde sonraki sayfa
kendiliğinden eklenir. Sayfa adresin parçasıdır: `/films`, `/films/2`, `/series/3`.
Yeni liste sayfaları `gridView` kullandığı için otomatik aynı davranışı alır.

### Görsel hızı
Asıl yavaşlık 944 görselin tek seferde istenmesiydi; sayfalama bunu 30'a indirdi.
Ayıca kartlara `content-visibility:auto` eklendi, ekran dışındaki kartlar çizilmiyor.

### Detay kutularındaki sıra
Film ve dizi bilgi kutularındaki satır sırası ve etiketler kullanıcı isteğiyle
belirlendi. Boş satırlar hiç gösterilmez.

* **Orijinal ad** yalnızca "ön ek + film" (dizilerde "dizi") ile aynı değilse çıkar.
* Etiketlerde `||` iki satıra böler: "Nasıl keşfettim / neden izledim".
* Kitaplarda aynı etiket "Nasıl keşfettim / neden okudum" olur.

### Yeni alanlar
Sheets sütun adları değiştiği için şema güncellendi; eski adlar da alias olarak duruyor.

| Sheets | Sitede |
|---|---|
| `yoğunluk` (1–5) | çok düşük / düşük / orta / yüksek / çok yüksek |
| `tekrar izler miyim`, `tekrar okur muyum` (1–5) | hayır / düşük ihtimalle / belki / muhtemelen / kesinlikle |
| `imdb linki` (film), `imdb`, `tmdb`, `tvmaze linki` (dizi) | afiş altında dış link |
| `başladığım yıl` (dizi) | "Başladığım yıl" satırı |
| `ilk izlediğim şehir` (dizi) | "İlk izlediğim şehir" satırı |

> Film sayfasında `tür (letterboxd)`, `tmdb id` ve `afişi indirdim mi` sütunları
> kaldırıldığı için kaldırıldılar; tür artık `tür` sütunundan geliyor.

### Favoriler sayfası
Yazarlar, yönetmenler ve türler artık bağlantı. Yazar → `/kitap/filtre/author/<slug>`,
yönetmen → `/film/filtre/director/<slug>`, tür → `/tur/<slug>` (film + dizi + kitap +
playlist kayıtları birlikte). Büyük/küçük harf farkı olan aynı adlar tek kayda
indirgenir ve adetleri toplanır (örn. "Adam Wingard" 2).

### Tasarım
Yalnızca `main label` kutulandı ve kalınlaştırıldı; diğer değerler kutusuz, altı çizili
düz bağlantı oldu. Dış sitelere giden bağlantılar (letterboxd, tmdb, imdb, tvmaze,
goodreads) noktalı alt çizgi + `↗` ile ayrıldı. Playlist kapakları kare, adları
kapak altında. Başlığın altındaki yönetmen/yazar/creator 15px → 30px.
Site adı "Arşiv" yerine "versucher"; adres `/arsiv` olarak kalıyor.

### Taban adres
`detectAppBase` artık rota adlarını `ROUTE_PREFIX`'ten türetiyor. Daha önce
`playlist` listede olmadığı için `/arsiv/playlist/<slug>` adresi 404 sonrası yanlış
taban adrese çözülüyordu. Yeni `tur` rotası da aynı listeye eklendi.
## v1.11 değişiklikleri

### Yayın güvenliği (acil düzeltme)

`update-and-deploy.yml` veriyi üretip aynı `main` dalına commit ederken şu
zinciri takip ediyordu:

```
git commit  →  git pull --rebase  →  git push  →  (paketle)  →  deploy
```

Siz arada push yaptığınızda `git pull --rebase` çakışmaya düşüyor ve **yarım
kalmış bir çalışma ağacı** bırakıyordu: dosyaların içine `<<<<<<< HEAD`
yazılıyordu. Döngü bunu başarısız saymıyor, sonraki `Siteyi paketle` adımı
`path: .` ile **kirli ağacın tamamını** paketleyip GitHub Pages'e yayınlıyordu.
Sonuç: sitede *"Veri dosyaları yüklenemedi … Unexpected token '<'"* hatası.

İki savunma hattı eklendi:

1. **Her push denemesinden sonra yarım kalan rebase/merge temizlenir**
   (`git rebase --abort`). Bu, commit'ten *önceki* duruma döner; yani üretilmiş
   geçerli veri dosyaları çalışma ağacında kalır. 5 deneme sonunda hâlâ
   gönderilemezse iş `::warning::` ile devam eder, veri bir sonraki saatte yazılır.
2. **Yayından hemen önce "ağaç sağlam mı" kontrolü** çalışır. Çalışma ağacı
   kirliyse, dosyalarda `<<<<<<<` / `=======` / `>>>>>>>` işareti varsa ya da
   `data/*.json` geçerli JSON değilse iş **hata ile durur** — bozuk site
   yayınlanmaz.

Doğrulama: geçici bir depoda gerçek bir çakışma üretildi; koruma işareti buldu ve
yayını engelledi. v1.11 dosyalarıyla temiz ağaç kontrolü geçti.

> Siz de aynı dala push ettiğiniz için **önce `git pull --ff-only`, sonra dosya
> kopyalayın**. Böylece push fast-forward olur, merge hiç oluşmaz.

### Dizi görsellerindeki rozet kaldırıldı

Kartların sol üstündeki "Sürüyor" / "İzlenmedi" / "Yarım" etiketi kaldırıldı.
`.badge` stili silinmedi; ileride geri isterseniz hazır duruyor. Dizi detay
sayfasındaki "Durumu", "Ne kadarını izledim", "Bitirdim mi?" satırları yerinde.

### Navbar araması

Başlık sağ üstünde **🔍 Ara** düğmesi var. Tıklayınca `/ara` sayfası açılır.
Herhangi bir sayfada **`/`** tuşuna basmak da aramayı açar (odak alan içindeyken
`/` normal karakter olarak yazılır).

* Film, dizi, kitap ve playlistlerde **aynı anda** arar.
* Aranan alanlar: başlık, özgün ad, yazar, yönetmen, creator, network, tür,
  alt tür, ülke, main label, çevirmen, yayınevi, platform, "nasıl keşfettim"…
* Sonuçlar türlerine göre gruplanır (Filmler / Diziler / Kitaplar / Playlistler).
* Sıralama: önce tam eşleşen ad, sonra adı sorguyla başlayanlar, sonra
  içerenler.
* Adres çubuğu canlı güncellenir (`/ara?q=nolan`), yani arama paylaşılabilir.
* Listelerdeki arama kutuları değişmeden duruyor; `/ara` tüm siteyi tarar.
## v1.12 değişiklikleri

### Playlistler varsayılan olarak kategoriye göre sıralanır
`/lists` sayfası "Şarkı sayısına göre" ile açılmıyor. Varsayılan **"Kategoriye
göre"** ve kategori sırası:

```
main  →  versucher II  →  artist  →  genre
```

(26 / 18 / 21 / 44 kayıt). Aynı kategoride ad alfabetik sıralanır. Seçenek
listesinde sıra: Kategoriye göre · Şarkı sayısına göre · Ada göre.

### Filmler varsayılan olarak son izlemeye göre sıralanır
`/films` sayfası artık "Son izlemeye göre" ile açılıyor ve **gerçekten** o
sırayı uyguluyor.

> Bulunan hata: `dateSort` yalnızca `13 Haziran 2026` ve `2026-06-13`
> biçimlerini çözebiliyordu. Film sayfasındaki tarihler ise **gün/ay/yıl**
> (`13.06.2026`) biçiminde; bu yüzden 144 tarihin hiçbiri çözülmüyor, hepsi
> "tarihsiz" sayılıp sheet satır sırasına düşüyordu. Desen eklendi.
>
> Doğrulama: ilk sayfadaki 30 kartın tarihleri 27.09.2026 → 13.06.2026 arasında
> kesin azalan; tarihi olmayanlar en sona gidiyor. Kitap (`2016`) ve dizi
> (`2000`) yalnızca yıl içerdiği için davranışları değişmedi.

### Anasayfa
* Sıra artık: **Kitaplar → Filmler → Playlistler → Diziler**.
* Playlist satırı eklendi: `main` kategorisinden 12 kayıt, elle seçilmiş sırayla
  (loşş salınım, victoria's spell, alice in angerland, sade'ın kırbacı,
  astral çürüme, hiç ışık yok, ebedi döngü, depedehşet, çözülüş, sentetik gece,
  tender violence, itlik & serserilik).
* "Raflar" listesine Playlistler de eklendi; "Yakında" metni artık yalnızca
  konserleri anıyor (metin güncellendi, playlist verisi artık var).

Başlıklar `looseKey()` ile eşleştirilir: HTML kaçışı, tırnak çeşidi ve aksan
farkları yok sayılır, bu yüzden `"itlik &amp; serserilik"` ile yazılan kayıt da
bulunur.

### Favoriler sayfası yeniden düzenlendi
* **Yazarlar**, **Yönetmenler**, tür listeleri ve **Müzik türleri** en çok
  kayda sahip olandan en aza doğru sıralanır (aynı sayıda ise alfabetik).
* **Türler** başlığı altında türler tür tür ayrıldı: **Kitap** (20 tür),
  **Dizi** (34 tür), **Film** (23 tür). Her biri kendi türlerini ve kendi
  tür sayısını gösterir.
* Yeni **Müzik türleri** bölümü: playlist türleri (88 tür).
  *Not: `feeling` sütunu sheet'te tamamen boş (0/109), dolayısıyla müzik
  türleri playlist `tür` değerlerinden geliyor. Playlist türlerini "Türler"
  altında görmek isterseniz `favoritesView` içindeki `muzik` satırı
  `turler`in içine taşınabilir.*

### Tür sayıları düzeltildi
> Bulunan hata: `collectValues(genreValues())` çağrısı sayıları **her zaman 1**
> gösteriyordu. `genreValues()` zaten `unique()` ile türleri tekilleştiriyor,
> sonra sayaç o tekilleşmiş listeyi sayıyordu. Bu yüzden "bilim kurgu 1"
> yazıyordu, halbuki tıklanınca 109 kayıt geliyordu.

Artık türler ham kayıtlardan sayılıyor ve **her tür kendi türünün filtresine**
bağlanıyor, yani yazan sayı ile tıklayınca çıkan sonuç birebir aynı:

| Bağlantı | Yazan | Tıklayınca çıkan |
|---|---|---|
| Film / bilim kurgu | 109 | 109 |
| Film / drama | 203 | 203 |
| Dizi / bilim kurgu | 24 | 24 |
| Kitap / roman | 118 | 118 |
| Müzik / black metal | 11 | 11 |
| Yazar / orkun uçar | 16 | 16 |
| Yönetmen / christopher nolan | 8 | 8 |

### Link rengi `#fff2cc`
Üç tema bloğunda da `--link` `#fff2cc` yapıldı.

> **Dikkat — açık tema.** Koyu temada kontrast 14.28:1, kusursuz. Açık temada
> (`--bg:#D5DAE2`) kontrast **1.26:1**; WCAG AA için gereken 4.5:1'in çok
> altında, yani linkler neredeyse görünmez. Sitenin açık temasını kullanırsanız
> ilk blokta şu değişiklik gerekir:
>
> ```css
> /* :root { ... --link:#999999; }  ->  */
> :root{ --link:#6b5a1f; }   /* aynı krem tonunun koyu varyantı, kontrast 4.81:1 */
> ```
>
> Koyu temalar `#fff2cc` olarak kalır. İsterseniz bunu doğrudan uygularım.
## v1.12 — ikinci tur (10 madde)

### Favoriler: yönetmenler
Tek filmi olan yönetmenler gizlenir (>= 2 film şart) ve `hasan karacadağ`
listeden çıkarıldı. **355 → 90 yönetmen.** Listede adet sırasında:

```
Christopher Nolan 8 · Quentin Tarantino 7 · Steven Spielberg 7 · …
```

### Favoriler: yazarlar
Çoklu yazarlı kitaplar artık virgüllü tek kayıt olarak listelenmiyor.
`anadolu korku öyküleri 1` kitabından yalnızca **demokan atasoy, galip dursun,
ışın beril tetik** tekil yazar olarak gösterilir; aynı gruptaki diğer yazarlar
(koray günyaşar, ayşegül nergis, kayra keri küpçü) ve diğer çoklu yazarlı grubun
(kaynak: `gio ödülleri 2013`) 16 yazar hiç gösterilmez. Tek yazarlı kitapların
yazarları normal şekilde listelenir. **85 yazar.** (85 = 82 tek yazarlı + 3).

### Favoriler: türler
`Türler` bölümü beş alt başlıktan oluşur:

| Alt başlık | İçerik |
|---|---|
| Kitap / Dizi / Film | tür tür ayrılmış hâli (20 / 34 / 23 tür) |
| **Türler tümü** | 62 tür — bir türdeki film + dizi + kitaplar (`/tur/<slug>`) |
| **Main label** | 291 tür — `main label` olarak işaretlenenler (`/etiket/<slug>`) |

`/tur/<slug>` sayfası artık yalnızca film, dizi ve kitap gösterir; playlistler
kendi bölümünde ("Müzik türleri"). Böylece yazan sayı ile tıklayınca çıkan sonuç
birebir aynı (bilim kurgu 133, drama 240, korku 172, komedi 106, roman 118 —
hepsi doğrulandı).

### Detay sayfalarında geri bağlantı
Her detay sayfasının en üstünde: `← Filmlere dön` · `← Dizilere dön` ·
`← Kitaplara dön` · `← Playlistlere dön`.

### Creator / showrunner tıklanabilir
Dizi detayında başlığın altındaki creator artık bağlantı; tıklanınca o kişinin
`creator / showrunner` olduğu yapımlar listelenir
(`/dizi/filtre/creator/<slug>`, başlık "Creator / showrunner: …").

### Temalar
* Açık temada link rengi `#6b5a1f` (kontrast 4.81:1, AA geçer). Önceki
  `#fff2cc` açık zeminde 1.26:1 idi ve görünmüyordu.
* Koyu temada linkler `#fff2cc` (14.28:1) kaldı; link olmayan metin
  `#E6E2D8` yerine `#B9BFC9`, ikincil metin `#8A94A6` yapıldı. Böylece
  bağlantılar düz değerlerden belirgin.

### Küçük ekranda detay sayfası genişliği
`main:has(.detail-page)` genişliği ekran **yüksekliğinden** hesaplıyordu:
`(100vh - 185px) * 1.3334 + 75px`. 860×480 bir pencerede bu 469px'e
düşüyor, ekranın yarısı boş kalıyordu. Yükseklikle hesaplanan daraltma artık
yalnızca 701px üzeri ekranlarda uygulanıyor.

### Footer
Eski biçim: `books.json · films.json · … · 944 kayıt · son üretim …`
Yeni biçim:

```
Son güncelleme tarihi: 30 eylül 2026 05:39 (tsi)
```

Zaman damgası küçük harfli, ay adı uzun ve parantez içinde `(tsi)`.

### Baş harfler otomatik büyük
Sheet'te her şey küçük harfle başlıyor. `titleCase()` şu alanlara uygulanıyor:
film/dizi/kitap/playlist adı, ön ek, özgün ad, yazar, yönetmen, creator,
çevirmen ve tüm tür değerleri. Sonuç: **944 / 944** kayıt büyük harfle başlıyor.

Tireli adlar korunur (`post-black metal` → `Post-Black Metal`), iyelik
apostrofları bozulmaz (`agatha'nın anahtarı` → `Agatha'nın Anahtarı`,
`victoria's spell` → `Victoria's Spell`).

> Slug üretimi (`slugPart`) zaten küçük harfe çevirdiği için **adresler
> değişmedi**.

### Yapım ülkesi Türkçeleştirildi
Sheet'te karışık (İngilizce/Türkçe) yazıyordu. 48 farklı ülkenin tamamı
Türkçeye geçirildi: `united states` → `Amerika Birleşik Devletleri`,
`south korea` → `Güney Kore`, `czechia` → `Çekya`…

Üç yazım hatası da düzeltildi: `guadeleope` → `Guadelup`,
`avusturalya` → `Avustralya`, `bulgarisyan` → `Bulgaristan`.

Film ülke filtresi artık Türkçe adlarla çalışır
(`/film/filtre/country/amerika-birlesik-devletleri`).
## v1.12 — üçüncü tur (4 madde)

### "Nasıl keşfettim" ve "Neden izledim" ayrıldı
Sheet'te birleşik `nasıl keşfettim / neden izledim` sütunu ikiye bölündü.
Artık film ve dizi detayında **iki ayrı satır** var, alt alta, ve her biri
yalnızca doluysa gösteriliyor:

| | film | dizi |
|---|---|---|
| `nasıl keşfettim` | 64 / 494 dolu | 20 / 142 dolu |
| `neden izledim` | 136 / 494 dolu | 31 / 142 dolu |

> Bu arada bir şey düzeldi: eski birleşik sütun kaldırıldığı için o turun
> sonrasında bu bilgi film/dizi detayında **hiç görünmüyordu**. Artık ikisi de
> geri geldi. Hiçbir kayıtta iki satır birden dolu değil ama ikisi de doğru
> çalışıyor (filmde `ghost in the shell` yalnızca "Nasıl keşfettim",
> `titane` yalnızca "Neden izledim" satırını gösteriyor).

### Diziye özgü "Favori sezon"
Yeni sütun dizi detayında **"Ne kadarını izledim"in hemen altında** görünüyor.
31 / 142 dizide dolu. Örnekler: `Son Sezon Hariç Tümü`, `Tümü`, `İlk 2 Sezon`.

### Main label kutusu
Afişin altındaki main label artık sitenin en belirgin vurgusu: accent renkli
1px çerçeve, büyük harf + harf aralığı, daha büyük iç boşluk ve gölge.
Üzerine gelince zemin accent olur.

### Kitap detay sayfası
* `Okunan tüm formatlar` → **`Okuduğum formatlar`**
* Baş harfler büyütüldü. `titleCase()` kapsamı 22 metin alanına genişletildi:
  `seriesName`, `mainLabel`, `reason`, `publisher`, `character`, `formats`,
  `acquisition`, `authorOrigin`, `fiction`, `city`, `platform`,
  `directorOrigin`, `seriesOrder`, `statusRaw`, `watched`, `network`,
  `language`, `format`, `adaptation`, `firstCity`, `category`, `feeling`
  + `subgenres`, `readLanguage`, `writtenLanguage`, `owned`, `doneRaw`.
* Tutarlılık için `yoğunluk` ve `tekrar` etiketleri de büyütüldü:
  `orta` → `Orta`, `hayır` → `Hayır`, `düşük ihtimalle` → `Düşük İhtimalle`.

Doğrulama: 30 metin alanı tarandı, **küçük harfle başlayan 0 kayıt** kaldı.
## v1.12 - tur 4

### 1) Favorilerde ve her yerde yazım kuralı
Bağlaç kelimeler (`ve`, `ile`, `de`) artık büyük harfle başlamıyor; **ilk kelime her zaman
büyütülüyor** (yani "De İkinci Ufuk" gibi bir başlık bozulmuyor).
Apostroftan sonra gelen kelimeler de küçük kalıyor: `Agatha'nın Anahtarı`, `Calla'nın Kurtları`,
`Vakıf'ın Sürüsü`. Tireli bileşikler korunuyor: `Post-punk`, `Middle-earth`, `Avant-garde`.

`FAV_MULTI_AUTHORS` listesindeki üç yazar sitede küçük harfle duruyordu
(`demokan atasoy`, `ışın beril tetik`); düzeltildi. Sheet'te "Işın" yazdığı için
eşleştirme `looseKey()` ile yapılıyor (İ/ı farkını görmez), listede ise doğru yazım
görünüyor: `Demokan Atasoy`, `Galip Dursun`, `İşın Beril Tetik`.

### 2) Detay sayfasında yenileme veri hatası veriyordu - DÜZELTİLDİ
Veri dosyaları göreli yoldan çekiliyordu (`data/books.json`). `/arsiv/film/bugonia-2025`
gibi bir adres yenilendiğinde adres `/arsiv/film/data/books.json` olup 404 dönüyor, dört dosya
da düştüğü için site "Veri dosyaları yüklenemedi" diyordu. Artık `dataUrl()` her zaman uygulama
kökünden okuyor (`APP_BASE + data/...`).

### 3) Favoriler yavaş açılıyordu - DÜZELTİLDİ (6,5 kat)
Kök neden `routeValueSlug()` idi: her etiket için kardeş değerlerinin **tamamı** taranıyor ve
her tarama `slugPart()` yeniden hesaplıyordu. Favoriler sayfasında bu yüz binlerce kez
oluyordu.

* `slugPart()` ve `valueKey()` saf fonksiyonlar; `Map` önbelleğine alındı (O(n²) → O(n)).
* `genreValues()` ve `siblingValues()` da önbelleklendi.

Ölçüm (başsız Edge, 944 kayıt): **15.3 sn → 1.7-3.1 sn**. Favoriler 693 bağlantı üretiyor.
Ayrıca favoriler, tür ve filtre sayfalarında içerik basılmadan önce spinner gösteriliyor
(`showLoading()`), yani "açılıyor mu" sorusu cevaplanıyor.

### 7) Kitaplarda ilk okunma tarihi
Sheet'te aynı sütun dört biçimde dolu: `2026`, `2026 Eylül`, `Aralık 2025`, `20.01.2026`.
Önceden hepsi yıl olarak sayılıyordu, yani **"2026 Eylül" Ocak 2026 ile aynı yere düşüyordu**.

* `parseReadDate()` dört biçimi de çözüyor.
* Yalnızca yıl yazan kayıtlara o yılın **en yeni ayı** yazılıyor (2025 → `Aralık 2025`).
* Build iki alan üretiyor: `firstReadSort` (`YYYY-AA-GG`, sıralama için) ve
  `firstReadLabel` (`Eylül 2026`, `20 Ocak 2026`, gösterim için).
* Kitaplar sekmesinde iki sıralama seçeneği var:
  **İlk okunma sırasına göre: sondan başa** (varsayılan) ve
  **İlk okunma sırasına göre: baştan sona**.
  (Filmlerde `date` artık gerçekten son izlemeye göre sıralıyor; diziler yıla göre.)

### 4-6) Detay değerlerinin büyük harfle başlaması
İstendiği listedeki alanların **zaten** büyük harfle başladığı veri üzerinde doğrulandı
(film, dizi, kitap: 0 küçük harfle başlayan kayıt) - bu turda ek değişiklik gerekmedi.
Apostrof kuralı uygulanmadığı için `Calla'Nın Kurtları` gibi hatalar vardı, düzeltildi.

### Doğrulama
* GitHub Pages davranışını taklit eden yerel sunucu (bilinmeyen yol → `404.html`, 404 kodu)
  üzerinde 15 rota denendi: **hepsi hatasız**, konsolda JS hatası yok.
* Detay sayfası doğrudan adresle açıldığında (yenileme senaryosu) veri yükleniyor.
* `arsiv-taslak-v6.html`, `index.html`, `404.html` üçü de bayt bayt aynı.
* 944 kayıt üretildi (kitap 199, film 494, dizi 142, playlist 109).
* **Slug/adresler değişmedi**: eski verideki 944 slug'ın tamamı yeni veride de var.
  (`titleCase` yalnızca gösterim metnini değiştiriyor, slug zaten küçük harfe iniyor.)


## Yeni renk paleti

Koyu tema tamamen yeniden boyandi:

| Rol | Renk |
|---|---|
| Ana arka plan | `#0F0F10` (grafit siyahı) |
| Kartlar / panel | `#18181A` |
| Kenarlıklar | `#26262A` |
| Ana metin | `#E3DEC3` (soluk kemik / parşömen) |
| İkincil metin | `#8A8778` |
| Vurgu (accent) | `#C5A880` (eski pirinç / antik altın) |

Bu altı renk birebir kullanıldı. Kalan yüzeyler onlardan türetildi:

* `--raise` (iç kartlar) `#1E1E22` - panelden bir tık açık.
  `#212125` denendi ama oradaki ikincil metin 4.44:1 düşüyordu; bu değer 4.6:1.
* `--well` (içe gömülü alanlar) `#0A0A0B`.
* `--star` (puan yıldızları) `#B29572` - accent biraz sönük, böylece bağlantılarla yarışmıyor.
* `--link` `#D4B98C` - accentin biraz açığı, bağlantı olarak 8.5:1.
* Gölgeler saf siyah (`rgba(0,0,0,.72)`), vurgu çizgisi sıcak (`rgba(227,222,195,.07)`).
* Afiş yer tutucusu için ayrı `--cover` (`#1B1B1F`) ve çerçeve `--cover-frame`
  (`rgba(227,222,195,.24)`) eklendi. Yer tutucu `--well` ile doluydu ve koyu temada
  panelden koyu olduğu için "delik" gibi görünüyordu.

### Form kontrolleri için ayrı kenar tonu
Tarayıcı, arama kutusu ve `kbd` gibi kontroller `--line` (#26262A) ile çiziliyordu.
Bu renk `#0F0F10` üzerinde 1.27:1 - yani kontroller **görünmez** oluyordu.
Bu yüzden `--line-ctl` eklendi (`#5E5E66`, dolgu üzerinde 3.08:1) ve yalnızca bu
üç kontrol kuralı ona geçirildi. Dekoratif kenarlıklar sizin `#26262A` değerinizde kaldı.

### Açık tema
Sitenin açık/koyu tema anahtarı var ve verdiğiniz palet koyu olduğu için açık tema
**aynı renk ailesinden türetildi** (soğuk mavi-gri + bordo gitti):

| Rol | Renk |
|---|---|
| Arka plan | `#E9E4D3` (parşömen) |
| Panel / kart | `#F2EEE0` / `#FBF8EE` |
| Kenarlık | `#CFC7AE` |
| Ana metin | `#1F1D18` (mürekkep) |
| İkincil metin | `#625E4A` |
| Vurgu | `#7E5F2F` (koyu pirinç) |

Tema anahtarını kaldırıp siteyi her koşulda koyu yapmak isterseniz tek yapılacak şey:
`:root` bloğundaki değerlerin aynısını `:root[data-theme="dark"]` bloğuna kopyalamak.

### Kontrast ölçümü (WCAG)
`#E3DEC3` / `#0F0F10` = **14.1:1**, `#8A8778` / `#0F0F10` = 5.3:1,
`#C5A880` / `#0F0F10` = 8.5:1, `#D4B98C` / `#18181A` = 9.4:1.
Hedeflerin hepsi 4.5:1 üstünde. Açık temada en düşük değer 4.7:1 (ikincil metin).


## Kırılganlığı azaltma turu

### "Üç dosya aynı" kuralı artık kodla garanti ediliyor
Önceden `index.html`, `404.html` ve `arsiv-taslak-v6.html` elle aynı tutuluyordu;
insan disiplinine dayanan bir kuraldı. Artık:

* **`arsiv-taslak-v6.html` kaldırıldı.** Çalışma dosyası doğrudan `index.html`.
  Kural "iki dosya aynı"ya indi ve workflow bunu **kendisi** üretiyor.
* Workflow, yayından hemen önce `cp index.html 404.html` çalıştırıyor ve
  `cmp -s` ile bayt bayt aynı olduğunu doğruluyor. Ayrıca `arsiv-taslak-v6.html`
  depoda kalmışsa işi hata ile durduruyor.
* Depodaki `404.html` `index.html` ile farklıysa yalnızca uyarı verir (yayın yine de
  yapılır, çünkü dosya zaten üretildi).
* "Çalışma ağacı temiz mi" kontrolü artık `404.html` dosyasını hariç tutar;
  çünkü bir önceki adım onu bilerek değiştiriyor.
* Sürüm klasörleri yerine **git etiketleri** kullanılmalı (aşağıya bak).

### Doğrulama depoya taşındı: iki betik
Bu turun bulduğu "detay sayfası yenilemede veri hatası" gerilemesi türü şeyleri
insan gözüne bırakmak riskti. Artık iki betik var, ikisi de **bağımlılıksız**
(sadece Node modüllerinden):

| Betik | Ne yapar | Hata durumunda |
|---|---|---|
| `scripts/check-data.mjs` | Veri dosyaları, adres tutarlılığı, HTML bütünlüğü, çakışma işareti, kritik alan doluluğu, **sütun eşleştirme raporu** | `exit 1` |
| `scripts/check-site.mjs` | Siteyi GitHub Pages gibi sunar (bilinmeyen yol → `404.html`, 404 kodu) ve 18 rotayı başsız tarayıcıda açar | `exit 1` |

`check-site.mjs` her rota için şunları doğruluyor: sayfa yüklendi, konsolda JavaScript
hatası yok, "veri yüklenemedi" uyarısı yok, beklenen başlık ve kart/bağlantı sayısı
eşleşti. Olmayan bir kayıt adresi de "bulunamadı" mesajı veriyor mu diye sınanıyor.
**Tarayıcı bulunamazsa atlar ve 0 döner** — yerelde Node çalıştıran ama tarayıcısı
olmayan biri hata görmez. GitHub runnerlarında `google-chrome` hazır olduğu için
CI da bu test gerçekten çalışır.

Rotalar `data/*.json` üzerinden dinamik üretiliyor; `check-site.mjs` içindeki
`slugPart()` kopyası sitedeki kuralın aynısıdır ve eşleşmezse haber verir.

### `reason` / `reasonFound` alias hatası düzeltildi
Önceden `reason: ['nasıl keşfettim / neden izledim']` diyelim birleşik bir başlık
tek sütun olarak **yoksa** eşleştirme bulanık (alt dizi) moda düşüyor ve onu
"nasıl keşfettim" sütununa bağlıyordu; böylece `reason` ve `reasonFound` **aynı
sütuna** biniyordu. Bu bir kod hatasıydı.

* `columnMap()` artık alias başındaki `=` işaretini tanıyor: `=` varsa o alias **sadece
  tam eşleşmede** kullanılır, bulanık eşleştirmeye hiç girmez.
* Üç tipte de `reason` alias'ı `=nasıl keşfettim / ...` yapıldı.
* Sonuç: `reason` artık hiçbir yere bağlanmıyor (o sütunlarda birleşik başlık yok),
  `reasonFound` ve `reasonWhy` kendi sütunlarında kaldı. Doğrulandı:
  film `reasonWhy` 136, dizi `reasonFound` 20, ikisi de doğru sütunda.

### `/tur` ve `/etiket` artık gerçek dizin sayfaları
Bu adresler daha önce **ana sayfaya düşüyordu** — gerçek bir gezinme boşluğuydu.

* `/tur` → kitap (20) + dizi (34) + film (23) türleri + müzik türleri (88),
  166 bağlantı. Film/dizi/kitap türleri `/tur/<slug>`, müzik türleri kendi
  filtre adresine gider.
* `/etiket` → **429** main label'ın tamamı, 292 bağlantı (bazı etiketlerin slug'ı
  boş olduğu için düz metin olarak listeleniyor).
* Favoriler sayfasındaki main label bölümü artık **ilk 30** etiketi gösterip
  "Tüm 429 etiketi gör" bağlantısı veriyor. Favoriler sayfasının DOM yükü
  **693 → 434 bağlantıya** indi.
* Favorilerde "Türler tümü" başlığına da "Tüm türleri gör" bağlantısı eklendi.

### Afişlerde yükleme efekti
Afişler harici bir depodan geldiği için yavaş bağlantıda kap boş siyah bir kutu
gibi görünüyordu: `.has-image` sınıfı atanır atanmaz başlığı gizliyor, başlık ancak
görsel **hata verirse** geri geliyordu.

* `loading="lazy"` ve `decoding="async"` zaten vardı, korundu.
* Yeni: kap içinde bir **skeleton** (ışık geçişi) ve `is-loaded` sınıfı.
  `.cover.has-image.is-loaded .cover-fallback` olarak değişti, yani **başlık
  görsel gerçekten boyanana kadar görünür** kalıyor.
* `load` ve `error` dinleyicileri `document` seviyesinde (capture) bağlandı;
  `render()` sonunda `markLoadedImages()` çalışıyor (önbellekten gelen görseller için).
* `prefers-reduced-motion` altında animasyon kapatılıyor.


## v1.12 - tur 5 (favoriler sıralaması, iki yeni dizin, İ/İ düzeltmesi)

### `i` → `İ` hatası (gerçek veri bozulmasıydı)

`titleCase()` her kelimenin baş harfini `toLocaleUpperCase('tr-TR')` ile
büyütüyordu. Bu İngilizce adlar için yanlıştı: `isaac` → **İ**saac (14 kayıt),
`inception` → **İ**nception, `ideocracy` → **İ**deocracy, `impossible` →
**İ**mpossible, `isles` → **İ**sles. Hepsinde nokta ve tire var, yanlış olan
tek şey ilk harf.

Türkçe tarafı bozmamak için kural **kelime listesiyle** çözüldü, sezgisel
değil: `ilk`, `istanbul`, `israil`, `ispanyol`, `italyan`, `ipek` gibi Türkçe
kelimeler listede yok, onlar Türkçe kurallara devam eder. Aksi hâlde 137
kayıttaki "İstanbul" "Istanbul" olurdu.

Roma rakamları ayrı: `versucher ii` → `Versucher II` (`isRomanInitial`).

Sonuç: **944 kaydın slug'ı değişmedi** (`i`/`İ` farkı küçük büyük harfte
görünür, slug tamamen küçük harf). Değişen tek şey 43 film, 8 dizi ve 3
playlist başlığı.

### Arama "Isaac" yazınca sonuç gelmiyordu (bulunan hata)

`hydrate()` arama dizinini `toLocaleLowerCase('tr-TR')` ile kuruyordu.
Türkçe küçültmede `I` → `ı` olduğu için dizinde "Isaac Asimov"
**"ısaac asimov"** olarak yazılıyordu. Kullanıcı `isaac` yazınca iğne
`isaac` kalıyor, dizin `ısaac` → eşleşme yok. Aynı sorun `İngilizce`
içeren her sorguda vardı.

Yeni `foldText()`: küçültme + `ı→i, ş→s, ğ→g, ö→o, ü→u, ç→c`
indirgemesi. Hem arama dizini hem sorgu hem de sonuç sıralaması bunu
kullanıyor; artık `Isaac`, `isaac` ve `İsaac` aynı kayda gidiyor.

`/ara?q=isaac` rotası `check-site.mjs` eşiklerine eklendi (sonuç ≥ 1)
ve bulunmayan bir sorgu için `maxCards: 0` eklendi.

### Anasayfa rafları büyütüldü

Satırlar liste sayfalarıyla aynı 6 sütunu paylaşıyordu, bu yüzden
kartlar küçüktü. Anasayfa için ayrı ızgara sınıfları:

| Bölüm | Önce | Sonra |
|---|---|---|
| Favori kitaplar / filmler / diziler | 6 sütun, ~12 kayıt | **4 sütun, ilk 8 kayıt** |
| Favori playlistler | 6 sütun, 12 kayıt | **3 sütun, 12 kayıt (4 satır)** |

Kart genişliği `1fr` olduğu için sütun azalınca kartlar kendiliğinden
büyüyor (ölçüldü: 200×300 px → **319×479 px**, playlist 433×433 px). Buna
uyumlu olarak afiş olmayan kartların başlığı, puan yazısı ve playlist
adı da büyütüldü (`.niche` kapsayıcısı yalnızca anasayfada kullanılıyor).

Sınır kodda: `HOME_FAV_LIMIT=8`. Sheets'teki "anasayfa sıra" sütunu
dokunulmadı; 8'den sonraki kayıtlar `/kitap`, `/film`, `/dizi`
listelerinde kendi sırasıyla duruyor. Playlist sırası elle seçilmiş 12
kayıt olduğu için olduğu gibi bırakıldı.

Liste sayfaları (`/film`, `/kitap`, ...) 6 sütunda kaldı — orada kart
sayısı 30 ve bilinçli olarak sıkıştırılmış.

### "Yazar köken" satırı kaldırıldı

Kitap detay sayfasından çıkarıldı. Alan **veride ve arama dizininde
kalıyor** (`hydrate()` ve `fieldValues()` tanımları duruyor, `FILTER_TITLES`
içindeki başlık da yerinde) — sadece detay sayfasında gösterilmiyor.
`/kitap/filtre/authorOrigin/<slug>` adresi çalışmaya devam ediyor.

Not: `density` ve `authorOrigin` gibi alanları tamamen silmek istersen
`build-data.mjs` içindeki `SCHEMAS` girişleri de kaldırılmalı; şu an
JSON'da duruyorlar, sadece görünmüyorlar.

### "Yazıldığı dil" artık tıklanabilir

Detay sayfasında "Yazıldığı dil" artık bir bağlantı; tıklanınca o dilde
yazılmış tüm kitaplar listeleniyor
(`/kitap/filtre/writtenLanguage/<slug>`).

Bunun için iki şey gerekiyordu ve ikisi de eksikti:

- `fieldValues()` kitaplar bölümünde `writtenLanguage` alanı **hiç tanımlı
  değildi** — filtre çalışması için eklendi (`splitList` ile, "İngilizce,
  Fransızca" gibi çoklu değerleri böyle ayırıyor).
- `FILTER_TITLES` içinde karşılığı olmadığı için filtre sayfasının başlığı
  ham alan adını (`writtenLanguage`) gösterecekti; **"Yazıldığı dil"** eklendi.

Doğrulama: İngilizce → **88 kitap**, Türkçe → **68 kitap**, hatasız.

Aynı şekilde tıklanabilir olabilir: "Okuduğum dil" (`readLanguage`) — söyle,
yaparım.

### "Yoğunluk" satırı kaldırıldı

Kitap, film ve dizi detay sayfalarından üçünden de kaldırıldı; sayfalar
tarayıcıda tek tek kontrol edildi. `build-data.mjs` hâlâ `density` alanını
üretiyor (JSON'da dursun, geri istersen tek satır); sadece gösterilmiyor.

### Kitaplarda "nasıl keşfettim" / "neden okudum" eşleşmiyordu (bulunan hata)

Sheet'teki kitap tablosunda bu iki sütun **ayrı**:
`neden okudum` ve `nasıl keşfettim` (sonuncunun başında boşluk var).
Kodda ise tek bir sütun adı aranıyordu: `reason: ['=nasıl keşfettim /
neden okudum']`. Böyle bir sütun yok, üstelik `=` ile "tam eşleşme" zorunlu
olduğu için bulanık eşleşme de devreye girmiyordu. Film ve dizilerde
`reasonFound` + `reasonWhy` olarak ayrı ayrı tanımlı olduğu için kitaplara da
ikisi eklendi.

Sonuç: 199 kitaptan **19'unda "Nasıl keşfettim"** dolu (ör. Dune →
"Önerildi", Şelik Mağaraları → "Orkun Uçar önerisi", Taht Oyunları → "Dizi
Uyarlaması"). **"Neden okudum" sütunu şu an hiç dolu değil** (0/199); doldurulduğu
gerek satır kendiliğinden çıkacak.

Satırlar "Okuma bilgileri"nde **Yoğunluk'un hemen üstünde**, ayrı ayrı iki
satır olarak duruyor. `row()` boş değerde `null` döndüğü için dolu olmayanlar
hiç görünmüyor.

Bu alanlar `hydrate()` arama dizinine de eklendi — böylece kitaplar kadar
film ve dizilerde de "Nasıl keşfettim" / "Neden izledim" metinleri aranabilir
hale geldi (daha önce `item.reason` vardı, bu ikisi yoktu).

### Kitap detay sayfası yeniden sıralandı

**Kitap** kutusu, istenen sırada:

1. Orijinal adı — **sadece sitede gösterilen addan farklıysa**
2. Yazar · 3. Yazar köken · 4. Çevirmen · 5. Yayınevi · 6. Kurgu mu?
7. Tür · 8. Alt tür · 9. Yazıldığı dil · 10. Baş karakter
11. Orijinal yayın tarihi · 12. Türkiye yayın tarihi · 13. Sayfa sayısı

*Yazar doğum tarihi çıkarıldı; tarih satırları "Sayfa sayısı"n üstüne alındı.*

`originalTitleDiffers()` artık `displayName()` ile karşılaştırıyor (önceden
`filmName()` idi, yalnızca filmlerde doğruydu). 199 kitaptan **127'sinde**
orijinal ad farklı, 72'sinde aynı — yani satır artık her kitapta görünmüyor.

**Okuma bilgileri** kutusu:

İlk erişim / edinim şekli · İlk kez okuduğum şehir · Okuduğum medium ·
Yoğunluk · İlk okuduğum dönem · Kaç kez okudum? · Tekrar okur muyum ·
Kitap bende var mı? · Okuduğum dil

Etiket değişiklikleri: "İlk okunan şehir" → **İlk kez okuduğum şehir**,
"İlk kez okunan tarih" → **İlk okuduğum dönem**. Filtre sayfası başlığı da
(`FILTER_TITLES.city`) güncellendi.

Bu sıralamada **"Nasıl keşfettim / neden okudum"** satırları aşağıdaki
düzeltmeyle geri geldi ve "Yoğunluk"un üstüne yerleştirildi.

### Detay sayfalarında önceki/sonraki okları

Ekranın sol ve sağ kenarında, dikeyde ortada iki ok. Sağ ok **sonraki**,
sol ok **önceki** kayda gider. Dört türde de çalışır: kitap, film, dizi,
playlist.

- Sıra, o türün grid sayfasındaki sıranın aynısıdır (`sortItems(D[type],
  state.sort)`), yani "listedeki komşu" demektir. Detay sayfasına geçerken
  `resetFilters()` çalıştığı için sıra her zaman varsayılan `date`
  sıralamasıdır.
- Okların üzerinde ve `aria-label`'ında komşunun adı yazar
  (`Sonraki: Dune Tanrı İmparatoru`); fareyle gelince de görünür.
- Listenin başında sol ok, sonunda sağ ok **hiç basılmaz** — olmayan bir
  sayfaya giden buton gösterilmez.
- 700 px altında oklar küçülür (34×50 px) ve kenara yapışır.
- **Klavyeyle de aynı iş:** `←` ve `→` tuşları oka basılmış gibi davranır.
  Tuş işleyicisi sayfadaki `.nav-arrow.prev` / `.nav-arrow.next` öğesini
  bulup **o okun gittiği adrese** gider — yani iki yol tek kaynaktan çıkar,
  ileride biri değişirse diğeri de değişir. Doğrulandı: Tengri → (→) Dorian
  Gray → (→) Frankenstein → (←) Dorian Gray → (←) Tengri.
- Karşılanmayan durumlar: ok yoksa (liste başı/sonu, detay dışı sayfalar) hiç
  bir şey olmaz; `Shift`/`Ctrl`/`Cmd`/`Alt` ile ok tuşu kendi işini yapar
  (metin seçimi, tarayıcı gezinmesi); arama kutusu, açılır liste veya
  düzenlenebilir alan odaktayken dokunulmaz.

### Kitap detayında aynı yıl olan tarihler birleşiyor

`publishDateRows(item)`: orijinal ve Türkiye yayın yılı aynıysa tek satırda
**"Yayın tarihi"** gösteriyor, değilse iki ayrı satır duruyor.

199 kitaptan **77'sinde** yıl aynı, 119'unda farklı. Yılı okunamayanlar
(`basılmadı`, `bilinmiyor`) aynı sayılmıyor — "Zofloya Or The Moor"
(1806 / basılmadı) iki satır olarak kalıyor.

### İki etiket düzeltmesi

- `Okuduğum formatlar` → **Okuduğum medium**
- `Okunduğu dil` → **Okuduğum dil**

Aynı `formats` alanının filtre sayfası başlığı da (`FILTER_TITLES`) tutarlı
olsun diye güncellendi.

### Favoriler sayfası

- **Yazarlar**: istenen 10 kişi, istenen sırayla. Yazım veriden alınır, kod
  sabitinden değil; eşleştirme boşluğa duyarsız (`J.R.R. Tolkien` = `J. R. R.
  Tolkien`). Bulunamayan isim sessizce kaybolmaz, `console.warn` yazar.
- **Yönetmenler**: istenen 10 kişi, istenen sırayla.
- **Türler**: kitap 5, dizi 5, film 5 · türler tümü 10 · main label 10 ·
  müzik türleri 10.
- Her bloğun altında "Tüm N ... gör" bağlantısı. `/favs` 693 → **69
  bağlantı**.

### Yeni dizin sayfaları

- **`/yazarlar`** — 105 yazarın tamamı, sayıya göre sıralı; ada tıklayınca o
  yazarın 14 kitabı açılır.
- **`/yonetenler`** — 355 yönetmenin tamamı; ada tıklayınca o yönetmenin tüm
  filmleri açılır.

`/tur` ve `/etiket` zaten vardı. Dört dizin sayfası artık birbirine
bağlı (`DIZINLER` / `dizinSatiri()`), böylece her sayfadan diğerlerine tek
tıkla geçilir.

### `check-site.mjs`

`/yazarlar` ve `/yonetenler` rotaya eklendi; `/favs` eşiği 100 → 40 çekildi
(sayfa artık kısıtlı, 69 bağlantı).

### PowerShell ile dosya yamalarken

Bu turda üç hata birden yapıldı ve üçü de sessizdi:

1. `-replace` **arama dizesini regex sayar**. `${chips(...)}` içindeki
   parantezler deseni bozuyordu, "BULUNAMADI" hatası yanlış yere işaret
   ediyordu. Çözüm: `.Replace` (literal).
2. Çift tırnaklı PowerShell dizesi `${...}` ifadelerini **değerlendirir**.
   Yamalar tek tırnaklı olmalı; içerideki `'` çiftlenir.
3. Değişken adları **büyük/küçük harf duyarsızdır**: `$L` ile `$l` aynı
   değişkendir. Bir doğrulama betiği beklenen çıktı yerine dosyanın tamamını
   yazdı.

Ayrıca: Türkçe metni harf harf eşleyerek üretmek **yanlış**. Kural kelime
başı uygulanır; `sirayi` → `sırayı` (baştaki `s` değişmez), `etiketler`
içindeki `i` düz kalır. Harf harf eşleme `şırayı`, `etıketler`,
`taşııyan` gibi bozuk metinler üretti. Türkçe metin tek tırnaklı
here-string içinde **doğrudan yazılmalı**.



`scripts/build-data.mjs` içindeki `SCHEMAS[type]` listesine yeni alan adını ve
`scripts/sources.json` içindeki `required` listesine ekleyin. Alan JSON'a otomatik
düşer; sitede göstermek için `index.html` içindeki `detailSection(...)`
çağrısına bir satır ekleyin.
