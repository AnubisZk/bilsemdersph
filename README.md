# DersPlan — öğrenci odaklı ders programı

Öğrenci ve öğretmen Excel dosyalarını birlikte okuyup öğrencileri ders kodlarına göre sınıf/gruplara ayırır. Öğretmenlerin uygun saatlerini dikkate alarak öğrenci, grup ve öğretmen programları üretir; sonuçlar gerçek XLSX veya yönetime uygun PDF olarak alınır.

## Excel başlıkları

Zorunlu:

- `İSİM VE SOYİSİM` veya `Ad Soyad`
- `ANA DERS`, `YAN ALAN`, `İKİNCİ ALAN` ya da `Dersler`

İsteğe bağlı:

- `E-OKUL SINIFI`
- `E-OKUL DEVRESİ`
- `VARDİYA`
- `UYGUN OLMADIĞI SAATLER`

Birden çok ders `;` veya `|` ile ayrılabilir. Eski program hücresi `PMAT129. Salı 16:20_17:50` biçimindeyse önceki gün ve saat tercih olarak okunur. Uygulamadaki **Örnek Excel şablonunu indir** bağlantısı doğrudan kullanılabilir.

Öğretmen Excel’i için zorunlu başlıklar:

- `ÖĞRETMEN ADI SOYADI`
- `DERS KODLARI`

İsteğe bağlı öğretmen başlıkları:

- `UYGUN OLDUĞU SAATLER`
- `UYGUN OLMADIĞI SAATLER`
- `GÜNLÜK MAKSİMUM`

Birden çok kod ve saat `|` ile ayrılır. Örnek: `PİNG*|ÖMAT*` ve `Salı 14:40-16:10|Cumartesi 14:20-15:50`.

## Kısıtlar

- Öğrenci ve öğretmen saat çakışmalarını engelleme
- Salı/Cumartesi saat blokları
- Sabahçı öğrenciye hafta içi önceliği
- Özel/tam gün/şehir dışı okula Cumartesi önceliği
- Öğrenci ve öğretmen günlük üst sınırları
- Geçen yılın saatini koruma tercihi
- Gerekirse aynı aşamadaki küçük grupları birleştirme
- Ders kodu veya jokerli kod ailesini öğretmene bağlama: `PMAT*=Zafer Savaş Kıvılcım`

Yazılı kural örnekleri:

```text
PMAT129 Cumartesi 09:00-10:30
ÖMAT111 birleşmesin
Zafer Savaş Kıvılcım yalnız Salı, Cumartesi
Zafer Savaş Kıvılcım günde en fazla 4 ders
AYŞE DİDEM KORUOĞLU Salı uygun değil
```

## Güçlü AI ile program oluşturma

OpenAI veya Claude iki şekilde kullanılabilir: serbest Türkçe kural metnini desteklenen kurallara dönüştürmek ve bütün ders grupları için doğrudan program önermek. Model önerisi uygulamada yeniden doğrulanır; geçersiz saat, öğrenci/öğretmen çakışması veya günlük sınır ihlali kabul edilmez. Ham Excel dosyaları ve Excel’deki öğrenci adları otomatik gönderilmez; program üretiminde ders kodları, anonim öğrenci kimlikleri, okul/vardiya bilgileri, öğretmen eşlemeleri ve kısıtlar seçilen API'ye gönderilir. Kullanıcı bir adı serbest kural metnine yazarsa o metin API isteğinin parçası olur. Anahtarlar yalnız Netlify ortam değişkenlerinde tutulur.

Netlify'da **Site configuration → Environment variables** bölümüne ekleyin:

```text
OPENAI_API_KEY=...
OPENAI_RULE_MODEL=gpt-5.4
OPENAI_SCHEDULE_MODEL=gpt-5.4
ANTHROPIC_API_KEY=...
ANTHROPIC_RULE_MODEL=claude-sonnet-5
ANTHROPIC_SCHEDULE_MODEL=claude-sonnet-5
```

`Otomatik` sağlayıcı seçiminde Claude anahtarı varsa Claude, yoksa OpenAI kullanılır. API kullanmayacaksanız bu değişkenlere gerek yoktur; yerel algoritma ve yapılandırılmış kurallar tarayıcıda çalışır.

## Çalıştırma ve Netlify

```bash
npm install
npm run dev
npm run build
```

API fonksiyonuyla birlikte yayınlamak için kaynak kodu GitHub üzerinden Netlify'a bağlayın veya Netlify CLI ile kaynak klasöründen deploy edin. `netlify.toml` build ve function ayarlarını içerir. Yalnız `dist` klasörünü Netlify Drop'a yüklemek statik sürümü yayınlar; AI düğmesi çalışmaz, diğer planlama özellikleri çalışır.
