/**
 * TOKO ABANGDA - BACKEND CONTROLLER (code.gs)
 * Google Apps Script Backend Engine
 */


// Cache budgets are a best-effort application guard, not a network-level firewall.
const PUBLIC_LIMITS = {catalog:600,tracking:120,coupon:120,checkoutAttempts:120,newOrders:60,phoneOrders:5};
function consumeBudget_(key, limit, seconds, alreadyLocked) {
  // Read budgets are best-effort cache counters; never queue behind checkout.
  // Financial writes call this only while already holding the transaction lock.
  const cache = CacheService.getScriptCache();
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const cacheKey = 'budget:v2:' + key + ':' + bucket;
  const used = Number(cache.get(cacheKey) || 0);
  if (used >= limit) throw new Error('Terlalu banyak permintaan. Tunggu beberapa menit sebelum mencoba lagi.');
  cache.put(cacheKey,String(used+1),seconds);
}

function normalizePhone_(value) {
  let phone = String(value || '').trim();
  if (!/^[+\d][\d\s()-]*$/.test(phone)) throw new Error('Nomor WhatsApp tidak valid.');
  phone = phone.replace(/\D/g,''); if (phone.startsWith('0')) phone = '62'+phone.slice(1);
  if (!/^[1-9]\d{7,14}$/.test(phone)) throw new Error('Nomor WhatsApp tidak valid.');
  return phone;
}

function publicSettings_(ss) {
  const sheet = ss.getSheetByName('settings'); if (!sheet) throw new Error('Sheet settings tidak ditemukan.');
  const rows = sheet.getDataRange().getDisplayValues(), headers = rows[0] || [];
  const keyIndex = headers.indexOf('kunci'), valueIndex = headers.indexOf('nilai');
  if (keyIndex < 0 || valueIndex < 0) throw new Error('Header settings belum lengkap.');
  const allowed = ['nama_toko','alamat_toko','no_telepon','no_whatsapp','link_facebook','link_instagram','link_youtube','link_tiktok'];
  const settings = {}, seen = new Set();
  rows.slice(1).forEach(function(row) {
    const key = String(row[keyIndex] || '').trim(); if (!key || !allowed.includes(key)) return;
    if (seen.has(key)) throw new Error('Kunci settings ganda: '+key+'. Rapikan melalui pemeriksaan data.');
    seen.add(key); if (allowed.includes(key)) settings[key] = String(row[valueIndex] || '').trim();
  });
  if (settings.no_whatsapp) settings.no_whatsapp = normalizePhone_(settings.no_whatsapp);
  return settings;
}

function findOrderRow_(sheet, field, value) {
  if(!sheet)throw new Error('Sheet transaksi belum tersedia.');
  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
  const index = headers.indexOf(field); if (index < 0 || sheet.getLastRow() < 2) return null;
  const column = sheet.getRange(2,index+1,sheet.getLastRow()-1,1).getValues();
  let found = -1;
  column.forEach(function(row,i) {
    if (String(row[0] || '').trim().toUpperCase() !== String(value).trim().toUpperCase()) return;
    if (found >= 0) throw new Error('Data pesanan ganda. Hubungi pengelola.'); found = i+2;
  });
  return found < 0 ? null : {headers:headers,row:sheet.getRange(found,1,1,headers.length).getValues()[0],rowIndex:found};
}

function validOrderId_(value) { return /^TA-(?:[A-F0-9]{20}|\d{8}-\d{3,})$/.test(String(value || '').trim().toUpperCase()); }


function sha256_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(function(byte) { return (byte & 255).toString(16).padStart(2, '0'); }).join('');
}

function ensureOrderColumns_(sheet) {
  const extra = ['request_id','request_hash','checkout_summary','wa_target','subtotal','diskon','kode_kupon','coupon_debited','coupon_refunded','ongkir','total_final','status_pembayaran','dibayar_pada','riwayat_status','agreement_state'];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  extra.forEach(function(name) {
    if (headers.includes(name)) return;
    if (sheet.getMaxColumns() <= headers.length) sheet.insertColumnAfter(sheet.getMaxColumns());
    sheet.getRange(1, headers.length + 1).setValue(name); headers.push(name);
  });
  return headers;
}

function replayCheckout_(sheet, requestId, requestHash) {
  const found = findOrderRow_(sheet,'request_id',requestId); if (!found) return null;
  function field(name) { return found.row[found.headers.indexOf(name)]; }
  if (field('request_hash') !== requestHash) {
    const error = new Error('Pesanan sebelumnya sudah tercatat. Data baru belum disimpan.'); error.existingOrderId = String(field('id_pesanan')); throw error;
  }
  if(field('status')==='Pesanan Dibatalkan') return {success:false,existingOrderId:String(field('id_pesanan')),message:'Pesanan sebelumnya sudah dibatalkan. Buat pesanan baru jika diperlukan.'};
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
function legacyProductKey_(row,headers) {
  function value(name){const i=headers.indexOf(name);return i<0?'':String(row[i]??'').trim();}
  return value('nama')?'P-'+sha256_(JSON.stringify([value('nama'),value('brand')])):'';
}
function productKeyFromRow_(row,headers) {
  const nameIndex=headers.indexOf('nama');if(nameIndex<0||!String(row[nameIndex]??'').trim())return '';
  const index=headers.indexOf('_kunci_produk');if(index<0)return legacyProductKey_(row,headers);
  const key=String(row[index]||'').trim();if(!/^P-[a-f0-9]{64}$/.test(key))throw new Error('Kunci sistem produk belum siap. Jalankan Perbarui Struktur Sheet.');
  return key;
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
  const groups = new Map(), pairs = new Map(), products = new Map(), issues = new Map(), warnings = [], featured = [];
  rows.slice(1).forEach(function(row,i) {
    if (row.every(function(value) { return value == null || String(value).trim() === ''; })) return;
    const pair=JSON.stringify(['nama','brand'].map(function(name){const i=headers.indexOf(name);return i<0?'':String(row[i]??'').trim();}));
    pairs.set(pair,(pairs.get(pair)||0)+1);
    let id;try{id=productKeyFromRow_(row,headers);}catch(error){warnings.push({row:i+2,message:error.message});return;}
    if (!id) { warnings.push({row:i+2,message:'Nama produk belum diisi.'}); return; }
    if (!groups.has(id)) groups.set(id,[]); groups.get(id).push({row:row,index:i+2,pair:pair});
  });
  groups.forEach(function(entries,id) {
    if (entries.length > 1 || pairs.get(entries[0].pair)>1) {
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

    const settings = publicSettings_(ss);

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
      if (!id || id.length > 128 || !Number.isSafeInteger(qty) || qty < 1 || qty > 10000) {
        throw new Error('ID atau jumlah produk tersimpan tidak valid.');
      }
      const total = (wanted.get(id) || 0) + qty;
      if (!Number.isSafeInteger(total) || total > 10000) throw new Error('Jumlah produk tersimpan terlalu besar.');
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
        brand:product.brand, satuan:product.satuan, url_foto:product.url_foto});
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
  const matches = all.slice(1).filter(function(row) { return String(row[index] || '').trim().toUpperCase() === code; });
  const rows = [headers].concat(matches);
  const ttl = matches.length ? 30 : 5, data = {rows:rows,expiresAt:Date.now()+ttl*1000};
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
    const matches = rows.slice(1).filter(function(item) {
      return String(item[idx.kode_kupon]).trim().toUpperCase() === code;
    });
    if(matches.length>1)throw new Error('Kode voucher ganda. Hubungi toko agar data voucher dirapikan.');
    const row=matches[0];
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
    recoverPendingOperations_();
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
    const phone = normalizePhone_(phoneInput);
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
    const waTarget = publicSettings_(ss).no_whatsapp;
    if (!waTarget) throw new Error('Nomor WhatsApp toko belum valid di settings.');
    const orderHeaders = ensureOrderColumns_(orders);
    const required = ['id_pesanan', 'tgl_pesan', 'nama_pemesan', 'no_whatsapp', 'alamat', 'catatan', 'tipe_pengiriman', 'detail_produk', 'total_harga', 'status'];
    required.forEach(function(field) {
      if (!orderHeaders.includes(field)) throw new Error('Kolom orders belum lengkap: ' + field);
    });
    const now = new Date();
    const dateText = Utilities.formatDate(now, 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
    let orderId = '';
    for (let i=0;i<5;i++) {
      const candidate = 'TA-'+Utilities.getUuid().replace(/-/g,'').slice(0,20).toUpperCase();
      if (!/^TA-[A-F0-9]{20}$/.test(candidate)) throw new Error('ID pesanan belum dapat dibuat. Coba kembali.');
      if (!findOrderRow_(orders,'id_pesanan',candidate)) { orderId=candidate; break; }
    }
    if (!orderId) throw new Error('ID pesanan belum dapat dibuat. Coba kembali.');
    function cell(value) {
      return typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value;
    }
    const values = {
      id_pesanan: orderId, tgl_pesan: dateText, nama_pemesan: name,
      no_whatsapp: "'" + phone, alamat: summary.alamat, catatan: note || '-',
      tipe_pengiriman: delivery, detail_produk: JSON.stringify(items),
      total_harga: total, status: 'Menunggu Konfirmasi Stok',
      request_id:requestId, request_hash:requestHash, checkout_summary:JSON.stringify(summary), wa_target:waTarget,
      subtotal:subtotal, diskon:discount, kode_kupon:couponCode, coupon_debited:couponCode ? 1 : 0, coupon_refunded:0,
      ongkir:'', total_final:'', status_pembayaran:'Belum Dikonfirmasi', dibayar_pada:'',
      riwayat_status:JSON.stringify([{at:dateText,status:'Menunggu Konfirmasi Stok',event:'Pesanan dicatat'}])
    };
    if (values.checkout_summary.length > 45000 || values.detail_produk.length > 45000) throw new Error('Rincian pesanan terlalu panjang. Kurangi jumlah jenis produk.');
    const newRow = orderHeaders.map(function(header) {
      return Object.prototype.hasOwnProperty.call(values, header) ? cell(values[header]) : '';
    });
    consumeBudget_('new-orders',PUBLIC_LIMITS.newOrders,600,true);
    consumeBudget_('phone:' + sha256_(phone),PUBLIC_LIMITS.phoneOrders,600,true);
    PropertiesService.getScriptProperties().setProperty('ABANGDA_CHECKOUT_V1',JSON.stringify({requestId:requestId,requestHash:requestHash,orderId:orderId,code:couponCode,before:previousQuota,after:couponCode?previousQuota-1:null}));
    if (quotaRange) quotaRange.setValue(previousQuota - 1);
    orders.appendRow(newRow);
    orderWritten = true;
    SpreadsheetApp.flush();
    recoverPendingCheckout_();
    if (couponCode) { try { CacheService.getScriptCache().remove('coupon-preview:v3:' + sha256_(couponCode)); } catch (_) {} }
    return checkoutResponse_(orderId, dateText, summary, waTarget);
  } catch (error) {
    if (!orderWritten && orderSheet && requestId && requestHash) {
      try {
        recoverPendingCheckout_();
        const committed = replayCheckout_(orderSheet, requestId, requestHash);
        if (committed) { orderWritten = true; return committed; }
      } catch (lookupError) {
        if (quotaRange) return {success:false,message:'Status penyimpanan belum dapat dipastikan. Coba kirim kembali tanpa mengubah data pesanan.'};
      }
    }
    return { success: false, message: error.message || String(error), existingOrderId:error.existingOrderId || '' };
  } finally {
    if (locked) lock.releaseLock();
  }
}

function trackOrder(orderId) {
  const denied = {success:false,message:'ID pesanan tidak ditemukan. Periksa kembali ID pesanan Anda.'};
  try {
    consumeBudget_('tracking',PUBLIC_LIMITS.tracking,60);
    const id = String(orderId || '').trim().toUpperCase(); if (!validOrderId_(id)) return denied;
    const ss=SpreadsheetApp.getActiveSpreadsheet(), sheet=ss && ss.getSheetByName('orders'); if (!sheet) return denied;
    const found=findOrderRow_(sheet,'id_pesanan',id); if (!found) return denied;
    function value(name) { const i=found.headers.indexOf(name);return i<0?'':found.row[i]; }
    const legacy=/^TA-\d{8}-\d{3,}$/.test(id);
    const order={id_pesanan:id,tgl_pesan:String(value('tgl_pesan')),status:String(value('status') || 'Menunggu Konfirmasi Stok'),legacy:legacy};
    // Legacy sequential references expose status only; new references stay a single input.
    if (legacy) return {success:true,order:order};
    let items=[];try{const parsed=JSON.parse(value('detail_produk') || '[]');if(Array.isArray(parsed))items=parsed.map(function(item){return {nama:String(item.nama||''),brand:String(item.brand||''),satuan:String(item.satuan||'pcs'),qty:Number(item.qty)||0,harga:Number(item.harga)||0};});}catch(_){}
    const total=Number(value('total_harga'));const sum=items.reduce(function(sum,item){return sum+item.qty*item.harga;},0);
    order.items=items;order.tipe_pengiriman=String(value('tipe_pengiriman'));order.total_harga=Number.isFinite(total)?total:0;
    order.subtotal=value('subtotal')!==''?Number(value('subtotal')):sum;order.diskon=value('diskon')!==''?Number(value('diskon')):Math.max(0,sum-order.total_harga);
    const confirmed=value('agreement_state')==='confirmed';
    order.ongkir=confirmed?Number(value('ongkir')):null;order.total_final=confirmed?Number(value('total_final')):null;
    order.status_pembayaran=value('agreement_state')==='pending'?'Konfirmasi toko sedang diperbarui':String(value('status_pembayaran') || 'Belum Dikonfirmasi');
    return {success:true,order:order};
  } catch(error) {return denied;}
}

function orderValue_(found,name) { const i=found.headers.indexOf(name);return i<0?'':found.row[i]; }
function setOrderValue_(sheet,found,name,value) {
  const i=found.headers.indexOf(name);if(i<0)throw new Error('Kolom orders belum siap: '+name+'. Jalankan Perbarui Struktur Sheet.');
  sheet.getRange(found.rowIndex,i+1).setValue(value);found.row[i]=value;
}
function orderTime_() { return Utilities.formatDate(new Date(),'Asia/Jakarta','dd/MM/yyyy HH:mm:ss'); }
function appendOrderEvent_(sheet,found,event) {
  const raw=orderValue_(found,'riwayat_status');let history=[];
  if(raw){history=JSON.parse(raw);if(!Array.isArray(history))throw new Error('Riwayat status tidak valid.');}
  if(event.key && history.some(function(item){return item.key===event.key;}))return;
  history.push(event);const json=JSON.stringify(history);if(json.length>45000)throw new Error('Riwayat pesanan penuh. Arsipkan sebelum memperbarui.');
  setOrderValue_(sheet,found,'riwayat_status',json);
}

// Durable single-refund journal. Every financial operation recovers it before mutating quotas.
function recoverPendingRefund_() {
  const props=PropertiesService.getScriptProperties(),raw=props.getProperty('ABANGDA_REFUND_V1');if(!raw)return;
  const tx=JSON.parse(raw),ss=SpreadsheetApp.getActiveSpreadsheet(),orders=ss.getSheetByName('orders');
  const found=findOrderRow_(orders,'id_pesanan',tx.id);if(!found)throw new Error('Pesanan jurnal pembatalan tidak ditemukan. Hubungi pengelola.');
  if(tx.code && Number(orderValue_(found,'coupon_refunded'))!==1){
    const coupons=ss.getSheetByName('coupons'),coupon=findOrderRow_(coupons,'kode_kupon',tx.code);
    if(!coupon)throw new Error('Kupon jurnal pembatalan tidak ditemukan.');
    const index=coupon.headers.indexOf('kuota'),actual=Number(coupon.row[index]);
    if(actual===tx.before)coupons.getRange(coupon.rowIndex,index+1).setValue(tx.after);
    else if(actual!==tx.after)throw new Error('Kuota berubah di luar proses pembatalan. Periksa jurnal sebelum melanjutkan.');
    setOrderValue_(orders,found,'coupon_refunded',1);
    try{CacheService.getScriptCache().remove('coupon-preview:v3:'+sha256_(tx.code));}catch(_){}
  }
  setOrderValue_(orders,found,'status','Pesanan Dibatalkan');
  if(orderValue_(found,'status_pembayaran')==='Lunas')setOrderValue_(orders,found,'status_pembayaran','Perlu Pengembalian');
  appendOrderEvent_(orders,found,{key:'cancel:'+tx.id,at:tx.at,status:'Pesanan Dibatalkan',event:tx.code?'Pesanan batal; kuota voucher dikembalikan satu kali':'Pesanan dibatalkan'});
  props.deleteProperty('ABANGDA_REFUND_V1');
}

function cancelOrderById_(id) {
  const lock=LockService.getScriptLock();let locked=false;
  try{
    if(!lock.tryLock(15000))throw new Error('Ada proses transaksi lain. Coba kembali.');locked=true;recoverPendingOperations_();
    const ss=SpreadsheetApp.getActiveSpreadsheet(),orders=ss.getSheetByName('orders');ensureOrderColumns_(orders);
    const found=findOrderRow_(orders,'id_pesanan',id);if(!found)throw new Error('Pesanan tidak ditemukan.');
    const code=String(orderValue_(found,'kode_kupon')||'').trim().toUpperCase();
    if(code && Number(orderValue_(found,'coupon_debited'))!==1 && Number(orderValue_(found,'coupon_refunded'))!==1)throw new Error('Pesanan lama belum memiliki bukti pemakaian kuota. Periksa manual; kuota tidak diubah.');
    const history=JSON.parse(orderValue_(found,'riwayat_status')||'[]');
    const alreadyLogged=Array.isArray(history)&&history.some(item=>item.key==='cancel:'+id);
    if(alreadyLogged&&orderValue_(found,'status')==='Pesanan Dibatalkan' && (!code || Number(orderValue_(found,'coupon_refunded'))===1))return 'Pesanan sudah dibatalkan. Kuota tidak ditambah lagi.';
    const tx={id:String(id),code:'',at:orderTime_()};
    if(code && Number(orderValue_(found,'coupon_refunded'))!==1){
      const coupons=ss.getSheetByName('coupons'),coupon=findOrderRow_(coupons,'kode_kupon',code);if(!coupon)throw new Error('Kupon tidak ditemukan atau ganda.');
      const before=Number(coupon.row[coupon.headers.indexOf('kuota')]);if(!Number.isSafeInteger(before)||before<0||!Number.isSafeInteger(before+1))throw new Error('Kuota kupon tidak valid.');
      tx.code=code;tx.before=before;tx.after=before+1;
    }
    PropertiesService.getScriptProperties().setProperty('ABANGDA_REFUND_V1',JSON.stringify(tx));recoverPendingRefund_();
    return 'Pesanan dibatalkan.'+(code?' Kuota voucher sudah dikembalikan satu kali.':'');
  }finally{if(locked)lock.releaseLock();}
}

function recordOrderAgreement_(id,shipping,payment) {
  const amount=Number(shipping);if(!Number.isSafeInteger(amount)||amount<0)throw new Error('Ongkir harus angka bulat nonnegatif.');
  if(!['Belum Bayar','Lunas'].includes(payment))throw new Error('Status pembayaran harus Belum Bayar atau Lunas.');
  const lock=LockService.getScriptLock();let locked=false;
  try{
    if(!lock.tryLock(15000))throw new Error('Ada proses transaksi lain. Coba kembali.');locked=true;recoverPendingOperations_();
    const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('orders');ensureOrderColumns_(sheet);
    const found=findOrderRow_(sheet,'id_pesanan',id);if(!found)throw new Error('Pesanan tidak ditemukan.');
    if(orderValue_(found,'status')==='Pesanan Dibatalkan'||Number(orderValue_(found,'coupon_refunded'))===1)throw new Error('Pesanan batal tidak dapat diaktifkan ulang. Buat pesanan baru.');
    if(orderValue_(found,'tipe_pengiriman')==='Takeaway'&&amount!==0)throw new Error('Ambil sendiri harus memakai ongkir 0.');
    const productTotal=Number(orderValue_(found,'total_harga')),finalTotal=productTotal+amount;
    if(!Number.isSafeInteger(productTotal)||productTotal<0||!Number.isSafeInteger(finalTotal))throw new Error('Total pesanan tidak valid.');
    const at=orderTime_(),paidAt=payment==='Lunas'?(orderValue_(found,'dibayar_pada')||at):'';
    PropertiesService.getScriptProperties().setProperty('ABANGDA_AGREEMENT_V1',JSON.stringify({id:String(id),key:'agreement:'+Utilities.getUuid(),at:at,shipping:amount,total:finalTotal,payment:payment,paidAt:paidAt}));
    recoverPendingAgreement_();
    return 'Total akhir Rp '+finalTotal.toLocaleString('id-ID')+'. Pembayaran: '+payment+'.';
  }finally{if(locked)lock.releaseLock();}
}

function selectedOrderId_() {
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getActiveSheet(),range=sheet&&sheet.getActiveRange();
  if(!sheet||sheet.getName()!=='orders'||!range||range.getNumRows()!==1||range.getRow()<2)throw new Error('Pilih satu baris pesanan pada sheet orders.');
  const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0],i=headers.indexOf('id_pesanan');
  const id=i<0?'':String(sheet.getRange(range.getRow(),i+1).getValues()[0][0]);if(!validOrderId_(id))throw new Error('ID pesanan tidak valid.');return id;
}
function cancelSelectedOrder_() {
  const ui=SpreadsheetApp.getUi();try{const id=selectedOrderId_();if(ui.alert('Batalkan pesanan',id+': batalkan dan kembalikan kuota voucher jika terpakai?',ui.ButtonSet.YES_NO)!==ui.Button.YES)return;ui.alert(cancelOrderById_(id));}catch(error){ui.alert(error.message);}
}
function setSelectedOrderAgreement_() {
  const ui=SpreadsheetApp.getUi();try{
    const id=selectedOrderId_(),shipping=ui.prompt('Ongkir '+id,'Isi angka rupiah, misalnya 10000. Isi 0 untuk ambil sendiri.',ui.ButtonSet.OK_CANCEL);if(shipping.getSelectedButton()!==ui.Button.OK)return;
    const input=shipping.getResponseText().trim();if(!/^\d+$/.test(input))throw new Error('Isi ongkir sebagai angka tanpa Rp/titik.');
    const payment=ui.prompt('Pembayaran '+id,'Ketik LUNAS atau BELUM BAYAR.',ui.ButtonSet.OK_CANCEL);if(payment.getSelectedButton()!==ui.Button.OK)return;
    const text=payment.getResponseText().trim().toUpperCase();if(!['LUNAS','BELUM BAYAR'].includes(text))throw new Error('Isi LUNAS atau BELUM BAYAR.');
    ui.alert(recordOrderAgreement_(id,Number(input),text==='LUNAS'?'Lunas':'Belum Bayar'));
  }catch(error){ui.alert(error.message);}
}

// Receipt proof is a random browser-held request key, never an extra tracking input.
function recoverCheckout(requestId) {
  try{
    consumeBudget_('receipt',120,60);const key=String(requestId||'');if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Referensi pemulihan tidak valid.');
    const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('orders'),found=sheet&&findOrderRow_(sheet,'request_id',key);if(!found)return {success:true,found:false};
    const id=String(orderValue_(found,'id_pesanan'));if(orderValue_(found,'status')==='Pesanan Dibatalkan')return {success:false,existingOrderId:id,message:'Pesanan sebelumnya sudah dibatalkan.'};
    const result=checkoutResponse_(id,String(orderValue_(found,'tgl_pesan')),JSON.parse(orderValue_(found,'checkout_summary')),String(orderValue_(found,'wa_target')));
    return {success:true,found:true,result:result};
  }catch(error){return {success:false,message:'Pesanan terakhir belum dapat dipulihkan. Coba lagi atau hubungi toko.'};}
}

function recoverPendingAgreement_() {
  const props=PropertiesService.getScriptProperties(),raw=props.getProperty('ABANGDA_AGREEMENT_V1');if(!raw)return;
  const tx=JSON.parse(raw),sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('orders'),found=findOrderRow_(sheet,'id_pesanan',tx.id);
  if(!found)throw new Error('Pesanan kesepakatan belum ditemukan.');
  if(orderValue_(found,'status')==='Pesanan Dibatalkan')throw new Error('Jurnal kesepakatan mengarah ke pesanan batal. Periksa melalui pengelola.');
  setOrderValue_(sheet,found,'agreement_state','pending');
  setOrderValue_(sheet,found,'ongkir',tx.shipping);setOrderValue_(sheet,found,'total_final',tx.total);
  setOrderValue_(sheet,found,'dibayar_pada',tx.paidAt);setOrderValue_(sheet,found,'status_pembayaran',tx.payment);
  appendOrderEvent_(sheet,found,{key:tx.key,at:tx.at,status:String(orderValue_(found,'status')),event:'Kesepakatan total/pembayaran',ongkir:tx.shipping,total_final:tx.total,pembayaran:tx.payment});
  setOrderValue_(sheet,found,'agreement_state','confirmed');props.deleteProperty('ABANGDA_AGREEMENT_V1');
}
function recoverPendingOperations_() { recoverPendingCheckout_();recoverPendingRefund_();recoverPendingAgreement_(); }

function inspectAllData_() {
  const ss=SpreadsheetApp.getActiveSpreadsheet(),schemas=databaseSchemas_(),issues=[],tables={};
  function issue(sheet,row,message){issues.push({sheet:sheet,row:row,message:message});}
  Object.keys(schemas).forEach(function(name){
    const sheet=ss.getSheetByName(name);if(!sheet){issue(name,1,'Sheet belum tersedia. Jalankan Perbarui Struktur Sheet.');return;}
    const rows=sheet.getDataRange().getValues();tables[name]=rows;
    const headers=(rows[0]||[]).map(normalizeDatabaseHeader_),seen=new Set();
    headers.forEach(function(header){if(header&&seen.has(header))issue(name,1,'Header ganda: '+header);seen.add(header);});
    schemas[name].forEach(function(header){if(!headers.includes(header))issue(name,1,'Kolom belum tersedia: '+header);});
  });
  function records(name){const rows=tables[name]||[],headers=rows[0]||[];return rows.slice(1).map(function(row,i){const object={_row:i+2};headers.forEach(function(header,j){object[header]=row[j];});return object;}).filter(function(row){return Object.keys(row).some(function(key){return key!=='_row'&&String(row[key]??'').trim()!=='';});});}
  function unique(name,field,upper){const seen=new Set();records(name).forEach(function(row){const raw=String(row[field]||'').trim(),key=upper?raw.toUpperCase():raw;if(!key){issue(name,row._row,field+' belum diisi.');return;}if(seen.has(key))issue(name,row._row,field+' ganda: '+raw);seen.add(key);});}
  unique('settings','kunci');unique('categories','nama');unique('brands','nama_brand');unique('coupons','kode_kupon',true);unique('orders','id_pesanan',true);
  try{const settings=publicSettings_(ss);if(!settings.no_whatsapp)issue('settings',1,'Nomor WhatsApp toko wajib diisi.');}catch(error){issue('settings',1,error.message);}
  const categories=new Set(records('categories').map(row=>String(row.nama||'').trim())),brands=new Set(records('brands').map(row=>String(row.nama_brand||'').trim()));
  const products=ss.getSheetByName('products');if(products){try{readProductCatalog_(products).warnings.forEach(item=>issue('products',item.row,item.message));}catch(error){issue('products',1,error.message);}}
  records('products').forEach(function(row){
    if(!categories.has(String(row.id_kategori||'').trim()))issue('products',row._row,'Kategori belum cocok dengan categories.nama.');
    if(!brands.has(String(row.brand||'').trim()))issue('products',row._row,'Brand belum cocok dengan brands.nama_brand.');
    if(!String(row.satuan||'').trim())issue('products',row._row,'Satuan belum diisi; aplikasi memakai pcs.');
    if(!['YA','TIDAK',''].includes(String(row.is_unggulan||'').trim().toUpperCase()))issue('products',row._row,'is_unggulan harus YA atau TIDAK.');
  });
  function imageUrl(value){return /^https:\/\//i.test(String(value||''));}
  ['products','categories','brands','banners'].forEach(function(name){const field={products:'url_foto',categories:'url_ikon',brands:'url_logo',banners:'url_gambar'}[name];records(name).forEach(row=>{if(!imageUrl(row[field]))issue(name,row._row,field+' belum berupa URL HTTPS.');});});
  records('banners').forEach(function(row){if(!String(row.keterangan||'').trim())issue('banners',row._row,'Keterangan banner belum diisi.');if(row.link&&row.link!=='#'&&!imageUrl(row.link))issue('banners',row._row,'Link banner harus HTTPS.');});
  records('coupons').forEach(function(row){
    ['nilai','min_belanja','kuota'].forEach(function(field){const n=Number(row[field]);if(row[field]===''||!Number.isSafeInteger(n)||n<0)issue('coupons',row._row,field+' harus angka bulat nonnegatif.');});
    const type=String(row.tipe||'').trim().toUpperCase(),value=Number(row.nilai);
    if(!['PERSEN','NOMINAL'].includes(type)||value<=0||type==='PERSEN'&&value>100)issue('coupons',row._row,'Tipe/nilai voucher tidak valid.');
    if(!['AKTIF','NONAKTIF'].includes(String(row.status||'').trim().toUpperCase()))issue('coupons',row._row,'Status voucher harus AKTIF atau NONAKTIF.');
  });
  records('orders').forEach(function(row){
    if(!validOrderId_(row.id_pesanan))issue('orders',row._row,'ID pesanan tidak valid.');
    if(row.status==='Pesanan Dibatalkan'&&Number(row.coupon_debited)===1&&Number(row.coupon_refunded)!==1)issue('orders',row._row,'Kuota pesanan batal belum dikembalikan. Gunakan menu Batalkan Pesanan Terpilih.');
    if(row.agreement_state==='pending')issue('orders',row._row,'Kesepakatan total belum selesai; ulangi menu Ongkir & Pembayaran.');
    try{if(row.detail_produk&&!Array.isArray(JSON.parse(row.detail_produk)))throw Error();}catch(_){issue('orders',row._row,'Rincian produk bukan JSON yang valid.');}
    try{if(row.checkout_summary){const summary=JSON.parse(row.checkout_summary);if(Number(summary.total_harga)!==Number(row.total_harga))issue('orders',row._row,'Total produk tidak cocok dengan snapshot; jangan timpa dengan total termasuk ongkir.');}}catch(_){issue('orders',row._row,'Snapshot checkout rusak.');}
  });
  const props=PropertiesService.getScriptProperties();if(props.getProperty('ABANGDA_CHECKOUT_V1')||props.getProperty('ABANGDA_REFUND_V1')||props.getProperty('ABANGDA_AGREEMENT_V1'))issue('orders',1,'Ada jurnal transaksi tertunda; ulangi tindakan pengelola untuk pemulihan.');
  return issues;
}
function checkAllData_() {
  const ui=SpreadsheetApp.getUi();try{const issues=inspectAllData_();ui.alert(issues.length?issues.slice(0,80).map(item=>item.sheet+' baris '+item.row+': '+item.message).join('\n')+'\n\nJumlah temuan: '+issues.length:'Seluruh struktur dan data yang diperiksa siap. Akses foto/deployment masih perlu diuji langsung.');}catch(error){ui.alert(error.message || String(error));}
}

function markMoneyReturned_(id) {
  const lock=LockService.getScriptLock();let locked=false;
  try{
    if(!lock.tryLock(15000))throw new Error('Ada proses transaksi lain. Coba kembali.');locked=true;recoverPendingOperations_();
    const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('orders'),found=findOrderRow_(sheet,'id_pesanan',id);if(!found)throw new Error('Pesanan tidak ditemukan.');
    if(orderValue_(found,'status')!=='Pesanan Dibatalkan')throw new Error('Hanya untuk pesanan yang sudah dibatalkan.');
    const status=orderValue_(found,'status_pembayaran');if(status==='Dikembalikan')return 'Pengembalian dana sudah dicatat.';
    if(!['Lunas','Perlu Pengembalian'].includes(status))throw new Error('Belum ada pembayaran lunas yang perlu dikembalikan.');
    appendOrderEvent_(sheet,found,{key:'money-returned:'+id,at:orderTime_(),status:'Pesanan Dibatalkan',event:'Pengelola mengonfirmasi dana sudah dikembalikan secara manual'});
    setOrderValue_(sheet,found,'status_pembayaran','Dikembalikan');return 'Pengembalian dana dicatat. Aplikasi tidak melakukan transfer uang.';
  }finally{if(locked)lock.releaseLock();}
}
function markSelectedMoneyReturned_() {
  const ui=SpreadsheetApp.getUi();try{const id=selectedOrderId_();if(ui.alert('Catat pengembalian dana',id+': pastikan dana SUDAH dikembalikan kepada pembeli. Menu ini hanya mencatat, tidak mentransfer uang. Lanjutkan?',ui.ButtonSet.YES_NO)!==ui.Button.YES)return;ui.alert(markMoneyReturned_(id));}catch(error){ui.alert(error.message);}
}
function repairPendingOperations_() {
  const ui=SpreadsheetApp.getUi(),lock=LockService.getScriptLock();let locked=false,message='';
  try{if(!lock.tryLock(15000))throw new Error('Ada proses transaksi lain. Coba kembali.');locked=true;recoverPendingOperations_();message='Transaksi tertunda sudah diperiksa dan dipulihkan.';}catch(error){message=error.message;}finally{if(locked)lock.releaseLock();}ui.alert(message);
}

function showSelectedOrderHistory_() {
  const ui=SpreadsheetApp.getUi();try{
    const id=selectedOrderId_(),sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('orders'),found=findOrderRow_(sheet,'id_pesanan',id);
    const history=JSON.parse(orderValue_(found,'riwayat_status')||'[]');
    ui.alert('Riwayat '+id,history.length?history.slice(-80).map(function(item){return item.at+' | '+item.event+' | '+item.status+(item.total_final!=null?' | Total akhir Rp '+Number(item.total_final).toLocaleString('id-ID'):'');}).join('\n'):'Pesanan lama belum memiliki riwayat.',ui.ButtonSet.OK);
  }catch(error){ui.alert(error.message);}
}

function recoverPendingCheckout_() {
  const props=PropertiesService.getScriptProperties(),raw=props.getProperty('ABANGDA_CHECKOUT_V1');if(!raw)return;
  const tx=JSON.parse(raw),ss=SpreadsheetApp.getActiveSpreadsheet(),orders=ss.getSheetByName('orders');
  if(!orders||!orders.getRange(1,1,1,orders.getLastColumn()).getDisplayValues()[0].includes('request_id'))throw new Error('Metadata jurnal checkout belum tersedia. Periksa melalui pengelola.');
  const found=findOrderRow_(orders,'request_id',tx.requestId);
  if(found&&(orderValue_(found,'request_hash')!==tx.requestHash||orderValue_(found,'id_pesanan')!==tx.orderId))throw new Error('Jurnal checkout tidak cocok dengan pesanan. Jangan ubah kuota manual.');
  if(tx.code){
    const sheet=ss.getSheetByName('coupons'),coupon=findOrderRow_(sheet,'kode_kupon',tx.code);if(!coupon)throw new Error('Kupon jurnal checkout tidak ditemukan.');
    const col=coupon.headers.indexOf('kuota'),actual=Number(coupon.row[col]),target=found?tx.after:tx.before;
    if(actual!==tx.before&&actual!==tx.after)throw new Error('Kuota jurnal checkout berubah di luar transaksi. Periksa sebelum melanjutkan.');
    if(actual!==target)sheet.getRange(coupon.rowIndex,col+1).setValue(target);
    try{CacheService.getScriptCache().remove('coupon-preview:v3:'+sha256_(tx.code));}catch(_){}
  }
  props.deleteProperty('ABANGDA_CHECKOUT_V1');
}
