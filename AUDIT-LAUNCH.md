# Audit kesiapan launch Toko Abangda

Tanggal: 3 November 2026 (Asia/Jakarta). Kode yang diperiksa: commit `2bc6a9d3147a316e21740629d6042cd8d4fa2bb0`.

**Penilaian: belum siap untuk launch publik penuh.** Layak dilanjutkan ke perbaikan dan uji terbatas. Alur normal berjalan dalam simulasi, tetapi masih ada masalah reproduktif pada katalog, checkout, pencarian, dan pencatatan transaksi. Audit ini tidak mengubah kode aplikasi atau sheet asli.

## Status setelah paket perbaikan wajib

Enam temuan bagian 1 sudah mendapat perbaikan kode dan uji regresi: retry checkout dengan kunci yang disimpan bersama order, respons kategori/pencarian berurutan, render data/URL yang aman, pemisahan produk rusak dan baris kosong, pembatasan server dasar, serta CSS produksi yang dibundel. Subtotal/diskon/kupon juga sudah disimpan dan benturan ID setelah reset counter dicegah. Lihat [README](README.md) untuk pemasangan kelima file lengkap dan batas perilaku terbaru. Uraian temuan awal di bawah dipertahankan sebagai catatan kondisi saat audit; pernyataan “belum diperbaiki” pada ringkasan awal bukan status kode terbaru.

Status produksi tetap belum terverifikasi. Pengembalian kuota saat pembatalan manual, ID tracking acak, pemeriksaan operasional/deployment/domain dan uji perangkat nyata belum dikerjakan. Pembatasan CacheService adalah pengendalian dasar yang bisa dipengaruhi eviksi cache, bukan anti-DDoS. Transaksi lintas-sheet belum atomik walaupun retry normal dan penulisan yang responsnya hilang sudah ditangani.

## Batas pemeriksaan

Yang diperiksa: `index.html`, `js.html`, `code.gs`, `setup.gs`, skema tujuh sheet, dokumentasi, serta pengujian backend dan browser. Sebanyak 48 pemeriksaan backend, pengujian migrasi, dan empat suite browser yang sudah tersedia kembali lolos.

Pemeriksaan tambahan berhasil mereproduksi sembilan kondisi di luar cakupan tes lama: pengiriman checkout ganda, benturan ID setelah counter direset, baris produk kosong yang merusak respons katalog, produk duplikat yang tampil tetapi menggagalkan checkout, riwayat diskon/kupon tidak tersimpan, respons filter lama menimpa pilihan terbaru, teks produk menjadi markup aktif di keranjang, tanda kutip ganda pada brand merusak tombol, serta saran pencarian lama menimpa hasil terbaru.

**Belum terverifikasi:** isi/izin spreadsheet asli, versi Apps Script yang terpasang, deployment `/exec`, akses pengunjung tanpa login, gambar dan CDN di perangkat pelanggan, WhatsApp pada perangkat nyata, penyimpanan dalam iframe, kapasitas trafik nyata, serta konfigurasi domain/DNS. Sesi ini tidak memiliki konektor edit/baca Sheets. Upaya membuka dokumentasi eksternal juga diblokir jaringan; tautan referensi domain di bawah disediakan untuk verifikasi konfigurasi, bukan bukti bahwa konfigurasi akun sudah diperiksa.

## 1. Perbaikan wajib sebelum dibuka ke publik

### 1.1 Checkout belum tahan pengiriman ulang

Bukti: `code.gs` fungsi `createOrder`, terutama pembuatan ID dan penulisan baris sekitar baris 553–576. Mengirim payload yang sama dua kali menghasilkan dua ID/baris pesanan, dan menghabiskan kuota kupon dua kali. Menonaktifkan tombol di browser hanya mencegah klik saat permintaan masih berjalan; tidak menyelesaikan kasus respons jaringan hilang setelah server berhasil menulis.

Perbaikan: satu kunci permintaan checkout yang dipakai ulang untuk retry, pemeriksaan server di dalam lock, dan pengembalian pesanan yang sama untuk permintaan yang sudah tercatat. Kunci harus ditautkan ke payload agar tidak dipakai untuk mengganti isi pesanan sebelumnya. Jangan memakai data pribadi atau keranjang global sebagai pengenal tunggal.

### 1.2 Respons kategori dan pencarian bisa salah urutan

Bukti: `js.html` `loadProducts` sekitar baris 511–559. Permintaan baru dibuang ketika `isLoadingProducts` aktif, tetapi filter di layar sudah berubah. Simulasi memilih B ketika A masih dimuat berakhir dengan filter B dan produk A. `fetchSearchSuggestions` sekitar baris 757–768 juga menerima respons lama tanpa pemeriksaan kata kunci/urutan. Brand dan modal detail mempunyai risiko respons terlambat serupa berdasarkan pembacaan kode; belum direproduksi terpisah.

Perbaikan: nomor versi permintaan/snapshot filter, abaikan respons usang, jalankan permintaan terbaru setelah yang lama selesai, dan jangan menaikkan halaman secara permanen bila append gagal.

### 1.3 Penanganan teks dan URL dari sheet belum konsisten

Bukti: `js.html` `renderCartUI` sekitar baris 967–990 menyisipkan nama, brand, dan URL langsung ke `innerHTML`. Dalam pengujian browser, nama produk yang berisi markup gambar memicu event JavaScript. `renderBrands` sekitar baris 502–503 juga memasukkan teks ke HTML dan onclick; brand dengan tanda kutip ganda sudah cukup untuk merusak atribut tombol. Banner/gambar dan saran pencarian masih memiliki penyusunan atribut manual; `bindSocialLink` menerima skema URL tanpa pembatasan.

Perbaikan: buat elemen dengan DOM, gunakan `textContent`, pasang event listener, dan izinkan hanya URL/protokol yang diperlukan. Escaping HTML dan escaping string JavaScript adalah dua konteks berbeda. Sumber yang dibuktikan adalah data katalog/sheet; audit ini **tidak** menemukan jalur pelanggan anonim menulis nama produk ke sheet.

### 1.4 Katalog belum tahan baris kosong atau data rusak

Bukti: `code.gs` sekitar baris 241–267. Menambahkan baris berisi sel kosong ke data range membuat seluruh respons katalog gagal karena `productFromRow_` menolak nama kosong. Ini berlaku untuk baris yang benar-benar termasuk data range, bukan seluruh baris kosong di bawah area terpakai. Produk duplikat dapat tampil dua kali di katalog, tetapi `createOrder` menolak seluruh checkout ketika menemukan pasangan nama/brand ganda, termasuk bila duplikat bukan item yang dipesan.

Perbaikan: abaikan baris benar-benar kosong, sediakan pemeriksaan kesehatan data untuk admin, deteksi duplikat sebelum produk ditampilkan, dan beri penjelasan konfigurasi yang jelas. Produk rusak tidak boleh diam-diam diberi harga nol atau dipadankan dengan produk lain.

### 1.5 Pesanan publik belum punya pengendalian penyalahgunaan

Dari kode: tidak ada pembatasan laju, challenge anti-bot, atau pemantauan lonjakan pemesanan/pelacakan. Endpoint checkout publik dapat mencatat order yang belum dikonfirmasi dan mengurangi kuota kupon. Ini berpotensi menghabiskan kuota Apps Script dan kupon. Tidak dilakukan serangan trafik ke deployment asli.

Perbaikan: batas permintaan yang sesuai kemampuan platform, challenge tervalidasi server bila diperlukan, pembatasan jumlah wajar, pencatatan error, dan alarm operasional. Proteksi harus dijalankan di server; menambah jeda tombol saja tidak cukup.

### 1.6 Gaya tampilan masih bergantung pada Tailwind CDN runtime

Bukti: `index.html` baris 12. Bila CDN gagal, mayoritas utility class tidak tersedia. Tes browser memakai CSS fixture lokal sehingga tidak membuktikan keandalan CDN produksi. Font dan ikon juga memakai sumber eksternal.

Perbaikan: build CSS dari class aplikasi dan sertakan hasilnya di Apps Script/hosting. Pastikan class yang dibuat dinamis disertakan dalam build; jangan hanya memindai markup statis. Setelah itu uji tampilan dengan CDN diblokir.

## 2. Transaksi dan pelacakan yang perlu dirapikan

- **Riwayat transaksi belum lengkap.** `createOrder` menghitung subtotal, kupon, dan diskon tetapi hanya menyimpan item dan total akhir bersama data pelanggan/status. Bahkan bila kolom `subtotal`, `kode_kupon`, dan `diskon` ditambahkan manual, nilainya tidak ditulis. Tambahkan snapshot subtotal/diskon/kode kupon, ongkir bila sudah disepakati, total final dan status pembayaran sesuai proses manual. Total di tracking saat ini dapat berbeda dari jumlah harga item tanpa rincian diskon.
- **Kuota kupon berkurang sebelum stok/pembayaran dikonfirmasi.** Pembatalan melalui perubahan status manual tidak mengembalikannya. Putuskan apakah kupon dikonsumsi saat pencatatan, saat konfirmasi, atau memakai reservasi. Pengembalian kuota harus satu kali, tidak boleh berulang setiap status diganti.
- **Nomor pesanan bisa bertabrakan bila Script Properties direset.** Counter tidak memeriksa ID yang sudah ada di `orders`. Kondisi ini berhasil direproduksi dengan mereset properties sementara data lama tetap ada. Perbaiki generator dengan pemeriksaan benturan di dalam lock atau gunakan ID acak yang cukup kuat.
- **Pelacakan ID saja tetap bisa dipakai.** Tidak perlu mengembalikan kolom kode/token. Namun ID saat ini berurutan (`TA-tanggal-001`), sehingga ringkasan item/total/status mudah dicoba-coba. Gunakan ID pesanan acak yang sulit ditebak dan tetap satu kolom input. Respons saat ini sudah tidak menyertakan nama, telepon, alamat, dan catatan pelanggan.
- **Bukti pesanan hilang saat halaman direfresh.** ID, ringkasan, dan tautan WhatsApp hanya berada pada halaman konfirmasi; keranjang sudah dikosongkan. Bila pelanggan belum mengirim pesan, toko tetap punya baris orders dan bisa menghubungi nomor pembeli secara manual, tetapi pelanggan bisa kehilangan referensinya. Simpan minimal referensi ID terakhir dan sediakan salin ID. Jangan menyimpan data pelanggan/tautan berisi data pribadi tanpa mempertimbangkan perangkat bersama.
- **WhatsApp manual memang sesuai rancangan.** `wa.me` membuka pesan yang disiapkan; aplikasi tidak membuktikan bahwa pengguna menekan Kirim. Jangan menyebut klik tautan sebagai bukti pesan diterima atau pembayaran berhasil. Status stok manual dipertahankan sesuai permintaan pemilik toko.

## 3. Struktur dan operasi spreadsheet

Menu pembaruan sekarang mencadangkan spreadsheet, menambah header/sheet yang kurang, menormalkan header yang dikenal, menghapus ID produk/brand serta token usang, dan mengubah ID banner menjadi keterangan. Pengujian pengulangan, variasi header, dan kegagalan cadangan lolos. Ini **tidak menjamin isi data benar**.

Sebelum launch, periksa data nyata:

1. Harga normal/grosir dan minimum belanja berupa angka; kedua field grosir sama-sama lengkap atau kosong.
2. Nama produk + brand unik, nama kategori produk cocok dengan `categories.nama`, serta brand cocok dengan `brands.nama_brand`. Sheet kategori lama yang memakai ID terpisah perlu diperiksa: updater menambah header/dropdown tetapi tidak menjalankan migrasi ID kategori ke nama yang ada pada initializer lama.
3. Nomor WA toko benar. Backend masih memiliki nomor fallback; bila setting hilang aplikasi dapat tetap memakai nomor default. Jadikan nomor tujuan eksplisit sebelum launch.
4. Tautan gambar dapat diakses tanpa login dan placeholder alamat/media sosial sudah diganti.
5. Header dan kolom rumus dilindungi dari edit tidak sengaja; hanya pengelola yang punya akses sheet orders. Aplikasi publik tidak berarti spreadsheet perlu dibuat publik.
6. Salinan cadangan berisi data pelanggan juga. Atur siapa yang dapat mengaksesnya, jadwal cadangan rutin, retensi, dan uji pemulihan. Cadangan dari tombol migrasi tidak otomatis memuat pesanan setelah waktu pencadangan.
7. Migrasi beberapa sheet tidak atomik. Kegagalan di tengah bisa menyisakan sebagian perubahan; dialog sudah menyatakan hal itu. Jalankan saat trafik sepi dan pastikan menu menampilkan hasil berhasil, bukan hanya menganggap pemasangan kode sebagai migrasi.

Nama/brand menjadi identitas internal otomatis saat ini. Mengurutkan baris atau mengganti harga aman terhadap identitas, tetapi mengganti nama/brand mengubah pengenal dan dapat menghapus item dari keranjang yang dipulihkan. Jika produk sering diedit, pertimbangkan pengenal stabil yang dikelola sistem tanpa kolom ID yang harus diisi pengguna; ini perbaikan rancangan lanjutan, bukan alasan mengembalikan kolom manual.

## 4. Kinerja dan kemudahan penggunaan

`getProducts` membaca seluruh tabel dua kali dan menyaring semuanya sebelum mengambil satu halaman. Pengetikan pencarian memicu permintaan katalog dan saran terpisah. Pelacakan membaca seluruh tabel orders. Belum ada cache katalog, pengukuran latensi produksi, atau uji beban asli. Optimalkan pembacaan dan cache katalog saja; data harga/kupon saat checkout tetap diverifikasi ulang dari sumber otoritatif. Jangan menjanjikan kapasitas pengunjung tertentu sebelum diukur.

Tambahkan indikator awal/retry yang jelas, pagination yang bisa dicoba ulang setelah gagal, validasi WhatsApp yang konsisten untuk `08...` dan `628...`, serta batas jumlah per item yang sesuai usaha. Viewport saat ini menonaktifkan zoom; izinkan zoom untuk keterbacaan. SEO belum memiliki deskripsi, metadata share, URL produk tersendiri, atau rancangan indeks katalog. Ini peningkatan setelah masalah transaksi/katalog diselesaikan.

Tambahkan informasi layanan yang dibutuhkan pelanggan: area antar, cara hitung ongkir, jam operasional, pembayaran yang diterima, prosedur retur/pembatalan, dan penjelasan penggunaan nama/nomor WA/alamat. Kebutuhan ini mengikuti proses usaha, bukan pengganti stok otomatis atau payment gateway yang memang belum diminta.

## 5. Custom domain

**Apps Script webapp tidak menyediakan custom-domain mapping langsung melalui DNS seperti hosting website biasa.** Domain redirect ke `/exec` akan beralih ke alamat Google; itu bukan hosting aplikasi di domain sendiri. URL `/dev` hanya untuk pengujian pengguna yang punya akses editor, bukan tautan pelanggan.

Frontend sekarang memakai `google.script.run`. File tidak bisa sekadar dipindah ke GitHub Pages, Cloudflare Pages, Netlify, atau Vercel lalu diharapkan tetap memanggil fungsi Apps Script. RPC itu hanya tersedia dalam konteks HTML Service Apps Script. Header HTML, iframe sandbox, dan kebijakan origin juga perlu diperhitungkan.

Pilihan:

| Pilihan | Implikasi |
| --- | --- |
| Google Sites dengan custom domain + embed `/exec` | Perubahan paling kecil jika mempertahankan hosting Google Sites. Domain berada pada halaman pembungkus; app tetap iframe. Verifikasi ketersediaan menu custom domain sesuai akun/Workspace, izin akses publik, HTTPS, tampilan tinggi/scroll, WhatsApp, dan storage Safari/Chrome. SEO produk tetap terbatas. |
| Frontend pada hosting yang mendukung custom domain + backend/API yang dirancang ulang | Memberi kontrol lebih atas URL, SEO, dan tampilan. Perlu mengganti `google.script.run`, merancang API/perantara server, validasi, anti-spam, otorisasi akses sheet, serta menangani redirect/CORS. Rahasia dan service-account credentials tidak boleh masuk JavaScript browser. |
| Redirect domain ke Apps Script | Mudah untuk tautan pendek, tetapi alamat browser pindah ke Google dan tidak menyelesaikan kebutuhan branding domain penuh. |

Rekomendasi tahap dekat: perbaiki penghalang launch, uji `/exec`, lalu gunakan Google Sites + domain bila ingin mempertahankan rancangan sekarang dan menerima keterbatasan iframe. Bila domain sendiri, SEO katalog, dan kendali tampilan menjadi prioritas utama, rencanakan frontend hosting terpisah sebagai pekerjaan migrasi sebelum peluncuran penuh. Domain boleh dipesan untuk mengamankan nama, tetapi membeli domain tidak menyelesaikan masalah aplikasi; ketersediaan nama domain belum dicek.

Referensi konfigurasi:
- Apps Script webapps: https://developers.google.com/apps-script/guides/web
- HTML Service dan RPC: https://developers.google.com/apps-script/guides/html/communication
- Google Sites custom domain: https://support.google.com/sites/answer/9068867
- Kuota Apps Script: https://developers.google.com/apps-script/guides/services/quotas

## 6. Gerbang peluncuran

1. Selesaikan keamanan render teks/URL, checkout tahan retry, respons filter/pencarian, dan katalog tahan data kosong/rusak.
2. Lengkapi riwayat transaksi serta aturan kuota kupon; amankan generator ID dan pelacakan tetap satu input.
3. Periksa data/nomor WA/gambar/izin sheet asli dan jalankan migrasi yang berhasil.
4. Gunakan satu deployment produksi `/exec`, perbarui ke versi yang benar, dan uji melalui mode samaran tanpa login Google. Hentikan penggunaan deployment lama yang memberi perilaku berbeda.
5. Lakukan satu pesanan nyata: harga normal → batas grosir → turun kembali → kupon → submit → satu baris orders → kirim WA → konfirmasi manual → perubahan status → pelacakan. Uji retry setelah koneksi putus serta refresh konfirmasi.
6. Uji di Chrome Android dan Safari iPhone, khususnya setelah dibungkus Google Sites/domain; pastikan penyimpanan dan tautan WhatsApp punya fallback yang dapat dipakai.
7. Periksa HTTPS/domain, rencana rollback, backup yang dapat dipulihkan, serta pemantauan error/kuota.

Fitur yang belum wajib untuk katalog dengan konfirmasi manual: stok otomatis, pembayaran otomatis, akun pelanggan, atau dashboard kompleks. Fokus peluncuran adalah pemesanan yang benar, dapat dilacak dan direkonsiliasi, data yang terlindungi, dan jalur domain yang benar-benar kompatibel.
