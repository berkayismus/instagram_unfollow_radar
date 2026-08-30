# Premium

## Plan farkları

| Özellik | Ücretsiz | Premium |
|---|---:|---:|
| 24 saatlik unfollow limiti | 10 | 500 |
| İzleme listesi | 1 | 10 |
| CSV dışa aktarma | — | ✓ |

Diğer temel özellikler iki planda da kullanılabilir.

## Etkinleştirme

1. Premium sekmesindeki Gumroad bağlantısından lisans satın alın.
2. Lisans anahtarını uzantıya girin.
3. Uzantı anahtarı Gumroad `licenses/verify` API’siyle doğrular.
4. Başarılı sonuçta Premium durumu, lisans anahtarı ve satın alma e-postası yerel depolamaya yazılır.

Lisans 12 saatte bir ve popup açıldığında yeniden doğrulanır. İade, dispute/chargeback veya bitmiş/iptal edilmiş/yenilenememiş abonelik Premium erişimini kaldırır. Gumroad’a ağ nedeniyle ulaşılamazsa son başarılı doğrulamadan sonra en fazla 72 saatlik offline grace period uygulanır; Gumroad’un geçerli bir olumsuz yanıtı grace period kullanmaz.

**Lisansı Kaldır** yalnızca cihazdaki Premium durumunu temizler; Gumroad aboneliğini iptal etmez. Abonelik Gumroad üzerinden yönetilir.

## Teknik davranış

- Premium bayrağı yerel depolamada tutulur.
- Yeniden doğrulama kullanım sayısını artırmaz.
- Premium’dan ücretsize dönüldüğünde izleme listesi ücretsiz limite kırpılır.

Gizlilik ayrıntıları: [PRIVACY_POLICY.md](./PRIVACY_POLICY.md).
