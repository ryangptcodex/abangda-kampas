/**
 * TOKO ABANGDA - BACKEND CONTROLLER (code.gs)
 * Google Apps Script Backend Engine
 */

const DEFAULT_WHATSAPP_NUMBER = '6282331463166';

function doGet() {
  const template = HtmlService.createTemplateFromFile('index');

  return template.evaluate()
    .setTitle('Toko Abangda - Kebutuhan Harian Lebih Mudah')
    .addMetaTag(
      'viewport',
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'
    )
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getInitialData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Data pengaturan toko.
    const setSheet = ss.getSheetByName('settings');
    const settings = {};

    if (setSheet && setSheet.getLastRow() > 1) {
      const setData = setSheet.getDataRange().getDisplayValues();
      const headers = setData[0];
      const keyIdx = headers.indexOf('kunci');
      const valueIdx = headers.indexOf('nilai');

      if (keyIdx !== -1 && valueIdx !== -1) {
        for (let i = 1; i < setData.length; i++) {
          const key = String(setData[i][keyIdx]).trim();

          if (key) {
            settings[key] = setData[i][valueIdx];
          }
        }
      }
    }

    // Sheet categories berisi nama dan url_ikon.
    // Nama kategori dipakai sebagai nilai id_kategori pada produk.
    const catSheet = ss.getSheetByName('categories');
    const categories = [];

    if (catSheet && catSheet.getLastRow() > 1) {
      const catData = catSheet.getDataRange().getDisplayValues();
      const headers = catData[0];
      const namaIdx = headers.indexOf('nama');
      const iconIdx = headers.indexOf('url_ikon');

      if (namaIdx !== -1) {
        for (let i = 1; i < catData.length; i++) {
          const nama = String(catData[i][namaIdx] || '').trim();

          if (nama) {
            categories.push({
              id_kategori: nama,
              nama: nama,
              url_ikon: iconIdx !== -1 ? catData[i][iconIdx] : ''
            });
          }
        }
      }
    }

    // Data brand pilihan.
    const brdSheet = ss.getSheetByName('brands');
    const brands = [];

    if (brdSheet && brdSheet.getLastRow() > 1) {
      const brdData = brdSheet.getDataRange().getDisplayValues();
      const headers = brdData[0];
      const idIdx = headers.indexOf('id_brand');
      const namaIdx = headers.indexOf('nama_brand');
      const logoIdx = headers.indexOf('url_logo');

      for (let i = 1; i < brdData.length; i++) {
        brands.push({
          id_brand: idIdx !== -1 ? brdData[i][idIdx] : '',
          nama_brand: namaIdx !== -1 ? brdData[i][namaIdx] : '',
          url_logo: logoIdx !== -1 ? brdData[i][logoIdx] : ''
        });
      }
    }

    // Data banner promo.
    const bnrSheet = ss.getSheetByName('banners');
    const banners = [];

    if (bnrSheet && bnrSheet.getLastRow() > 1) {
      const bnrData = bnrSheet.getDataRange().getDisplayValues();
      const headers = bnrData[0];
      const idIdx = headers.indexOf('id_banner');
      const imageIdx = headers.indexOf('url_gambar');
      const linkIdx = headers.indexOf('link');

      for (let i = 1; i < bnrData.length; i++) {
        banners.push({
          id_banner: idIdx !== -1 ? bnrData[i][idIdx] : '',
          url_gambar: imageIdx !== -1 ? bnrData[i][imageIdx] : '',
          link: linkIdx !== -1 ? bnrData[i][linkIdx] : ''
        });
      }
    }

    // Produk unggulan.
    const prdSheet = ss.getSheetByName('products');
    const featuredProducts = [];

    if (prdSheet && prdSheet.getLastRow() > 1) {
      const prdData = prdSheet.getDataRange().getDisplayValues();
      const prdDataValues = prdSheet.getDataRange().getValues();
      const headers = prdData[0];
      const idIdx = headers.indexOf('id_produk');
      const namaIdx = headers.indexOf('nama');
      const brandIdx = headers.indexOf('brand');
      const hargaIdx = headers.indexOf('harga');
      const descIdx = headers.indexOf('deskripsi');
      const stokIdx = headers.indexOf('stok');
      const fotoIdx = headers.indexOf('url_foto');
      const unggulanIdx = headers.indexOf('is_unggulan');

      for (let i = 1; i < prdData.length; i++) {
        const isUnggulan = unggulanIdx !== -1
          ? String(prdData[i][unggulanIdx]).trim().toUpperCase()
          : '';

        if (isUnggulan === 'YA') {
          featuredProducts.push({
            id_produk: idIdx !== -1 ? prdData[i][idIdx] : '',
            nama: namaIdx !== -1 ? prdData[i][namaIdx] : '',
            brand: brandIdx !== -1 ? prdData[i][brandIdx] : '',
            harga: hargaIdx !== -1
              ? Number(prdDataValues[i][hargaIdx]) || 0
              : 0,
            deskripsi: descIdx !== -1 ? prdData[i][descIdx] : '',
            stok: stokIdx !== -1
              ? parseInt(prdDataValues[i][stokIdx], 10) || 0
              : 0,
            url_foto: fotoIdx !== -1 ? prdData[i][fotoIdx] : ''
          });
        }
      }
    }

    return {
      success: true,
      settings: settings,
      categories: categories,
      brands: brands,
      banners: banners,
      featuredProducts: featuredProducts
    };
  } catch (error) {
    return {
      success: false,
      message: error.toString()
    };
  }
}

function getProducts(searchVal, categoryId, brandVal, page, limit) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('products');

    if (!sheet || sheet.getLastRow() <= 1) {
      return {
        success: true,
        data: [],
        totalPages: 0,
        currentPage: 1,
        totalItems: 0
      };
    }

    const rawData = sheet.getDataRange().getDisplayValues();
    const rawDataValues = sheet.getDataRange().getValues();
    const headers = rawData[0];
    const idIdx = headers.indexOf('id_produk');
    const namaIdx = headers.indexOf('nama');
    const catIdx = headers.indexOf('id_kategori');
    const brandIdx = headers.indexOf('brand');
    const hargaIdx = headers.indexOf('harga');
    const descIdx = headers.indexOf('deskripsi');
    const stokIdx = headers.indexOf('stok');
    const fotoIdx = headers.indexOf('url_foto');

    const search = searchVal
      ? String(searchVal).toLowerCase().trim()
      : '';
    const cat = categoryId || 'ALL';
    const brand = brandVal || 'ALL';

    const filtered = [];

    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      const pNama = namaIdx !== -1
        ? String(row[namaIdx]).toLowerCase()
        : '';
      const pDesc = descIdx !== -1
        ? String(row[descIdx]).toLowerCase()
        : '';
      const pCat = catIdx !== -1 ? String(row[catIdx]) : '';
      const pBrand = brandIdx !== -1
        ? String(row[brandIdx]).trim()
        : '';

      const matchSearch =
        !search ||
        pNama.includes(search) ||
        pDesc.includes(search) ||
        pBrand.toLowerCase().includes(search);

      const matchCat = cat === 'ALL' || pCat === cat;

      const matchBrand =
        brand === 'ALL' ||
        pBrand.toLowerCase() === String(brand).toLowerCase().trim();

      if (matchSearch && matchCat && matchBrand) {
        filtered.push({
          id_produk: idIdx !== -1 ? row[idIdx] : '',
          nama: namaIdx !== -1 ? row[namaIdx] : '',
          id_kategori: pCat,
          brand: pBrand,
          harga: hargaIdx !== -1 ? Number(rawDataValues[i][hargaIdx]) || 0 : 0,
          deskripsi: descIdx !== -1 ? row[descIdx] : '',
          stok: stokIdx !== -1 ? parseInt(rawDataValues[i][stokIdx], 10) || 0 : 0,
          url_foto: fotoIdx !== -1 ? row[fotoIdx] : ''
        });
      }
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 6;
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / limitNum) || 1;
    const offset = (pageNum - 1) * limitNum;
    const paginatedData = filtered.slice(offset, offset + limitNum);

    return {
      success: true,
      data: paginatedData,
      totalPages: totalPages,
      currentPage: pageNum,
      totalItems: totalItems
    };
  } catch (error) {
    return {
      success: false,
      message: error.toString()
    };
  }
}

function getProductById(productId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('products');

    if (!sheet) {
      return {
        success: false,
        message: 'Sheet produk tidak ditemukan.'
      };
    }

    const rawData = sheet.getDataRange().getDisplayValues();
    const rawDataValues = sheet.getDataRange().getValues();
    const headers = rawData[0];
    const idIdx = headers.indexOf('id_produk');
    const namaIdx = headers.indexOf('nama');
    const brandIdx = headers.indexOf('brand');
    const hargaIdx = headers.indexOf('harga');
    const descIdx = headers.indexOf('deskripsi');
    const stokIdx = headers.indexOf('stok');
    const fotoIdx = headers.indexOf('url_foto');

    for (let i = 1; i < rawData.length; i++) {
      if (
        idIdx !== -1 &&
        String(rawData[i][idIdx]).trim() === String(productId).trim()
      ) {
        return {
          success: true,
          product: {
            id_produk: rawData[i][idIdx],
            nama: namaIdx !== -1 ? rawData[i][namaIdx] : '',
            brand: brandIdx !== -1 ? rawData[i][brandIdx] : '',
            harga: hargaIdx !== -1
              ? Number(rawDataValues[i][hargaIdx]) || 0
              : 0,
            deskripsi: descIdx !== -1 ? rawData[i][descIdx] : '',
            stok: stokIdx !== -1
              ? parseInt(rawDataValues[i][stokIdx], 10) || 0
              : 0,
            url_foto: fotoIdx !== -1 ? rawData[i][fotoIdx] : ''
          }
        };
      }
    }

    return {
      success: false,
      message: 'Produk tidak ditemukan.'
    };
  } catch (error) {
    return {
      success: false,
      message: error.toString()
    };
  }
}

// Read-only reconciliation of saved IDs/quantities against the current catalog.
function getCartSnapshot(savedItems) {
  try {
    if (!Array.isArray(savedItems) || savedItems.length > 100) {
      throw new Error('Keranjang tersimpan tidak valid.');
    }
    const wanted = new Map();
    savedItems.forEach(function(item) {
      const id = item && typeof item.id === 'string' ? item.id.trim() : '';
      const qty = item && item.qty;
      if (!id || id.length > 128 || !Number.isSafeInteger(qty) || qty < 1) {
        throw new Error('ID atau jumlah produk tersimpan tidak valid.');
      }
      const total = (wanted.get(id) || 0) + qty;
      if (!Number.isSafeInteger(total)) throw new Error('Jumlah produk tersimpan terlalu besar.');
      wanted.set(id, total);
    });
    if (!wanted.size) return { success: true, items: [], adjustments: [] };
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss && ss.getSheetByName('products');
    if (!sheet) throw new Error('Sheet products tidak ditemukan.');
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0] || [];
    const columns = {};
    ['id_produk', 'nama', 'harga', 'stok'].forEach(function(name) {
      columns[name] = headers.indexOf(name);
      if (columns[name] < 0) throw new Error('Kolom produk belum lengkap: ' + name);
    });
    const brandCol = headers.indexOf('brand');
    const photoCol = headers.indexOf('url_foto');
    const products = new Map();
    rows.slice(1).forEach(function(row) {
      const id = String(row[columns.id_produk] || '').trim();
      if (!wanted.has(id)) return;
      if (products.has(id)) throw new Error('ID produk duplikat di Sheets: ' + id);
      products.set(id, row);
    });
    function integer(value, label) {
      if (typeof value === 'string' && /^\d+$/.test(value.trim())) value = Number(value);
      if (!Number.isSafeInteger(value) || value < 0) throw new Error(label + ' produk tidak valid.');
      return value;
    }
    const items = [], adjustments = [];
    wanted.forEach(function(qty, id) {
      const row = products.get(id);
      if (!row) { adjustments.push({id: id, reason: 'removed'}); return; }
      const stock = integer(row[columns.stok], 'Stok');
      const price = integer(row[columns.harga], 'Harga');
      const name = String(row[columns.nama] || '').trim();
      if (!name) throw new Error('Nama produk kosong: ' + id);
      if (!stock) { adjustments.push({id: id, reason: 'out_of_stock'}); return; }
      if (qty > stock) adjustments.push({id: id, reason: 'quantity_reduced'});
      items.push({id: id, qty: Math.min(qty, stock), nama: name, harga: price,
        maxStock: stock, brand: brandCol < 0 ? '' : String(row[brandCol] || ''),
        url_foto: photoCol < 0 ? '' : String(row[photoCol] || '')});
    });
    return { success: true, items: items, adjustments: adjustments };
  } catch (error) {
    return { success: false, message: error.message || 'Keranjang belum dapat dipulihkan.' };
  }
}

function validateCoupon(couponCode, subtotal) {
  try {
    const code = String(couponCode || '').trim().toUpperCase();
    if (!code) throw new Error('Masukkan kode kupon!');
    if (!Number.isSafeInteger(subtotal) || subtotal < 0) {
      throw new Error('Subtotal kupon tidak valid.');
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss && ss.getSheetByName('coupons');
    if (!sheet) throw new Error('Tabel kupon belum tersedia.');
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0] || [];
    const fields = ['kode_kupon', 'tipe', 'nilai', 'min_belanja', 'kuota', 'status'];
    const idx = {};
    fields.forEach(function(field) {
      idx[field] = headers.indexOf(field);
      if (idx[field] < 0) throw new Error('Kolom kupon belum lengkap: ' + field);
    });
    function integer(value, label) {
      if (typeof value === 'string' && /^\d+$/.test(value.trim())) value = Number(value);
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error('Data ' + label + ' kupon harus berupa angka bulat nonnegatif.');
      }
      return value;
    }
    const row = rows.slice(1).find(function(item) {
      return String(item[idx.kode_kupon]).trim().toUpperCase() === code;
    });
    if (!row) throw new Error('Kode kupon tidak ditemukan.');
    if (String(row[idx.status]).trim().toUpperCase() !== 'AKTIF') {
      throw new Error('Kupon sudah tidak aktif.');
    }
    if (integer(row[idx.kuota], 'kuota') <= 0) throw new Error('Kuota kupon telah habis.');
    const minimum = integer(row[idx.min_belanja], 'minimum belanja');
    if (subtotal < minimum) {
      throw new Error('Minimal belanja kupon ini Rp ' + minimum.toLocaleString('id-ID'));
    }
    const type = String(row[idx.tipe]).trim().toUpperCase();
    const value = integer(row[idx.nilai], 'nilai');
    if (!['PERSEN', 'NOMINAL'].includes(type) || value <= 0 || (type === 'PERSEN' && value > 100)) {
      throw new Error('Tipe atau nilai kupon tidak valid.');
    }
    const discount = Math.min(subtotal, type === 'PERSEN' ? Math.round(subtotal * value / 100) : value);
    return {
      success: true, code: code, type: type, value: value,
      discountAmount: discount, minBelanja: minimum,
      message: 'Kupon berhasil digunakan! Hemat Rp ' + discount.toLocaleString('id-ID')
    };
  } catch (error) {
    return { success: false, message: error.message || String(error) };
  }
}

function createOrder(orderPayload) {
  const lock = LockService.getScriptLock();
  let locked = false;
  let quotaRange = null;
  let previousQuota = null;
  let orderWritten = false;
  try {
    if (!lock.tryLock(15000)) throw new Error('Toko sedang memproses pesanan lain. Silakan coba lagi.');
    locked = true;
    const payload = orderPayload || {};
    function text(value, max, label) {
      const result = String(value || '').trim();
      if (result.length > max) throw new Error(label + ' terlalu panjang.');
      return result;
    }
    function integer(value, label) {
      if (typeof value === 'string' && /^\d+$/.test(value.trim())) value = Number(value);
      if (!Number.isSafeInteger(value) || value < 0) throw new Error(label + ' harus berupa angka bulat nonnegatif.');
      return value;
    }
    const name = text(payload.nama_pemesan, 100, 'Nama');
    const phoneInput = text(payload.no_whatsapp, 30, 'Nomor WhatsApp');
    if (!/^[+\d][\d\s()-]*$/.test(phoneInput)) throw new Error('Nomor WhatsApp tidak valid.');
    const phone = phoneInput.replace(/\D/g, '');
    const delivery = payload.tipe_pengiriman;
    const address = text(payload.alamat, 1000, 'Alamat');
    const note = text(payload.catatan, 1000, 'Catatan');
    if (!name || !/^\d{8,15}$/.test(phone)) throw new Error('Lengkapi nama dan nomor WhatsApp yang valid.');
    if (!['Delivery', 'Takeaway'].includes(delivery)) throw new Error('Metode pengiriman tidak valid.');
    if (delivery === 'Delivery' && !address) throw new Error('Alamat pengiriman wajib diisi.');
    if (!Array.isArray(payload.items) || !payload.items.length || payload.items.length > 100) {
      throw new Error('Keranjang harus berisi 1 sampai 100 baris produk.');
    }
    const quantities = new Map();
    payload.items.forEach(function(item) {
      if (!item || typeof item !== 'object') throw new Error('Item pesanan tidak valid.');
      const id = String(item.id || item.id_produk || '').trim();
      const qty = integer(item.qty, 'Jumlah produk');
      if (!id || qty < 1) throw new Error('ID dan jumlah produk wajib valid.');
      const totalQty = (quantities.get(id) || 0) + qty;
      if (!Number.isSafeInteger(totalQty)) throw new Error('Jumlah produk terlalu besar.');
      quantities.set(id, totalQty);
    });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('Spreadsheet toko tidak terhubung.');
    const products = ss.getSheetByName('products');
    const orders = ss.getSheetByName('orders');
    if (!products || !orders) throw new Error('Sheet products atau orders tidak ditemukan.');
    const rows = products.getDataRange().getValues();
    const headers = rows[0] || [];
    const idx = {};
    ['id_produk', 'nama', 'brand', 'harga', 'stok'].forEach(function(field) {
      idx[field] = headers.indexOf(field);
      if (idx[field] < 0) throw new Error('Kolom produk belum lengkap: ' + field);
    });
    const byId = new Map();
    rows.slice(1).forEach(function(row) {
      const id = String(row[idx.id_produk]).trim();
      if (!id) return;
      if (byId.has(id)) throw new Error('ID produk duplikat di Sheets: ' + id);
      byId.set(id, row);
    });
    let subtotal = 0;
    const items = [];
    quantities.forEach(function(qty, id) {
      const row = byId.get(id);
      if (!row) throw new Error('Produk tidak ditemukan: ' + id);
      const stock = integer(row[idx.stok], 'Stok ' + id);
      const price = integer(row[idx.harga], 'Harga ' + id);
      const productName = String(row[idx.nama]).trim();
      if (!productName) throw new Error('Nama produk kosong: ' + id);
      if (qty > stock) throw new Error('Stok ' + productName + ' tersisa ' + stock + '. Perbarui keranjang.');
      subtotal += price * qty;
      if (!Number.isSafeInteger(subtotal)) throw new Error('Total pesanan terlalu besar.');
      items.push({ id: id, nama: productName, brand: String(row[idx.brand] || ''), harga: price, qty: qty });
    });
    const couponCode = text(payload.kode_kupon, 64, 'Kode kupon').toUpperCase();
    let discount = 0;
    if (couponCode) {
      const coupon = validateCoupon(couponCode, subtotal);
      if (!coupon.success) throw new Error(coupon.message);
      discount = coupon.discountAmount;
      const couponSheet = ss.getSheetByName('coupons');
      const couponRows = couponSheet.getDataRange().getValues();
      const codeCol = couponRows[0].indexOf('kode_kupon');
      const quotaCol = couponRows[0].indexOf('kuota');
      const couponRow = couponRows.findIndex(function(row, i) {
        return i > 0 && String(row[codeCol]).trim().toUpperCase() === couponCode;
      });
      if (couponRow < 1) throw new Error('Kupon berubah. Silakan coba kembali.');
      quotaRange = couponSheet.getRange(couponRow + 1, quotaCol + 1);
      previousQuota = integer(couponRows[couponRow][quotaCol], 'Kuota kupon');
      if (previousQuota <= 0) throw new Error('Kuota kupon telah habis.');
    }
    const total = subtotal - discount;
    const summary = {
      nama_pemesan: name, no_whatsapp: phone, tipe_pengiriman: delivery,
      alamat: delivery === 'Delivery' ? address : '', catatan: note,
      items: items, kode_kupon: couponCode, diskon: discount,
      subtotal: subtotal, total_harga: total
    };
    let waTarget = DEFAULT_WHATSAPP_NUMBER;
    const settings = ss.getSheetByName('settings');
    if (settings && settings.getLastRow() > 1) {
      const data = settings.getDataRange().getDisplayValues();
      const keyCol = data[0].indexOf('kunci');
      const valCol = data[0].indexOf('nilai');
      const found = data.slice(1).find(function(row) {
        return keyCol >= 0 && String(row[keyCol]).trim() === 'no_whatsapp';
      });
      if (found && valCol >= 0 && String(found[valCol]).trim()) waTarget = String(found[valCol]).trim();
    }
    waTarget = waTarget.replace(/\D/g, '');
    if (waTarget.startsWith('0')) waTarget = '62' + waTarget.slice(1);
    if (!/^\d{8,15}$/.test(waTarget)) throw new Error('Nomor WhatsApp toko belum valid di settings.');
    const orderHeaders = orders.getRange(1, 1, 1, orders.getLastColumn()).getDisplayValues()[0];
    const required = ['id_pesanan', 'tgl_pesan', 'nama_pemesan', 'no_whatsapp', 'alamat', 'catatan', 'tipe_pengiriman', 'detail_produk', 'total_harga', 'status'];
    required.forEach(function(field) {
      if (!orderHeaders.includes(field)) throw new Error('Kolom orders belum lengkap: ' + field);
    });
    const trackingToken = newTrackingToken_();
    const trackingHash = trackingHash_(trackingToken);
    ensureTrackingColumn_(orders, orderHeaders);
    const now = new Date();
    const date = Utilities.formatDate(now, 'Asia/Jakarta', 'yyyyMMdd');
    const dateText = Utilities.formatDate(now, 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
    const props = PropertiesService.getScriptProperties();
    const counter = props.getProperty('LAST_ORDER_DATE') === date
      ? Number(props.getProperty('ORDER_COUNTER') || 0) + 1 : 1;
    if (!Number.isSafeInteger(counter) || counter < 1) throw new Error('Nomor urut pesanan tidak valid.');
    const orderId = 'TA-' + date + '-' + String(counter).padStart(3, '0');
    props.setProperty('LAST_ORDER_DATE', date);
    props.setProperty('ORDER_COUNTER', String(counter));
    function cell(value) {
      return typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value;
    }
    const values = {
      id_pesanan: orderId, tgl_pesan: dateText, nama_pemesan: name,
      no_whatsapp: "'" + phone, alamat: summary.alamat, catatan: note || '-',
      tipe_pengiriman: delivery, detail_produk: JSON.stringify(items),
      total_harga: total, status: 'Menunggu Konfirmasi Stok',
      tracking_token_hash: trackingHash
    };
    const newRow = orderHeaders.map(function(header) {
      return Object.prototype.hasOwnProperty.call(values, header) ? cell(values[header]) : '';
    });
    if (quotaRange) quotaRange.setValue(previousQuota - 1);
    orders.appendRow(newRow);
    orderWritten = true;
    let message = '*PESANAN BARU - TOKO ABANGDA*\n';
    message += '*ID Pesanan:* ' + orderId + '\n*Tanggal:* ' + dateText + '\n';
    message += '*Kode pelacakan pribadi:* ' + trackingToken + '\n';
    message += '_Simpan ID dan kode ini untuk melacak pesanan. Jangan bagikan kode kepada pihak lain._\n';
    message += '*Nama:* ' + name + '\n*No. WA:* ' + phone + '\n';
    message += '*Pengiriman:* ' + delivery + '\n';
    if (summary.alamat) message += '*Alamat:* ' + summary.alamat + '\n';
    message += '*Catatan:* ' + (note || '-') + '\n\n*RINCIAN ITEM:*\n';
    items.forEach(function(item) {
      message += '• ' + item.nama + (item.brand ? ' [' + item.brand + ']' : '') + ' (' + item.qty + 'x) = Rp ' + (item.harga * item.qty).toLocaleString('id-ID') + '\n';
    });
    message += '\nSubtotal: Rp ' + subtotal.toLocaleString('id-ID') + '\n';
    if (couponCode) message += 'Diskon (' + couponCode + '): -Rp ' + discount.toLocaleString('id-ID') + '\n';
    message += '*Estimasi total produk: Rp ' + total.toLocaleString('id-ID') + '*\n';
    message += '_Mohon konfirmasi stok, ongkir jika ada, total akhir, dan cara pembayaran. Terima kasih!_';
    return { success: true, orderId: orderId, trackingToken: trackingToken, waUrl: 'https://wa.me/' + waTarget + '?text=' + encodeURIComponent(message), summary: summary };
  } catch (error) {
    if (quotaRange && previousQuota !== null && !orderWritten) {
      try { quotaRange.setValue(previousQuota); }
      catch (rollbackError) { console.error('Pemulihan kuota gagal: ' + rollbackError.message); }
    }
    return { success: false, message: error.message || String(error) };
  } finally {
    if (locked) lock.releaseLock();
  }
}

// Helpers ending in _ are private to Apps Script and cannot be called with google.script.run.
function newTrackingToken_() {
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Kode pelacakan belum berhasil dibuat. Silakan coba lagi.');
  return token;
}

function trackingHash_(token) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    token,
    Utilities.Charset.UTF_8
  ).map(function(byte) {
    return (byte & 255).toString(16).padStart(2, '0');
  }).join('');
}

function sameTrackingHash_(a, b) {
  if (!/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false;
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function ensureTrackingColumn_(sheet, headers) {
  let index = headers.indexOf('tracking_token_hash');
  if (index >= 0) return index;
  index = headers.length;
  if (sheet.getMaxColumns() <= index) sheet.insertColumnAfter(sheet.getMaxColumns());
  sheet.getRange(1, index + 1).setValue('tracking_token_hash');
  headers.push('tracking_token_hash');
  return index;
}

function trackOrder(orderId, trackingToken) {
  const denied = {
    success: false,
    message: 'ID pesanan atau kode pelacakan tidak valid. Periksa keduanya, atau hubungi admin toko untuk pesanan lama/kode yang hilang.'
  };
  try {
    const id = String(orderId || '').trim().toUpperCase();
    const token = String(trackingToken || '').trim().toLowerCase();
    if (!/^TA-\d{8}-\d{3,}$/.test(id) || !/^[a-f0-9]{64}$/.test(token)) return denied;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss && ss.getSheetByName('orders');
    if (!sheet || sheet.getLastRow() <= 1) return denied;
    const range = sheet.getDataRange();
    const data = range.getDisplayValues();
    const values = range.getValues();
    const headers = data[0];
    const idCol = headers.indexOf('id_pesanan');
    const hashCol = headers.indexOf('tracking_token_hash');
    if (idCol < 0 || hashCol < 0) return denied;
    const rowIndex = data.findIndex(function(row, i) {
      return i > 0 && String(row[idCol]).trim().toUpperCase() === id;
    });
    if (rowIndex < 1 || !sameTrackingHash_(String(data[rowIndex][hashCol] || ''), trackingHash_(token))) return denied;
    const row = data[rowIndex];
    function field(name) {
      const index = headers.indexOf(name);
      return index < 0 ? '' : row[index];
    }
    let items = [];
    try {
      const parsed = JSON.parse(field('detail_produk') || '[]');
      if (Array.isArray(parsed)) items = parsed.map(function(item) {
        return { nama: String(item.nama || ''), brand: String(item.brand || ''), qty: Number(item.qty) || 0, harga: Number(item.harga) || 0 };
      });
    } catch (error) {
      items = [];
    }
    const totalCol = headers.indexOf('total_harga');
    const total = totalCol < 0 ? 0 : Number(values[rowIndex][totalCol]);
    return {
      success: true,
      order: {
        id_pesanan: row[idCol], tgl_pesan: field('tgl_pesan'),
        tipe_pengiriman: field('tipe_pengiriman'),
        total_harga: Number.isFinite(total) ? total : 0,
        status: field('status') || 'Menunggu Konfirmasi Stok', items: items
      }
    };
  } catch (error) {
    // Do not expose exception text, credential material, or order existence publicly.
    return denied;
  }
}

// Spreadsheet menu only; the trailing _ prevents anonymous browser RPC calls.
function issueTrackingCodeForSelectedOrder_() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getActiveSheet();
  const selection = sheet && sheet.getActiveRange();
  if (!sheet || sheet.getName() !== 'orders' || !selection || selection.getNumRows() !== 1 || selection.getRow() <= 1 || selection.getRow() > sheet.getLastRow()) {
    ui.alert('Pilih satu baris pesanan pada sheet orders terlebih dahulu.');
    return;
  }
  const row = selection.getRow();
  let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  let idColumn = headers.indexOf('id_pesanan');
  const orderId = idColumn < 0 ? '' : sheet.getRange(row, idColumn + 1).getDisplayValue();
  if (!/^TA-\d{8}-\d{3,}$/.test(orderId)) {
    ui.alert('ID pesanan pada baris ini tidak valid.');
    return;
  }
  // UI prompts suspend execution: acquire the lock only after confirmation.
  const answer = ui.alert('Buat/ganti kode pelacakan', 'Pesanan ' + orderId + ': kode lama akan dinonaktifkan. Lanjutkan?', ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) return;
  const lock = LockService.getScriptLock();
  let locked = false;
  let token = '';
  let failure = '';
  try {
    if (!lock.tryLock(15000)) throw new Error('Ada proses pesanan lain. Silakan coba lagi.');
    locked = true;
    headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    idColumn = headers.indexOf('id_pesanan');
    if (idColumn < 0 || sheet.getRange(row, idColumn + 1).getDisplayValue() !== orderId) {
      throw new Error('Baris pesanan berubah. Pilih kembali pesanan yang benar.');
    }
    token = newTrackingToken_();
    const hash = trackingHash_(token);
    const column = ensureTrackingColumn_(sheet, headers);
    sheet.getRange(row, column + 1).setValue(hash);
    SpreadsheetApp.flush();
  } catch (error) {
    failure = error.message || 'Kode pelacakan belum berhasil dibuat.';
  } finally {
    if (locked) lock.releaseLock();
  }
  if (failure) {
    ui.alert(failure);
    return;
  }
  ui.alert('Kode pelacakan pribadi', 'ID Pesanan: ' + orderId + '\nKode: ' + token + '\n\nSalin sekarang dan berikan hanya kepada pelanggan pemilik pesanan. Kode mentah tidak disimpan di Sheets.', ui.ButtonSet.OK);
}
