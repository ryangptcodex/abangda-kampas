const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {fixture}=require('./helpers/apps-script.cjs');let passed=0;
function test(name,fn){fn();passed++;console.log('PASS',name);}
function setup(f){vm.runInContext(fs.readFileSync('setup.gs','utf8'),f.context);return f;}
test('failed vouchers do not consume new-order or buyer allowance',()=>{
 const f=fixture(),p=f.payload();p.kode_kupon='SALAH';for(let i=0;i<8;i++){const r=f.context.createOrder(p);assert.equal(r.success,false);assert.match(r.message,/kupon/);}
 p.kode_kupon='';assert.equal(f.context.createOrder(p).success,true);assert.equal(f.tables.orders.length,2);
});
test('one canonical WA source normalizes 08 and rejects duplicate settings',()=>{
 const f=fixture();f.tables.settings[1][1]='081234567890';assert.equal(f.context.getInitialData().settings.no_whatsapp,'6281234567890');
 assert.equal(new URL(f.context.createOrder(f.payload()).waUrl).pathname,'/6281234567890');
 f.tables.settings.push(['no_whatsapp','628999999999']);assert.equal(f.context.getInitialData().success,true);assert.equal(f.context.getInitialData().settings.no_whatsapp,'');assert.equal(f.context.createOrder(f.payload()).success,false);assert.equal(f.tables.orders.length,2);
});
test('random single order references preserve legacy status-only privacy and explain discounts/units',()=>{
 const f=fixture();f.tables.products[0].push('satuan');f.tables.products[1].push('box');const p=f.payload();p.kode_kupon='HEMAT';const r=f.context.createOrder(p);assert.match(r.orderId,/^TA-[A-F0-9]{20}$/);
 const t=f.context.trackOrder(r.orderId);assert.equal(t.order.items[0].satuan,'box');assert.equal(t.order.subtotal,69000);assert.equal(t.order.diskon,6900);assert.equal(t.order.total_harga,62100);
 for(const key of ['no_whatsapp','nama_pemesan','alamat','checkout_summary','request_id'])assert.equal(Object.hasOwn(t.order,key),false);
 f.tables.orders.push(['TA-20261103-001','3/11/2026','Nama','081234567890','Alamat','Catatan','Delivery','[]',999,'Selesai']);const old=f.context.trackOrder('TA-20261103-001');assert.equal(old.success,true);assert.equal(old.order.legacy,true);assert.equal(Object.hasOwn(old.order,'items'),false);assert.equal(Object.hasOwn(old.order,'total_harga'),false);
});
test('cancellation refunds once, preserves original totals and forbids reopening financial agreement',()=>{
 const f=fixture(),p=f.payload();p.kode_kupon='HEMAT';const r=f.context.createOrder(p);assert.equal(f.tables.coupons[1][4],1);
 f.context.recordOrderAgreement_(r.orderId,10000,'Lunas');let t=f.context.trackOrder(r.orderId);assert.equal(t.order.total_final,72100);assert.equal(t.order.ongkir,10000);assert.equal(t.order.total_harga,62100);assert.equal(t.order.status_pembayaran,'Lunas');
 f.context.cancelOrderById_(r.orderId);assert.equal(f.tables.coupons[1][4],2);f.context.cancelOrderById_(r.orderId);assert.equal(f.tables.coupons[1][4],2);
 assert.throws(()=>f.context.recordOrderAgreement_(r.orderId,0,'Belum Bayar'),/batal/);assert.equal(f.context.createOrder(p).success,false);
 const recovery=f.context.recoverCheckout(p.request_id);assert.equal(recovery.success,false);assert.equal(recovery.existingOrderId,r.orderId);
});
test('refund journal recovers a write committed before error without a second refund',()=>{
 const f=fixture(),p=f.payload();p.kode_kupon='HEMAT';const r=f.context.createOrder(p),original=f.sheets.coupons.getRange;let fail=true;
 f.sheets.coupons.getRange=(...args)=>{const range=original(...args),set=range.setValue;range.setValue=v=>{set(v);if(fail){fail=false;throw Error('committed but response lost');}};return range;};
 assert.throws(()=>f.context.cancelOrderById_(r.orderId),/lost/);assert.equal(f.tables.coupons[1][4],2);assert.ok(f.context.PropertiesService.getScriptProperties().getProperty('ABANGDA_REFUND_V1'));
 f.context.cancelOrderById_(r.orderId);assert.equal(f.tables.coupons[1][4],2);assert.equal(f.context.PropertiesService.getScriptProperties().getProperty('ABANGDA_REFUND_V1'),null);
});
test('agreement journal hides partial final values and recovers idempotently',()=>{
 const f=fixture(),r=f.context.createOrder(f.payload()),original=f.sheets.orders.getRange;let fail=true;
 f.sheets.orders.getRange=(...args)=>{const range=original(...args),set=range.setValue;range.setValue=v=>{set(v);if(fail&&args[1]===f.tables.orders[0].indexOf('ongkir')+1){fail=false;throw Error('shipping write response lost');}};return range;};
 assert.throws(()=>f.context.recordOrderAgreement_(r.orderId,5000,'Lunas'),/lost/);assert.equal(f.context.trackOrder(r.orderId).order.total_final,null);
 f.context.recoverPendingOperations_();const t=f.context.trackOrder(r.orderId);assert.equal(t.order.total_final,74000);assert.equal(t.order.status_pembayaran,'Lunas');assert.equal(f.context.PropertiesService.getScriptProperties().getProperty('ABANGDA_AGREEMENT_V1'),null);
});
test('receipt proof resumes original WhatsApp without writing or exposing by public ID',()=>{
 const f=fixture(),p=f.payload();p.kode_kupon='HEMAT';const r=f.context.createOrder(p);f.tables.coupons[1][5]='NONAKTIF';
 const res=f.context.recoverCheckout(p.request_id);assert.equal(res.found,true);assert.deepEqual(res.result,r);assert.equal(f.tables.orders.length,2);assert.equal(f.tables.coupons[1][4],1);
 assert.equal(f.context.recoverCheckout('a'.repeat(64)).found,false);assert.equal(f.context.recoverCheckout(r.orderId).success,false);
});
test('catalog and tracking do not wait on transaction lock; order lookups do not scan full archives',()=>{
 const busy=fixture({busy:true});assert.equal(busy.context.getInitialData().success,true);assert.equal(busy.context.getProducts('','ALL','ALL',1,6).success,true);assert.equal(busy.attempts(),0);
 const f=fixture();f.sheets.orders.getDataRange=()=>{throw Error('full archive read forbidden');};const p=f.payload(),r=f.context.createOrder(p);assert.equal(r.success,true);assert.equal(f.context.trackOrder(r.orderId).success,true);assert.deepEqual(f.context.createOrder(p),r);
});
test('hidden system product keys preserve active carts through rename and full-row reorder',()=>{
 const f=setup(fixture()),old=f.context.getInitialData().featuredProducts[0].id_produk;f.tables.products[0].push('_kunci_produk');f.context.initializeProductKeys_({getSheetByName:()=>f.sheets.products});
 assert.equal(f.tables.products[1].at(-1),old);f.tables.products[1][1]='Beras Nama Baru';f.tables.products[1][3]='Brand Baru';
 assert.equal(f.context.getProductById(old).product.nama,'Beras Nama Baru');assert.equal(f.context.getCartSnapshot([{id:old,qty:2}]).items[0].id,old);
 const p=f.payload();p.items=[{id:old,qty:2}];assert.equal(f.context.createOrder(p).success,true);
 const other=[...f.tables.products[1]];other[1]='Produk Lain';f.tables.products.push(other);f.context.initializeProductKeys_({getSheetByName:()=>f.sheets.products},{getRow:()=>3,getNumRows:()=>1});assert.notEqual(f.tables.products[2].at(-1),old);
 f.tables.products.splice(1,0,f.tables.products.pop());assert.equal(f.context.getProductById(old).product.nama,'Beras Nama Baru');
});
test('all-sheet diagnostics catch relational, duplicate-key, unit and malformed-data problems',()=>{
 const f=setup(fixture());f.tables.settings.push(['no_whatsapp','628999999999']);f.tables.coupons.push([...f.tables.coupons[1]]);
 const report=f.context.inspectAllData_();assert.ok(report.some(i=>i.sheet==='settings'&&/ganda/.test(i.message)));assert.ok(report.some(i=>i.sheet==='coupons'&&/ganda/.test(i.message)));assert.ok(report.some(i=>i.sheet==='products'&&/Kategori/.test(i.message)));assert.ok(report.some(i=>i.sheet==='brands'));
});
test('manual status dropdown cancellation refunds once and refuses reactivation',()=>{
 const f=setup(fixture()),p=f.payload();p.kode_kupon='HEMAT';const r=f.context.createOrder(p),index=f.tables.orders[0].indexOf('status');
 const range={getSheet:()=>f.sheets.orders,getRow:()=>2,getColumn:()=>index+1,getNumRows:()=>1,getNumColumns:()=>1};
 f.tables.orders[1][index]='Pesanan Dibatalkan';f.context.onEdit({range,source:{toast(){}},oldValue:'Menunggu Konfirmasi Stok'});assert.equal(f.tables.coupons[1][4],2);
 f.tables.orders[1][index]='Sedang Diproses';f.context.onEdit({range,source:{toast(){}},oldValue:'Pesanan Dibatalkan'});assert.equal(f.tables.orders[1][index],'Pesanan Dibatalkan');assert.equal(f.tables.coupons[1][4],2);
});
test('money refund confirmation is a private manual record, never a transfer or second coupon credit',()=>{
 const f=fixture(),p=f.payload();p.kode_kupon='HEMAT';const r=f.context.createOrder(p);f.context.recordOrderAgreement_(r.orderId,0,'Lunas');f.context.cancelOrderById_(r.orderId);assert.equal(f.context.trackOrder(r.orderId).order.status_pembayaran,'Perlu Pengembalian');
 f.context.markMoneyReturned_(r.orderId);f.context.markMoneyReturned_(r.orderId);assert.equal(f.context.trackOrder(r.orderId).order.status_pembayaran,'Dikembalikan');assert.equal(f.tables.coupons[1][4],2);
});
test('duplicate coupon codes are rejected by both preview and checkout without spending buyer quota',()=>{
 const f=fixture();f.tables.coupons.push([...f.tables.coupons[1]]);assert.equal(f.context.validateCoupon('HEMAT',69000).success,false);const p=f.payload();p.kode_kupon='HEMAT';assert.equal(f.context.createOrder(p).success,false);assert.equal(f.tables.coupons[1][4],2);assert.equal(f.tables.orders.length,1);
});
test('checkout journal recovers a hard interruption between quota debit and row append',()=>{
 const f=fixture(),p=f.payload();const props=f.context.PropertiesService.getScriptProperties();
 props.setProperty('ABANGDA_CHECKOUT_V1',JSON.stringify({requestId:'a'.repeat(64),requestHash:'hash',orderId:'TA-'+ 'A'.repeat(20),code:'HEMAT',before:2,after:1}));f.tables.orders[0].push('request_id');f.tables.coupons[1][4]=1;
 f.context.recoverPendingOperations_();assert.equal(f.tables.coupons[1][4],2);assert.equal(props.getProperty('ABANGDA_CHECKOUT_V1'),null);assert.equal(f.context.createOrder(p).success,true);
});

test('invalid store contact cannot hide catalog or create orders',()=>{const f=fixture();f.tables.settings[1][1]='tidak valid';const r=f.context.getInitialData();assert.equal(r.success,true);assert.ok(r.featuredProducts.length);assert.equal(r.settings.contactUnavailable,true);assert.equal(r.settings.no_whatsapp,'');assert.equal(f.context.createOrder(f.payload()).success,false);assert.equal(f.tables.orders.length,1);});

test('instant WhatsApp ID matches committed order, retries replay and forged price is ignored',()=>{
 const f=fixture(),p=f.payload();p.instant_whatsapp=true;p.items[0].harga=1;
 const r=f.context.createOrder(p);assert.equal(r.success,true);assert.equal(r.orderId,'TA-'+p.request_id.slice(0,20).toUpperCase());assert.equal(r.summary.total_harga,69000);
 const retry=f.context.createOrder(p);assert.equal(retry.orderId,r.orderId);assert.equal(f.tables.orders.length,2);
});
console.log(passed+' launch-readiness checks passed.');
