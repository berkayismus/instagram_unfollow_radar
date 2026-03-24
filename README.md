# Instagram Unfollow Radar — Chrome Extension

> 🇹🇷 [Türkçe](#türkçe) | 🇬🇧 [English](#english)

---

## Türkçe

Instagram’da oturumunuz açıkken, sizi geri takip etmeyen hesapları bulur; isteğe bağlı olarak güvenli gecikmelerle takipten çıkmanıza yardımcı olur. **Veriler cihazınızda kalır; şifreniz okunmaz.** Ücretsiz ve Premium planları vardır. Özellik özeti: [`docs/FEATURES.md`](docs/FEATURES.md) · plan / lisans: [`docs/PREMIUM.md`](docs/PREMIUM.md).

### 💎 Planlar

| Özellik | Ücretsiz | Premium ($1/ay) |
|---|:---:|:---:|
| Günlük unfollow limiti | **10** | **500** |
| İzleme listesi (hesap) | **1** | **10** |
| Otomatik tespit & tarama | ✓ | ✓ |
| Filtreler & Whitelist | ✓ | ✓ |
| Dry-Run (Test) Modu | ✓ | ✓ |
| Geri Alma (Undo) | ✓ | ✓ |
| 30 Günlük İstatistikler | ✓ | ✓ |
| CSV Dışa Aktarma | — | ✓ |
| Öncelikli Destek | — | ✓ |

Premium'a geçmek için: [cayliverse.gumroad.com/l/vnzrgn](https://cayliverse.gumroad.com/l/vnzrgn)

### 🎯 Özellikler

FEATURES özetiyle uyumlu ana başlıklar:

- ✅ **Tarama**: Takipçi listesi ile takip listesi karşılaştırılır; geri takip etmeyenler sıraya alınır
- ✅ **Gecikme**: Her işlem arasında yaklaşık **5–10 sn** rastgele bekleme
- ✅ **Günlük limit**: Ücretsiz **10** / Premium **500** takipten çıkarma; limit **24 saatte** bir sıfırlanır
- ✅ **Toplu duraklama**: İlk **50 işlem**den sonra devam için onay ister
- ✅ **Dry run**: Gerçekten takipten çıkmadan “kim çıkarılacaktı” simülasyonu
- ✅ **Geri alma (Undo)**: Son işlemlerden en fazla **10** hesabı tekrar takip etme
- ✅ **Filtreler**: **Whitelist** (asla çıkarılmaz) ve **anahtar kelime** ile atlama
- ✅ **İstatistikler**: Son **30 gün** özet grafik; **CSV** yalnızca Premium
- ✅ **İzleme listesi**: İzlenen hesap kotası ücretsiz **1** / Premium **10**; **Yenile** ile güncelleme; listeye ekledikten sonraki **24 saat** içinde profil takip sayısı artışına göre yeni takipler (Instagram verisiyle sınırlı)
- ✅ **Arayüz**: Açık / koyu tema · **Türkçe, İngilizce, Almanca**

### 📦 Kurulum (Geliştirici Modu)

1. Bu klasörü bilgisayarına indirin
2. Chrome'da `chrome://extensions` sayfasını açın
3. Sağ üstten **Developer mode**'u aktif edin
4. **Load unpacked** butonuna tıklayın
5. Bu klasörü seçin
6. Eklenti yüklendi! 🎉

### 🚀 Kullanım

1. **instagram.com**'a gidin ve hesabınıza giriş yapın
2. Eklenti simgesine tıklayın
3. **(Opsiyonel)** Filtreler sekmesinden anahtar kelime veya whitelist ekleyin; **İzleme** sekmesinden hesap izlemek için kullanıcı ekleyin
4. **(Opsiyonel)** Dry-run modunu açın
5. **Başlat** butonuna tıklayın
6. Eklenti önce tüm takipçi listeni indirir, ardından takip ettiğin kişilerle karşılaştırır
7. İlk 50 işlemden sonra onay ister — **Devam Et** ile devam edin
8. İstediğiniz zaman **Durdur** ile durdurun

### 🔑 Premium Lisans Aktivasyonu

1. [cayliverse.gumroad.com/l/vnzrgn](https://cayliverse.gumroad.com/l/vnzrgn) adresinden satın alın
2. E-postanıza gelen lisans anahtarını kopyalayın
3. Eklentide **Premium** sekmesini açın
4. Anahtarı ilgili alana yapıştırıp **Etkinleştir**'e tıklayın
5. Günlük limit 10'dan 500'e yükseler, izleme listesi 10 hesaba çıkar, CSV dışa aktarım açılır; abonelik iptali **Gumroad** üzerinden

### 🔒 Gizlilik (kısa)

Ana iş akışı için veriler harici sunucuya gönderilmez; istekler `instagram.com` oturumunuz ve **yerel depolama** ile çalışır. **Premium** lisans doğrulaması yalnızca **Gumroad API**’sine gider.

### ⚙️ Teknik Detaylar

#### Instagram Internal API Kullanımı

Bu eklenti **DOM scraping yapmaz**. Instagram'ın web uygulamasının kullandığı internal API endpoint'leri kullanır:

| İşlem | Endpoint |
|---|---|
| Takipçi listesi çekme | `GET /api/v1/friendships/{userId}/followers/` |
| Takip listesi çekme | `GET /api/v1/friendships/{userId}/following/` |
| Takipten çıkma | `POST /api/v1/friendships/destroy/{userId}/` |
| Geri takip (undo) | `POST /api/v1/friendships/create/{userId}/` |

- **Kullanıcı ID**: `ds_user_id` cookie'sinden otomatik alınır
- **CSRF Token**: `csrftoken` cookie'sinden otomatik alınır
- **App ID**: Instagram web app'ın sabit App ID'si kullanılır

#### Lisans Doğrulama

Gumroad API'si kullanılır (`POST https://api.gumroad.com/v2/licenses/verify`). Lisans bilgisi `chrome.storage.local`'da saklanır. Ana unfollow akışı dışında tek zorunlu harici çağrı budur (FEATURES.md teknik özetiyle uyumlu).

#### Rate Limit

- Unfollow işlemleri: ~60 işlem/saat
- API sorguları: ~200 istek/saat

Bu yüzden işlemler arası bekleme süresi 5–10 saniyedir.

#### Dosya Yapısı

```
instagram_unfollow_radar/
├── manifest.json              # Extension configuration (Manifest V3)
├── README.md                  # Bu dosya
├── src/
│   ├── background/
│   │   └── index.js           # Service worker (mesaj relay)
│   ├── content/
│   │   ├── api.js             # Instagram private API çağrıları
│   │   ├── storage.js         # chrome.storage.local işlemleri
│   │   ├── filters.js         # Whitelist / keyword filtresi
│   │   ├── automation.js      # 2 fazlı tarama + unfollow motoru
│   │   ├── watchlist.js       # İzleme listesi (snapshot / diff)
│   │   └── index.js           # Merkezi state + mesaj router
│   ├── popup/
│   │   ├── popup.html         # 5 sekme: Ana / Filtreler / İzleme / İstatistikler / Premium
│   │   ├── popup.js           # Init + mesaj router
│   │   ├── ui.js              # Tüm DOM manipülasyonu
│   │   ├── events.js          # Kullanıcı event handler'ları
│   │   └── popup.css          # Instagram gradient tema
│   └── shared/
│       ├── constants.js       # Merkezi konfigürasyon (limitler, Gumroad config)
│       ├── watchlistLimits.js # İzleme listesi kotası (free / premium)
│       └── i18n.js            # Çok dil desteği
├── assets/icons/              # Eklenti ikonları
├── locales/
│   ├── tr.json                # Türkçe
│   ├── en.json                # İngilizce
│   └── de.json                # Almanca
└── vendor/
    └── chartist.*             # Grafik kütüphanesi
```

### ⚠️ Önemli Uyarılar

1. **Rate Limit**: Instagram günlük işlem limitleri uygular. Aşırı kullanım hesap kısıtlamalarına yol açabilir.
2. **Giriş Zorunlu**: Eklenti yalnızca `instagram.com`'da oturum açıkken çalışır.
3. **Internal API**: Instagram internal API'yi herhangi bir zamanda değiştirebilir.
4. **Sorumluluk**: Bu eklentiyi kendi sorumluluğunuzda kullanın.

---

## English

While you’re signed in to Instagram in your browser, finds accounts you follow that don’t follow you back — optionally unfollows them with safe delays. **Data stays on your device; your password is never read.** Free and Premium plans. Feature summary: [`docs/FEATURES.md`](docs/FEATURES.md) · plans / license: [`docs/PREMIUM.md`](docs/PREMIUM.md).

### 💎 Plans

| Feature | Free | Premium ($1/mo) |
|---|:---:|:---:|
| Daily unfollow limit | **10** | **500** |
| Watch list (accounts) | **1** | **10** |
| Automatic detection & scan | ✓ | ✓ |
| Filters & Whitelist | ✓ | ✓ |
| Dry-Run (Test) Mode | ✓ | ✓ |
| Undo Actions | ✓ | ✓ |
| 30-Day Statistics | ✓ | ✓ |
| CSV Export | — | ✓ |
| Priority Support | — | ✓ |

Upgrade to Premium: [cayliverse.gumroad.com/l/vnzrgn](https://cayliverse.gumroad.com/l/vnzrgn)

### 🎯 Features

Aligned with `docs/FEATURES.md`:

- ✅ **Scan**: Compares followers vs following; non-followers are queued
- ✅ **Delays**: Random **~5–10 s** between actions
- ✅ **Daily limit**: **10** on Free / **500** on Premium; counter **resets every 24 hours**
- ✅ **Batch pause**: Asks for confirmation after the first **50 actions**
- ✅ **Dry run**: Preview who would be unfollowed without changing anything
- ✅ **Undo**: Re-follow up to **10** recent unfollows
- ✅ **Filters**: **Whitelist** (never unfollow) and **keyword** skip rules
- ✅ **Statistics**: **30-day** chart; **CSV** is Premium-only
- ✅ **Watch list**: **1** watched account on Free / **10** on Premium; **Refresh** to update; **new follows** in the **24 hours after you add** someone, based on profile following count (limited by what Instagram exposes)
- ✅ **UI**: Light / dark theme · **Turkish, English, German**

### 📦 Installation (Developer Mode)

1. Download this folder to your computer
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** in the top-right corner
4. Click **Load unpacked**
5. Select this folder
6. Extension installed! 🎉

### 🚀 Usage

1. Go to **instagram.com** and log in to your account
2. Click the extension icon
3. **(Optional)** Add keywords or whitelist in **Filters**; add accounts to watch in **Watch**
4. **(Optional)** Enable Dry-run mode to test without unfollowing
5. Click **Start**
6. The extension first downloads your full followers list, then scans who you follow and compares
7. After the first 50 actions it pauses and asks for confirmation — click **Continue** to proceed
8. Click **Stop** at any time to pause

### 🔑 Premium License Activation

1. Purchase at [cayliverse.gumroad.com/l/vnzrgn](https://cayliverse.gumroad.com/l/vnzrgn)
2. Copy the license key from your confirmation email
3. Open the **Premium** tab in the extension
4. Paste the key and click **Activate**
5. Daily limit 10→500, watch list up to 10 accounts, CSV export unlocks; cancel billing on **Gumroad**

### 🔒 Privacy (short)

The core workflow does not send your Instagram data to the developer’s servers; it uses your **instagram.com** session and **local storage** only. **Premium** license verification uses the **Gumroad API**.

### ⚙️ Technical Details

#### Instagram Internal API

This extension does **not** use DOM scraping. It uses the same internal API endpoints as Instagram's own web app:

| Action | Endpoint |
|---|---|
| Fetch followers | `GET /api/v1/friendships/{userId}/followers/` |
| Fetch following | `GET /api/v1/friendships/{userId}/following/` |
| Unfollow | `POST /api/v1/friendships/destroy/{userId}/` |
| Re-follow (undo) | `POST /api/v1/friendships/create/{userId}/` |

- **User ID**: Automatically read from the `ds_user_id` cookie
- **CSRF Token**: Automatically read from the `csrftoken` cookie
- **App ID**: Uses Instagram web app's fixed App ID

#### License Verification

Uses the Gumroad API (`POST https://api.gumroad.com/v2/licenses/verify`). License data is stored in `chrome.storage.local`. Aside from the core unfollow flow, this is the main external call (see `docs/FEATURES.md`).

#### Rate Limits

Instagram's rate limits are significantly more restrictive than other platforms:
- Unfollow actions: ~60 per hour
- API queries: ~200 per hour

This is why a 5–10 second delay is applied between each action.

#### File Structure

```
instagram_unfollow_radar/
├── manifest.json              # Extension configuration (Manifest V3)
├── README.md                  # This file
├── src/
│   ├── background/
│   │   └── index.js           # Service worker (message relay)
│   ├── content/
│   │   ├── api.js             # Instagram private API calls
│   │   ├── storage.js         # chrome.storage.local operations
│   │   ├── filters.js         # Whitelist / keyword filter
│   │   ├── automation.js      # 2-phase scan + unfollow engine
│   │   ├── watchlist.js       # Watch list (snapshot / diff)
│   │   └── index.js           # Central state + message router
│   ├── popup/
│   │   ├── popup.html         # 5 tabs: Main / Filters / Watch / Statistics / Premium
│   │   ├── popup.js           # Init + message router
│   │   ├── ui.js              # All DOM manipulation
│   │   ├── events.js          # User event handlers
│   │   └── popup.css          # Instagram gradient theme
│   └── shared/
│       ├── constants.js       # Central configuration (limits, Gumroad config)
│       ├── watchlistLimits.js # Watch list tier limits (free / premium)
│       └── i18n.js            # Multi-language support
├── assets/icons/              # Extension icons
├── locales/
│   ├── tr.json                # Turkish
│   ├── en.json                # English
│   └── de.json                # German
└── vendor/
    └── chartist.*             # Charting library
```

### ⚠️ Important Warnings

1. **Rate Limits**: Instagram enforces daily action limits. Excessive use may result in account restrictions.
2. **Login Required**: The extension only works when logged in to `instagram.com`.
3. **Internal API**: Instagram may change its internal API at any time, which could break the extension.
4. **Responsibility**: Use this extension at your own risk.

---

*Last updated: March 2026*
