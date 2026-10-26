# Toko Abangda — transaksi dan pelacakan privat

Aplikasi Google Apps Script yang terhubung ke Google Sheets. Nama toko tetap Toko Abangda.

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
3. Simpan semua file lalu uji URL `/dev`. Tidak perlu menjalankan ulang setup database. Kolom `tracking_token_hash` ditambahkan otomatis saat membuat pesanan atau kode pelacakan admin; data pesanan lama tidak dihapus.
4. Muat ulang spreadsheet agar menu **Toko Abangda → Buat/Ganti Kode Pelacakan** muncul.
5. Setelah hasil `/dev` benar, perbarui deployment `/exec` ke versi baru. Perbarui/nonaktifkan deployment publik lama yang masih menyediakan pelacakan hanya berdasarkan ID; menguji `/dev` saja tidak menutup akses pada backend lama.
6. Uji satu pesanan nyata dengan produk uji: periksa harga/kupon, baris orders, kode pada konfirmasi, pesan WhatsApp, dan pelacakan dengan kode benar/salah. Akses Google Sheets dan deployment asli belum dapat diuji dari workspace ini.

Harga, stok, nilai/min_belanja/kuota kupon harus berupa angka bulat nonnegatif. Masukkan 34500 sebagai angka; format tampilan mata uang di Sheets boleh digunakan. Kupon harus PERSEN (1–100) atau NOMINAL (lebih dari nol).

## Transaksi

Server membaca ulang ID produk, jumlah, harga, stok, dan kupon saat checkout. Harga/total/diskon dari browser tidak dipercaya. Produk dengan ID ganda atau angka tidak valid ditolak. Harga katalog dibaca dari nilai angka asli Sheets agar format mata uang tidak mengubah nominal. Jumlah berulang untuk produk sama digabung sebelum pemeriksaan stok.

ScriptLock melindungi pembuatan nomor pesanan dan pemakaian kuota kupon antar permintaan melalui skrip ini. Kuota dipulihkan jika penulisan order gagal secara sinkron. Google Sheets tidak menyediakan transaksi atomik multi-sheet: kegagalan infrastruktur dengan hasil tulis yang tidak pasti tetap perlu rekonsiliasi admin. Penyuntingan Sheets manual tidak mengikuti ScriptLock.

Stok tetap menunggu konfirmasi admin; belum ada reservasi atau pemotongan otomatis. Beberapa pesanan masih dapat meminta stok sama sebelum konfirmasi. Kuota kupon terpakai ketika order tercatat; pembatalan belum mengembalikannya otomatis.

Setelah order tercatat, pelanggan melihat total server dan menekan tautan WhatsApp. Tautan dapat dibuka ulang tanpa membuat order baru. Keranjang dipertahankan bila checkout ditolak. Tidak ada pembayaran otomatis.

## Pelacakan privat

- Pesanan baru mendapat kode acak 64 karakter, dibuat dari dua UUID oleh Apps Script. Server menyimpan SHA-256 kode pada kolom `tracking_token_hash`, bukan kode mentah.
- Pelanggan melihat kode di halaman konfirmasi, dan kode dicantumkan dalam pesan pesanan WhatsApp ke toko. Simpan bersama ID; jangan membagikannya kepada pihak lain.
- Pelacakan memerlukan ID dan kode sekaligus. Kode kosong/salah, ID tidak ada, atau pesanan lama tanpa hash menghasilkan penolakan umum yang sama; tidak ada fallback ID saja atau nomor WhatsApp.
- Respons yang sah hanya memuat ID/tanggal/status/pengiriman/item/total. Nama, nomor WhatsApp, alamat, catatan, hash, dan kode tidak disertakan dalam respons pelacakan.
- Kode tidak dimasukkan ke URL halaman katalog atau penyimpanan browser. Tautan pesan WhatsApp memang memuat kode sebagai bagian pesan yang ditujukan kepada toko.
- Mengubah ID/kode langsung membersihkan hasil sebelumnya. Respons yang terlambat untuk kredensial sebelumnya tidak ditampilkan.
- Hash bukan kode yang dapat dibagikan kepada pelanggan; kode mentah tidak dapat dipulihkan dari hash.

## Pesanan lama atau kode hilang

1. Admin memverifikasi pemilik pesanan melalui proses layanan toko.
2. Di sheet `orders`, pilih tepat satu baris pesanan, bukan header.
3. Pilih menu **Toko Abangda → Buat/Ganti Kode Pelacakan** dan konfirmasi.
4. Salin kode dari dialog lalu berikan hanya kepada pelanggan pemilik pesanan. Aplikasi tidak mengirim pesan otomatis.
5. Jika kode sebelumnya ada, kode itu langsung tidak berlaku; data/order ID tidak berubah.

Menu ini memanggil fungsi berakhiran `_`, yang tidak dapat dipanggil lewat `google.script.run`. Fungsi setup database juga menjadi `setupDatabase_` agar tidak tersedia sebagai RPC halaman publik; menu **Siapkan Database** tetap berfungsi. Jangan menjalankannya hanya untuk memasang revisi ini, karena migrasi awal dapat menata ulang kategori/pengaturan.

## Pemeriksaan lokal

- `node tests/checkout.test.cjs`: 42 pemeriksaan backend, termasuk kalkulasi, kupon/stok, hash, penolakan ID saja, pemisahan kode antar order, dukungan pesanan lama, dan rotasi admin.
- `node tests/checkout.browser.cjs`: uji Chromium pada ukuran HP untuk checkout, Cara Order, konfirmasi, dan WhatsApp; respons RPC disimulasikan.
- `node tests/tracking.browser.cjs`: browser menjalankan kode klien dan backend repo, dengan layanan SpreadsheetApp/Utilities/LockService tiruan. Menguji penerbitan kode, lookup benar/salah, privasi respons, penolakan respons terlambat, escaping teks, dan rotasi kode.

Uji browser memerlukan Node, Playwright (diverifikasi dengan 1.62.1), dan Chromium. Gunakan `CHROMIUM_PATH` jika executable bukan `/usr/bin/chromium`. CSS fixture lokal dipakai dalam tes dengan CDN diblokir; koneksi CDN di perangkat pengguna belum dibuktikan oleh tes ini. Tidak ada penulisan ke Sheets asli dalam tes lokal.

## Belum termasuk

Keranjang persisten, ongkir otomatis, reservasi stok, idempotensi checkout setelah reload, statistik admin, serta pembatasan laju/monitoring percobaan akses pelacakan. Pemegang kode yang dibagikan dapat melihat rincian pesanan; ganti kode melalui menu admin jika terlanjur tersebar.
