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

**Lisansı Kaldır** yalnızca cihazdaki Premium durumunu temizler; Gumroad aboneliğini iptal etmez. Abonelik Gumroad üzerinden yönetilir.

## Mevcut teknik sınırlar

- Doğrulama etkinleştirme sırasında yapılır; periyodik yeniden doğrulama henüz yoktur.
- İade, chargeback ve abonelik bitişi için ek kontrol henüz uygulanmamıştır.
- Premium bayrağı yerel depolamada tutulur.
- Premium’dan ücretsize dönüldüğünde izleme listesi ücretsiz limite kırpılır.

Gizlilik ayrıntıları: [PRIVACY_POLICY.md](./PRIVACY_POLICY.md).
