# Sürüm Notları

## 1.3.1

- Popup yeniden açıldığında canlı çalışma durumu ve işlenen kullanıcılar geri yüklenir.
- **Durdur**, geç gelen async güncellemelerin süreci yeniden canlandırmasını engeller.
- Instagram’ın HTML veya farklı şemadaki yanıtları güvenli biçimde sınıflandırılır.
- Unfollow/refollow web fallback’i ilişki durumu üzerinden önce ve sonra doğrulanır.
- Son API tanısı hesap kapsamında, yanıt gövdesi ve kullanıcı verisi olmadan saklanır.
- Popup, checkpoint, storage yarışı ve API fallback regresyon kapsamı genişletildi.

Doğrulama: 57 otomatik test ve deterministik Chrome Web Store paketi.
