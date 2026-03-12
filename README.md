# Instagram Unfollow Radar — Chrome Extension

> 🇹🇷 [Türkçe](#türkçe) | 🇬🇧 [English](#english)

---

## Türkçe

Seni takip etmeyen Instagram kullanıcılarını otomatik tespit edip takipten çıkaran Chrome eklentisi.

### 🎯 Özellikler

- ✅ **Otomatik Tespit**: Takipçi listeni indirip, takip ettiğin kişilerle karşılaştırarak arkandan takip etmeyenleri bulur
- ✅ **Güvenli Çalışma**: 5–10 saniye rastgele gecikmeler ile Instagram kurallarına uygun
- ✅ **Kontrollü İşlem**: Oturum başına maksimum 100 kişi limiti
- ✅ **Batch Modu**: İlk 50 kişide durup onay ister
- ✅ **İstatistik Takibi**: 30 günlük grafik ve CSV export
- ✅ **Whitelist**: Belirli kullanıcıları koruma altına al
- ✅ **Keywords Filter**: İsim/kullanıcı adında belirli kelime olanları atla
- ✅ **Dry-Run Mode**: Gerçekte takipten çıkmadan test et
- ✅ **Undo Sistemi**: Son işlemleri geri al (API ile yeniden takip)
- ✅ **Dark Mode**: Karanlık tema desteği
- ✅ **Çoklu Dil**: Türkçe ve İngilizce arayüz (tarayıcı diline göre otomatik seçim)

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
7. İlk 50 kişiden sonra onay ister — **Devam Et** ile ikinci batch'e geçin
8. İstediğiniz zaman **Durdur** ile durdurun

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
│   │   └── index.js           # Instagram API + ana otomasyon mantığı
│   ├── popup/
│   │   ├── popup.html         # 3 tab'lı UI
│   │   ├── popup.js           # UI controller
│   │   └── popup.css          # Instagram gradient tema
│   └── shared/
│       ├── constants.js       # Merkezi konfigürasyon
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

A Chrome extension that automatically detects and unfollows Instagram users who don't follow you back.

### 🎯 Features

- ✅ **Automatic Detection**: Downloads your followers list and compares it with who you follow to find non-followers
- ✅ **Safe Operation**: Random 5–10 second delays between actions to comply with Instagram's guidelines
- ✅ **Controlled Processing**: Maximum 100 unfollows per session
- ✅ **Batch Mode**: Pauses after the first 50 and asks for confirmation before continuing
- ✅ **Statistics**: 30-day chart and CSV export
- ✅ **Whitelist**: Protect specific users from being unfollowed
- ✅ **Keywords Filter**: Skip users whose name or username contains certain words
- ✅ **Dry-Run Mode**: Test without actually unfollowing anyone
- ✅ **Undo System**: Re-follow recently unfollowed users via the API
- ✅ **Dark Mode**: Dark theme support
- ✅ **Multi-language**: Turkish and English UI (auto-detected from browser language)

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
7. After the first 50 users it pauses and asks for confirmation — click **Continue** for the next batch
8. Click **Stop** at any time to pause

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
│   │   └── index.js           # Instagram API + main automation logic
│   ├── popup/
│   │   ├── popup.html         # 3-tab UI
│   │   ├── popup.js           # UI controller
│   │   └── popup.css          # Instagram gradient theme
│   └── shared/
│       ├── constants.js       # Centralized configuration
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

*Last updated: 2026*
