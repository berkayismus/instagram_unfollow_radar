# Chrome Web Store — Extension Description

> Referans: özellik özeti ve limitler [FEATURES.md](./FEATURES.md) ile uyumludur.

## Short Description

> Max 132 characters — paste this into the "Short description" field on the Store dashboard and into `manifest.json`.

```
Find non-followers on Instagram: safe delays, filters, dry-run & stats. Free 10/day, Premium 500/day. TR, EN & DE.
```

*(≈114 karakter / Chrome Web Store kısa açıklama üst sınırı 132.)*

---

## Detailed Description

> Paste everything below the horizontal rule into the "Detailed description" field on the Store dashboard (plain text, no Markdown rendering).

---

INSTAGRAM UNFOLLOW RADAR

Instagram’da oturumunuz açıkken, sizi geri takip etmeyen hesapları bulur; isteğe bağlı olarak güvenli gecikmelerle takipten çıkmanıza yardımcı olur. Veriler cihazınızda kalır; şifreniz okunmaz.

Tarayıcı betikleri veya şifre isteyen üçüncü taraf sitelerinin aksine, uzantı Instagram’ın web uygulamasının kullandığı dahili API ile yalnızca mevcut oturumunuz üzerinden çalışır.

---

HOW IT WORKS

1. Takipçi listenizi indirir ve takip ettiğiniz hesaplarla karşılaştırır; geri takip etmeyenler sıraya alınır.
2. İşlemler instagram.com bağlamında, yerel bellek ve tarayıcı depolaması ile yürütülür.

Her işlem arasında yaklaşık 5–10 saniye rastgele bekleme uygulanır (doğal kullanım ve hız sınırı riskini azaltmak için).

---

FEATURES

✅ Otomatik tespit: takipçi listesi ile takip listesi karşılaştırması (DOM kazıma yok)
✅ Güvenli gecikme: işlemler arası yaklaşık 5–10 sn rastgele bekleme
✅ Günlük limit: ücretsiz 10 / Premium 500 takipten çıkarma (24 saatte bir sıfırlanır)
✅ Toplu duraklama: ilk 50 işlemden sonra devam etmek için onay ister
✅ Dry run: gerçekten takipten çıkmadan kimlerin çıkarılacağını önizleme
✅ Geri alma (Undo): son işlemlerden en fazla 10 hesabı tek tıkla yeniden takip etme
✅ Filtreler: beyaz liste (asla çıkarılmaz) ve anahtar kelime ile atlama
✅ İstatistikler: son 30 güne ait özet grafik
✅ CSV dışa aktarma: yalnızca Premium
✅ İzleme listesi: belirli hesaplarda yeni takipleri takip (ücretsiz 1 hesap, Premium 10 hesap); yenileme ve 24 saatlik pencere Instagram’ın verdiği bilgiyle sınırlıdır
✅ Açık / koyu tema
✅ Dil: Türkçe, İngilizce, Almanca

---

PREMIUM (OPSİYONEL)

Premium ile günlük 500 limit, CSV indirme ve daha geniş izleme listesi (10 hesap) sunulur. Lisans, satın alma sonrası e-posta ile gelen anahtarla uzantı içinde etkinleştirilir; abonelik yönetimi satıcı (Gumroad) üzerinden yapılır. Ayrıntılı plan özeti için geliştirici sitesindeki özellik dokümanına bakın.

---

PRIVACY & PERMISSIONS

Ana iş akışı: veriler cihazınızda kalır; Instagram oturumunuz dışında unfollow süreci için harici bir sunucuya hesap verisi gönderilmez.

Premium lisans doğrulaması yalnızca etkinleştirme sırasında Gumroad’un resmi API’sine gider.

İzinler (Manifest ile uyumlu):

• storage — ayarlar, istatistikler, listeler ve yerel tercihler
• instagram.com — mevcut oturum çerezleriyle dahili API istekleri
• api.gumroad.com — yalnızca isteğe bağlı Premium lisans doğrulaması

Kimlik bilgileriniz okunmaz veya saklanmaz.

---

USAGE

1. instagram.com’da oturum açın
2. Araç çubuğundan uzantı simgesine tıklayın
3. (İsteğe bağlı) Filtreler sekmesinden beyaz liste veya anahtar kelimeler ekleyin
4. (İsteğe bağlı) Dry run ile önce test edin
5. Başlat — tarama ve işlem otomatik devam eder
6. İlk 50 işlemden sonra onay istenir; Devam ile ilerleyin
7. İstediğiniz zaman Durdur

---

IMPORTANT NOTES

• Uzantı yalnızca instagram.com’da oturum varken anlamlı çalışır
• Instagram API hız sınırı uygulayabilir; geçici duraklama sonrası uzantı yaklaşık 15 dakika sonra otomatik devam etmeyi dener
• Instagram dahili API’si haber vermeden değişebilir; bu geçici olarak uyumluluğu etkileyebilir
• Sorumlu kullanın; risk size aittir

---

## English variant (optional second paste)

If the Store listing is English-only, use this block instead of the Turkish detailed text above the horizontal rule.

---

INSTAGRAM UNFOLLOW RADAR

While you’re signed in to Instagram in your browser, finds accounts you follow that don’t follow you back — optionally unfollows them with safe delays. Data stays on your device; your password is never read.

Unlike bookmarklets or third-party sites that ask for your password, this extension uses Instagram’s internal web API with your existing session only.

---

HOW IT WORKS

1. Downloads your followers list and compares it with accounts you follow; non-followers are queued.
2. Runs in the instagram.com context using local memory and browser storage.

Each action uses a random ~5–10 second delay to reduce rate-limit risk.

---

FEATURES

✅ Automatic detection: followers vs following comparison (no DOM scraping)
✅ Safe delays: ~5–10 seconds between actions
✅ Daily limit: 10 on Free / 500 on Premium (resets every 24 hours)
✅ Batch pause: asks for confirmation after the first 50 actions
✅ Dry run: preview who would be unfollowed without changing anything
✅ Undo: re-follow up to 10 recent unfollows with one click
✅ Filters: whitelist (never unfollow) and keyword skip rules
✅ Statistics: 30-day summary chart
✅ CSV export: Premium only
✅ Watch list: track new follows for watched accounts (1 on Free, 10 on Premium); refresh + 24h window, limited by what Instagram exposes
✅ Light / dark theme
✅ Languages: Turkish, English, German

---

PREMIUM (OPTIONAL)

Premium unlocks 500/day, CSV export, and a larger watch list (10 accounts). Activate with the license key from your purchase email inside the extension; manage billing via the seller (Gumroad).

---

PRIVACY & PERMISSIONS

Core workflow: data stays local; unfollow processing does not send your Instagram data to the developer’s servers.

Premium license verification contacts Gumroad’s official API only when you activate.

Permissions:

• storage — settings, stats, lists, preferences
• instagram.com — internal API calls with your session
• api.gumroad.com — optional Premium license verification only

Your credentials are not read or stored.

---

USAGE

1. Sign in at instagram.com
2. Click the extension icon
3. (Optional) Add whitelist or keywords in Filters
4. (Optional) Enable dry run first
5. Click Start — scan runs automatically
6. After 50 actions, confirm to continue
7. Stop anytime

---

IMPORTANT NOTES

• Requires an active instagram.com session
• Instagram may rate-limit; the extension can pause ~15 minutes and resume
• Instagram’s internal API may change without notice
• Use responsibly at your own risk
