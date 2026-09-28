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

## Ana sayfa favorileri

Ana sayfadaki **Favori filmler / Favori diziler / Favori kitaplar** blokları, Sheets'teki
`anasayfa sıra` (dizilerde `anasayfa sıralama`) sütunundaki numaraya göre sıralanır.
Bu sütunda değeri olan kayıtlar favoridir; sütunu boş olanlar listelere girmez.

- Başlıklar iki yazım da tanınır (`anasayfa sıra` ve `anasayfa sıralama`).
- Değer JSON'da `homeOrder` alanı olarak sayıya çevrilir.
- Sıra numarası vermek için Sheets'teki hücreye `1`, `2`, `3` … yazmanız yeterli;
  bir sonraki saatlik çalışmada site kendiliğinden güncellenir.
- Şu an her kategoride 12 favori var (6 + 6 = iki satır).

## Yeni başlık gelirse

`scripts/build-data.mjs` içindeki `SCHEMAS[type]` listesine yeni alan adını ve
`scripts/sources.json` içindeki `required` listesine ekleyin. Alan JSON'a otomatik
düşer; sitede göstermek için `arsiv-taslak-v6.html` içindeki `detailSection(...)`
çağrısına bir satır ekleyin.
