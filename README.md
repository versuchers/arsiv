# Arşiv — film, dizi, kitap

Statik tek sayfa arşiv. Veri **tarayıcıda Google Sheets'ten çekilmez**; GitHub Actions
saatlik olarak CSV'leri indirip `data/*.json` üretir, site bu dosyaları `no-cache`
ile okur.

## Klasör yapısı

```
index.html                  site (arsiv-taslak-v6.html ile aynı içerik)
404.html                    doğrudan detay adresi yenilendiğinde fallback
arsiv-taslak-v6.html        çalışma dosyası
data/
  books.json                Kitaplar  (üretilir)
  films.json                Filmler   (üretilir)
  series.json               Diziler   (üretilir)
scripts/
  build-data.mjs            CSV -> JSON dönüştürücü + doğrulamalar
  sources.json              kaynak CSV adresleri ve zorunlu başlıklar
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
## Yeni başlık gelirse

`scripts/build-data.mjs` içindeki `SCHEMAS[type]` listesine yeni alan adını ve
`scripts/sources.json` içindeki `required` listesine ekleyin. Alan JSON'a otomatik
düşer; sitede göstermek için `arsiv-taslak-v6.html` içindeki `detailSection(...)`
çağrısına bir satır ekleyin.
