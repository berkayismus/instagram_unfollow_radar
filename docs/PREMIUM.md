# Instagram Unfollow Radar — Premium

Bu belge, **Ücretsiz** ve **Premium** planlar arasındaki farkları, lisansın nasıl çalıştığını ve geliştiriciler için teknik özetini açıklar. Arayüzdeki karşılaştırma tablosu **Premium** sekmesinde gösterilir.

---

## Özet

| | Ücretsiz | Premium |
|---|:---:|:---:|
| **Günlük takipten çıkarma limiti** (24 saat) | 10 | 500 |
| **İzleme listesi** (izlenen hesap sayısı) | 1 | 10 |
| **Geri alma (Undo)** | ✓ | ✓ |
| **Filtreler & Whitelist** | ✓ | ✓ |
| **İstatistikler** (grafik) | ✓ | ✓ |
| **CSV dışa aktarma** | 🔒 | ✓ |
| **Öncelikli destek** | — | ✓ |

**Fiyatlandırma (UI):** Gumroad üzerinden abonelik; popup metninde **$1/ay** ifadesi kullanılır — fiyat değişirse `locales/*.json` içindeki `premium.buyBtn` güncellenmelidir.

Premium’dan ücretsize dönüşte veya sekme açılışında liste, ücretsiz kotayı aşıyorsa **ilk N kayıt** saklanır (`IGRadarWatchlistLimits.enforceStorageLimit`).

---

## Lisansı etkinleştirme

1. Uzantıda **Premium** sekmesine gidin.
2. **Gumroad’dan Satın Al** ile ürün sayfasına gidin ve satın alın.
3. E-postanıza gelen **lisans anahtarını** aynı sekmedeki alana yapıştırıp **Etkinleştir**’e basın.
4. Başarılı doğrulamada `chrome.storage.local` içinde premium bayrağı ve (varsa) satın alma e-postası saklanır; günlük limit içerik betiğinde **500** olarak uygulanır.

**Aboneliği iptal / lisansı kaldırma**

- Aboneliği sonlandırmak için Gumroad hesabınızdan işlem yaparsınız (popup’taki **Aboneliği Yönet** → `Constants.GUMROAD.MANAGE_URL`).
- Uzantı içinde **Lisansı Kaldır** ile yerel olarak ücretsiz plana dönebilirsiniz; bu, Gumroad tarafındaki aboneliği otomatik iptal etmez.

---

## Gizlilik ve ağ trafiği

- Ana unfollow akışı Instagram ve yerel depolama üzerinden çalışır; işlem verileri uzantı geliştiricisinin sunucusuna gönderilmez.
- **Lisans doğrulaması** sırasında tarayıcı, Gumroad’un resmi API’sine (`Constants.GUMROAD.VERIFY_URL`) istek atar; gönderilen veri lisans doğrulaması için gerekli alanlarla sınırlıdır. Ayrıntılar için [PRIVACY_POLICY.md](./PRIVACY_POLICY.md).

---

## Teknik referans (kod)

| Konu | Konum / sabit |
|------|----------------|
| Günlük limitler | `Constants.LIMITS.FREE_DAILY_LIMIT` (10), `PREMIUM_DAILY_LIMIT` (500) |
| İzleme listesi kotası | `Constants.WATCH_LIST.MAX_ENTRIES_FREE` (1), `MAX_ENTRIES_PREMIUM` (10) — `src/shared/watchlistLimits.js`, `src/content/watchlist.js` |
| Limitin uygulanması | `src/content/automation.js` — `state.dailyLimit` |
| Premium + lisans depolama | `Constants.STORAGE_KEYS.IS_PREMIUM`, `LICENSE_KEY`, `LICENSE_EMAIL` — `src/content/storage.js` |
| Lisans doğrulama (popup) | `src/popup/events.js` — Gumroad `verify` API |
| CSV kilidi | `src/popup/ui.js` — `handleExportCsv`, Premium yoksa Premium sekmesine yönlendirme |
| Gumroad ürün permalink | `Constants.GUMROAD.PRODUCT_PERMALINK` — satın alma linki `ui.js` / `renderPremiumStatus` içinde oluşturulur |

Sabitler veya ürün kimliği değiştiğinde `src/shared/constants.js` ve çeviri dosyalarını birlikte güncelleyin.

---

## İlgili belgeler

- [FEATURES.md](./FEATURES.md) — Tüm özelliklerin kısa özeti (Premium bölümüne bakın).
- [TECHNICAL.md](./TECHNICAL.md) — Genel mimari ve mesajlaşma.
- [STORE_DESCRIPTION.md](./STORE_DESCRIPTION.md) — Mağaza listesi metinleri.
