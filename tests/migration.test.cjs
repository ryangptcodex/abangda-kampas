const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm'),crypto=require('node:crypto');
function fixture(options={}){
 const tables=structuredClone(options.tables||{products:[['harga','id_produk','catatan_sendiri'],[10000,'P1','=1+1']],orders:[['tracking_token','id_pesanan','tracking_token_hash','status','nama_pemesan'],['secret','TA-20261103-001','hash','Sedang Diproses','Budi']],brands:[['id_brand','nama_brand','url_logo'],['BR1','Abangda','logo']],banners:[['url_gambar','id_banner','link'],['gambar','Promo lama','tujuan']],settings:[['nilai','kunci','custom'],['628111','no_whatsapp','simpan']]});
 let held=false,copies=0,backup,mutations=0;const alerts=[];const sheets={};
 const make=(name)=>{const rows=tables[name];let maxColumns=Math.max(1,...rows.map(r=>r.length));return {
  getLastRow:()=>rows.length, getLastColumn:()=>Math.max(0,...rows.map(r=>r.length)),getMaxColumns:()=>maxColumns,getMaxRows:()=>5,
  insertColumnAfter(){maxColumns++;mutations++;},setFrozenRows(){},hideColumns(){},getProtections(){return [];},
  deleteColumns(col,n){rows.forEach(r=>r.splice(col-1,n));maxColumns-=n;mutations++;},
  getDataRange(){return {getValues:()=>rows.map(row=>[...row]),getDisplayValues:()=>rows.map(row=>row.map(String))};},
  getRange(row,col,nr=1,nc=1){assert.ok(row+nr-1<=5,'no out of bounds validations');return {
   getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>rows[row-1+i]?.[col-1+j]??'')),
   protect(){return {setDescription(){return this;},setWarningOnly(){return this;}};},
   getDisplayValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>String(rows[row-1+i]?.[col-1+j]??''))),
   setValue(v){if(options.failWrite)throw Error('write failed');while(rows.length<row)rows.push([]);rows[row-1][col-1]=v;mutations++;},
   setFontWeight(){},setBackground(){},setFontColor(){},setDataValidation(){}
  };}
 };};Object.keys(tables).forEach(name=>sheets[name]=make(name));
 const ss={getName:()=> 'Toko',getSheetByName:name=>sheets[name]||null,insertSheet(name){tables[name]=[];mutations++;return sheets[name]=make(name);},copy(){if(options.failBackup)throw Error('backup failed');if(copies===0)assert.equal(mutations,0);copies++;backup=structuredClone(tables);return {getUrl:()=> 'https://docs.google.com/spreadsheets/d/backup'};}};
 const builder={requireValueInList(){return this;},requireValueInRange(){return this;},setAllowInvalid(){return this;},setHelpText(){return this;},build(){return {};}};
 const context={SpreadsheetApp:{ProtectionType:{RANGE:'RANGE'},getActiveSpreadsheet:()=>ss,getUi:()=>({alert(msg){assert.equal(held,false);alerts.push(msg);}}),newDataValidation:()=>builder,flush(){}},LockService:{getScriptLock:()=>({tryLock(){if(options.busy)return false;held=true;return true;},releaseLock(){held=false;}})},Utilities:{getUuid:()=>crypto.randomUUID(),computeDigest:(_,text)=>[...crypto.createHash('sha256').update(text).digest()],DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},formatDate:()=> '20261103-100000'}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('code.gs','utf8'),context);vm.runInContext(fs.readFileSync('setup.gs','utf8'),context);
 return {context,tables,alerts,get backup(){return backup;},get copies(){return copies;},get mutations(){return mutations;},get held(){return held;}};
}
const f=fixture();const original=structuredClone(f.tables);f.context.updateSheetStructure_();
assert.deepEqual(f.backup,original);assert.equal(f.copies,1);assert.equal(Object.keys(f.tables).length,7);
assert.deepEqual(f.tables.products[1],[10000,'=1+1']);
assert.deepEqual(f.tables.brands[1],['Abangda','logo']);assert.deepEqual(f.tables.banners[1],['gambar','Promo lama','tujuan']);assert.equal(f.tables.banners[0][1],'keterangan');assert.deepEqual(f.tables.settings[1],original.settings[1]);
assert.deepEqual(f.tables.orders[1],['TA-20261103-001','Sedang Diproses','Budi']);
assert.ok(f.tables.products[0].includes('harga_grosir'));assert.ok(f.tables.products[0].includes('min_beli_grosir'));
assert.ok(!f.tables.orders[0].includes('tracking_token_hash'));assert.ok(!f.tables.orders[0].includes('tracking_token'));
for(const rows of Object.values(f.tables))assert.ok(rows.length<=2,'no sample rows');
const once=structuredClone(f.tables);f.context.updateSheetStructure_();assert.deepEqual(f.tables,once);assert.equal(f.copies,2);assert.match(f.alerts.at(-1),/Kolom ditambahkan: 0/);
for(const option of [{busy:true},{failBackup:true},{tables:{orders:[['status','status']]}},{tables:{products:[['id_produk','nama','brand'],['A','Sama','Brand'],['B','Sama','Brand']]}}]){
 const t=fixture(option),before=structuredClone(t.tables);t.context.updateSheetStructure_();assert.deepEqual(t.tables,before);assert.equal(t.mutations,0);assert.equal(t.held,false);assert.match(t.alerts[0],/belum selesai/);
}
const dual=fixture({tables:{banners:[['id_banner','keterangan','url_gambar','link'],['OLD','Promo baru','img','dest']]}});dual.context.updateSheetStructure_();assert.deepEqual(dual.tables.banners,[['keterangan','url_gambar','link'],['Promo baru','img','dest']]);
for(const productHeader of ['ID Product',' id_products ', 'ID-PRODUK','idproduct']){
 const t=fixture({tables:{products:[[productHeader,' Nama ',' BRAND ','Harga','Catatan Tambahan'],['OLD','Beras','Abangda',10000,'=1+1']],brands:[['ID Brands','Nama_Brand','url_logo'],['BR','Abangda','logo']],banners:[[' ID Banners ','url_gambar'],['Promo','img']]}});
 t.context.setupDatabase_(); // Existing saved menu also uses the safe updater.
 assert.equal(t.copies,1);assert.equal(t.tables.products[0].includes(productHeader),false);assert.deepEqual(t.tables.products[1].slice(0,4),['Beras','Abangda',10000,'=1+1']);assert.match(t.tables.products[1][t.tables.products[0].indexOf('_kunci_produk')],/^P-[a-f0-9]{64}$/);
 assert.ok(t.tables.products[0].includes('nama'));assert.equal(t.tables.brands[0].includes('ID Brands'),false);assert.equal(t.tables.banners[0][0],'keterangan');
 const before=structuredClone(t.tables);t.context.updateSheetStructure_();assert.deepEqual(t.tables,before);
}
const normalizedDuplicate=fixture({tables:{products:[['nama',' Nama '],['Beras','Lain']]}});normalizedDuplicate.context.updateSheetStructure_();assert.equal(normalizedDuplicate.mutations,0);assert.equal(normalizedDuplicate.copies,0);
const failed=fixture({failWrite:true});failed.context.updateSheetStructure_();assert.equal(failed.copies,1);assert.match(failed.alerts[0],/Sebagian perubahan/);assert.match(failed.alerts[0],/https:.*backup/);assert.equal(failed.held,false);
console.log('PASS migration: backup before writes, 7 schemas, preserves rows/formulas/custom columns/settings, removes obsolete IDs/tokens, renames banner header, no samples, idempotent, bounded validations, busy/backup/duplicate/write failure handling.');
