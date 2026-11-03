# Audit pra-launch terbaru — Toko Abangda

Tanggal: 3 November 2026, Asia/Jakarta. Versi aplikasi yang diaudit: `cb06084` (sesudah perbaikan voucher, format WhatsApp, penghapusan konfirmasi, header, dan kategori sticky).

**Penilaian: alur utama layak dilanjutkan ke uji terbatas; belum dapat dinyatakan siap launch publik penuh.** Ada beberapa sisa masalah yang berhasil direproduksi dan ada pemeriksaan produksi yang belum bisa dilakukan. Audit ini tidak mengubah kode aplikasi, deployment, atau sheet asli.

## Cakupan dan bukti

- Membaca kode HTML/JavaScript, backend Apps Script, migrasi dan skema tujuh sheet.
- Menjalankan ulang `npm run test:backend` dan `npm run test:browser`: **57 pemeriksaan backend, pengujian migrasi, dan tujuh suite browser lolos**.
- Menjalankan pengujian tambahan terpisah dengan Sheets tiruan untuk kondisi yang tidak tercakup tes lama; temuan reproduktif dirinci di bawah.
- Tidak ada konektor Google Sheets di sesi ini. Percobaan membaca link sheet milik pengguna terhalang proxy dengan `Tunnel connection failed: 403 Forbidden`; ini bukan bukti bahwa izin file di Google salah. Isi, baris, sharing, dan pengaturan deployment asli **belum terverifikasi**.
- Screenshot pengguna menunjukkan tampilan pada konteks tertentu; tidak membuktikan pengunjung anonim dapat memakai deployment produksi `/exec`. Pembukaan aplikasi WhatsApp asli, Safari/iPhone, Google Sites/custom domain, dan latensi beban produksi belum diuji.

## Yang sudah beres dalam pengujian repo

- Perhitungan harga normal/grosir per produk, perubahan kembali ke harga normal saat jumlah turun, dan kupon dihitung sesudah grosir.
- Server mengabaikan harga/total dari browser dan memeriksa harga/kupon terkini saat checkout.
- Retry dengan request yang sama mengembalikan pesanan yang sama; kasus append berhasil tetapi respons hilang sudah memiliki pengujian. Retry tidak memakai kuota kupon dua kali pada kasus yang ditangani ini.
- Produk kosong/rusak/duplikat tidak lagi menjatuhkan seluruh katalog; menu admin menunjukkan baris produk yang perlu dirapikan.
- Penanganan teks/URL dari sheet, respons pencarian/kategori yang terlambat, serta CSS utama lokal sudah diperbaiki dan diuji.
- Voucher preview tidak lagi mengantre pada lock checkout; cache singkat dan batas tunggu UI tersedia. Checkout tetap memeriksa kupon langsung dari sheet.
- Langsung membuka WhatsApp sesudah order tersimpan, tanpa halaman konfirmasi. Popup diblokir memiliki tautan cadangan yang tidak membuat order baru; kegagalan pencatatan mempertahankan keranjang.
- Header menutupi konten yang lewat di belakangnya; filter kategori berada dalam header sticky dan tetap dapat digeser horizontal. Perilaku visual ini telah diuji pada revisi sebelumnya.
- ID produk/brand manual tidak dikembalikan; satuan produk sudah masuk snapshot dan pesan WhatsApp.

Lolosnya pengujian di atas tidak berarti semua kombinasi data dan perangkat nyata telah tercakup.

## Sisa perbaikan prioritas sebelum publik

### 1. Salah voucher berulang bisa mengunci checkout yang sudah diperbaiki

**Terbukti pada simulasi.** `createOrder` menaikkan batas `new-orders` dan `phone` sebelum membaca produk dan memvalidasi kupon ([code.gs](code.gs#L509)). Lima permintaan dengan voucher salah memakai batas nomor pembeli; permintaan keenam tanpa voucher ikut ditolak walaupun belum ada satu pun order yang tercatat.

Dampak: pelanggan yang mencoba beberapa kode bisa gagal membeli setelah memperbaiki input. Pesan penolakan tidak menjelaskan bahwa batas tersebut sudah terpakai oleh percobaan gagal.

Perbaikan yang disarankan: pisahkan pembatasan percobaan umum dari pembatasan order baru. Pertahankan perlindungan percobaan, tetapi hitung batas order/nomor setelah seluruh validasi bisnis berhasil dan sesaat sebelum menulis, dengan perlakuan kegagalan tulis yang jelas. Jangan menghapus seluruh pembatasan untuk mengatasi kasus ini.

### 2. Satuan produk belum konsisten di tampilan

**Terbukti pada browser.** Produk `satuan=box` tetap menampilkan “Grosir ... mulai 12 pcs” karena `refreshProductCards`, `generateProductsHtml`, dan `updateModalPricing` masih menulis `pcs` secara tetap ([js.html](js.html#L636)). WhatsApp sudah benar menggunakan `box`, sehingga tampilan sebelum checkout dan pesan akhir bisa berbeda.

Dampak: pelanggan tidak yakin harga/minimum berlaku untuk 12 buah atau 12 kotak.

Perbaikan: teruskan `satuan` ke kartu, detail/modal, item keranjang, pemulihan keranjang, dan tracking. Tampilkan harga per satuan dan minimum yang sama di semua tempat, misalnya `Rp80.000/box`, `mulai 12 box`. Jangan mengubah aturan harga atau membuat jumlah pecahan secara diam-diam.

### 3. Nomor WhatsApp harus berasal dari satu aturan yang konsisten

**Dua kondisi berhasil direproduksi:**

- `getInitialData` mengambil nilai setting terakhir untuk kunci yang berulang, sedangkan checkout memilih baris pertama. Dua baris `no_whatsapp` bisa membuat footer dan tujuan order berbeda ([code.gs](code.gs#L191), [code.gs](code.gs#L552)). Ini bukan pernyataan bahwa sheet asli punya baris ganda; isinya belum terbaca.
- Checkout mengubah awalan `08...` menjadi `628...`, tetapi `renderStoreSettings` di frontend hanya membuang karakter selain angka. Jika setting berisi `08...`, tautan pertanyaan pada footer masih memakai `wa.me/08...` ([js.html](js.html#L403)).

Perbaikan: satu sumber setting, tolak kunci setting ganda yang ambigu, dan gunakan normalisasi/validasi nomor yang sama pada seluruh tautan WA. Sebelum launch, pastikan nomor yang benar menerima satu pesan uji dari footer dan satu dari checkout.

### 4. ID tracking masih mudah ditebak

**Terlihat pada implementasi.** ID masih berupa `TA-tanggal-001`, `002`, dan seterusnya ([code.gs](code.gs#L574)). `trackOrder` hanya membutuhkan ID dan masih mengembalikan item, total, tanggal, status, serta metode pengiriman. Nama, nomor WA, alamat, catatan, dan metadata request sudah tidak dikirim.

Dampak: orang yang mencoba nomor berurutan dapat mengetahui ringkasan pembelian pesanan lain. Batas permintaan mengurangi kecepatan percobaan, bukan membuktikan kepemilikan pesanan.

Perbaikan: tetap gunakan **satu ID pesanan saja**, sesuai permintaan pengguna, tetapi buat ID baru yang acak dan sulit ditebak. Pertahankan dukungan untuk order lama, atau batasi rincian yang ditampilkan pada tracking lama. Tidak perlu menambahkan kembali kolom kode/token pribadi atau input kedua.

## Konsistensi transaksi dan aturan usaha

### 5. Kuota voucher pada order batal harus punya aturan yang jelas

Saat ini kuota berkurang ketika order tercatat, sebelum pemeriksaan stok/pembayaran. Mengubah status menjadi batal tidak otomatis mengembalikan kuota. Karena stok diperiksa manual, pembatalan setelah pencatatan merupakan bagian normal proses toko.

Ini keputusan aturan bisnis yang harus ditegaskan: bila kuota dimaksudkan hanya untuk transaksi jadi, tambahkan tindakan pembatalan yang mengembalikan kuota **tepat satu kali**, dengan catatan bahwa kuota sudah dikembalikan. Jika sengaja menghitung semua order yang masuk termasuk batal, dokumentasikan aturan itu. Pengeditan quota/status manual tanpa riwayat berisiko pengembalian ganda.

### 6. Tracking belum menjelaskan diskon dan satuan

**Terbukti pada simulasi.** Order dengan subtotal Rp69.000 dan diskon Rp6.900 ditampilkan dengan item berjumlah Rp69.000 tetapi total Rp62.100; respons tracking tidak menyertakan diskon atau kode kupon walaupun kolom snapshot sudah ada ([code.gs](code.gs#L650)). Satuan juga belum dipetakan ke respons item tracking.

Perbaikan: tampilkan subtotal, diskon, total produk dan satuan secara konsisten, tanpa mengembalikan data kontak pelanggan. Jika ongkir/total akhir telah disepakati melalui WA, simpan sebagai field terpisah dan tandai perkiraan versus total akhir, bukan menimpa sembarang angka historis.

### 7. Label total dan pencatatan akhir masih perlu dirapikan

Checkout memakai “Total Tagihan”, WA memakai “Total”, sementara stok/ongkir/total akhir masih menunggu konfirmasi manual. Catatan konfirmasi sudah ada, tetapi judul total sebaiknya menjelaskan bahwa ini total produk/perkiraan sebelum ongkir.

Skema inti belum menyediakan alur resmi untuk ongkir yang disepakati, total final, status pembayaran, waktu pembayaran, atau riwayat perubahan status. Untuk launch kecil dengan konfirmasi manual, pilih pencatatan sederhana yang konsisten; tidak perlu memasang payment gateway. Pastikan pengelola tidak menganggap status “Sedang Diproses” sebagai bukti pembayaran otomatis.

## Keandalan dan kenyamanan yang masih perlu diuji/ditingkatkan

### 8. Katalog dan tracking masih bisa mengantre di lock transaksi

**Terbukti pada mock lock sibuk; durasi produksi belum diukur.** Guard `consumeBudget_` untuk read masih meminta ScriptLock yang sama dengan checkout/migrasi, dengan waktu tunggu hingga 15 detik ([code.gs](code.gs#L9)). Dalam simulasi lock sibuk, initial catalog gagal sedangkan preview voucher berhasil. Migrasi juga menahan lock selama pencadangan/perubahan struktur.

Perbaikan: pisahkan pencatatan budget baca dari lock transaksi dengan tetap mempertahankan perlindungan yang memadai. Tambahkan pemulihan/retry katalog yang jelas. Jalankan migrasi saat trafik sepi. Jangan menyimpulkan bahwa optimasi voucher sudah menghilangkan semua sumber loading lama.

### 9. Pemulihan WhatsApp sesudah refresh masih terbatas

Dari kode frontend: setelah pencatatan sukses, keranjang/kunci pending dibersihkan dan hanya ID terakhir yang disimpan lokal. Tautan WA cadangan berada di DOM, bukan disimpan. Jika popup diblokir lalu halaman direfresh sebelum tautan cadangan ditekan, referensi ID masih bisa diisi ke tracking, tetapi pesan sebelumnya tidak otomatis dapat dibuka kembali. Membuat ulang keranjang akan menjadi permintaan baru.

Perbaikan yang disarankan: berikan cara melanjutkan pesan pesanan terakhir menggunakan bukti request/receipt yang aman, tanpa order baru dan tanpa menjadikan URL tracking publik sebagai jalan membaca data kontak. Hindari menyimpan seluruh pesan berisi alamat/nomor telepon di perangkat bersama tanpa pertimbangan privasi.

### 10. Skala data dan batas global belum diukur

Katalog masih membaca semua produk lalu menyaring/paginasi. Pelacakan dan lookup retry membaca seluruh tabel orders; checkout juga membaca arsip order lagi untuk mencegah benturan ID. Kolom JSON snapshot membuat setiap baris order relatif besar. Saat data tumbuh, pembacaan seluruh arsip berulang di dalam lock perlu diganti pencarian kolom ID/request atau index yang sesuai.

Batas katalog 600/menit dan order 60/10 menit adalah global untuk aplikasi, bukan jatah tiap pelanggan. CacheService dapat dieviksikan; preview kupon memakai counter nonblocking yang bisa meleset saat bersamaan. Batas ini bukan anti-DDoS, dan kapasitas pengunjung tertentu belum terbukti. Ukur waktu initial load, pencarian, voucher, checkout dan tracking pada trafik nyata sebelum promosi besar.

### 11. Identitas produk dan batas jumlah

Nama+brand adalah pengenal otomatis. Mengubah nama/brand memutus identitas keranjang yang sudah tersimpan, sedangkan mengubah harga atau urutan baris aman. Jika perubahan nama sering terjadi, gunakan pengenal stabil yang dikelola sistem tanpa mengembalikan kolom ID manual.

Server membatasi 10.000 unit per produk, sedangkan kontrol tambah/kurang frontend hanya memeriksa integer aman. Pengguna bisa melihat jumlah yang akhirnya ditolak saat checkout. Selaraskan batas aplikasi pada UI, tanpa mengembalikan pengecekan stok otomatis yang sudah sengaja dihapus.

## Pemeriksaan tujuh sheet pada data nyata

Menu Periksa Data Produk saat ini tidak menggantikan pemeriksaan semua dataset berikut. Tidak ada klaim bahwa data asli sedang salah.

| Sheet | Yang harus dipastikan |
| --- | --- |
| products | Pasangan nama+brand unik, harga numerik, grosir lengkap/masuk akal, satuan jelas, kategori sesuai daftar, foto dapat dibuka, `is_unggulan` menggunakan format yang didukung (`YA`/`TIDAK`). Nilai nol harus disengaja. |
| categories | Nama tidak ganda; nilai `products.id_kategori` benar-benar nama kategori yang sama, bukan ID kategori dari skema lama. Updater struktur tidak otomatis mengubah semua ID kategori lama menjadi nama. |
| brands | Nama tidak ganda dan konsisten dengan kolom brand pada products; logo dapat diakses tanpa login. |
| banners | Keterangan jelas, foto/banner dapat dibuka tanpa login, tautan tujuan benar dan memakai HTTPS. |
| coupons | Kode unik termasuk setelah trim/uppercase, angka dan kuota valid, status aktif benar, minimum belanja jelas. Nomor baris kuota tidak bergeser saat checkout karena edit manual tidak mengikuti ScriptLock. |
| settings | Satu baris per kunci, nomor WA konsisten, alamat toko dan media sosial asli, tidak ada placeholder atau tujuan yang salah. Hanya setting publik yang dikirim ke browser; rahasia jangan ditaruh di field publik. |
| orders | Kolom sistem retry/snapshot tidak dihapus atau diedit sembarangan; pengelola memahami status, pembatalan, pembayaran dan total produk/final. Jangan menjadikan sheet order publik. |

Lindungi header/kolom sistem dari edit tidak sengaja, batasi editor, tentukan retensi data pelanggan dan cadangan, dan uji pemulihan. Kode pemformatan header belum membuktikan adanya proteksi rentang pada sheet asli. Cadangan migrasi tidak otomatis mencakup pesanan yang masuk setelah waktu pencadangan. Penulisan lintas sheet tetap tidak atomik jika terjadi hard timeout/hasil tulis tidak pasti; proses rekonsiliasi pengelola masih dibutuhkan.

## Gate deployment, perangkat dan domain

Sebelum launch publik, lakukan pengujian nyata berikut:

1. Pastikan satu deployment produksi `/exec` memakai kelima file dari versi yang sama. Deployment lama yang berbeda perilaku perlu ditinjau/dinonaktifkan. `/dev` bukan URL pelanggan.
2. Periksa eksekusi sebagai pemilik dan akses publik yang diizinkan akun; buka `/exec` tanpa login Google/mode samaran. Jangan membuka sharing spreadsheet hanya agar aplikasi publik dapat dipakai.
3. Buat order uji nyata dan periksa satu baris orders, diskon, satuan, nomor tujuan WA, pesan yang benar-benar diterima, perubahan status dan tracking. Uji kasus voucher salah lalu dibetulkan dan pembatalan stok.
4. Uji Android Chrome dan Safari iPhone: popup/tautan WA, kembali dari aplikasi WA, refresh saat permintaan tertunda, storage ditolak, scroll sticky, pencarian, serta orientasi layar. Browser desktop Chromium tidak membuktikan handoff aplikasi WhatsApp pada HP.
5. Jika memakai Google Sites/custom domain, ulangi pengujian pada iframe/domain tersebut. Perilaku popup dan storage dapat berbeda dari membuka `/exec` langsung.
6. Verifikasi HTTPS, DNS, kepemilikan domain, informasi layanan (jam buka, area antar, ongkir, pembayaran, pembatalan/retur, penggunaan data pembeli), pemantauan error/kuota dan rencana rollback.

Apps Script tetap tidak menyediakan custom-domain mapping langsung seperti hosting biasa. Google Sites dengan custom domain dan embed `/exec` adalah jalur perubahan kecil jika fitur akun mendukung; frontend hosting terpisah membutuhkan pengganti `google.script.run`. Domain tidak otomatis memperbaiki SEO produk; katalog saat ini belum punya URL per produk, metadata share produk, atau rancangan indeks yang lengkap.

## Urutan yang disarankan

1. Perbaiki batas voucher gagal, satuan seluruh UI, konsistensi setting/nomor WA, dan ID tracking acak satu kolom.
2. Tetapkan aturan kuota saat batal dan pencatatan total akhir/pembayaran; rapikan rincian tracking.
3. Jalankan pemeriksaan data nyata dan tes produksi/perangkat; ukur penantian lock dan waktu respons.
4. Uji terbatas dengan beberapa pelanggan dahulu, lalu pasang/uji domain dan buka publik setelah hasilnya benar.

Stok otomatis, akun pelanggan, pembayaran otomatis, dan dashboard besar bukan persyaratan wajib untuk katalog usaha ini. Fokus terakhir adalah unit/harga yang tidak membingungkan, tujuan WA yang pasti, pelanggan tidak terblokir oleh percobaan gagal, ringkasan pesanan terlindungi, dan proses manual yang bisa direkonsiliasi.
