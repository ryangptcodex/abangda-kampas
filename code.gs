/**
 * TOKO ABANGDA - BACKEND CONTROLLER (code.gs)
 * Google Apps Script Backend Engine
 */


// Cache budgets are a best-effort application guard, not a network-level firewall.
const PUBLIC_LIMITS = {catalog:600,tracking:120,coupon:120,checkoutAttempts:120,newOrders:60,phoneOrders:5};
function consumeBudget_(key, limit, seconds, alreadyLocked) {
  const lock = alreadyLocked ? null : LockService.getScriptLock(); let locked = false;
  try {
    if (lock) { if (!lock.tryLock(15000)) throw new Error('Toko sedang sibuk. Coba kembali sebentar lagi.'); locked = true; }
    const cache = CacheService.getScriptCache();
    const bucket = Math.floor(Date.now() / (seconds * 1000));
    const cacheKey = 'budget:v1:' + key + ':' + bucket;
    const used = Number(cache.get(cacheKey) || 0);
    if (used >= limit) throw new Error('Terlalu banyak permintaan. Tunggu beberapa menit sebelum mencoba lagi.');
    cache.put(cacheKey,String(used+1),seconds);
  } finally { if (locked) lock.releaseLock(); }
}

function sha256_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(function(byte) { return (byte & 255).toString(16).padStart(2, '0'); }).join('');
}

function ensureOrderColumns_(sheet) {
  const extra = ['request_id','request_hash','checkout_summary','wa_target','subtotal','diskon','kode_kupon'];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  extra.forEach(function(name) {
    if (headers.includes(name)) return;
    if (sheet.getMaxColumns() <= headers.length) sheet.insertColumnAfter(sheet.getMaxColumns());
    sheet.getRange(1, headers.length + 1).setValue(name); headers.push(name);
  });
  return headers;
}

function replayCheckout_(sheet, requestId, requestHash) {
  const rows = sheet.getDataRange().getValues(); const headers = rows[0] || [];
  const key = headers.indexOf('request_id'); if (key < 0) return null;
  const row = rows.slice(1).find(function(row) { return row[key] === requestId; });
  if (!row) return null;
  function field(name) { return row[headers.indexOf(name)]; }
  if (field('request_hash') !== requestHash) {
    const error = new Error('Pesanan sebelumnya sudah tercatat. Data baru belum disimpan.'); error.existingOrderId = String(field('id_pesanan')); throw error;
  }
  const summary = JSON.parse(field('checkout_summary'));
  return checkoutResponse_(String(field('id_pesanan')), String(field('tgl_pesan')), summary, String(field('wa_target')));
}

function checkoutResponse_(orderId, dateText, summary, waTarget) {
  const delivery = summary.tipe_pengiriman === 'Delivery' ? 'Diantar' : 'Ambil Sendiri';
  let message = '👋🏻 Halo Abangda...\n\n*PESANAN BARU - TOKO ABANGDA*\n';
  message += '*ID Pesanan:* ' + orderId + '\n*Tanggal:* ' + dateText + '\n';
  message += '_Simpan ID pesanan ini untuk melacak pesanan._\n\n';
  message += '*Nama:* ' + summary.nama_pemesan + '\n*No. WhatsApp:* ' + summary.no_whatsapp + '\n';
  message += '*Pengiriman:* ' + delivery + '\n';
  if (summary.alamat) message += '*Alamat:* ' + summary.alamat + '\n';
  message += '*Catatan:* ' + (summary.catatan || '-') + '\n\n*RINCIAN ITEM:*\n';
  summary.items.forEach(function(item) {
    const name = item.nama + (item.brand && !item.nama.toLowerCase().includes(item.brand.toLowerCase()) ? ' [' + item.brand + ']' : '');
    message += '• ' + name + ' x ' + item.qty + ' ' + (item.satuan || 'pcs') + ' = Rp ' + (item.harga * item.qty).toLocaleString('id-ID') + '\n';
  });
  message += '\nSubtotal : Rp ' + summary.subtotal.toLocaleString('id-ID') + '\n';
  if (summary.kode_kupon) message += 'Diskon (' + summary.kode_kupon + ') : -Rp ' + summary.diskon.toLocaleString('id-ID') + '\n';
  message += '*Total : Rp ' + summary.total_harga.toLocaleString('id-ID') + '*\n\n';
  message += '_Mohon konfirmasi stok, ongkir jika ada, total akhir, dan cara pembayaran._\n';
  message += '_Terima kasih Abangda!_';
  return {success:true,orderId:orderId,waUrl:'https://wa.me/' + waTarget + '?text=' + encodeURIComponent(message),summary:summary};
}

function doGet() {
  const template = HtmlService.createTemplateFromFile('index');

  return template.evaluate()
    .setTitle('Toko Abangda - Kebutuhan Harian Lebih Mudah')
    .addMetaTag(
      'viewport',
      'width=device-width, initial-scale=1.0'
    )
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function ensureWholesaleColumns_(ss) {
  const sheet = ss.getSheetByName('products');
  if (!sheet || sheet.getLastColumn() < 1) throw new Error('Sheet products atau header produk belum tersedia.');
  const wanted = ['harga_grosir', 'min_beli_grosir'];
  let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  if (wanted.every(function(name) { return headers.includes(name); })) return;
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    if (!lock.tryLock(15000)) throw new Error('Pengaturan produk sedang diproses. Silakan coba lagi.');
    locked = true;
    headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    wanted.forEach(function(name) {
      if (headers.includes(name)) return;
      if (sheet.getMaxColumns() <= headers.length) sheet.insertColumnAfter(sheet.getMaxColumns());
      sheet.getRange(1, headers.length + 1).setValue(name);
      headers.push(name);
    });
  } finally { if (locked) lock.releaseLock(); }
}

function prepareWholesaleColumns_() {
  ensureWholesaleColumns_(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.getUi().alert('Kolom harga_grosir dan min_beli_grosir sudah siap di sheet products. Isi keduanya untuk mengaktifkan harga grosir per produk. Data produk lama tetap dipertahankan.');
}

// Internal key only; no ID column is required in the spreadsheet.
function productKeyFromRow_(row, headers) {
  function value(name) { const i = headers.indexOf(name); return i < 0 ? '' : String(row[i] == null ? '' : row[i]).trim(); }
  if (!value('nama')) return '';
  const key = JSON.stringify([value('nama'), value('brand')]);
  return 'P-' + Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, key, Utilities.Charset.UTF_8)
    .map(function(byte) { return (byte & 255).toString(16).padStart(2, '0'); }).join('');
}

function productFromRow_(row, headers) {
  function field(name) {
    const index = headers.indexOf(name);
    return index < 0 || row[index] == null ? '' : row[index];
  }
  function integer(value, label) {
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) value = Number(value);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(label + ' harus berupa angka bulat nonnegatif.');
    return value;
  }
  const id = productKeyFromRow_(row, headers);
  const name = String(field('nama')).trim();
  if (!id || !name) throw new Error('ID atau nama produk belum lengkap.');
  const price = integer(field('harga'), 'Harga ' + id);
  const rawWholesale = field('harga_grosir');
  const rawMinimum = field('min_beli_grosir');
  function blank(value) { return value === '' || value === 0 || value === '0'; }
  let wholesale = 0, minimum = 0;
  if (!blank(rawWholesale) || !blank(rawMinimum)) {
    wholesale = integer(rawWholesale, 'Harga grosir ' + id);
    minimum = integer(rawMinimum, 'Minimum grosir ' + id);
    if (wholesale <= 0 || wholesale > price || minimum < 1) {
      throw new Error('Isi harga_grosir dan min_beli_grosir dengan benar untuk ' + id + '. Harga grosir harus lebih dari nol dan tidak melebihi harga normal.');
    }
  }
  return {id_produk:id, nama:name, satuan:String(field('satuan')).trim() || 'pcs', id_kategori:String(field('id_kategori')), brand:String(field('brand')),
    harga:price, harga_grosir:wholesale, min_beli_grosir:minimum,
    deskripsi:String(field('deskripsi')), url_foto:String(field('url_foto'))};
}

// Quarantine incomplete/ambiguous products while keeping the rest of the catalog usable.
function readProductCatalog_(sheet) {
  if (!sheet) throw new Error('Sheet products tidak ditemukan.');
  const rows = sheet.getDataRange().getValues(); const headers = rows[0] || [];
  ['nama','harga'].forEach(function(field) { if (!headers.includes(field)) throw new Error('Kolom produk belum lengkap: ' + field); });
  const groups = new Map(), products = new Map(), issues = new Map(), warnings = [], featured = [];
  rows.slice(1).forEach(function(row,i) {
    if (row.every(function(value) { return value == null || String(value).trim() === ''; })) return;
    const id = productKeyFromRow_(row,headers);
    if (!id) { warnings.push({row:i+2,message:'Nama produk belum diisi.'}); return; }
    if (!groups.has(id)) groups.set(id,[]); groups.get(id).push({row:row,index:i+2});
  });
  groups.forEach(function(entries,id) {
    if (entries.length > 1) {
      const message = 'Nama produk dan brand duplikat. Bedakan nama atau varian produk.';
      issues.set(id,message); entries.forEach(function(entry) { warnings.push({row:entry.index,message:message}); }); return;
    }
    const entry = entries[0];
    try {
      const product = productFromRow_(entry.row,headers); products.set(id,product);
      const flag = headers.indexOf('is_unggulan');
      if (flag >= 0 && String(entry.row[flag]).trim().toUpperCase() === 'YA') featured.push(product);
    } catch (error) { issues.set(id,error.message); warnings.push({row:entry.index,message:error.message}); }
  });
  return {products:products,issues:issues,warnings:warnings,featured:featured};
}

function checkProductData_() {
  try {
    const catalog = readProductCatalog_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('products'));
    SpreadsheetApp.getUi().alert(catalog.warnings.length ? catalog.warnings.slice(0,50).map(function(issue) { return 'Baris '+issue.row+': '+issue.message; }).join('\n') : 'Data produk siap. Tidak ada baris bermasalah.');
  } catch (error) { SpreadsheetApp.getUi().alert(error.message || String(error)); }
}

function unitPriceForQuantity_(product, qty) {
  return product.min_beli_grosir > 0 && qty >= product.min_beli_grosir ? product.harga_grosir : product.harga;
}

function getInitialData() {
  try {
    consumeBudget_('catalog', PUBLIC_LIMITS.catalog, 60);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureWholesaleColumns_(ss);

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

          if (['nama_toko','alamat_toko','no_telepon','no_whatsapp','link_facebook','link_instagram','link_youtube','link_tiktok'].includes(key)) {
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
      const namaIdx = headers.indexOf('nama_brand');
      const logoIdx = headers.indexOf('url_logo');

      for (let i = 1; i < brdData.length; i++) {
        brands.push({
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
      const descriptionIdx = headers.indexOf('keterangan');
      const imageIdx = headers.indexOf('url_gambar');
      const linkIdx = headers.indexOf('link');

      for (let i = 1; i < bnrData.length; i++) {
        banners.push({
          keterangan: descriptionIdx !== -1 ? bnrData[i][descriptionIdx] : '',
          url_gambar: imageIdx !== -1 ? bnrData[i][imageIdx] : '',
          link: linkIdx !== -1 ? bnrData[i][linkIdx] : ''
        });
      }
    }

    const catalog = readProductCatalog_(ss.getSheetByName('products'));
    const featuredProducts = catalog.featured;
    return {
      success: true,
      settings: settings,
      categories: categories,
      brands: brands,
      banners: banners,
      featuredProducts: featuredProducts, catalogWarnings:catalog.warnings.length
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
    consumeBudget_('catalog', PUBLIC_LIMITS.catalog, 60);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('products');
    const catalog = readProductCatalog_(sheet);
    const search = String(searchVal || '').trim().toLowerCase().slice(0,100);
    const category = String(categoryId || 'ALL').trim(), brand = String(brandVal || 'ALL').trim();
    const filtered = Array.from(catalog.products.values()).filter(function(product) {
      return (!search || [product.nama,product.deskripsi,product.brand].some(function(value) { return value.toLowerCase().includes(search); }))
        && (category === 'ALL' || product.id_kategori.trim() === category)
        && (brand === 'ALL' || product.brand.trim().toLowerCase() === brand.toLowerCase());
    });
    const pageNum = Math.max(1, parseInt(page,10) || 1), limitNum = Math.max(1,Math.min(100,parseInt(limit,10) || 6));
    return {success:true,data:filtered.slice((pageNum-1)*limitNum,pageNum*limitNum),totalItems:filtered.length,totalPages:Math.max(1,Math.ceil(filtered.length/limitNum)),currentPage:pageNum,catalogWarnings:catalog.warnings.length};
  } catch(error) { return {success:false,message:error.message || String(error)}; }
}

function getProductById(productId) {
  try {
    consumeBudget_('catalog', PUBLIC_LIMITS.catalog, 60);
    const catalog = readProductCatalog_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('products'));
    const id = String(productId || '').trim(); const product = catalog.products.get(id);
    if (!product) throw new Error(catalog.issues.get(id) || 'Produk tidak ditemukan.');
    return {success:true,product:product};
  } catch(error) { return {success:false,message:error.message || String(error)}; }
}

// Read-only reconciliation of saved IDs/quantities against the current catalog.
function getCartSnapshot(savedItems) {
  try {
    consumeBudget_('catalog', PUBLIC_LIMITS.catalog, 60);
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
    const catalog = readProductCatalog_(sheet);
    const items = [], adjustments = [];
    wanted.forEach(function(qty, id) {
      if (catalog.issues.has(id)) throw new Error(catalog.issues.get(id));
      const product = catalog.products.get(id);
      if (!product) { adjustments.push({id: id, reason: 'removed'}); return; }
      items.push({id:id, qty:qty, nama:product.nama, harga:unitPriceForQuantity_(product, qty),
        harga_normal:product.harga, harga_grosir:product.harga_grosir, min_beli_grosir:product.min_beli_grosir,
        brand:product.brand, url_foto:product.url_foto});
    });
    return { success: true, items: items, adjustments: adjustments };
  } catch (error) {
    return { success: false, message: error.message || 'Keranjang belum dapat dipulihkan.' };
  }
}

// Voucher preview is read-only: never queue behind the order/migration ScriptLock.
function couponPreviewBudget_() {
  const cache = CacheService.getScriptCache();
  const key = 'budget:coupon-preview:v2:' + Math.floor(Date.now()/60000);
  const used = Number(cache.get(key) || 0);
  if (used >= PUBLIC_LIMITS.coupon) throw new Error('Terlalu banyak pemeriksaan voucher. Coba kembali sebentar lagi.');
  cache.put(key,String(used+1),60);
}

function couponPreviewRows_(code) {
  const cache = CacheService.getScriptCache(), key = 'coupon-preview:v3:' + sha256_(code);
  try { const saved = cache.get(key); if (saved) { const data = JSON.parse(saved); if (Array.isArray(data.rows) && Array.isArray(data.rows[0]) && data.expiresAt > Date.now()) return data; } } catch (_) {}
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('coupons');
  if (!sheet) throw new Error('Tabel kupon belum tersedia.');
  const all = sheet.getDataRange().getValues(), headers = all[0] || [];
  const index = headers.indexOf('kode_kupon');
  const row = all.slice(1).find(function(row) { return String(row[index] || '').trim().toUpperCase() === code; });
  const rows = row ? [headers,row] : [headers];
  const ttl = row ? 30 : 5, data = {rows:rows,expiresAt:Date.now()+ttl*1000};
  try { const text = JSON.stringify(data); if (text.length < 20000) cache.put(key,text,ttl); } catch (_) {}
  return data;
}

function validateCoupon(couponCode, subtotal) {
  try {
    const code = String(couponCode || '').trim().toUpperCase();
    if (!code || code.length > 64) throw new Error('Masukkan kode kupon yang valid.');
    couponPreviewBudget_();
    return validateCoupon_(code,subtotal,true);
  } catch(error) { return {success:false,message:error.message || String(error)}; }
}

function validateCoupon_(couponCode, subtotal, preview) {
  try {
    const code = String(couponCode || '').trim().toUpperCase();
    if (!code) throw new Error('Masukkan kode kupon!');
    if (!Number.isSafeInteger(subtotal) || subtotal < 0) {
      throw new Error('Subtotal kupon tidak valid.');
    }
    let rows, previewExpiresAt = 0;
    if (preview) { const data = couponPreviewRows_(code); rows = data.rows; previewExpiresAt = data.expiresAt; }
    else {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss && ss.getSheetByName('coupons');
      if (!sheet) throw new Error('Tabel kupon belum tersedia.');
      rows = sheet.getDataRange().getValues();
    }
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
      success: true, code: code, type: type, value: value, previewExpiresAt:previewExpiresAt,
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
  let orderSheet = null, requestId = '', requestHash = '';
  try {
    if (!lock.tryLock(15000)) throw new Error('Toko sedang memproses pesanan lain. Silakan coba lagi.');
    locked = true;
    consumeBudget_('checkout-attempts',PUBLIC_LIMITS.checkoutAttempts,60,true);
    const payload = orderPayload || {};
    requestId = String(payload.request_id || '');
    if (!/^[a-f0-9]{64}$/.test(requestId)) throw new Error('Muat ulang aplikasi sebelum membuat pesanan.');
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
      if (!id || id.length > 128 || qty < 1 || qty > 10000) throw new Error('ID dan jumlah produk wajib valid (maksimal 10.000 per produk).');
      const totalQty = (quantities.get(id) || 0) + qty;
      if (!Number.isSafeInteger(totalQty) || totalQty > 10000) throw new Error('Jumlah produk terlalu besar.');
      quantities.set(id, totalQty);
    });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('Spreadsheet toko tidak terhubung.');
    const products = ss.getSheetByName('products');
    const orders = ss.getSheetByName('orders');
    if (!products || !orders) throw new Error('Sheet products atau orders tidak ditemukan.');
    orderSheet = orders;
    requestHash = sha256_(JSON.stringify({name:name,phone:phone,delivery:delivery,address:delivery === 'Delivery' ? address : '',note:note,
      items:Array.from(quantities.entries()).sort(function(a,b) { return a[0].localeCompare(b[0]); }),coupon:String(payload.kode_kupon || '').trim().toUpperCase()}));
    const previous = replayCheckout_(orders, requestId, requestHash);
    if (previous) return previous;
    consumeBudget_('new-orders',PUBLIC_LIMITS.newOrders,600,true);
    consumeBudget_('phone:' + sha256_(phone),PUBLIC_LIMITS.phoneOrders,600,true);

    const catalog = readProductCatalog_(products);
    let subtotal = 0;
    const items = [];
    quantities.forEach(function(qty, id) {
      const product = catalog.products.get(id);
      if (!product) throw new Error(catalog.issues.get(id) || 'Produk tidak ditemukan. Pilih produk kembali.');
      const price = unitPriceForQuantity_(product, qty);
      subtotal += price * qty;
      if (!Number.isSafeInteger(subtotal)) throw new Error('Total pesanan terlalu besar.');
      items.push({id:id, nama:product.nama, brand:product.brand, satuan:product.satuan, harga:price, qty:qty,
        harga_normal:product.harga, harga_grosir:product.harga_grosir, min_beli_grosir:product.min_beli_grosir});
    });
    const couponCode = text(payload.kode_kupon, 64, 'Kode kupon').toUpperCase();
    let discount = 0;
    if (couponCode) {
      const coupon = validateCoupon_(couponCode, subtotal);
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
    let waTarget = '';
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
    const orderHeaders = ensureOrderColumns_(orders);
    const required = ['id_pesanan', 'tgl_pesan', 'nama_pemesan', 'no_whatsapp', 'alamat', 'catatan', 'tipe_pengiriman', 'detail_produk', 'total_harga', 'status'];
    required.forEach(function(field) {
      if (!orderHeaders.includes(field)) throw new Error('Kolom orders belum lengkap: ' + field);
    });
    const now = new Date();
    const date = Utilities.formatDate(now, 'Asia/Jakarta', 'yyyyMMdd');
    const dateText = Utilities.formatDate(now, 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
    const props = PropertiesService.getScriptProperties();
    let counter = props.getProperty('LAST_ORDER_DATE') === date
      ? Number(props.getProperty('ORDER_COUNTER') || 0) + 1 : 1;
    if (!Number.isSafeInteger(counter) || counter < 1) throw new Error('Nomor urut pesanan tidak valid.');
    const existingIds = new Set(orders.getDataRange().getValues().slice(1).map(function(row) { return String(row[orderHeaders.indexOf('id_pesanan')]); }));
    while (existingIds.has('TA-' + date + '-' + String(counter).padStart(3, '0'))) counter++;
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
      request_id:requestId, request_hash:requestHash, checkout_summary:JSON.stringify(summary), wa_target:waTarget,
      subtotal:subtotal, diskon:discount, kode_kupon:couponCode
    };
    if (values.checkout_summary.length > 45000 || values.detail_produk.length > 45000) throw new Error('Rincian pesanan terlalu panjang. Kurangi jumlah jenis produk.');
    const newRow = orderHeaders.map(function(header) {
      return Object.prototype.hasOwnProperty.call(values, header) ? cell(values[header]) : '';
    });
    if (quotaRange) quotaRange.setValue(previousQuota - 1);
    orders.appendRow(newRow);
    orderWritten = true;
    if (couponCode) { try { CacheService.getScriptCache().remove('coupon-preview:v3:' + sha256_(couponCode)); } catch (_) {} }
    return checkoutResponse_(orderId, dateText, summary, waTarget);
  } catch (error) {
    if (!orderWritten && orderSheet && requestId && requestHash) {
      try {
        const committed = replayCheckout_(orderSheet, requestId, requestHash);
        if (committed) { orderWritten = true; return committed; }
      } catch (lookupError) {
        if (quotaRange) return {success:false,message:'Status penyimpanan belum dapat dipastikan. Coba kirim kembali tanpa mengubah data pesanan.'};
      }
    }
    if (quotaRange && previousQuota !== null && !orderWritten) {
      try { quotaRange.setValue(previousQuota); }
      catch (rollbackError) { console.error('Pemulihan kuota gagal: ' + rollbackError.message); }
    }
    return { success: false, message: error.message || String(error), existingOrderId:error.existingOrderId || '' };
  } finally {
    if (locked) lock.releaseLock();
  }
}

function trackOrder(orderId) {
  const denied = {
    success: false,
    message: 'ID pesanan tidak ditemukan. Periksa kembali ID pesanan Anda.'
  };
  try {
    consumeBudget_('tracking', PUBLIC_LIMITS.tracking, 60);
    const id = String(orderId || '').trim().toUpperCase();
    if (!/^TA-\d{8}-\d{3,}$/.test(id)) return denied;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss && ss.getSheetByName('orders');
    if (!sheet || sheet.getLastRow() <= 1) return denied;
    const range = sheet.getDataRange();
    const data = range.getDisplayValues();
    const values = range.getValues();
    const headers = data[0];
    const idCol = headers.indexOf('id_pesanan');
    if (idCol < 0) return denied;
    const rowIndex = data.findIndex(function(row, i) {
      return i > 0 && String(row[idCol]).trim().toUpperCase() === id;
    });
    if (rowIndex < 1) return denied;
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
