/**
 * TOKO ABANGDA - DATABASE INITIALIZER & SMART PRUNER (setup.gs)
 * Menyiapkan struktur sheet, header, data awal, dropdown, dan menu spreadsheet.
 */

function onOpen(e) {
  SpreadsheetApp.getUi()
    .createMenu('🛒 Toko Abangda')
    .addItem('🛠️ Siapkan Database', 'setupDatabase_')
    .addItem('💰 Siapkan Kolom Harga Grosir', 'prepareWholesaleColumns_')
    .addSeparator()
    .addItem('📦 Buka Produk', 'openProductsSheet')
    .addItem('🗂️ Buka Kategori', 'openCategoriesSheet')
    .addItem('🏷️ Buka Brand', 'openBrandsSheet')
    .addItem('🖼️ Buka Banner', 'openBannersSheet')
    .addItem('🧾 Buka Pesanan', 'openOrdersSheet')
    .addItem('🔐 Buat/Ganti Kode Pelacakan', 'issueTrackingCodeForSelectedOrder_')
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

function setupDatabase_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const schemas = {
      products: [
        'id_produk',
        'nama',
        'id_kategori',
        'brand',
        'harga',
        'deskripsi',
        'url_foto',
        'is_unggulan',
        'harga_grosir',
        'min_beli_grosir'
      ],
      categories: [
        'nama',
        'url_ikon'
      ],
      brands: [
        'id_brand',
        'nama_brand',
        'url_logo'
      ],
      banners: [
        'id_banner',
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
        'status',
        'tracking_token_hash'
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

  const productRows = Math.max(productsSheet.getMaxRows() - 1, 100);

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
      ['BRD-001', 'Indofood', 'https://cdn-icons-png.flaticon.com/512/888/888879.png'],
      ['BRD-002', 'Unilever', 'https://cdn-icons-png.flaticon.com/512/888/888879.png'],
      ['BRD-003', 'Wings', 'https://cdn-icons-png.flaticon.com/512/888/888879.png'],
      ['BRD-004', 'Nestle', 'https://cdn-icons-png.flaticon.com/512/888/888879.png'],
      ['BRD-005', 'Bimoli', 'https://cdn-icons-png.flaticon.com/512/888/888879.png']
    ];

    sheet.getRange(2, 1, brands.length, 3).setValues(brands);
  }
}

function seedBannersIfEmpty(sheet) {
  if (sheet && sheet.getLastRow() <= 1) {
    const banners = [
      [
        'BNR-001',
        'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1000&q=80',
        '#'
      ],
      [
        'BNR-002',
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
        'PRD-001',
        'Minyak Goreng Premium 2L',
        'Sembako & Bumbu',
        'Bimoli',
        34500,
        'Minyak goreng kelapa sawit berkualitas tinggi, bening dan sehat.',
        'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80',
        'YA'
      ],
      [
        'PRD-002',
        'Beras Wangi Super 5kg',
        'Sembako & Bumbu',
        'Toko Abangda',
        72000,
        'Beras pulen pilihan tanpa bahan pengawet.',
        'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80',
        'YA'
      ],
      [
        'PRD-003',
        'Kopi Hitam Original 200g',
        'Makanan & Minuman',
        'Nestle',
        18500,
        'Kopi bubuk asli racikan istimewa Abangda.',
        'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=600&q=80',
        'YA'
      ],
      [
        'PRD-004',
        'Sabun Mandi Aromatherapy',
        'Mandi & Perawatan',
        'Unilever',
        8500,
        'Sabun mandi dengan aroma harum menyegarkan sepanjang hari.',
        'https://images.unsplash.com/photo-1607006482170-13f5fb479b12?auto=format&fit=crop&w=600&q=80',
        'TIDAK'
      ],
      [
        'PRD-005',
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
    const demoFields = ['id_produk','nama','id_kategori','brand','harga','deskripsi','url_foto','is_unggulan'];
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