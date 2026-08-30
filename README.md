# Instagram Unfollow Radar

Instagram’da oturumunuz açıkken takipçi ve takip edilen listelerini karşılaştıran Chrome uzantısıdır. Geri takip etmeyen hesapları filtrelere göre belirler ve rastgele gecikmelerle otomatik olarak takipten çıkarabilir.

> Bu proje Instagram’ın belgelenmemiş web API’lerini kullanır. Instagram değişiklikleri işlevleri bozabilir; yoğun kullanım hesap kısıtlamasına yol açabilir.

## Planlar

| Özellik | Ücretsiz | Premium |
|---|---:|---:|
| 24 saatlik unfollow limiti | 10 | 500 |
| İzleme listesi | 1 hesap | 10 hesap |
| Filtreler, dry-run, undo, istatistik | ✓ | ✓ |
| CSV dışa aktarma | — | ✓ |

Premium Gumroad üzerinden etkinleştirilir: [cayliverse.gumroad.com/l/vnzrgn](https://cayliverse.gumroad.com/l/vnzrgn).
Lisans durumu 12 saatte bir doğrulanır; geçici ağ kesintilerinde en fazla 72 saatlik offline süre uygulanır.

## Temel özellikler

- Takipçi ve takip edilen listelerini karşılaştırma
- Whitelist ve anahtar kelime filtreleri
- Gerçek işlem yapmadan dry-run
- İşlemler arasında 5–10 saniye rastgele bekleme
- Son 10 işlemi geri alma
- 30 günlük istatistik ve Premium CSV dışa aktarımı
- TR, EN ve DE arayüz
- Aynı anda yalnızca bir Instagram sekmesinde otomasyon
- Sayfa yenileme ve Instagram rate-limit sonrasında otomatik devam
- Instagram hesabına göre ayrı kota, filtre, geçmiş ve izleme verisi
- Çalışma sırasında hesap değişirse güvenli durdurma
- İzleme listesinde yalnızca tam alınan snapshot’ları karşılaştırma

Otomasyon günlük kotaya ulaşana, açıkça durdurulana veya güvenlik koşullarından biri tetiklenene kadar ek onay istemeden devam eder.

## Kurulum

1. Depoyu indirin.
2. Chrome’da `chrome://extensions` sayfasını açın.
3. **Developer mode** seçeneğini etkinleştirin.
4. **Load unpacked** ile proje klasörünü seçin.
5. Instagram’ı açıp giriş yaptıktan sonra uzantıyı çalıştırın.

## Kullanım

1. İsterseniz whitelist, anahtar kelime ve dry-run ayarlarını yapın.
2. **Başlat** düğmesine basın.
3. Uzantı önce takipçi listesini tamamen alır, ardından takip edilenleri tarar.
4. İlerleme yerelde saklanır; aynı hesapta sayfa yenilenirse veya rate-limit süresi dolarsa otomatik devam eder.
5. Eksik takipçi verisi, hesap değişikliği veya kaybedilen çalışma kilidi algılanırsa süreç güvenle durur.
6. **Durdur** ile süreci ve kayıtlı ilerlemeyi sonlandırabilir, **Geri Al** ile son başarılı işlemleri geri çevirebilirsiniz.

## Gizlilik

Instagram verileri geliştirici sunucusuna gönderilmez. Takipçi karşılaştırması tarayıcıda yapılır ve ayarlar/geçmiş `chrome.storage.local` içinde tutulur. Premium etkinleştirmede lisans anahtarı Gumroad API’sine gönderilir; ayrıntılar [gizlilik politikasında](docs/PRIVACY_POLICY.md) açıklanır.

## Geliştirme

```bash
npm test          # testler
npm run check     # testler + JavaScript sözdizimi
npm run package   # deterministik mağaza ZIP'i
```

Ana yapı:

```text
manifest.json
src/background/   extension-geneli çalışma kilidi
src/content/      Instagram API, storage, filtre, otomasyon, watchlist
src/popup/        popup arayüzü ve olaylar
src/shared/       sabitler, i18n ve ortak limitler
locales/          TR, EN, DE çeviriler
tests/            Node tabanlı regresyon testleri
```

Belgeler:

- [Özellikler](docs/FEATURES.md)
- [Premium](docs/PREMIUM.md)
- [Teknik mimari](docs/TECHNICAL.md)
- [Gizlilik politikası](docs/PRIVACY_POLICY.md)
- [Yol haritası](docs/ROADMAP.md)

## English

Instagram Unfollow Radar is a Chrome extension that compares your followers and following lists, applies local filters, and can automatically unfollow non-followers with randomized delays. Data processing stays in the browser; Premium activation contacts Gumroad. See the documents above for implementation and privacy details.
