const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '..', '..', 'code.gs'), 'utf8');
function fixture(options = {}) {
  const tables = {
    products: [['id_produk','nama','id_kategori','brand','harga','deskripsi','stok','url_foto','is_unggulan'], ['P1','Beras','Sembako','Abangda',34500,'Beras 5 kg',10,'','YA']],
    coupons: [['kode_kupon','tipe','nilai','min_belanja','kuota','status'], ['HEMAT','PERSEN',10,30000,2,'AKTIF']],
    orders: [['id_pesanan','tgl_pesan','nama_pemesan','no_whatsapp','alamat','catatan','tipe_pengiriman','detail_produk','total_harga','status']],
    settings: [['kunci','nilai'], ['no_whatsapp','6282331463166']]
  };
  let releases = 0, attempts = 0;
  const properties = {};
  const alerts = [];
  let activeLocks = 0;
  const ui = {
    Button: {YES:'YES', NO:'NO'}, ButtonSet:{YES_NO:'YES_NO', OK:'OK'},
    alert(...args) {
      assert.equal(activeLocks, 0, 'Do not hold ScriptLock across a UI prompt');
      alerts.push(args);
      if (args[2] === 'YES_NO') {
        if (options.onConfirm) options.onConfirm(tables);
        return options.confirm === 'NO' ? 'NO' : 'YES';
      }
    }
  };
  const sheets = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, {
    getLastRow: () => rows.length, getLastColumn: () => rows[0].length,
    getMaxColumns: () => rows[0].length,
    insertColumnAfter() {},
    getName: () => name,
    getActiveRange: () => ({getRow: () => options.selectedRow || 2, getNumRows: () => options.selectedCount || 1}),
    getDataRange() { return {
      getValues: () => rows.map(r => [...r]),
      getDisplayValues: () => rows.map((r,i) => r.map((v,j) => name === 'products' && i > 0 && j === 4 ? 'Rp34.500' : name === 'orders' && i > 0 && rows[0][j] === 'total_harga' ? 'Rp' + Number(v).toLocaleString('id-ID') : String(v == null ? '' : v).replace(/^'/,'')))
    }; },
    getRange(row, col, nr=1, nc=1) { return {
      getDisplayValue: () => String(rows[row-1][col-1] == null ? '' : rows[row-1][col-1]),
      getDisplayValues: () => rows.slice(row-1, row-1+nr).map(r => r.slice(col-1,col-1+nc).map(String)),
      setValue(value) { rows[row-1][col-1] = value; }
    }; },
    appendRow(row) { if (options.failAppend) throw Error('Gagal menulis order'); rows.push([...row]); }
  }]));
  const ss = { getSheetByName: name => sheets[name] || null, getActiveSheet: () => sheets[options.activeSheet || 'orders'] };
  const context = {
    console,
    SpreadsheetApp: {getActiveSpreadsheet: () => ss, getUi: () => ui, flush() {}},
    LockService: {getScriptLock: () => ({tryLock(ms) { attempts++; assert.equal(ms,15000); if (options.busy) return false; activeLocks++;return true; }, releaseLock(){activeLocks--;releases++;}})},
    PropertiesService: {getScriptProperties: () => ({getProperty:k=>properties[k]||null,setProperty(k,v){properties[k]=v;}})},
    Utilities: {getUuid: () => crypto.randomUUID(), DigestAlgorithm:{SHA_256:'SHA_256'}, Charset:{UTF_8:'UTF_8'}, computeDigest: (_, text) => [...crypto.createHash('sha256').update(text, 'utf8').digest()], formatDate: (_,zone,format) => {assert.equal(zone,'Asia/Jakarta');return format==='yyyyMMdd'?'20261025':'25/10/2026 10:00:00';}}
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const payload = () => ({nama_pemesan:'Budi', no_whatsapp:'081234567890',tipe_pengiriman:'Delivery',alamat:'Jalan Toko 1',catatan:'',items:[{id:'P1',qty:2,harga:1,nama:'Harga Palsu'}],total_harga:1,diskon:999999});
  return {context,tables,sheets,payload,alerts,releases:()=>releases,attempts:()=>attempts};
}

module.exports = { fixture };
