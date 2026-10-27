# Toko Abangda — transaksi dan pelacakan pesanan

Aplikasi Google Apps Script yang terhubung ke Google Sheets. Nama toko tetap Toko Abangda.

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
