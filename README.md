# Toko Abangda

Webapp katalog Google Apps Script + Google Sheets. Stok, ongkir, pembayaran, dan pengembalian uang dikonfirmasi pemilik toko secara manual melalui WhatsApp. Nama toko tetap **Toko Abangda**.

## Memasang paket penyelesaian pra-launch

Ganti **kelima file lengkap** dari versi yang sama melalui tombol **Copy raw file** di GitHub. Jangan membuat backend kedua atau menyalin pratinjau yang terpotong.

| GitHub | Tujuan di Apps Script |
| --- | --- |
| [code.gs](code.gs) | `Kode.gs` / backend yang sudah ada |
| [js.html](js.html) | `js.html` |
| [index.html](index.html) | `index.html` |
| [css.html](css.html) | `css.html`, CSS produksi yang sudah dibuild |
| [setup.gs](setup.gs) | `setup.gs` |

1. Simpan seluruh file. Gunakan waktu sepi untuk pemasangan/migrasi.
2. Refresh Google Sheets desktop → **🛒 Toko Abangda → 🔄 Perbarui Struktur Sheet**. Cadangan lengkap dibuat sebelum perubahan. Jangan menjalankan initializer lama untuk memperbarui data yang sudah ada.
3. Jalankan **🩺 Periksa Seluruh Data**. Perbaiki baris yang ditunjukkan: nomor WA, duplikat, kategori/brand, harga/grosir, satuan, dan URL. Aplikasi tidak menebak nilai mana yang benar pada data yang ambigu.
4. Uji `/dev`, kemudian perbarui deployment publik `/exec` ke versi baru dan refresh webapp. Pelanggan yang masih membuka versi lama perlu refresh.
5. Uji `/exec` tanpa login Google dan pada Android/iPhone sebelum promosi publik. Jangan membuat sharing spreadsheet publik untuk memungkinkan akses webapp.

Asisten belum memiliki akses ke sheet/deployment asli. Tes repo menggunakan layanan Google tiruan dan Chromium, bukan penulisan ke sheet pengguna. Kode sudah dapat dipasang; migrasi, izin, foto asli, WhatsApp pada HP, dan domain tetap harus diverifikasi pada lingkungan sebenarnya.

## Masalah audit yang diselesaikan

| Temuan | Perilaku sekarang |
| --- | --- |
| Checkout gagal menghabiskan batas pesanan pembeli | Validasi produk, kupon, nomor toko dan ukuran payload selesai sebelum batas order baru/nomor dipakai. Batas percobaan umum tetap ada. |
| Satuan box ditampilkan sebagai pcs | Satuan diteruskan ke kartu harga, minimum grosir, modal, keranjang/pemulihan, WhatsApp dan tracking. |
| Nomor WA footer berbeda dengan checkout | Satu pembacaan settings dan normalisasi nomor; `08...` menjadi `628...`; kunci publik ganda ditolak. Kode kupon ganda juga ditolak, bukan memakai baris pertama diam-diam. |
| Nomor tracking mudah ditebak | Order baru memakai ID acak `TA-` + 20 karakter heksadesimal. Tracking tetap satu input, tanpa kode pribadi tambahan. ID lama masih dapat melihat status, tetapi rincian belanja lama tidak dibuka melalui nomor berurutan. |
| Pembatalan tidak mengembalikan kuota | Menu pembatalan dan perubahan dropdown status memakai proses refund kuota satu kali dengan jurnal pemulihan. |
| Tracking tidak menjelaskan hitungan | Menampilkan satuan, subtotal, diskon, total produk, ongkir/total akhir yang sudah disepakati, dan status pembayaran. Tidak mengirim nama/telepon/alamat/catatan atau metadata request. |
| Total final/payment bercampur dengan harga awal | Field operasional terpisah; snapshot checkout dan total produk awal tetap dipertahankan. |
| Katalog ikut mengantre pada lock transaksi | Budget baca memakai cache tanpa menunggu lock checkout; ada tombol coba muat ulang jika gagal. Batas baca tetap bersifat best-effort. |
| Tautan WA hilang setelah refresh | Browser menyimpan bukti request acak, bukan pesan atau data kontak. Server memulihkan pesan pesanan terakhir tanpa order baru. |
| Arsip orders dibaca penuh berulang | Lookup membaca kolom ID/request dan satu baris yang cocok, bukan seluruh JSON arsip order. |
| Nama/brand diedit membuat identitas produk berubah | Kunci otomatis disimpan pada kolom sistem tersembunyi; identitas tetap saat nama, brand, harga, atau urutan seluruh baris berubah. |
| Batas jumlah UI tidak sama dengan server | UI dan server sama-sama membatasi 10.000 unit per produk; ini batas aplikasi, bukan stok. |
| Pemeriksaan hanya mencakup produk | Menu Periksa Seluruh Data mencakup tujuh sheet; header/kolom sistem mendapat proteksi berupa peringatan edit. |

[AUDIT-PRA-LAUNCH.md](AUDIT-PRA-LAUNCH.md) mempertahankan temuan sebelum paket ini dengan catatan status penyelesaiannya. Tidak ada klaim bahwa batas platform, DDoS, atau kesalahan manual pengelola sudah dapat dihilangkan sepenuhnya.

## Menu pengelola pesanan

Pilih satu baris pada `orders`, lalu gunakan menu **Toko Abangda**:

| Menu | Fungsi |
| --- | --- |
| **Batalkan Pesanan Terpilih** | Membatalkan dan mengembalikan kuota voucher yang terbukti terpakai tepat satu kali. Menjalankan ulang tidak menambah kuota lagi. |
| **Atur Ongkir & Pembayaran** | Masukkan ongkir angka rupiah tanpa titik/Rp dan pilih `LUNAS` atau `BELUM BAYAR`. Total akhir dihitung dari total produk + ongkir. Ambil sendiri memakai ongkir 0. |
| **Catat Dana Dikembalikan** | Setelah uang benar-benar dikembalikan manual, tandai pengembaliannya. Aplikasi tidak melakukan transfer uang. |
| **Pulihkan Transaksi Tertunda** | Melanjutkan jurnal checkout, pembatalan, atau kesepakatan yang belum selesai. |
| **Riwayat Pesanan Terpilih** | Melihat pencatatan status, kesepakatan total, pembatalan dan konfirmasi pengembalian dana. |
| **Periksa Seluruh Data** | Melaporkan duplikat, relasi/data yang belum cocok dan transaksi yang perlu diperiksa. Tidak menghapus atau menggabungkan data secara otomatis. |

Mengubah dropdown status menjadi **Pesanan Dibatalkan** juga menjalankan pemrosesan lewat `onEdit`. Gunakan menu pembatalan untuk tindakan yang penting; simple trigger dapat dibatasi Google atau terlewat saat edit massal. Pemeriksaan data mendeteksi pembatalan dengan kuota yang belum selesai. Pesanan yang sudah dibatalkan tidak dapat diaktifkan ulang; buat order baru.

Jika pembayaran sudah `Lunas` ketika dibatalkan, status menjadi **Perlu Pengembalian**. Setelah pengelola mengembalikan uang, gunakan **Catat Dana Dikembalikan**. Ini pencatatan manual, bukan payment gateway atau bukti otomatis dari bank/WhatsApp.

Order lama tanpa bukti `coupon_debited` yang lengkap tidak otomatis diberi refund kuota; menu meminta pemeriksaan manual agar tidak mengembalikan kuota dua kali atas transaksi historis yang statusnya tidak diketahui.

## Transaksi, retry dan jurnal

Browser membuat kunci request acak 64 karakter dan mempertahankannya saat hasil checkout belum diketahui. Server menyimpan hash payload dan snapshot bersama order. Retry payload yang sama mengembalikan order yang sama dengan harga/kupon/satuan saat pencatatan, bukan harga katalog yang baru diedit. Payload berbeda pada request yang sudah tercatat tidak menimpa order; tersedia pilihan melanjutkan pesan sebelumnya atau memulai pesanan baru.

Jurnal kecil pada Script Properties mencatat niat checkout, pengembalian kuota, dan kesepakatan akhir sebelum penulisan beberapa field. Operasi finansial berikutnya memulihkan jurnal terlebih dahulu. Checkout yang terputus di antara pemotongan kuota dan penulisan order dapat diperiksa: kuota dipertahankan bila row order ditemukan, atau dipulihkan bila row tidak tercatat. Refund membandingkan kuota sebelum/sesudah dan penanda refund agar tidak mengkredit ulang. Kesepakatan sebagian tidak ditampilkan sebagai total final yang sudah dikonfirmasi.

Jika jurnal tidak cocok dengan data yang telah diedit manual, proses berhenti untuk pemeriksaan, bukan menebak angka. **Jangan mengedit kuota/metadata atau mereset Script Properties saat ada jurnal tertunda.** Gunakan menu pemulihan dan pemeriksaan data. Jurnal bukan pengganti database transaksional: error layanan dengan hasil tulis tidak pasti, perubahan manual di luar lock, pemulihan backup yang tidak sejalan dengan properties, atau penghapusan metadata tetap membutuhkan rekonsiliasi pengelola.

Kolom metadata disembunyikan dan diberi peringatan edit. Proteksi ini tidak mengubah sharing atau mencabut hak editor; pemilik tetap dapat mengabaikan peringatannya. Ongkir, total akhir dan status pembayaran tetap terlihat, tetapi diperbarui melalui menu. Jangan menimpa `total_harga` dengan total termasuk ongkir.

## Produk, satuan dan kunci sistem

Kolom yang diisi pengelola di `products`: `nama`, `id_kategori`, `brand`, `harga`, `deskripsi`, `url_foto`, `is_unggulan`, `harga_grosir`, `min_beli_grosir`, `satuan`. Kolom `id_produk` dan `id_brand` lama tetap dihapus. `id_banner` tetap diganti menjadi `keterangan`. Stok lama diabaikan.

`_kunci_produk` adalah **kolom sistem tersembunyi yang dihasilkan otomatis, bukan ID yang harus diketik pengelola**. Migrasi pertama mempertahankan kunci lama yang dihitung dari nama+brand sehingga keranjang yang kompatibel tidak putus. Sesudah itu kunci disimpan tetap; produk baru mendapat kunci otomatis melalui `onEdit` atau pembaruan struktur. Nama+brand setiap varian tetap harus unik agar pilihan produk jelas.

Urutkan seluruh sheet/baris termasuk kolom tersembunyi, bukan hanya sebagian sel. Jangan mengganti/menghapus kunci sistem. Jika menyalin baris, trigger mencoba memberi kunci baru pada salinannya; checker menolak kunci/nama yang ganda agar tidak memesan produk yang salah. Produk dengan kunci belum siap tidak dijual sampai data diperbarui, bukan dipadankan dengan produk lain.

Baris kosong diabaikan, produk rusak/ambigu disisihkan, dan menu produk menunjukkan nomor baris yang perlu diperbaiki. Harga nol harus disengaja. `is_unggulan` memakai `YA`/`TIDAK`. `id_kategori` berisi nama yang cocok dengan categories, bukan ID kategori dari skema lama. Migrasi struktur tidak menebak relasi kategori/brand yang ambigu.

## Grosir, voucher dan WhatsApp

| harga | harga_grosir | min_beli_grosir | satuan |
| --- | --- | --- | --- |
| 10000 | 9000 | 12 | box |

1–11 box memakai Rp10.000/box; mulai 12 box **seluruh jumlah produk tersebut** memakai Rp9.000/box. Produk berbeda tidak digabung. Turun di bawah minimum mengembalikan harga normal. Kedua kolom grosir harus lengkap atau sama-sama kosong/nol. Server membaca harga dan kupon kembali saat checkout; harga/total dari browser diabaikan.

Preview voucher memakai cache singkat maksimal 30 detik dan tidak menunggu lock transaksi. Cache di halaman tidak memperpanjang masa berlaku hasil secara berulang. UI memberi kesempatan mencoba lagi setelah 12 detik; callback lama yang sudah dibatalkan diabaikan. Pemeriksaan awal bisa sementara berbeda dari sheet yang baru diedit, tetapi checkout selalu memakai data langsung.

WhatsApp dibuka setelah order tercatat, tanpa halaman konfirmasi. Tab disiapkan pada klik agar callback server tidak dianggap popup tanpa tindakan pengguna. Browser/OS menentukan pembukaan aplikasi WhatsApp atau WhatsApp Web; pembeli tetap menekan Kirim. Jika popup diblokir, tautan cadangan memakai order yang sudah ada. Format pesan berisi sapaan, ID/tanggal, kontak/pengiriman, item+satuan, subtotal, diskon bila ada, total dan permintaan konfirmasi manual.

Nama, alamat dan nomor pelanggan tidak disimpan dalam localStorage. Pemulihan pesan menggunakan bukti request acak yang disimpan perangkat dan snapshot server; **bukti perangkat ini bersifat rahasia, jangan dibagikan**. Hanya satu referensi pesanan terakhir disimpan untuk pemulihan, maksimal 30 hari pada browser. Storage yang diblokir hanya dapat mempertahankan bukti pada sesi halaman; simpan ID/pesan sebelum menutup halaman. Keranjang pembelian baru yang kebetulan sama dengan order lama tidak dikosongkan oleh pemulihan receipt lama.

## Tracking dan batas aplikasi

Tracking tetap satu ID. ID baru acak; ID lama berurutan hanya menampilkan status/tanggal. Rincian order baru berisi barang, satuan, subtotal/diskon, total produk, kesepakatan ongkir/total akhir dan pembayaran. Nama/WA/alamat/catatan, kunci request dan snapshot privat tidak dikirim oleh tracking. Mengetahui ID acak tetap memungkinkan melihat ringkasan, jadi jangan menyebarkannya tanpa perlu.

Batas awal: katalog/detail/pemulihan keranjang 600/menit global; tracking dan preview voucher 120/menit; percobaan checkout 120/menit; order baru 60/10 menit global dan 5/10 menit per nomor ternormalisasi. Read counter memakai cache nonblocking yang best-effort; counter finansial diperiksa di dalam lock. Cache Google dapat dieviksikan dan counter baca bisa meleset saat bersamaan. Ini bukan perlindungan DDoS atau pengganti pengukuran kapasitas.

CSS utama dibundel dalam `css.html`, bukan compiler Tailwind CDN. Font, ikon dan foto masih bisa memerlukan koneksi eksternal. Header/kategori tetap sticky dan kategori bisa digeser horizontal. Storage, popup dan scroll tetap perlu diuji pada iframe/domain sebenarnya.

## Pengujian dan build

```sh
npm ci
npm run build:css
npm run test:backend
npm run test:browser
```

Build menggunakan Tailwind 3.4.17. Browser tests memakai Chromium (`/usr/bin/chromium` atau `CHROMIUM_PATH`) dan CSS produksi dengan koneksi luar diblokir/ditiru.

- 57 pemeriksaan backend dasar + 14 pemeriksaan penyelesaian audit = **71 pemeriksaan backend**, ditambah suite migrasi.
- Delapan suite browser: checkout, tracking, keranjang, grosir, keamanan/race/voucher, pemulihan saat respons hilang, popup WhatsApp, dan kesiapan launch terintegrasi.
- Pengujian tambahan mencakup gagal voucher lalu benar, setting ganda/08, random/legacy tracking, subtotal/satuan, pembatalan berulang, write yang sudah commit lalu error, jurnal terputus, ongkir/pembayaran, pemulihan pesan setelah refresh, keranjang pembelian baru, serta rename dan pengurutan seluruh baris produk.

Tes tidak melakukan transfer uang, mengirim WhatsApp, mengedit sheet asli, atau menjanjikan transaksi ACID pada layanan Google. Data migrasi dipertahankan dan dicadangkan; metadata baru ditambahkan tanpa mereset pesanan lama.

## Yang masih perlu dilakukan pada lingkungan nyata

Setelah pemasangan: periksa semua data melalui menu, nomor WA/foto asli, izin sheet/backup/editor, satu deployment `/exec` publik yang benar, order uji yang diterima di WA, status/payment/pembatalan, pemulihan jurnal, serta uji Chrome Android dan Safari iPhone. Jadwalkan backup dan retensi data pelanggan; backup migrasi tidak memuat order yang masuk belakangan. Tinjau file cadangan dan izin aksesnya. Jangan mengubah data/Script Properties yang masih dalam transaksi ketika rollback.

Domain dan DNS belum diubah. Apps Script tidak mendukung custom-domain mapping langsung seperti hosting biasa. Google Sites + custom domain + embed `/exec` adalah jalur perubahan minimum jika fitur akun mendukung; uji ulang popup/storage pada iframe tersebut. Frontend hosting terpisah perlu API/perantara pengganti `google.script.run`. SEO/URL per produk, akun pelanggan dan pembayaran otomatis bukan syarat bagi katalog manual ini dan belum ditambahkan.
