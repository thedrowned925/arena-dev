# Arena Dev — Windows Desktop (v0.1)

Arena Dev, Arena.ai yanıtlarını doğrudan Arena'nın canlı web arayüzünde gösteren bir Windows masaüstü prototipidir. **Tek yapay zekâ Arena'dır.** Ollama veya başka bir yerel model çalıştırılmaz; ayrıca API anahtarı gerekmez.

## Neler çalışıyor?

- Electron içinde gerçek Arena Agent Mode sayfası (https://arena.ai/agent)
- Arena hesabıyla web oturumunu kullanma; geri / ileri / yenile, normal tarayıcıda açma
- Ayrı Chromium oturumu: web sayfasına yerel Node.js, preload ya da masaüstü aracına erişim verilmez
- Klasör seçimi, metin dosyalarını okuma/yazma, dosya arama
- Onaylı PowerShell / terminal komutları
- Windows ekran görüntüsü, fare tıklaması, metin yazdırma (onaylı)
- Araç sonuçlarını kopyalama ve Arena sohbetine elle aktarma
- GitHub üzerinden değişiklikleri aldıktan sonra onaylı git pull --ff-only

## Ne henüz çalışmıyor?

**Bu sürüm tam otonom Arena-PC ajanı değildir.** Arena kendi web sayfasında yanıt verir; masaüstündeki araçları doğrudan kendiliğinden çağırmaz. Arena mesajları DOM'dan okunmaz, otomatik sorgulama yapılmaz ve özel servis uç noktaları kullanılmaz. Bu köprü için Arena tarafından izin verilen dış araç bağlantısı gereklidir.

Arena Agent Mode GitHub ile entegre çalışabilir; uzak çalışma alanında yaptığı değişiklikleri bir pull request olarak sunar. PR'ı birleştirip projeni yerelde güncellemek mümkün, ancak bu doğrudan Windows kontrolü anlamına gelmez.

## Kurulum

Windows 10/11, Node.js 22 ve Git kur.

~~~powershell
git clone https://github.com/thedrowned925/arena-dev.git
cd arena-dev
npm install
npm start
~~~

Windows kurulumu oluşturmak için:

~~~powershell
npm run dist
~~~

Oluşan yükleyici dist klasöründe bulunur. GitHub Actions altındaki **Windows Build** iş akışı da main dalına yeni commit geldikten sonra test ve EXE derlemesi çalıştıracak şekilde ayarlanmıştır. Çalışmanın başarılı olup olmadığını Actions bölümünden kontrol et; henüz Windows'ta gerçek oturum açma ve ekran otomasyonunu uçtan uca test ettiğimizi söylemiyoruz.

## Kullanım

1. Sağ tarafta Arena Agent Mode'u aç ve gerekirse hesabınla giriş yap.
2. Sol tarafta bir çalışma klasörü seç.
3. Yerel araç seçerek JSON argümanlarıyla işlemi çalıştır. Dosya yazma, terminal ve masaüstü işlemlerinde onay ver.
4. Araç sonucunu kopyalayıp gerektiğinde Arena sohbetine yapıştır.
5. Arena Agent Mode ile GitHub deposu üzerinde çalışıyorsan Arena'nın açtığı PR'ı incele, birleştir ve yerel çalışma alanında git pull --ff-only kullan.

## Güvenlik

- Yerel dosya okuma/yazma araçları çalışma klasörü kapsamı ve symlink sınırları kontrolü yapar.
- Terminal **sandbox değildir**: normal Windows kullanıcı haklarıyla çalışır, klasör dışına erişebilir. Bu nedenle açık onay ister.
- Ekran görüntüsü yalnızca onay sonrasında alınır ve yerel uygulamada görünür.
- Kimlik doğrulama bazı servislerde gömülü tarayıcıda engellenebilir. Bu durumda üstteki ↗ düğmesinden Arena'yı normal tarayıcıda aç.
- Arena web yanıtları uygulama tarafından okunmaz veya otomatik toplanmaz.
- Arena'nın kullanım kurallarını incele: https://help.arena.ai/articles/5629909088-terms-of-use?lang=en

Proje Arena.ai ile bağlantılı, resmî veya Arena tarafından onaylanan bir uygulama değildir.
