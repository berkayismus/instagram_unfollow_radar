# Yol Haritası

## Tamamlananlar

- Eksik takipçi taramasında güvenli durdurma
- Dry-run ve gerçek kota ayrımı
- Başarılı API yanıtına bağlı undo
- İstatistik sıfırlama ile 24 saatlik kotanın ayrılması
- Sekmeler arası tek aktif otomasyon kilidi ve heartbeat
- Hesap değişikliğinde otomatik durdurma
- Watchlist snapshot bütünlüğü ve seri mutation kuyruğu
- Regresyon testleri, CI ve deterministik mağaza paketi

## Kalan işler

### Otomasyon dayanıklılığı

- Tarama fazı, cursor ve kuyruk checkpoint’leri
- Sayfa yenileme ve rate-limit sonrasında devam
- Kimlik doğrulama, challenge, ağ ve sunucu hatalarını ayrı sınıflandırma

### Premium

- Periyodik lisans yeniden doğrulaması
- İade, chargeback ve abonelik bitiş kontrolleri
- Sınırlı offline kullanım süresi

### Ürün ve veri

- Ayar/whitelist içe ve dışa aktarma
- Verileri Instagram hesap kimliğine göre ayırma
- Daha geniş entegrasyon testleri ve storage migration doğrulamaları
- Gizlilik, mağaza ve özellik metinlerini sürüm sürecinde otomatik kontrol etme

Otomatik unfollow akışı korunacaktır. Yeni bir tarama-sonrası ön onay ekranı planlanmamaktadır. İlk kullanımda görülebilen legacy batch duraklaması daha sonra ayrıca sadeleştirilecektir.
