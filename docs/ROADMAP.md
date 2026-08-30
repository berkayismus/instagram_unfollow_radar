# Yol Haritası

## Tamamlananlar

- Eksik takipçi taramasında güvenli durdurma
- Dry-run ve gerçek kota ayrımı
- Başarılı API yanıtına bağlı undo
- İstatistik sıfırlama ile 24 saatlik kotanın ayrılması
- Sekmeler arası tek aktif otomasyon kilidi ve heartbeat
- Hesap değişikliğinde otomatik durdurma
- Watchlist snapshot bütünlüğü ve seri mutation kuyruğu
- Tarama/cursor/kuyruk checkpoint’leri ve sayfa yenileme veya rate-limit sonrası otomatik devam
- Instagram hesabına göre ayrılmış yerel veri ve kayıpsız legacy migration
- Periyodik Premium doğrulaması, iptal/iade kontrolleri ve offline grace period
- Regresyon testleri, CI ve deterministik mağaza paketi

## Kalan işler

### Otomasyon dayanıklılığı

- Kimlik doğrulama, challenge, ağ ve sunucu hatalarını ayrı sınıflandırma

### Ürün ve veri

- Ayar/whitelist içe ve dışa aktarma
- Daha geniş entegrasyon testleri ve storage migration doğrulamaları
- Gizlilik, mağaza ve özellik metinlerini sürüm sürecinde otomatik kontrol etme

Otomatik unfollow akışı korunacaktır. Yeni bir tarama-sonrası ön onay ekranı planlanmamaktadır. İlk kullanımda görülebilen legacy batch duraklaması daha sonra ayrıca sadeleştirilecektir.
