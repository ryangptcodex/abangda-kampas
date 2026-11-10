/**
 * TOKO ABANGDA - DATABASE INITIALIZER & SMART PRUNER (setup.gs)
 * Menyiapkan struktur sheet, header, data awal, dropdown, dan menu spreadsheet.
 */

function onOpen(e) {
  SpreadsheetApp.getUi()
    .createMenu('🛒 Toko Abangda')
    .addItem('🚀 Perbarui Semua', 'perbaruiSemua')
    .addItem('🔐 Atur Akun Admin Web', 'configureWebAdmin_')
    .addSeparator()
    .addItem('🔄 Perbarui Struktur Sheet', 'updateSheetStructure_')
    .addItem('💰 Siapkan Kolom Harga Grosir', 'prepareWholesaleColumns_')
    .addItem('🔎 Periksa Data Produk', 'checkProductData_')
    .addItem('🩺 Periksa Seluruh Data', 'checkAllData_')
    .addItem('❌ Batalkan Pesanan Terpilih', 'cancelSelectedOrder_')
    .addItem('💳 Atur Ongkir & Pembayaran', 'setSelectedOrderAgreement_')
    .addItem('💸 Catat Dana Dikembalikan', 'markSelectedMoneyReturned_')
    .addItem('🛠️ Pulihkan Transaksi Tertunda', 'repairPendingOperations_')
    .addItem('📋 Riwayat Pesanan Terpilih', 'showSelectedOrderHistory_')
    .addSeparator()
    .addItem('📦 Buka Produk', 'openProductsSheet')
    .addItem('🗂️ Buka Kategori', 'openCategoriesSheet')
    .addItem('🏷️ Buka Brand', 'openBrandsSheet')
    .addItem('🖼️ Buka Banner', 'openBannersSheet')
    .addItem('🧾 Buka Pesanan', 'openOrdersSheet')
    .addItem('🎟️ Buka Kupon', 'openCouponsSheet')
    .addItem('⚙️ Buka Pengaturan', 'openSettingsSheet')
    .addToUi();
}

function openProductsSheet() {
  openSheetByName_('products');
}

function openCategoriesSheet() {
  openSheetByName_('categories');
}

function openBrandsSheet() {
  openSheetByName_('brands');
}

function openBannersSheet() {
  openSheetByName_('banners');
}

function openOrdersSheet() {
  openSheetByName_('orders');
}

function openCouponsSheet() {
  openSheetByName_('coupons');
}

function openSettingsSheet() {
  openSheetByName_('settings');
}

function openSheetByName_(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    SpreadsheetApp.getUi().alert(
      'Sheet "' + sheetName + '" tidak ditemukan.'
    );
    return;
  }

  ss.setActiveSheet(sheet);
}

function initializeDatabase_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const schemas = databaseSchemas_();

    // Buat sheet yang belum ada dan tambahkan header yang belum tersedia.
    Object.keys(schemas).forEach(function(sheetName) {
      let sheet = ss.getSheetByName(sheetName);

      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
      }

      const expectedHeaders = schemas[sheetName];

      if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
        sheet.getRange(1, 1, 1, expectedHeaders.length)
          .setValues([expectedHeaders]);

        formatHeaderRow(sheet, expectedHeaders.length);
      } else {
        const currentHeaders = sheet
          .getRange(1, 1, 1, sheet.getLastColumn())
          .getDisplayValues()[0];

        expectedHeaders.forEach(function(headerName) {
          if (currentHeaders.indexOf(headerName) === -1) {
            const nextCol = sheet.getLastColumn() + 1;
            sheet.getRange(1, nextCol).setValue(headerName);
          }
        });

        formatHeaderRow(sheet, sheet.getLastColumn());
      }
    });

    // Ubah kategori lama menjadi format dua kolom.
    // ID kategori lama pada produk dipetakan menjadi nama kategori.
    normalizeCategoriesSheet_(ss);

    // Dropdown status pesanan.
    const ordersSheet = ss.getSheetByName('orders');

    if (ordersSheet && ordersSheet.getLastColumn() > 0) {
      const orderHeaders = ordersSheet
        .getRange(1, 1, 1, ordersSheet.getLastColumn())
        .getDisplayValues()[0];

      const statusColIdx = orderHeaders.indexOf('status') + 1;

      if (statusColIdx > 0) {
        const statusOptions = [
          'Menunggu Konfirmasi Stok',
          'Menunggu Pembayaran',
          'Sedang Diproses',
          'Sedang Dikirim',
          'Sudah Diterima Pembeli',
          'Pesanan Dibatalkan'
        ];

        const statusRule = SpreadsheetApp.newDataValidation()
          .requireValueInList(statusOptions, true)
          .setAllowInvalid(false)
          .setHelpText('Pilih status resmi pesanan Toko Abangda.')
          .build();

        const totalRows = Math.max(ordersSheet.getMaxRows() - 1, 100);

        ordersSheet
          .getRange(2, statusColIdx, totalRows, 1)
          .setDataValidation(statusRule);
      }
    }

    // Sinkronisasi pengaturan toko.
    syncAndPruneSettings(ss.getSheetByName('settings'));

    // Isi data contoh hanya jika sheet terkait masih kosong.
    seedCategoriesIfEmpty(ss.getSheetByName('categories'));
    seedBrandsIfEmpty(ss.getSheetByName('brands'));
    seedBannersIfEmpty(ss.getSheetByName('banners'));
    seedProductsIfEmpty(ss.getSheetByName('products'));
    seedCouponsIfEmpty(ss.getSheetByName('coupons'));

    // Dropdown kategori produk mengambil nama dari sheet categories.
    applyProductCategoryValidation_(ss);

    SpreadsheetApp.flush();
    Logger.log('Inisialisasi, migrasi, dan pengaturan database berhasil.');
  } catch (err) {
    Logger.log('Error saat setup database: ' + err.toString());
    throw err;
  }
}

/**
 * Mempertahankan nama dan ikon kategori, lalu memastikan sheet categories
 * hanya memiliki kolom nama dan url_ikon.
 * Nilai ID kategori lama di products dipetakan menjadi nama kategorinya.
 */
function normalizeCategoriesSheet_(ss) {
  const categoriesSheet = ss.getSheetByName('categories');
  const productsSheet = ss.getSheetByName('products');

  if (!categoriesSheet) return;

  const oldLastColumn = categoriesSheet.getLastColumn();

  if (oldLastColumn === 0) {
    categoriesSheet.getRange(1, 1, 1, 2)
      .setValues([['nama', 'url_ikon']]);
    formatHeaderRow(categoriesSheet, 2);
    return;
  }

  const data = categoriesSheet.getDataRange().getDisplayValues();
  const headers = data[0];
  const idIdx = headers.indexOf('id_kategori');
  const namaIdx = headers.indexOf('nama');
  const ikonIdx = headers.indexOf('url_ikon');

  const categoryIdToName = {};
  const categoryRows = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = namaIdx !== -1
      ? String(row[namaIdx] || '').trim()
      : '';
    const icon = ikonIdx !== -1 ? row[ikonIdx] : '';
    const oldId = idIdx !== -1
      ? String(row[idIdx] || '').trim()
      : '';

    if (oldId && name) {
      categoryIdToName[oldId] = name;
    }

    if (name || icon) {
      categoryRows.push([name, icon]);
    }
  }

  // Ganti ID kategori lama di produk dengan nama kategori yang sesuai.
  if (productsSheet && productsSheet.getLastRow() > 1) {
    const productData = productsSheet.getDataRange().getDisplayValues();
    const productHeaders = productData[0];
    const productCategoryIdx = productHeaders.indexOf('id_kategori');

    if (productCategoryIdx !== -1) {
      const categoryValues = [];

      for (let i = 1; i < productData.length; i++) {
        let value = String(productData[i][productCategoryIdx] || '').trim();

        if (categoryIdToName[value]) {
          value = categoryIdToName[value];
        }

        categoryValues.push([value]);
      }

      if (categoryValues.length > 0) {
        productsSheet
          .getRange(2, productCategoryIdx + 1, categoryValues.length, 1)
          .setValues(categoryValues);
      }
    }
  }

  // Tulis ulang sheet categories dengan tepat dua kolom.
  categoriesSheet.clearContents();
  categoriesSheet.clearFormats();

  categoriesSheet.getRange(1, 1, 1, 2)
    .setValues([['nama', 'url_ikon']]);
  formatHeaderRow(categoriesSheet, 2);

  if (categoryRows.length > 0) {
    categoriesSheet
      .getRange(2, 1, categoryRows.length, 2)
      .setValues(categoryRows);
  }

  // Hapus kolom fisik setelah kolom B jika ada.
  const maxColumns = categoriesSheet.getMaxColumns();

  if (maxColumns > 2) {
    categoriesSheet.deleteColumns(3, maxColumns - 2);
  }

  categoriesSheet.setColumnWidth(1, 220);
  categoriesSheet.setColumnWidth(2, 320);
}

/**
 * Memasang dropdown nama kategori pada kolom id_kategori di products.
 */
function applyProductCategoryValidation_(ss) {
  const productsSheet = ss.getSheetByName('products');
  const categoriesSheet = ss.getSheetByName('categories');

  if (!productsSheet || !categoriesSheet) return;
  if (productsSheet.getLastColumn() === 0) return;
  if (categoriesSheet.getMaxRows() < 2) return;

  const productHeaders = productsSheet
    .getRange(1, 1, 1, productsSheet.getLastColumn())
    .getDisplayValues()[0];

  const categoryHeaders = categoriesSheet
    .getRange(1, 1, 1, categoriesSheet.getLastColumn())
    .getDisplayValues()[0];

  const productCategoryCol = productHeaders.indexOf('id_kategori') + 1;
  const categoryNameCol = categoryHeaders.indexOf('nama') + 1;

  if (productCategoryCol === 0 || categoryNameCol === 0) return;

  const categoryNameRange = categoriesSheet.getRange(
    2,
    categoryNameCol,
    categoriesSheet.getMaxRows() - 1,
    1
  );

  const categoryRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(categoryNameRange, true)
    .setAllowInvalid(false)
    .setHelpText('Pilih nama kategori dari sheet categories.')
    .build();

  const productRows = productsSheet.getMaxRows() - 1;
  if (productRows < 1) return;

  productsSheet
    .getRange(2, productCategoryCol, productRows, 1)
    .setDataValidation(categoryRule);
}

function formatHeaderRow(sheet, numCols) {
  if (numCols > 0) {
    const headerRange = sheet.getRange(1, 1, 1, numCols);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#0284c7');
    headerRange.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
}

/**
 * Menyisakan delapan kunci pengaturan aktif.
 * Nilai yang sudah ada untuk kunci aktif akan dipertahankan.
 */
function syncAndPruneSettings(sheet) {
  if (!sheet) return;

  const activeSettingsDefinitions = [
    {
      kunci: 'nama_toko',
      nilaiDefault: 'TOKO ABANGDA',
      keterangan: 'Nama resmi toko pada navbar, header & footer'
    },
    {
      kunci: 'alamat_toko',
      nilaiDefault: 'Jl. Niaga Abangda No. 88, Indonesia',
      keterangan: 'Alamat fisik toko di kartu footer'
    },
    {
      kunci: 'no_telepon',
      nilaiDefault: 'T-(+62) 823-3146-3166',
      keterangan: 'Teks nomor telepon toko di footer'
    },
    {
      kunci: 'no_whatsapp',
      nilaiDefault: '6282331463166',
      keterangan: 'Nomor WA tujuan checkout & icon WA (format: 628...)'
    },
    {
      kunci: 'link_facebook',
      nilaiDefault: 'https://facebook.com/tokoabangda',
      keterangan: 'Link profil Facebook resmi toko'
    },
    {
      kunci: 'link_instagram',
      nilaiDefault: 'https://instagram.com/tokoabangda',
      keterangan: 'Link profil Instagram resmi toko'
    },
    {
      kunci: 'link_youtube',
      nilaiDefault: 'https://youtube.com/@tokoabangda',
      keterangan: 'Link profil YouTube resmi toko'
    },
    {
      kunci: 'link_tiktok',
      nilaiDefault: 'https://tiktok.com/@tokoabangda',
      keterangan: 'Link profil TikTok resmi toko'
    }
  ];

  const existingValuesMap = {};

  if (sheet.getLastRow() > 1) {
    const rawData = sheet.getDataRange().getDisplayValues();
    const headers = rawData[0];
    const keyIdx = headers.indexOf('kunci');
    const valueIdx = headers.indexOf('nilai');

    if (keyIdx !== -1 && valueIdx !== -1) {
      for (let i = 1; i < rawData.length; i++) {
        const key = String(rawData[i][keyIdx]).trim();
        const value = rawData[i][valueIdx];

        if (key) {
          existingValuesMap[key] = value;
        }
      }
    }
  }

  const newRows = activeSettingsDefinitions.map(function(item) {
    const preservedValue =
      existingValuesMap[item.kunci] !== undefined
        ? existingValuesMap[item.kunci]
        : item.nilaiDefault;

    return [item.kunci, preservedValue, item.keterangan];
  });

  sheet.clearContents();
  sheet.clearFormats();

  const headers = ['kunci', 'nilai', 'keterangan'];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatHeaderRow(sheet, headers.length);
  sheet.getRange(2, 1, newRows.length, headers.length).setValues(newRows);

  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 320);
  sheet.setColumnWidth(3, 400);
}

function seedCategoriesIfEmpty(sheet) {
  if (sheet && sheet.getLastRow() <= 1) {
    const categories = [
      [
        'Makanan & Minuman',
        'https://cdn-icons-png.flaticon.com/512/3081/3081840.png'
      ],
      [
        'Sembako & Bumbu',
        'https://cdn-icons-png.flaticon.com/512/1261/1261163.png'
      ],
      [
        'Kebutuhan Rumah',
        'https://cdn-icons-png.flaticon.com/512/2558/2558022.png'
      ],
      [
        'Mandi & Perawatan',
        'https://cdn-icons-png.flaticon.com/512/3132/3132739.png'
      ]
    ];

    sheet.getRange(2, 1, categories.length, 2).setValues(categories);
  }
}

function seedBrandsIfEmpty(sheet) {
  if (sheet && sheet.getLastRow() <= 1) {
    const brands = [
      ['Indofood', 'https://cdn-icons-png.flaticon.com/512/888/888879.png'],
      ['Unilever', 'https://cdn-icons-png.flaticon.com/512/888/888879.png'],
      ['Wings', 'https://cdn-icons-png.flaticon.com/512/888/888879.png'],
      ['Nestle', 'https://cdn-icons-png.flaticon.com/512/888/888879.png'],
      ['Bimoli', 'https://cdn-icons-png.flaticon.com/512/888/888879.png']
    ];

    sheet.getRange(2, 1, brands.length, 2).setValues(brands);
  }
}

function seedBannersIfEmpty(sheet) {
  if (sheet && sheet.getLastRow() <= 1) {
    const banners = [
      [
        'Promo belanja harian',
        'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1000&q=80',
        '#'
      ],
      [
        'Pilihan sembako',
        'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1000&q=80',
        '#'
      ]
    ];

    sheet.getRange(2, 1, banners.length, 3).setValues(banners);
  }
}

function seedProductsIfEmpty(sheet) {
  if (sheet && sheet.getLastRow() <= 1) {
    const products = [
      [
        'Minyak Goreng Premium 2L',
        'Sembako & Bumbu',
        'Bimoli',
        34500,
        'Minyak goreng kelapa sawit berkualitas tinggi, bening dan sehat.',
        'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80',
        'YA'
      ],
      [
        'Beras Wangi Super 5kg',
        'Sembako & Bumbu',
        'Toko Abangda',
        72000,
        'Beras pulen pilihan tanpa bahan pengawet.',
        'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80',
        'YA'
      ],
      [
        'Kopi Hitam Original 200g',
        'Makanan & Minuman',
        'Nestle',
        18500,
        'Kopi bubuk asli racikan istimewa Abangda.',
        'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=600&q=80',
        'YA'
      ],
      [
        'Sabun Mandi Aromatherapy',
        'Mandi & Perawatan',
        'Unilever',
        8500,
        'Sabun mandi dengan aroma harum menyegarkan sepanjang hari.',
        'https://images.unsplash.com/photo-1607006482170-13f5fb479b12?auto=format&fit=crop&w=600&q=80',
        'TIDAK'
      ],
      [
        'Deterjen Cair 800ml',
        'Kebutuhan Rumah',
        'Wings',
        22000,
        'Pembersih pakaian ampuh menghilangkan noda membandel.',
        'https://images.unsplash.com/photo-1585830812416-a6c86bb14576?auto=format&fit=crop&w=600&q=80',
        'TIDAK'
      ]
    ];

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const demoFields = ['nama','id_kategori','brand','harga','deskripsi','url_foto','is_unggulan'];
    const rows = products.map(function(product) {
      return headers.map(function(header) {
        const index = demoFields.indexOf(header);
        return index < 0 ? '' : product[index];
      });
    });
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

function seedCouponsIfEmpty(sheet) {
  if (sheet && sheet.getLastRow() <= 1) {
    const coupons = [
      ['ABANGDA10', 'PERSEN', 10, 30000, 100, 'AKTIF'],
      ['HEMAT5RB', 'NOMINAL', 5000, 20000, 50, 'AKTIF']
    ];

    sheet.getRange(2, 1, coupons.length, 6).setValues(coupons);
  }
}

function databaseSchemas_() {
  return {
    products: [
      'nama',
      'id_kategori',
      'brand',
      'harga',
      'deskripsi',
      'url_foto',
      'is_unggulan',
      'harga_grosir',
      'min_beli_grosir',
      'satuan',
      '_kunci_produk'
    ],
    categories: [
      'nama',
      'url_ikon'
    ],
    brands: [
      'nama_brand',
      'url_logo'
    ],
    banners: [
      'keterangan',
      'url_gambar',
      'link'
    ],
    orders: [
      'id_pesanan',
      'tgl_pesan',
      'nama_pemesan',
      'no_whatsapp',
      'alamat',
      'catatan',
      'tipe_pengiriman',
      'detail_produk',
      'total_harga',
      'status', 'request_id', 'request_hash', 'checkout_summary', 'wa_target', 'subtotal', 'diskon', 'kode_kupon', 'coupon_debited', 'coupon_refunded', 'ongkir', 'total_final', 'status_pembayaran', 'dibayar_pada', 'riwayat_status', 'agreement_state'
    ],
    coupons: [
      'kode_kupon',
      'tipe',
      'nilai',
      'min_belanja',
      'kuota',
      'status'
    ],
    settings: [
      'kunci',
      'nilai',
      'keterangan'
    ]
  };
}


/** Menu spreadsheet privat: migrasi struktur tanpa reset atau data contoh. */
function updateSheetStructure_(silent) {
  const ui = SpreadsheetApp.getUi();
  const lock = LockService.getScriptLock();
  let locked = false;
  let backupUrl = '';
  let message = '';
  let success = false;
  try {
    if (!lock.tryLock(15000)) throw new Error('Ada proses pesanan lain. Silakan coba lagi.');
    locked = true;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const schemas = databaseSchemas_();
    // Tolak header ambigu sebelum membuat perubahan apa pun.
    Object.keys(schemas).forEach(function(name) {
      const sheet = ss.getSheetByName(name);
      if (!sheet || sheet.getLastColumn() === 0) return;
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(normalizeDatabaseHeader_);
      const seen = Object.create(null);
      headers.forEach(function(header) {
        if (!header) return;
        if (seen[header]) throw new Error('Header ganda "' + header + '" pada sheet ' + name + '. Rapikan header sebelum memperbarui.');
        seen[header] = true;
      });
    });
    const products = ss.getSheetByName('products');
    if (products && products.getLastRow() > 1) {
      const rows = products.getDataRange().getDisplayValues();
      const normalizedHeaders = rows[0].map(normalizeDatabaseHeader_);
      const nameIndex = normalizedHeaders.indexOf('nama');
      const brandIndex = normalizedHeaders.indexOf('brand');
      const seenProducts = new Set();
      rows.slice(1).forEach(function(row) {
        const name = nameIndex < 0 ? '' : String(row[nameIndex] || '').trim();
        if (!name) return;
        const brand = brandIndex < 0 ? '' : String(row[brandIndex] || '').trim();
        const key = JSON.stringify([name, brand]);
        if (seenProducts.has(key)) throw new Error('Nama produk dan brand sama persis: ' + name + '. Bedakan nama produk terlebih dahulu.');
        seenProducts.add(key);
      });
    }
    // Salinan utuh harus berhasil sebelum kolom/data diubah.
    const stamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd-HHmmss');
    const backup = ss.copy(ss.getName() + ' - Cadangan sebelum pembaruan ' + stamp);
    backupUrl = backup.getUrl();
    let added = 0;
    let removed = 0;
    Object.keys(schemas).forEach(function(name) {
      const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
      const count = sheet.getLastColumn();
      const originalHeaders = count ? sheet.getRange(1, 1, 1, count).getDisplayValues()[0] : [];
      const headers = originalHeaders.map(normalizeDatabaseHeader_);
      headers.forEach(function(header, i) {
        if (header !== originalHeaders[i]) sheet.getRange(1, i + 1).setValue(header);
      });
      // Rename in place so existing banner labels and URLs stay aligned.
      if (name === 'banners' && !headers.includes('keterangan') && headers.includes('id_banner')) {
        const index = headers.indexOf('id_banner');
        sheet.getRange(1, index + 1).setValue('keterangan');
        headers[index] = 'keterangan';
      }
      schemas[name].forEach(function(header) {
        if (headers.includes(header)) return;
        if (sheet.getMaxColumns() <= headers.length) sheet.insertColumnAfter(sheet.getMaxColumns());
        sheet.getRange(1, headers.length + 1).setValue(header);
        headers.push(header);
        added++;
      });
      const obsolete = name === 'orders' ? ['tracking_token', 'tracking_token_hash']
        : name === 'products' ? ['id_produk'] : name === 'brands' ? ['id_brand'] : name === 'banners' ? ['id_banner'] : [];
      for (let i = headers.length - 1; i >= 0; i--) {
        if (obsolete.includes(headers[i])) {
          sheet.deleteColumns(i + 1, 1);
          headers.splice(i, 1);
          removed++;
        }
      }
      const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(normalizeDatabaseHeader_);
      if (actualHeaders.some(function(header) { return obsolete.includes(header); })) throw new Error('Kolom lama pada ' + name + ' belum terhapus.');
      formatHeaderRow(sheet, headers.length);
    });
    initializeProductKeys_(ss);
    applySystemProtections_(ss);
    const orders = ss.getSheetByName('orders');
    const headers = orders.getRange(1, 1, 1, orders.getLastColumn()).getDisplayValues()[0];
    if (orders.getMaxRows() > 1) {
      const rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(['Menunggu Konfirmasi Stok', 'Menunggu Pembayaran', 'Sedang Diproses', 'Sedang Dikirim', 'Sudah Diterima Pembeli', 'Pesanan Dibatalkan'], true)
        .setAllowInvalid(false).setHelpText('Pilih status resmi pesanan Toko Abangda.').build();
      orders.getRange(2, headers.indexOf('status') + 1, orders.getMaxRows() - 1, 1).setDataValidation(rule);
    }
    applyProductCategoryValidation_(ss);
    SpreadsheetApp.flush();
    success = true;
    message = 'Struktur 7 sheet sudah diperbarui.\nKolom ditambahkan: ' + added + '\nKolom lama dihapus: ' + removed + '\n\nData lama, kolom tambahan, dan pengaturan toko dipertahankan. Tidak ada data contoh yang ditambahkan.';
  } catch (error) {
    message = 'Pembaruan belum selesai: ' + (error.message || String(error));
    if (backupUrl) message += '\nSebagian perubahan mungkin sudah diterapkan. Gunakan cadangan untuk memeriksa atau memulihkan data.';
  } finally {
    if (locked) lock.releaseLock();
  }
  // Dialog hanya ditampilkan setelah lock dilepas.
  if (backupUrl) message += '\n\nCadangan lengkap: ' + backupUrl;
  if (silent !== true) ui.alert(message);
  return {success:success,message:message};
}

// Satu tindakan pengelola; tidak mereset data atau menebak pengaturan toko.
// Nama publik ini juga dapat dipasang pada gambar/tombol di spreadsheet.
function perbaruiSemua() {
  const ui = SpreadsheetApp.getUi();
  const result = updateSheetStructure_(true);
  if (!result.success) { ui.alert(result.message); return; }
  try {
    const lock = LockService.getScriptLock();
    let locked = false;
    try {
      if (!lock.tryLock(15000)) throw new Error('Ada transaksi lain. Klik Perbarui Semua kembali.');
      locked = true;
      recoverPendingOperations_();
      SpreadsheetApp.flush();
    } finally { if (locked) lock.releaseLock(); }
    const issues = inspectAllData_();
    ui.alert(result.message + '\n\nPemulihan transaksi tertunda selesai.\n' +
      (issues.length ? 'Data yang perlu diperbaiki (' + issues.length + '):\n' + issues.slice(0,80).map(function(item) { return item.sheet + ' baris ' + item.row + ': ' + item.message; }).join('\n') : 'Pemeriksaan seluruh data selesai tanpa temuan.') +
      '\n\nKode Apps Script dan deployment webapp tidak diperbarui oleh tombol ini.');
  } catch (error) { ui.alert(result.message + '\n\nLangkah lanjutan belum selesai: ' + error.message); }
}

// Kompatibilitas menu lama: selalu gunakan pembaruan tanpa reset.
function setupDatabase_() {
  updateSheetStructure_();
}

function normalizeDatabaseHeader_(header) {
  const original = String(header == null ? '' : header);
  const normalized = original.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const aliases = {id_product:'id_produk', id_products:'id_produk', idproduct:'id_produk', idproduk:'id_produk',
    id_brands:'id_brand', idbrand:'id_brand', idbrands:'id_brand', id_banners:'id_banner', idbanner:'id_banner', idbanners:'id_banner'};
  const candidate = aliases[normalized] || normalized;
  const known = ['id_produk','id_brand','id_banner','tracking_token','tracking_token_hash'];
  Object.keys(databaseSchemas_()).forEach(function(name) {
    databaseSchemas_()[name].forEach(function(field) { if (!known.includes(field)) known.push(field); });
  });
  return known.includes(candidate) ? candidate : original;
}

function initializeProductKeys_(ss, editedRange) {
  const sheet=ss.getSheetByName('products');if(!sheet||sheet.getLastRow()<2)return;
  const rows=sheet.getDataRange().getValues(),headers=rows[0],index=headers.indexOf('_kunci_produk');if(index<0)return;
  const counts=new Map();rows.slice(1).forEach(function(row){const key=String(row[index]||'');if(key)counts.set(key,(counts.get(key)||0)+1);});
  rows.slice(1).forEach(function(row,i){
    const nameIndex=headers.indexOf('nama');
    if(nameIndex<0||!String(row[nameIndex]??'').trim()){
      if(editedRange&&row.every((value,j)=>j===index||value==null||String(value).trim()===''))sheet.getRange(i+2,index+1).setValue('');
      return;
    }
    const key=String(row[index]||'');
    const edited=editedRange&&i+2>=editedRange.getRow()&&i+2<editedRange.getRow()+editedRange.getNumRows();
    if(!key||edited&&counts.get(key)>1){
      const next=editedRange?'P-'+sha256_(Utilities.getUuid()):legacyProductKey_(row,headers);
      sheet.getRange(i+2,index+1).setValue(next);if(key)counts.set(key,counts.get(key)-1);
    }
  });
  sheet.hideColumns(index+1);
}

function applySystemProtections_(ss) {
  Object.keys(databaseSchemas_()).forEach(function(name){
    const sheet=ss.getSheetByName(name);if(!sheet||!sheet.getLastColumn())return;
    // Warnings preserve existing sharing/editor permissions, while discouraging accidental edits.
    const existing=sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
    const protect=function(range,label){const description='Toko Abangda: '+label;const found=existing.find(function(p){return p.getDescription()===description;});if(found){found.setRange(range);found.setWarningOnly(true);return;}range.protect().setDescription(description).setWarningOnly(true);};
    protect(sheet.getRange(1,1,1,sheet.getLastColumn()),'header '+name);
    const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
    const fields=name==='products'?['_kunci_produk']:name==='orders'?['request_id','request_hash','checkout_summary','wa_target','coupon_debited','coupon_refunded','riwayat_status','agreement_state','ongkir','total_final','status_pembayaran','dibayar_pada']:[];
    fields.forEach(function(field){const i=headers.indexOf(field);if(i<0)return;if(['_kunci_produk','request_id','request_hash','checkout_summary','wa_target','coupon_debited','coupon_refunded','riwayat_status','agreement_state'].includes(field))sheet.hideColumns(i+1);if(sheet.getMaxRows()>1)protect(sheet.getRange(2,i+1,sheet.getMaxRows()-1,1),name+'.'+field);});
  });
}

function onEdit(e) {
  if(!e||!e.range)return;
  try{
    const sheet=e.range.getSheet(),ss=sheet.getParent();
    if(sheet.getName()==='products'){
      const lock=LockService.getScriptLock();if(!lock.tryLock(15000))return;
      try{initializeProductKeys_(ss,e.range);}finally{lock.releaseLock();}return;
    }
    if(sheet.getName()!=='orders'||e.range.getRow()<2)return;
    const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0],statusCol=headers.indexOf('status')+1;
    if(e.range.getColumn()!==statusCol||e.range.getNumColumns()!==1)return;
    for(let offset=0;offset<e.range.getNumRows();offset++){
      const row=e.range.getRow()+offset,id=String(sheet.getRange(row,headers.indexOf('id_pesanan')+1).getValues()[0][0]);
      const found=findOrderRow_(sheet,'id_pesanan',id);if(!found)continue;
      if(String(orderValue_(found,'status'))==='Pesanan Dibatalkan'){cancelOrderById_(id);continue;}
      let cancelledBefore=e.oldValue==='Pesanan Dibatalkan';try{cancelledBefore=cancelledBefore||JSON.parse(orderValue_(found,'riwayat_status')||'[]').some(item=>item.key==='cancel:'+id);}catch(_){}
      if(cancelledBefore||Number(orderValue_(found,'coupon_refunded'))===1){sheet.getRange(row,statusCol).setValue('Pesanan Dibatalkan');ss.toast('Pesanan yang sudah dibatalkan tidak dapat diaktifkan ulang. Buat pesanan baru.');continue;}
      const lock=LockService.getScriptLock();if(!lock.tryLock(15000))throw new Error('Riwayat belum tercatat. Coba kembali lewat menu pesanan.');
      try{ensureOrderColumns_(sheet);const current=findOrderRow_(sheet,'id_pesanan',id);appendOrderEvent_(sheet,current,{at:orderTime_(),status:String(orderValue_(current,'status')),event:'Status diubah pengelola'});}finally{lock.releaseLock();}
    }
  }catch(error){try{e.source.toast('Perubahan perlu diperiksa: '+error.message);}catch(_){} }
}

// Private: cannot be invoked by google.script.run from the public web app.
function configureWebAdmin_() {
  const ui=SpreadsheetApp.getUi();
  try {
    const user=ui.prompt('Akun Admin Web','Username (3–64 karakter). Mengganti akun akan mengakhiri seluruh sesi admin.',ui.ButtonSet.OK_CANCEL);
    if(user.getSelectedButton()!==ui.Button.OK)return;
    const password=ui.prompt('Password Admin Web','Password minimal 12 karakter. Input dialog ini terlihat di layar; lakukan secara privat. Password disimpan sebagai hash, bukan teks asli.',ui.ButtonSet.OK_CANCEL);
    if(password.getSelectedButton()!==ui.Button.OK)return;
    adminSetCredentials_(user.getResponseText(),password.getResponseText());
    ui.alert('Akun admin web berhasil disetel. Login melalui menu Admin di webapp.');
  }catch(error){ui.alert(error.message);}
}
