# Instagram Unfollow Radar - Chrome Extension

Seni takip etmeyen Instagram kullanıcılarını otomatik tespit edip takipten çıkaran Chrome eklentisi.

## 🎯 Özellikler

- ✅ **Otomatik Tespit**: Instagram'ın internal API'si ile arkandan takip etmeyenleri bulur
- ✅ **Güvenli Çalışma**: 5–10 saniye rastgele gecikmeler ile Instagram kurallarına uygun
- ✅ **Kontrollü İşlem**: Oturum başına maksimum 100 kişi limiti
- ✅ **Batch Modu**: İlk 50 kişide durup onay ister
- ✅ **İstatistik Takibi**: 30 günlük grafik ve CSV export
- ✅ **Whitelist**: Belirli kullanıcıları koruma altına al
- ✅ **Keywords Filter**: İsim/kullanıcı adında belirli kelime olanları atla
- ✅ **Dry-Run Mode**: Gerçekte takipten çıkmadan test et
- ✅ **Undo Sistemi**: Son işlemleri geri al (API ile yeniden takip)
- ✅ **Dark Mode**: Karanlık tema desteği
- ✅ **Çoklu Dil**: Türkçe ve İngilizce arayüz

## 📦 Kurulum (Geliştirici Modu)

1. Bu klasörü bilgisayarınıza indirin
2. Chrome'da `chrome://extensions` sayfasını açın
3. Sağ üstten **Developer mode** aktif edin
4. **Load unpacked** butonuna tıklayın
5. Bu klasörü seçin
6. Eklenti yüklendi! 🎉

## 🚀 Kullanım

1. **instagram.com**'a gidin ve hesabınıza giriş yapın
2. Eklenti simgesine tıklayın
3. **(Opsiyonel)** Filtreler tab'ından keywords veya whitelist ekleyin
4. **(Opsiyonel)** Dry-run mode'u aktif edin
5. **Başlat** butonuna tıklayın
6. Eklenti, Instagram API'sini kullanarak takip listenizi tarar ve arkandan takip etmeyenleri bulur
7. İlk 50 kişiden sonra onay ister — **Devam Et** ile ikinci batch'e geçin
8. İstediğiniz zaman **Durdur** ile durdurun

## ⚙️ Teknik Detaylar

### Instagram Internal API Kullanımı

X (Twitter) eklentisinden farklı olarak bu eklenti **DOM scraping yapmaz**.
Bunun yerine Instagram'ın web uygulamasının kullandığı internal API endpoint'leri kullanır:

| İşlem | Endpoint |
|---|---|
| Takip listesi çekme | `GET /api/v1/friendships/{userId}/following/` |
| Arkadan takip durumu kontrolü | `POST /api/v1/friendships/show_many/` |
| Takipten çıkma | `POST /api/v1/friendships/destroy/{userId}/` |
| Geri takip (undo) | `POST /api/v1/friendships/create/{userId}/` |

- **Kullanıcı ID**: `ds_user_id` cookie'sinden otomatik alınır
- **CSRF Token**: `csrftoken` cookie'sinden otomatik alınır
- **App ID**: Instagram web app'ın sabit App ID'si kullanılır

### Rate Limit

Instagram'ın rate limitleri Twitter/X'ten çok daha kısıtlıdır:
- Unfollow işlemleri: ~60 işlem/saat
- API sorguları: ~200 istek/saat

Bu yüzden işlemler arası bekleme süresi 5–10 saniyedir.

### Dosya Yapısı

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

## ⚠️ Önemli Uyarılar

1. **Rate Limit**: Instagram günlük işlem limitleri uygular. Aşırı kullanım hesap kısıtlamalarına yol açabilir.
2. **Giriş Zorunlu**: Eklenti yalnızca `instagram.com`'da oturum açıkken çalışır.
3. **Internal API**: Instagram internal API'yi herhangi bir zamanda değiştirebilir.
4. **Sorumluluk**: Bu eklentiyi kendi sorumluluğunuzda kullanın.

---

*Son güncelleme: 2026*
