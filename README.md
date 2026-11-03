# Toko Abangda

Katalog dan pemesanan Google Apps Script + Google Sheets. Stok dan pembayaran dikonfirmasi pemilik toko melalui WhatsApp. Nama tetap **Toko Abangda**.

## Memasang paket perbaikan wajib

Ganti **kelima file lengkap** dari versi yang sama. Gunakan **Copy raw file** di GitHub; jangan menyalin pratinjau yang terpotong atau nomor baris.

| GitHub | File di editor Apps Script |
| --- | --- |
| [code.gs](code.gs) | `Kode.gs` / backend yang sudah ada, jangan buat duplikat |
| [js.html](js.html) | `js.html` |
| [index.html](index.html) | `index.html` |
| [css.html](css.html) | `css.html` — sekarang wajib, berisi CSS produksi lengkap |
| [setup.gs](setup.gs) | `setup.gs` |

1. Simpan semuanya saat tidak ada transaksi aktif. Paket lama tanpa request ID tidak kompatibel dengan checkout baru; pelanggan yang masih membuka halaman lama perlu refresh.
2. Refresh Google Sheets → **🛒 Toko Abangda → 🔄 Perbarui Struktur Sheet**. Menu membuat cadangan lengkap sebelum perubahan. Izinkan otorisasi pembuatan salinan bila Google memintanya.
3. Jalankan **🔎 Periksa Data Produk** untuk melihat nomor baris produk yang harus dirapikan. Isi nomor WhatsApp toko pada `settings.no_whatsapp`; nomor kosong/tidak valid kini menolak checkout dan tidak memakai nomor fallback.
4. Uji melalui `/dev`: katalog, kategori, pencarian, grosir, keranjang, kupon, checkout, WhatsApp, dan tracking.
5. Setelah benar, perbarui deployment publik `/exec` ke versi baru. Uji `/exec` dalam mode samaran tanpa login. `/dev` bukan tautan pelanggan.

Asisten belum dapat mengakses spreadsheet/deployment asli. Semua validasi yang dilaporkan dari repo memakai layanan Apps Script/Sheets tiruan dan Chromium. Jangan menganggap pemasangan kode otomatis berarti sheet sudah dimigrasikan atau deployment sudah diperbarui.

## Enam perbaikan wajib

### 1. Checkout tahan retry

Browser membuat satu kunci permintaan acak per percobaan checkout dan menyimpan **kuncinya saja**, tanpa nama/WA/alamat. Kunci dipertahankan bila koneksi gagal, halaman di-refresh, atau formulir berubah sebelum hasil sebelumnya diketahui.

Server memakai ScriptLock, menyimpan kunci dan hash payload bersama baris pesanan, dan mengembalikan hasil yang sama untuk retry payload yang sama. Harga atau konfigurasi kupon yang sudah berubah tidak mengubah pesanan yang sudah tercatat. Penggunaan kupon tidak diulang. Bila append telah berhasil tetapi pemanggilan melempar error, server mencoba menemukan baris yang sudah tersimpan sebelum memulihkan kuota.

Jika kunci yang sama dipakai untuk data berbeda setelah pesanan tercatat, server menolak perubahan dan memberi ID pesanan sebelumnya. Halaman menyediakan **Lacak pesanan sebelumnya** dan **Mulai pesanan baru**. Pilihan kedua secara eksplisit mengawali permintaan baru; bukan pengiriman ulang otomatis.

Kolom sistem pada `orders`: `request_id`, `request_hash`, `checkout_summary`, `wa_target`, `subtotal`, `diskon`, `kode_kupon`. Menu migrasi dan checkout menambahkan yang belum ada; jangan mengubah atau menghapus nilainya. Ini **bukan kolom ID produk atau kode pelacakan pribadi**. Snapshot dipakai untuk mengembalikan konfirmasi/WhatsApp yang sama. Data kontak sudah berada pada sheet orders; akses sheet dan cadangannya harus dibatasi untuk pengelola.

ID pesanan dicek terhadap baris yang sudah ada, sehingga reset counter tidak memakai ulang nomor lama. Pembatasan ukuran rincian juga diperiksa sebelum menulis.

Batas: Google Sheets tidak menyediakan transaksi atomik lintas sheet. Hard timeout/pemadaman saat commit beberapa penulisan tetap memerlukan rekonsiliasi pemilik toko. Penghapusan baris pesanan/metadata secara manual menghilangkan bukti retry. Jika browser menolak storage, kunci hanya bertahan selama sesi halaman tersebut; tampilkan/uji pemberitahuan penyimpanan pada perangkat pelanggan.

### 2. Respons katalog/pencarian terbaru yang berlaku

Nomor versi permintaan mencegah kategori atau saran lama menimpa pilihan terbaru. Permintaan filter baru tidak lagi dibuang saat permintaan sebelumnya berjalan. Halaman append yang gagal dikembalikan agar dapat dicoba ulang. Menutup modal membatalkan penerapan respons detail yang terlambat.

### 3. Teks dan tautan ditangani aman

Keranjang, ringkasan checkout, brand, banner, dan saran pencarian menggunakan elemen DOM dan `textContent` untuk data sheet. Tombol memakai event handler terikat, bukan menyisipkan nama ke string JavaScript. Kartu produk dan respons tracking yang masih memakai template HTML melakukan escaping pada nilai dinamis.

URL gambar/media sosial/banner harus berupa HTTP(S) absolut, tanpa username/password, dan dinormalisasi ke HTTPS. Skema `javascript:`/`data:` ditolak. URL Drive diproses berdasarkan hostname yang sesuai. Tautan banner yang valid sekarang dapat diklik; nama keterangannya menjadi teks alternatif gambar.

### 4. Data produk bermasalah disisihkan

Pembacaan katalog memakai nilai asli Sheets dan hanya satu pengambilan data per fungsi katalog, bukan membacanya dua kali. Baris benar-benar kosong diabaikan. Harga/grosir tidak valid atau pasangan nama+brand duplikat membuat produk tersebut tidak ditampilkan, tanpa memberi harga nol atau memblokir produk lain yang valid.

Pengunjung mendapat pemberitahuan bahwa sebagian produk sementara tidak tersedia. Menu privat **Periksa Data Produk** menunjukkan nomor baris dan alasannya untuk admin. Item bermasalah yang sudah tersimpan di keranjang tetap membutuhkan penyelesaian/retry/discard; tidak dipadankan secara diam-diam ke produk lain.

### 5. Pembatasan permintaan di server

Penghitung aplikasi menggunakan Script Cache dengan ScriptLock untuk pembaruan counter. Nilai awal di `PUBLIC_LIMITS`:

| Aktivitas | Batas awal |
| --- | --- |
| Katalog/initial/detail/pemulihan keranjang, digabung untuk seluruh aplikasi | 600 per menit |
| Pelacakan | 120 per menit |
| Pemeriksaan kupon | 120 per menit |
| Percobaan checkout, termasuk retry | 120 per menit |
| Pesanan baru, seluruh aplikasi | 60 per 10 menit |
| Pesanan baru per nomor pembeli | 5 per 10 menit |

Retry pesanan yang telah tercatat tidak dihitung lagi sebagai pesanan baru, tetapi masih dihitung sebagai percobaan checkout. Batas pesanan baru juga menghitung permintaan baru yang gagal setelah validasi awal; ini sengaja membatasi percobaan berulang, bukan statistik jumlah transaksi berhasil. Nomor dipakai sebagai hash pada kunci cache. Jumlah checkout dibatasi maksimal 100 jenis barang dan 10.000 unit per produk; ini batas aplikasi, bukan stok toko. Pagination dibatasi 1–100 produk per permintaan.

Ini **pengendalian aplikasi dasar, bukan perlindungan DDoS/CAPTCHA**. Cache Google dapat dieviksikan, bucket waktu dapat menerima burst di batas periode, nomor pembeli belum diverifikasi, dan permintaan tetap masuk ke Apps Script sebelum ditolak. Batas global harus disesuaikan dengan trafik nyata; jangan menjanjikan kapasitas tertentu sebelum diukur. Pelacakan berlebihan mendapat penolakan umum agar tidak membocorkan informasi lain.

### 6. CSS utama disertakan langsung

`index.html` meng-include `css.html`. Tailwind sudah dibuild menjadi CSS statis; tidak ada pemuatan `cdn.tailwindcss.com` atau compiler Tailwind di browser. Class dari markup dan JavaScript disertakan dalam build. Pengujian browser kini memakai **css.html produksi**, bukan fixture terpisah, dengan akses eksternal diblokir.

Google Fonts, Font Awesome, dan foto tetap sumber eksternal. Jika font gagal, teks memakai font sistem; ikon/foto belum dapat dijamin tanpa koneksi. Zoom browser sekarang diizinkan untuk keterbacaan.

## Produk tanpa kolom ID

Skema products: `nama`, `id_kategori`, `brand`, `harga`, `deskripsi`, `url_foto`, `is_unggulan`, `harga_grosir`, `min_beli_grosir`. Kolom `stok` lama diabaikan.

Tidak ada ID produk yang harus diisi. Pengenal internal berasal dari nama+brand dan tidak dipengaruhi penghapusan ID lama, urutan baris, atau perubahan harga. Mengganti nama/brand membuat identitas baru; pelanggan perlu memilih ulang item yang berganti identitas. Bedakan nama setiap varian. Kolom brands cukup `nama_brand`, `url_logo`; banners memakai `keterangan`, `url_gambar`, `link`.

Menu pembaruan menghapus ID produk/brand serta token tracking usang. Header banner lama diganti menjadi `keterangan` dengan nilai lama dipertahankan; bila kedua kolom sudah ada, `keterangan` dipertahankan dan nilai ID lama tersedia di cadangan. Header dikenal dengan variasi huruf besar/spasi seperti `ID Product`/`id_products` dinormalisasi. Header ambigu/duplikat atau pasangan nama+brand ganda menghentikan migrasi sebelum perubahan.

Menu tidak mereset data, menambah contoh, menghapus kolom tambahan lain, atau otomatis memperbaiki kategori lama yang masih memakai ID kategori. Jalur menu lama `setupDatabase_` diarahkan ke pembaruan yang sama. Initializer lama hanya tersedia sebagai fungsi privat `initializeDatabase_` dan tidak tampil di menu.

## Harga grosir, stok manual, dan WhatsApp

| harga | harga_grosir | min_beli_grosir |
| --- | --- | --- |
| 10000 | 9000 | 12 |

Jumlah 1–11 memakai Rp10.000/unit; 12 atau lebih memakai Rp9.000 untuk **seluruh unit produk tersebut**. Produk berbeda tidak digabung. Turun di bawah batas mengembalikan harga normal. Kedua kolom grosir harus lengkap atau sama-sama kosong/nol. Kupon dihitung setelah grosir; server membaca ulang harga/kupon dan mengabaikan harga/total dari browser.

Tidak ada pengecekan stok otomatis. Pesanan dicatat sebagai **Menunggu Konfirmasi Stok**. Pemilik memeriksa stok, ongkir, total akhir, dan pembayaran melalui WhatsApp. `wa.me` menyiapkan pesan, tetapi aplikasi tidak membuktikan bahwa pengguna menekan Kirim. Tidak ada pembayaran otomatis.

Kuota kupon masih dikonsumsi ketika order dicatat; membatalkan status secara manual belum otomatis mengembalikan kuotanya. Jangan menambah pemulihan manual tanpa memeriksa riwayat agar tidak mengembalikan dua kali.

## Keranjang dan pelacakan

Keranjang perangkat yang sama menyimpan ID internal+jumlah selama maksimal 30 hari. Harga dibaca kembali saat pemulihan. Browser yang menolak storage tetap bisa berbelanja pada sesi halaman; pemulihan lintas perangkat tidak tersedia.

Pelacakan tetap **cukup satu ID pesanan**. Nama, nomor WA, alamat, catatan, kunci request, dan snapshot checkout tidak dikirim oleh endpoint tracking. ID masih berurutan sehingga dapat ditebak; pembatasan permintaan hanya mengurangi percobaan dan tidak menggantikan otorisasi. ID acak dan penyederhanaan ringkasan tracking tetap menjadi pekerjaan lanjutan sebelum penilaian launch penuh. ID terakhir saja disimpan lokal untuk mengisi form pelacakan setelah refresh, bukan data pelanggan.

## Pengujian dan build

```sh
npm ci
npm run build:css
npm run test:backend
npm run test:browser
```

Browser tests memerlukan Chromium (`/usr/bin/chromium` atau `CHROMIUM_PATH`). Dependensi pengembang dikunci di `package-lock.json`; pengguna Apps Script cukup menyalin file aplikasi, tidak perlu menginstal Node.

- Backend: checkout, harga/grosir/kupon, snapshot/retry/conflict, penulisan ambigu, counter, data produk rusak, batas permintaan, tracking, dan keranjang.
- Migrasi: cadangan, seluruh skema, penghapusan kolom lama, header variasi, pengulangan dan penanganan kegagalan.
- Browser checkout/tracking/cart/wholesale: alur normal dan kegagalan dengan backend tiruan/layanan Sheets tiruan sesuai suite.
- `tests/launch.browser.cjs`: respons kategori/pencarian yang terbalik, modal ditutup, penanganan markup/URL/brand bertanda kutip, dan CSS produksi saat CDN diblokir.
- `tests/retry.browser.cjs`: backend repo + browser, respons hilang sesudah commit, reload dan retry, kupon yang terlepas setelah reload, satu baris order dan satu pemakaian kuota.
- Opsional: `MIGRATE_DURING_CART=1 node tests/wholesale.browser.cjs` untuk penghapusan kolom ID saat keranjang aktif.

## Launch dan domain

[AUDIT-LAUNCH.md](AUDIT-LAUNCH.md) menyimpan audit awal dan status perbaikannya. Perbaikan kode belum berarti deployment/Sheet asli sudah diuji. Masih perlu pemeriksaan izin publik `/exec`, nomor WA dan foto asli, status/pembayaran/pembatalan manual, backup/pemulihan, serta pengujian Chrome Android dan Safari iPhone.

Apps Script tidak menyediakan custom-domain mapping langsung seperti hosting biasa. Google Sites + custom domain + embed `/exec` adalah jalur perubahan minimum bila fitur akun mendukungnya. Uji scroll, storage iframe dan WhatsApp pada domain nyata. Hosting frontend terpisah membutuhkan API/perantara pengganti `google.script.run`; memindahkan HTML saja tidak cukup. Tidak ada domain/deployment yang diubah oleh paket ini.
