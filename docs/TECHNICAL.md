# Teknik Mimari

## Genel yapı

Uzantı Manifest V3, vanilla JavaScript ve `chrome.storage.local` kullanır. Bundle/transpile adımı yoktur; mağaza paketi doğrudan kaynak dosyalardan oluşturulur.

```text
Popup ──tabs.sendMessage──> Instagram content script ──fetch──> Instagram API
                                      │
                                      └──runtime.sendMessage──> Service worker
                                                  çalışma lease'i
```

Popup durum mesajlarını content script’ten doğrudan alır. Service worker yalnızca extension-geneli çalışma kilidini yönetir.

## Modüller

| Dosya | Sorumluluk |
|---|---|
| `src/background/index.js` | Tek aktif çalışma lease’i, heartbeat yenileme ve stale lock temizliği |
| `src/content/api.js` | Instagram GET/POST çağrıları ve cookie tabanlı kimlik |
| `src/content/storage.js` | Sayaç, geçmiş, lisans ve watchlist depolama işlemleri |
| `src/content/filters.js` | Whitelist ve anahtar kelime kontrolü |
| `src/content/automation.js` | Takipçi seti, following taraması ve unfollow döngüsü |
| `src/content/watchlist.js` | Tam snapshot baseline’ı ve yeni takip karşılaştırması |
| `src/content/index.js` | Content state, mesaj router’ı, run lease ve hesap koruması |
| `src/popup/*` | Arayüz, kullanıcı olayları ve CSV |
| `src/shared/*` | Sabitler, çeviri ve plan limitleri |

Content dosyaları `manifest.json` sırasıyla yüklenir ve IIFE namespace’leri paylaşır.

## Otomasyon akışı

1. Content script service worker’dan çalışma lease’i alır.
2. `ds_user_id` ile aktif Instagram hesabı sabitlenir.
3. Tüm takipçi sayfaları alınarak ID kümesi oluşturulur.
4. Takip edilen sayfaları taranır; takipçi kümesinde olmayan ve filtrelenmeyen kullanıcılar kuyruğa eklenir.
5. Kuyruk otomatik işlenir; her gerçek işlemden önce hesap kimliği tekrar doğrulanır.
6. Başarıyla tamamlanan işlemler sayaç, geçmiş ve undo kuyruğuna yazılır.

Takipçi taraması eksik kalırsa unfollow aşamasına geçilmez. Dry-run aynı karşılaştırmayı yapar ancak gerçek sayaçları ve geçmişi değiştirmez.

## Çalışma kilidi

- Service worker kilit işlemlerini seri yürütür.
- Lease süresi 45 saniye, heartbeat aralığı 15 saniyedir.
- Farklı sekme aktif lease varken yeni çalışma başlatamaz.
- Lease kaybı veya Instagram hesabı değişikliği otomasyonu durdurur.

Bu mekanizma checkpoint değildir. Sekme yenileme sonrası taramanın kaldığı yerden devam etmesi henüz desteklenmez.

## Instagram çağrıları

| İşlem | Endpoint |
|---|---|
| Takipçiler | `GET /api/v1/friendships/{id}/followers/` |
| Takip edilenler | `GET /api/v1/friendships/{id}/following/` |
| Profil | `GET /api/v1/users/web_profile_info/` |
| Unfollow | `POST /api/v1/friendships/destroy/{id}/` |
| Refollow | `POST /api/v1/friendships/create/{id}/` |

Kimlik doğrulama mevcut Instagram oturumu, CSRF cookie’si ve web App ID üzerinden yapılır. API belgelenmemiştir; yanıt yapıları değişebilir.

## Kota ve zamanlama

| Ayar | Değer |
|---|---:|
| API sayfa boyutu | 50 |
| Gerçek işlem gecikmesi | 5–10 sn |
| Ek insan benzeri duraklama | %10 olasılıkla 5–15 sn |
| Ücretsiz kota | 10 / 24 saat |
| Premium kota | 500 / 24 saat |
| Legacy batch duraklaması | İlk onaya kadar 50 işlenen aday |
| Undo kuyruğu | 10 |

İstatistik sıfırlama 24 saatlik kota penceresini değiştirmez.

## Watchlist

Watchlist mutation’ları tek kuyrukta seri yürütülür. Snapshot yalnızca şu koşullarda baseline olur:

- istek hata vermemiştir;
- pagination cursor kalmamıştır;
- profil following sayısı ile alınan benzersiz ID sayısı kabul edilen tolerans içindedir.

Eksik snapshot mevcut baseline’ı değiştirmez. `watchSchema: 4`, sıfır following’e sahip hesaplarda da baseline’ın hazır olduğunu ayırt eden `snapshotReady` alanını kullanır. Bir yenilemede en fazla 10 sayfa alınır.

## Depolama

Başlıca anahtarlar:

| Grup | Anahtarlar |
|---|---|
| Kota | `igSessionCount`, `igSessionStart`, `igTotalUnfollowed`, `igLastRun` |
| Filtre | `igKeywords`, `igWhitelist`, `igDryRunMode` |
| Geçmiş | `igUndoQueue`, `igUnfollowStats`, `igUnfollowHistory` |
| Premium | `igIsPremium`, `igLicenseKey`, `igLicenseEmail` |
| Watchlist | `igWatchList` |
| UI | `igTheme`, `igLanguage`, `igPopupActiveTab` |
| Çalışma | `igRateLimitUntil`, `igActiveRunLock` |

Veri doğrulama ve hesap kimliğine göre ayrı namespace kullanımı henüz uygulanmamıştır.

## Mesajlaşma

Popup → content eylemleri arasında `START`, `STOP`, `GET_STATUS`, filtre güncellemeleri, undo ve watchlist işlemleri bulunur. Content → popup durumları `STATUS_UPDATE`, `USER_PROCESSED`, `RATE_LIMIT_HIT` ve `TEST_COMPLETE` mesajlarıdır. Content → background yalnızca run-lock acquire/renew/release mesajlarını gönderir.

## Premium

Popup lisans anahtarını Gumroad `licenses/verify` endpoint’ine gönderir. Başarılı sonuç yerel Premium durumuna yazılır. Periyodik yeniden doğrulama, iade/chargeback kontrolü ve offline grace period henüz yoktur.

## Test ve paketleme

```bash
npm test
npm run check
npm run package
```

Testler Node’un yerleşik test runner’ını kullanır. Paketleme scripti sabit dosya sırası, zaman damgası ve izinlerle deterministik ZIP üretir. GitHub Actions PR’larda test/sözdizimi kontrolü yapar ve mağaza paketini artifact olarak oluşturur.
