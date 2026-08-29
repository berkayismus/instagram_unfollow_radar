# Özellikler

Bu belge ürün davranışının kısa özetidir. Teknik ayrıntılar için [TECHNICAL.md](./TECHNICAL.md), planlar için [PREMIUM.md](./PREMIUM.md) kullanılır.

## Otomasyon

- Takipçi listesi tamamen alınmadan unfollow aşaması başlamaz.
- Takip edilen hesaplar, takipçi kümesiyle karşılaştırılır.
- Whitelist veya anahtar kelime filtresine uyan hesaplar atlanır.
- Gerçek işlemler arasında 5–10 saniye rastgele gecikme uygulanır.
- Ücretsiz plan 10, Premium plan 500 gerçek unfollow ile sınırlıdır; pencere 24 saattir.
- İlk kullanımda 50 işlenen adaydan sonra legacy batch duraklaması gösterilebilir; devam seçimi yerelde saklanır.
- Ayrı bir tarama-sonrası ön onay ekranı yoktur.

## Güvenlik

- Eksik takipçi taraması hiçbir unfollow yapmadan sona erer.
- Aynı anda yalnızca bir Instagram sekmesi otomasyon çalıştırabilir.
- Aktif Instagram hesabı değişirse süreç durur.
- Dry-run gerçek kota veya unfollow istatistiği tüketmez.
- Undo, Instagram refollow isteği başarılı olduktan sonra kuyruktan silinir.

## Filtreler ve geçmiş

- Kullanıcı adı veya görünen ad için anahtar kelime filtresi
- Kalıcı whitelist
- Son 10 işlem için undo
- Son 30 gün istatistiği
- Premium için CSV dışa aktarımı

## İzleme listesi

- Ücretsiz planda 1, Premium’da 10 hesap
- Manuel yenileme
- Listeye eklenme anından sonraki 24 saat içinde algılanan yeni takipler
- Yalnızca tam alınan following snapshot’ları karşılaştırılır
- Eksik, gizli veya tutarsız API verisi baseline’ı değiştirmez

İzleme sonucu Instagram’ın sunduğu verilere bağlıdır; özel veya çok büyük hesaplarda tam liste alınamayabilir.

## Arayüz

- Türkçe, İngilizce ve Almanca
- Açık/koyu tema
- Ana, Filtreler, İzleme, İstatistikler ve Premium sekmeleri
