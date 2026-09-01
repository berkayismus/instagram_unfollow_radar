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
| `src/content/storage.js` | Sayaç, geçmiş, checkpoint, aktivite, tanı ve watchlist depolama işlemleri |
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
7. Faz, pagination cursor’ı, takipçi kümesi ve bekleyen kuyruk her sayfadan ve işlemden sonra checkpoint’e yazılır.
8. Popup için son 50 işlenen kullanıcı hesap kapsamında saklanır.

Takipçi taraması eksik kalırsa unfollow aşamasına geçilmez. Dry-run aynı karşılaştırmayı yapar ancak gerçek sayaçları ve geçmişi değiştirmez. Aynı hesap ve dry-run modu için 24 saatten yeni checkpoint sayfa açılışında otomatik sürdürülür. Popup kapanınca content script çalışmaya devam eder; yeniden açılışta `GET_STATUS` snapshot’ı ve aktivite listesi geri yüklenir. Açıkça durdurma checkpoint’i ve cooldown’ı terminal biçimde temizler.

## Çalışma kilidi

- Service worker kilit işlemlerini seri yürütür.
- Lease süresi 45 saniye, heartbeat aralığı 15 saniyedir.
- Farklı sekme aktif lease varken yeni çalışma başlatamaz.
- Lease kaybı veya Instagram hesabı değişikliği otomasyonu durdurur.

Çalışma lease’i eşzamanlılığı, checkpoint ise kalıcı ilerlemeyi korur. Yenilenen sekme önce yeni lease alır, ardından kayıtlı faz ve cursor’dan devam eder.

## Instagram çağrıları

| İşlem | Endpoint |
|---|---|
| Takipçiler | `GET /api/v1/friendships/{id}/followers/` |
| Takip edilenler | `GET /api/v1/friendships/{id}/following/` |
| Profil | `GET /api/v1/users/web_profile_info/` |
| Unfollow | `POST /api/v1/friendships/destroy/{id}/` |
| Refollow | `POST /api/v1/friendships/create/{id}/` |
| İlişki doğrulama | `GET /api/v1/friendships/show/{id}/` |
| Unfollow fallback | `POST /web/friendships/{id}/unfollow/` |
| Refollow fallback | `POST /web/friendships/{id}/follow/` |

Kimlik doğrulama mevcut Instagram oturumu, CSRF cookie’si ve web App ID üzerinden yapılır. API belgelenmemiştir; yanıt yapıları değişebilir.

API katmanı hataları `auth_required`, `challenge_required`, `rate_limit`, `network_error`, `server_error`, `invalid_response` ve genel `api_error` kodlarına dönüştürür. Salt-okuma isteği geçici ağ/sunucu/geçersiz yanıtında bir kez yinelenir. Ana yazma endpoint’i HTML döndürürse mevcut ilişki kontrol edilir; değişiklik zaten uygulanmışsa ikinci POST gönderilmez, uygulanmamışsa web fallback çalışır ve sonucu yeniden doğrulanır. Belirsizlikte aday checkpoint’e geri konur ve süreç güvenle durur.

## Kota ve zamanlama

| Ayar | Değer |
|---|---:|
| API sayfa boyutu | 50 |
| Gerçek işlem gecikmesi | 5–10 sn |
| Ek insan benzeri duraklama | %10 olasılıkla 5–15 sn |
| Ücretsiz kota | 10 / 24 saat |
| Premium kota | 500 / 24 saat |
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
| Çalışma | `igRateLimitUntil`, `igActiveRunLock`, `igRunCheckpoint`, `igRunActivity` |
| Tanı | `igApiDiagnostic` |

Instagram’a bağlı anahtarlar `::<account-id>` son ekiyle ayrı namespace’lerde tutulur. Kota, filtreler, geçmiş, undo, watchlist, checkpoint, popup aktivitesi ve API tanısı hesap kapsamındadır; tema, dil, popup sekmesi, lisans ve extension-geneli çalışma kilidi globaldir. API tanısı yalnızca kod, endpoint kategorisi, neden, HTTP durumu ve zaman içerir. Eski kapsamlandırılmamış veri, ilk görülen hesaba mevcut scoped veriyi ezmeden bir kez taşınır.

## Mesajlaşma

Popup → content eylemleri arasında `START`, `STOP`, `GET_STATUS`, filtre güncellemeleri, undo ve watchlist işlemleri bulunur. Content → popup durumları `STATUS_UPDATE`, `USER_PROCESSED` ve `RATE_LIMIT_HIT` mesajlarıdır. Content → background yalnızca run-lock acquire/renew/release mesajlarını gönderir.

## Premium

Popup lisans anahtarını Gumroad `licenses/verify` endpoint’ine gönderir. Service worker alarmı ve popup açılışı 12 saatlik aralıkla yeniden doğrulama yapar. `refunded`, `disputed`, `chargebacked` veya abonelik bitiş alanları doluysa Premium hemen kapatılır. Yalnızca ağ/sunucu hatalarında son başarılı kontrolden itibaren 72 saatlik offline grace period uygulanır; güncel durum açık Instagram sekmelerine iletilir.

## Test ve paketleme

```bash
npm test
npm run check
npm run package
```

Testler Node’un yerleşik test runner’ını tek worker ile kullanır. Popup yeniden açılma, Stop, stale checkpoint, storage yarışları ve Instagram yanıt/fallback varyantları regresyon kapsamındadır. Paketleme scripti sabit dosya sırası, zaman damgası ve izinlerle deterministik ZIP üretir. GitHub Actions PR’larda kontrolleri çalıştırır ve mağaza paketini artifact olarak oluşturur.
