# Instagram Unfollow Radar — Özellikler

Kısa özet: Instagram’da oturumunuz açıkken, sizi geri takip etmeyen hesapları bulur; isteğe bağlı olarak güvenli gecikmelerle takipten çıkmanıza yardımcı olur. Veriler cihazınızda kalır; şifreniz okunmaz.

---

## Ana işlevler

| Özellik | Açıklama |
|--------|-----------|
| **Tarama** | Takipçi listesi ile takip listesi karşılaştırılır; geri takip etmeyenler sıraya alınır. |
| **Gecikme** | Her işlem arasında yaklaşık 5–10 sn rastgele bekleme. |
| **Günlük limit** | Ücretsiz: 10 / Premium: 500 (24 saatte bir sıfırlanır). |
| **Toplu duraklama** | İlk 50 işlemden sonra devam etmek için onay ister. |
| **Dry run** | Gerçekten takipten çıkmadan “kim çıkarılacaktı” simülasyonu. |
| **Geri alma (Undo)** | Son işlemlerden en fazla 10 hesabı tekrar takip etme. |

---

## Filtreler sekmesi

- **Whitelist:** Listeye eklediğiniz kullanıcılar asla çıkarılmaz.
- **Anahtar kelimeler:** Kullanıcı adı veya görünen isimde bu kelimeler geçenler atlanır.

---

## İstatistikler sekmesi

- Son 30 güne ait özet grafik.
- **CSV dışa aktarma** (Premium).

---

## İzleme sekmesi

- İzlenen hesap kotası: **ücretsiz 1**, **Premium 10** (detay: [PREMIUM.md](./PREMIUM.md)).
- **Yenile** ile güncelleme; listeye ekledikten sonraki **24 saat** içinde, profil takip sayısındaki artışa göre yeni takipler gösterilir (Instagram’ın sunduğu veriyle sınırlıdır).

---

## Premium (Gumroad)

Ayrıntılı plan karşılaştırması, lisans akışı ve teknik referans: **[PREMIUM.md](./PREMIUM.md)**.

- Günlük 500 kişi limiti (ücretsiz: 10); izleme listesi 10 hesap (ücretsiz: 1).
- CSV indirme.
- Lisans anahtarı ile etkinleştirme; iptal Gumroad üzerinden.

---

## Arayüz

- **Açık / koyu tema**
- **Diller:** Türkçe, İngilizce, Almanca

---

## Teknik özet (bir satır)

İstekler yalnızca `instagram.com` oturumunuz ve yerel depolama üzerinden çalışır; ana iş akışı için harici sunucuya veri gönderilmez (Premium lisans doğrulaması Gumroad API’sine gider).
