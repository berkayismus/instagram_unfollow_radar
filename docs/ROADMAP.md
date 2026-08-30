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
- Legacy 50 işlem batch duraklamasının kaldırılması
- Kimlik doğrulama, challenge, rate-limit, ağ, sunucu ve geçersiz yanıt hatalarının sınıflandırılması
- Gerçek storage modülleriyle hesap izolasyonu ve migration entegrasyon testleri
- Paket allowlist’i, manifest izinleri ve ürün limitleri için otomatik tutarlılık kontrolleri
- `1.3.0` sürüm paketi
- Regresyon testleri, CI ve deterministik mağaza paketi

## Kalan işler

### Ürün ve veri

- Ayar/whitelist içe ve dışa aktarma

Otomatik unfollow akışı korunacaktır. Yeni bir tarama-sonrası ön onay ekranı planlanmamaktadır.
