# Toko Abangda — transaksi dan pelacakan pesanan

Aplikasi Google Apps Script yang terhubung ke Google Sheets. Nama toko tetap Toko Abangda.

## Perbaikan pembaruan kolom ID

Ganti seluruh isi **code.gs / Kode.gs** dan **setup.gs**, simpan, lalu perbarui deployment webapp. Muat ulang spreadsheet dan jalankan **Toko Abangda → Perbarui Struktur Sheet**. Ini tetap membuat cadangan terlebih dahulu. Memasang kode saja tidak menghapus kolom spreadsheet; menu pembaruan harus dijalankan.

Pembaruan mengenali variasi header seperti `ID Product`, `id_products`, `ID-PRODUK`, atau header dengan spasi/huruf besar. Header yang dikenal dirapikan tanpa mengubah isi baris; ID produk/brand dan token usang kemudian dihapus dan hasilnya diperiksa lagi. Kolom tambahan yang tidak dikenal tetap dipertahankan. Header ganda yang menjadi ambigu sesudah normalisasi menghentikan proses sebelum perubahan, agar tidak menghapus data yang salah.

Pengenal internal produk kini selalu berasal dari nama dan brand, bahkan ketika kolom ID lama belum dihapus. Mengubah/menghapus ID lama tidak lagi mengubah pengenal katalog, keranjang, atau checkout. Menu lama **Siapkan Database** diarahkan ke pembaruan yang sama; menu reset/data contoh tidak lagi ditampilkan. Data contoh produk juga tidak lagi mengisi ID.

Uji regresi: `MIGRATE_DURING_CART=1 node tests/wholesale.browser.cjs` menghapus kolom ID saat keranjang berisi produk, lalu melanjutkan tambah/kurang, detail, refresh, grosir, checkout, dan pelacakan. Tes backend memeriksa pengenal sebelum/sesudah penghapusan, dan tes migrasi memeriksa variasi header serta jalur menu lama. Pengujian ini menggunakan Sheets tiruan; sheet asli belum dapat diakses dari sesi ini.

## Produk dan brand tanpa kolom ID; keterangan banner

Ganti seluruh isi **code.gs** (backend `Kode.gs`), **js.html**, dan **setup.gs** dari repo. Simpan dan uji `/dev`, lalu perbarui deployment `/exec` yang dipakai pelanggan **sebelum** menjalankan migrasi sheet. Backend baru mendukung sheet lama maupun baru dan selalu mengabaikan nilai ID lama untuk menghitung pengenal produk. Muat ulang spreadsheet, lalu pilih **Toko Abangda → Perbarui Struktur Sheet**.

Menu membuat cadangan utuh, menghapus `products.id_produk` dan `brands.id_brand`, serta mengganti header `banners.id_banner` menjadi `keterangan` tanpa menghapus nilai pada baris banner. Isi labelnya sendiri, misalnya “Promo sembako” atau “Banner Ramadan”. Jika kedua header banner sudah ada, kolom `keterangan` dipertahankan dan `id_banner` dihapus; nilai lamanya tersedia di cadangan. Menu tetap menghapus token pelacakan lama.

Kolom akhir products: `nama`, `id_kategori`, `brand`, `harga`, `deskripsi`, `url_foto`, `is_unggulan`, `harga_grosir`, `min_beli_grosir`. Kolom brands: `nama_brand`, `url_logo`. Kolom banners: `keterangan`, `url_gambar`, `link`. Urutan aktual mengikuti kolom lama; kolom tambahan lain tetap dipertahankan.

Aplikasi membuat kunci internal otomatis berdasarkan pasangan nama produk dan brand, tanpa kolom ID di spreadsheet. Pasangan tersebut harus unik; varian produk perlu nama berbeda. Pengurutan baris dan perubahan harga tidak mengubah kunci. Mengganti nama atau brand mengubah kunci, sehingga pelanggan perlu memilih ulang item tersebut. Keranjang tersimpan dengan ID lama juga perlu dipilih ulang setelah migrasi; pemulihan keranjang memberi pemberitahuan item tidak tersedia. Pesanan yang sudah tercatat tetap menyimpan rincian lamanya. Nama/brand ganda menghentikan migrasi sebelum perubahan; checkout juga menolak produk ambigu.

Uji tambahan: `NO_PRODUCT_IDS=1 node tests/wholesale.browser.cjs` menjalankan katalog, kuantitas grosir, detail, keranjang persisten, checkout, WhatsApp, dan pelacakan tanpa kolom ID produk.

## Tombol pembaruan struktur sheet — 3 November 2026

Untuk memasang menu baru, ganti **seluruh isi [setup.gs](setup.gs)** di Apps Script, simpan, lalu muat ulang Google Sheets. Pilih **🛒 Toko Abangda → 🔄 Perbarui Struktur Sheet**. Jika Google meminta otorisasi untuk membuat cadangan, izinkan menggunakan akun pemilik spreadsheet.

Menu ini membuat salinan lengkap spreadsheet terlebih dahulu, lalu memeriksa tujuh sheet (`products`, `categories`, `brands`, `banners`, `orders`, `coupons`, `settings`) terhadap skema yang juga digunakan setup awal. Sheet/kolom wajib yang belum ada ditambahkan. Kolom token di `orders` serta ID produk/brand dihapus; ID banner menjadi keterangan sesuai pembaruan di atas. Dropdown kategori produk dan status pesanan diperbarui.

Baris yang ada, rumus, harga, nomor WhatsApp, pengaturan toko, dan kolom tambahan tetap dipertahankan. Kolom lama `stok` tetap diabaikan aplikasi. Tidak ada penyusunan ulang kolom, reset database, penambahan data contoh, atau penghapusan sheet lain. Menu ini memperbarui struktur; isi data dan aturan bisnis tetap mengikuti konfigurasi milik toko.

Jika header ganda terdeteksi, pembaruan berhenti sebelum perubahan. Jika cadangan gagal dibuat, data tidak diubah. Jika penulisan gagal setelah cadangan dibuat, dialog memberi tautan cadangan; sebagian perubahan mungkin sudah diterapkan. Setiap eksekusi membuat satu cadangan baru dan aman dijalankan ulang terhadap struktur yang sama. Cadangan tidak diperbarui otomatis ketika data baru masuk. ScriptLock melindungi proses dari checkout melalui skrip yang sama, tetapi pengeditan spreadsheet manual tidak mengikuti lock.

Fungsi `updateSheetStructure_` bersifat privat bagi RPC webapp, hanya untuk menu spreadsheet/editor Apps Script. Ini berbeda dari **Siapkan Database**; gunakan menu **Perbarui Struktur Sheet** untuk memperbarui spreadsheet yang sudah berisi data. Tidak perlu memperbarui deployment webapp untuk memunculkan menu spreadsheet; Apps Script harus sudah memakai versi terbaru fitur pelacakan ID saja sebelum kolom token dihapus.

Pengujian lokal: `node tests/migration.test.cjs` memeriksa cadangan sebelum perubahan, seluruh skema, pemeliharaan data/rumus/kolom tambahan, penghapusan token, pengulangan, dan penanganan kegagalan. Spreadsheet asli belum diubah atau diuji dari workspace ini.

## Pembaruan stok manual, harga grosir, dan kategori — 27 Oktober 2026

Ganti **empat file lengkap**: [code.gs](code.gs) ke backend `Kode.gs` yang ada, [js.html](js.html), [index.html](index.html), dan [setup.gs](setup.gs). `css.html` tetap. Simpan semuanya, buka `/dev`, lalu muat ulang spreadsheet. Jangan menjalankan setup database untuk memasang revisi ini.

### Kolom harga grosir

Dua kolom berikut ditambahkan otomatis di akhir sheet `products` saat aplikasi dibuka. Alternatif: pilih menu **Toko Abangda → Siapkan Kolom Harga Grosir**. Proses ini hanya menambahkan kolom yang belum ada dan tidak menghapus atau mengisi ulang produk lama.

| harga | harga_grosir | min_beli_grosir |
| --- | --- | --- |
| 10000 | 9000 | 12 |

Contoh: 1–11 pcs = Rp10.000/pcs; 12 pcs atau lebih = Rp9.000/pcs untuk **seluruh jumlah produk tersebut**. Turun ke 11 pcs mengembalikan harga normal. Jumlah produk berbeda tidak digabung untuk mencapai batas grosir. Pembelian dari kartu produk dan modal dihitung bersama berdasarkan ID produk dalam keranjang.

Isi angka tanpa teks Rp: `harga` adalah harga normal, `harga_grosir` harus lebih dari nol dan tidak melebihi harga normal, `min_beli_grosir` adalah bilangan bulat minimal 1. Kosongkan kedua kolom grosir (atau isi keduanya nol) jika produk tidak memiliki harga grosir. Mengisi hanya salah satu atau angka tidak valid akan menampilkan error konfigurasi; lengkapi atau kosongkan keduanya.

Tombol tambah/kurang pada kartu produk, modal, keranjang, ringkasan checkout, dan pemulihan keranjang memakai aturan harga yang sama. Server menghitung ulang harga grosir berdasarkan jumlah total per SKU ketika order dibuat. Jika kupon digunakan, perhitungan kupon memakai subtotal setelah harga grosir. Pesan WhatsApp dan pelacakan memakai harga pesanan yang tercatat.

### Ketersediaan dikonfirmasi manual

Badge stok/habis/sisa, pembatas jumlah berdasarkan stok, dan pemeriksaan stok checkout dihapus. Produk dapat dipesan walaupun kolom `stok` lama bernilai nol, kosong, atau sudah dihapus. Kolom lama tidak dibaca dan tidak dihapus otomatis. Admin memeriksa ketersediaan lalu menghubungi nomor WhatsApp pembeli yang tercatat pada sheet `orders`. Status awal tetap **Menunggu Konfirmasi Stok**.

### Kategori terbaca penuh

Kategori beranda memakai dua kolom dengan nama yang membungkus ke beberapa baris, tanpa ellipsis atau pembatas satu baris. Nama kategori di sidebar juga tidak dipotong. Nama yang berisi tanda kutip tetap dapat diklik.

### Keranjang tersimpan

Keranjang menyimpan version/waktu/ID produk/jumlah di perangkat/browser yang sama selama maksimal 30 hari sejak terakhir disimpan. Harga, nama produk, kupon, data pemesan, dan kode pelacakan tidak disimpan. Pemulihan membaca harga normal/grosir terbaru dari server, mempertahankan jumlah yang diminta, dan hanya menghapus produk yang tidak lagi terdaftar.

Jika pemulihan gagal, cache dipertahankan dengan opsi coba lagi/kosongkan. Checkout gagal mempertahankan cache; checkout berhasil menghapusnya. Jika localStorage diblokir atau penuh, aplikasi tetap bisa digunakan dengan keranjang sesi dan pemberitahuan. Bukan sinkronisasi akun lintas perangkat atau sinkronisasi langsung antar tab.

Uji `/dev`: isi contoh harga grosir pada satu produk, tambah/kurangi hingga melewati minimum, periksa harga di kartu/modal/keranjang, refresh, dan lakukan pesanan uji. Pastikan label stok sudah tidak ada dan nama kategori panjang terbaca. Setelah lolos, perbarui deployment `/exec` dan embed Google Sites jika dipakai.

## Salin kode lengkap ke Apps Script

Buka file di bawah, lalu gunakan tombol **Copy raw file** di GitHub untuk menyalin seluruh kode. Hindari menyalin nomor baris atau pratinjau potongan kode.

| File GitHub | File tujuan di Apps Script |
| --- | --- |
| [code.gs](code.gs) | `Kode.gs` yang sudah ada |
| [js.html](js.html) | `js.html` |
| [index.html](index.html) | `index.html` |
| [setup.gs](setup.gs) | `setup.gs` |
| [css.html](css.html) | `css.html` (versi asli, disertakan sebagai cadangan) |

Ganti seluruh isi file sesuai namanya; jangan gabungkan atau membuat backend duplikat. Simpan keempat file revisi sebelum menguji `/dev`. Tidak perlu menjalankan setup database.

## File aplikasi dan pemasangan

1. Ganti backend yang ada dengan `code.gs` (di editor pengguna boleh bernama `Kode.gs`); jangan menambahkan backend duplikat.
2. Ganti `js.html`, `index.html`, dan `setup.gs` dengan versi di repo ini. Keempat file harus memakai revisi yang sama. `css.html` tetap asli.
3. Simpan semua file lalu uji URL `/dev`. Tidak perlu menjalankan ulang setup database. Kolom lama `tracking_token_hash` boleh dibiarkan; tidak dipakai dan tidak dihapus.
4. Muat ulang spreadsheet untuk memperbarui menu; menu kode pelacakan sudah dihapus.
5. Setelah hasil `/dev` benar, perbarui deployment `/exec` ke versi baru.
6. Uji satu pesanan: periksa harga/kupon, baris orders, pesan WhatsApp, dan pelacakan cukup dengan ID. Deployment asli belum diuji dari workspace ini.

Harga dan nilai/min_belanja/kuota kupon harus berupa angka bulat nonnegatif. Masukkan 34500 sebagai angka; format tampilan mata uang di Sheets boleh digunakan. Kupon harus PERSEN (1–100) atau NOMINAL (lebih dari nol).

## Transaksi

Server membaca ulang ID produk, jumlah, harga normal/grosir, dan kupon saat checkout. Harga/total/diskon dari browser tidak dipercaya. Produk dengan ID ganda atau angka tidak valid ditolak. Harga katalog dibaca dari nilai angka asli Sheets agar format mata uang tidak mengubah nominal. Jumlah berulang untuk produk sama digabung sebelum pemilihan harga grosir.

ScriptLock melindungi pembuatan nomor pesanan dan pemakaian kuota kupon antar permintaan melalui skrip ini. Kuota dipulihkan jika penulisan order gagal secara sinkron. Google Sheets tidak menyediakan transaksi atomik multi-sheet: kegagalan infrastruktur dengan hasil tulis yang tidak pasti tetap perlu rekonsiliasi admin. Penyuntingan Sheets manual tidak mengikuti ScriptLock.

Ketersediaan diperiksa manual oleh admin melalui WhatsApp; tidak ada pembatasan atau pencatatan stok otomatis. Kuota kupon terpakai ketika order tercatat; pembatalan belum mengembalikannya otomatis.

Setelah order tercatat, pelanggan melihat total server dan menekan tautan WhatsApp. Tautan dapat dibuka ulang tanpa membuat order baru. Keranjang dipertahankan bila checkout ditolak. Tidak ada pembayaran otomatis.

## Pelacakan dengan ID pesanan

Pelanggan cukup memasukkan ID pesanan dari konfirmasi atau WhatsApp. Tidak ada kode pribadi, penerbitan hash baru, atau menu rotasi kode. Pesanan lama dengan atau tanpa hash tetap dapat dilacak. Kolom hash lama diabaikan tanpa mengubah data lama.

Siapa pun yang mengetahui atau menebak ID dapat melihat ringkasan: tanggal, status, pengiriman, item, dan total. Respons tidak menyertakan nama pemesan, nomor WhatsApp, alamat, atau catatan. Mengubah ID segera membersihkan hasil; respons terlambat untuk ID sebelumnya diabaikan. Teks tersimpan ditampilkan dengan escaping.

Jangan menjalankan ulang setup database untuk memasang revisi ini. Cukup ganti seluruh isi `code.gs`/`Kode.gs`, `js.html`, `index.html`, dan `setup.gs`; `css.html` tidak berubah.

## Pemeriksaan lokal

- `node tests/checkout.test.cjs`: pemeriksaan backend, termasuk kalkulasi, kupon/grosir, pelacakan ID saja, dukungan pesanan lama, dan rekonsiliasi keranjang dari katalog terkini.
- `node tests/checkout.browser.cjs`: uji Chromium pada ukuran HP untuk checkout, Cara Order, konfirmasi, dan WhatsApp; respons RPC disimulasikan.
- `node tests/cart.browser.cjs`: penyimpanan pada origin browser stabil, refresh/buka ulang, harga terbaru tanpa pembatasan stok, data rusak/kedaluwarsa, gagal/retry, respons terlambat setelah discard, checkout sukses/gagal, dan storage ditolak/penuh. Menjalankan backend repo dengan layanan Sheets tiruan.
- `node tests/wholesale.browser.cjs`: harga berubah tepat pada batas grosir dan kembali normal saat dikurangi; tanpa stok; modal menghitung jumlah gabungan; keranjang persisten; kupon, WhatsApp, pelacakan; nama kategori penuh pada viewport 320/390/768/1280 piksel.
- `node tests/tracking.browser.cjs`: browser menjalankan kode klien dan backend repo, dengan layanan SpreadsheetApp/Utilities/LockService tiruan. Menguji lookup ID benar/salah, privasi kontak, penolakan respons terlambat, dan escaping teks.

Uji browser memerlukan Node, Playwright (diverifikasi dengan 1.62.1), dan Chromium. Gunakan `CHROMIUM_PATH` jika executable bukan `/usr/bin/chromium`. CSS fixture lokal dipakai dalam tes dengan CDN diblokir; koneksi CDN di perangkat pengguna belum dibuktikan oleh tes ini. Tidak ada penulisan ke Sheets asli dalam tes lokal.

## Belum termasuk

Ongkir otomatis, idempotensi checkout setelah reload, statistik admin, serta pembatasan laju/monitoring percobaan akses pelacakan. Pemegang kode yang dibagikan dapat melihat rincian pesanan; ganti kode melalui menu admin jika terlanjur tersebar.
