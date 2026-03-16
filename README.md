# Instagram Unfollow Radar — Chrome Extension

> 🇹🇷 [Türkçe](#türkçe) | 🇬🇧 [English](#english)

---

## Türkçe

Seni takip etmeyen Instagram kullanıcılarını otomatik tespit edip takipten çıkaran Chrome eklentisi. Ücretsiz ve Premium olmak üzere iki plana sahiptir.

### 💎 Planlar

| Özellik | Ücretsiz | Premium ($1/ay) |
|---|:---:|:---:|
| Günlük unfollow limiti | **50** | **500** |
| Otomatik tespit & tarama | ✓ | ✓ |
| Filtreler & Whitelist | ✓ | ✓ |
| Dry-Run (Test) Modu | ✓ | ✓ |
| Geri Alma (Undo) | ✓ | ✓ |
| 30 Günlük İstatistikler | ✓ | ✓ |
| CSV Dışa Aktarma | — | ✓ |
| Öncelikli Destek | — | ✓ |

Premium'a geçmek için: [cayliverse.gumroad.com/l/vnzrgn](https://cayliverse.gumroad.com/l/vnzrgn)

### 🎯 Özellikler

- ✅ **Otomatik Tespit**: Takipçi listeni indirip, takip ettiğin kişilerle karşılaştırarak arkandan takip etmeyenleri bulur
- ✅ **Güvenli Çalışma**: 5–10 saniye rastgele gecikmeler ile Instagram kurallarına uygun
- ✅ **Freemium Model**: Ücretsiz planda günlük 50, Premium planda günlük 500 unfollow
- ✅ **Batch Modu**: Her 50 kişide durup onay ister
- ✅ **İstatistik Takibi**: 30 günlük grafik
- ✅ **CSV Export** *(Premium)*: Tüm işlem geçmişini CSV olarak indir
- ✅ **Whitelist**: Belirli kullanıcıları koruma altına al
- ✅ **Keywords Filter**: İsim/kullanıcı adında belirli kelime olanları atla
- ✅ **Dry-Run Mode**: Gerçekte takipten çıkmadan test et
- ✅ **Undo Sistemi**: Son işlemleri geri al (API ile yeniden takip)
- ✅ **Dark Mode**: Karanlık tema desteği
- ✅ **Çoklu Dil**: Türkçe ve İngilizce arayüz

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
3. **(Opsiyonel)** Filtreler sekmesinden keywords veya whitelist ekleyin
4. **(Opsiyonel)** Dry-run mode'u aktif edin
5. **Başlat** butonuna tıklayın
6. Eklenti önce tüm takipçi listeni indirir, ardından takip ettiğin kişilerle karşılaştırır
7. Her 50 kişiden sonra onay ister — **Devam Et** ile devam edin
8. İstediğiniz zaman **Durdur** ile durdurun

### 🔑 Premium Lisans Aktivasyonu

1. [cayliverse.gumroad.com/l/vnzrgn](https://cayliverse.gumroad.com/l/vnzrgn) adresinden satın alın
2. E-postanıza gelen lisans anahtarını kopyalayın
3. Eklentide **Premium** sekmesini açın
4. Anahtarı ilgili alana yapıştırıp **Etkinleştir**'e tıklayın
5. Günlük limit 50'den 500'e yükseler, CSV export aktif olur

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

Gumroad API'si kullanılır (`POST https://api.gumroad.com/v2/licenses/verify`). Lisans bilgisi `chrome.storage.local`'da saklanır. İnternet bağlantısı gerektiren tek işlemdir.

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
│   │   └── index.js           # Merkezi state + mesaj router
│   ├── popup/
│   │   ├── popup.html         # 4 tab'lı UI (Ana / Filtreler / İstatistikler / Premium)
│   │   ├── popup.js           # Init + mesaj router
│   │   ├── ui.js              # Tüm DOM manipülasyonu
│   │   ├── events.js          # Kullanıcı event handler'ları
│   │   └── popup.css          # Instagram gradient tema
│   └── shared/
│       ├── constants.js       # Merkezi konfigürasyon (limitler, Gumroad config)
│       └── i18n.js            # Çok dil desteği
├── assets/icons/              # Eklenti ikonları
├── locales/
│   ├── tr.json                # Türkçe çeviriler
│   └── en.json                # İngilizce çeviriler
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

A Chrome extension that automatically detects and unfollows Instagram users who don't follow you back. Available in Free and Premium plans.

### 💎 Plans

| Feature | Free | Premium ($1/mo) |
|---|:---:|:---:|
| Daily unfollow limit | **50** | **500** |
| Automatic detection & scan | ✓ | ✓ |
| Filters & Whitelist | ✓ | ✓ |
| Dry-Run (Test) Mode | ✓ | ✓ |
| Undo Actions | ✓ | ✓ |
| 30-Day Statistics | ✓ | ✓ |
| CSV Export | — | ✓ |
| Priority Support | — | ✓ |

Upgrade to Premium: [cayliverse.gumroad.com/l/vnzrgn](https://cayliverse.gumroad.com/l/vnzrgn)

### 🎯 Features

- ✅ **Automatic Detection**: Downloads your followers list and compares it with who you follow to find non-followers
- ✅ **Safe Operation**: Random 5–10 second delays between actions to comply with Instagram's guidelines
- ✅ **Freemium Model**: 50 unfollows/day on Free plan, 500 unfollows/day on Premium
- ✅ **Batch Mode**: Pauses after every 50 users and asks for confirmation before continuing
- ✅ **Statistics**: 30-day activity chart
- ✅ **CSV Export** *(Premium)*: Download full unfollow history as a CSV file
- ✅ **Whitelist**: Protect specific users from being unfollowed
- ✅ **Keywords Filter**: Skip users whose name or username contains certain words
- ✅ **Dry-Run Mode**: Test without actually unfollowing anyone
- ✅ **Undo System**: Re-follow recently unfollowed users via the API
- ✅ **Dark Mode**: Dark theme support
- ✅ **Multi-language**: Turkish and English UI

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
3. **(Optional)** Add keywords or whitelist entries in the Filters tab
4. **(Optional)** Enable Dry-run mode to test without unfollowing
5. Click **Start**
6. The extension first downloads your full followers list, then scans who you follow and compares
7. After every 50 users it pauses and asks for confirmation — click **Continue** to proceed
8. Click **Stop** at any time to pause

### 🔑 Premium License Activation

1. Purchase at [cayliverse.gumroad.com/l/vnzrgn](https://cayliverse.gumroad.com/l/vnzrgn)
2. Copy the license key from your confirmation email
3. Open the **Premium** tab in the extension
4. Paste the key and click **Activate**
5. Your daily limit increases from 50 to 500 and CSV export is unlocked

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

Uses the Gumroad API (`POST https://api.gumroad.com/v2/licenses/verify`). License data is stored in `chrome.storage.local`. This is the only operation that requires an internet connection outside of Instagram.

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
│   │   └── index.js           # Central state + message router
│   ├── popup/
│   │   ├── popup.html         # 4-tab UI (Main / Filters / Statistics / Premium)
│   │   ├── popup.js           # Init + message router
│   │   ├── ui.js              # All DOM manipulation
│   │   ├── events.js          # User event handlers
│   │   └── popup.css          # Instagram gradient theme
│   └── shared/
│       ├── constants.js       # Central configuration (limits, Gumroad config)
│       └── i18n.js            # Multi-language support
├── assets/icons/              # Extension icons
├── locales/
│   ├── tr.json                # Turkish translations
│   └── en.json                # English translations
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
