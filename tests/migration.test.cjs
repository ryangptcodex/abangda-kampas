const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function fixture(options={}){
 const tables=structuredClone(options.tables||{products:[['harga','id_produk','catatan_sendiri'],[10000,'P1','=1+1']],orders:[['tracking_token','id_pesanan','tracking_token_hash','status','nama_pemesan'],['secret','TA-20261103-001','hash','Sedang Diproses','Budi']],settings:[['nilai','kunci','custom'],['628111','no_whatsapp','simpan']]});
 let held=false,copies=0,backup,mutations=0;const alerts=[];const sheets={};
 const make=(name)=>{const rows=tables[name];let maxColumns=Math.max(1,...rows.map(r=>r.length));return {
  getLastColumn:()=>Math.max(0,...rows.map(r=>r.length)),getMaxColumns:()=>maxColumns,getMaxRows:()=>5,
  insertColumnAfter(){maxColumns++;mutations++;},setFrozenRows(){},
  deleteColumns(col,n){rows.forEach(r=>r.splice(col-1,n));maxColumns-=n;mutations++;},
  getRange(row,col,nr=1,nc=1){assert.ok(row+nr-1<=5,'no out of bounds validations');return {
   getDisplayValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>String(rows[row-1+i]?.[col-1+j]??''))),
   setValue(v){if(options.failWrite)throw Error('write failed');while(rows.length<row)rows.push([]);rows[row-1][col-1]=v;mutations++;},
   setFontWeight(){},setBackground(){},setFontColor(){},setDataValidation(){}
  };}
 };};Object.keys(tables).forEach(name=>sheets[name]=make(name));
 const ss={getName:()=> 'Toko',getSheetByName:name=>sheets[name]||null,insertSheet(name){tables[name]=[];mutations++;return sheets[name]=make(name);},copy(){if(options.failBackup)throw Error('backup failed');if(copies===0)assert.equal(mutations,0);copies++;backup=structuredClone(tables);return {getUrl:()=> 'https://docs.google.com/spreadsheets/d/backup'};}};
 const builder={requireValueInList(){return this;},requireValueInRange(){return this;},setAllowInvalid(){return this;},setHelpText(){return this;},build(){return {};}};
 const context={SpreadsheetApp:{getActiveSpreadsheet:()=>ss,getUi:()=>({alert(msg){assert.equal(held,false);alerts.push(msg);}}),newDataValidation:()=>builder,flush(){}},LockService:{getScriptLock:()=>({tryLock(){if(options.busy)return false;held=true;return true;},releaseLock(){held=false;}})},Utilities:{formatDate:()=> '20261103-100000'}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('setup.gs','utf8'),context);
 return {context,tables,alerts,get backup(){return backup;},get copies(){return copies;},get mutations(){return mutations;},get held(){return held;}};
}
const f=fixture();const original=structuredClone(f.tables);f.context.updateSheetStructure_();
assert.deepEqual(f.backup,original);assert.equal(f.copies,1);assert.equal(Object.keys(f.tables).length,7);
assert.deepEqual(f.tables.products[1],[10000,'P1','=1+1']);assert.deepEqual(f.tables.settings[1],original.settings[1]);
assert.deepEqual(f.tables.orders[1],['TA-20261103-001','Sedang Diproses','Budi']);
assert.ok(f.tables.products[0].includes('harga_grosir'));assert.ok(f.tables.products[0].includes('min_beli_grosir'));
assert.ok(!f.tables.orders[0].includes('tracking_token_hash'));assert.ok(!f.tables.orders[0].includes('tracking_token'));
for(const rows of Object.values(f.tables))assert.ok(rows.length<=2,'no sample rows');
const once=structuredClone(f.tables);f.context.updateSheetStructure_();assert.deepEqual(f.tables,once);assert.equal(f.copies,2);assert.match(f.alerts.at(-1),/Kolom ditambahkan: 0/);
for(const option of [{busy:true},{failBackup:true},{tables:{orders:[['status','status']]}}]){
 const t=fixture(option),before=structuredClone(t.tables);t.context.updateSheetStructure_();assert.deepEqual(t.tables,before);assert.equal(t.mutations,0);assert.equal(t.held,false);assert.match(t.alerts[0],/belum selesai/);
}
const failed=fixture({failWrite:true});failed.context.updateSheetStructure_();assert.equal(failed.copies,1);assert.match(failed.alerts[0],/Sebagian perubahan/);assert.match(failed.alerts[0],/https:.*backup/);assert.equal(failed.held,false);
console.log('PASS migration: backup before writes, 7 schemas, preserves rows/formulas/custom columns/settings, removes only legacy tokens, no samples, idempotent, bounded validations, busy/backup/duplicate/write failure handling.');
