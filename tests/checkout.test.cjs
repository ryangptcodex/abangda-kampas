const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { fixture } = require('./helpers/apps-script.cjs');
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS',name);}
function rejected(f,payload,pattern) {
 const result=f.context.createOrder(payload);
 assert.equal(result.success,false);
 assert.match(result.message,pattern);
 assert.equal(f.tables.orders.length,1);
 assert.equal(f.tables.coupons[1][4],2);
 assert.equal(f.releases(),1);
}
test('server ignores forged item prices, names, total and discount',()=>{
 const f=fixture(),r=f.context.createOrder(f.payload());
 assert.equal(r.success,true);assert.equal(r.summary.total_harga,69000);assert.equal(r.summary.diskon,0);
 assert.equal(r.summary.items[0].nama,'Beras');assert.equal(r.summary.items[0].harga,34500);
 assert.equal(f.tables.orders[1][8],69000);assert.equal(f.attempts(),1);assert.equal(f.releases(),1);
 assert.equal(f.tables.products[1][6],10); // stock confirmation remains manual
 const url=new URL(r.waUrl);assert.equal(url.hostname,'wa.me');assert.match(url.searchParams.get('text'),/69\.000/);
});
test('coupon is revalidated and recalculated against current server subtotal',()=>{
 const f=fixture(),p=f.payload();p.kode_kupon='hemat';p.diskon=99999;
 const r=f.context.createOrder(p);assert.equal(r.success,true);assert.equal(r.summary.diskon,6900);assert.equal(r.summary.total_harga,62100);assert.equal(f.tables.coupons[1][4],1);
});
test('inactive coupon is rejected at checkout',()=>{const f=fixture();f.tables.coupons[1][5]='NONAKTIF';const p=f.payload();p.kode_kupon='HEMAT';rejected(f,p,/tidak aktif/);});
test('exhausted coupon is rejected at checkout',()=>{const f=fixture();f.tables.coupons[1][4]=0;const p=f.payload();p.kode_kupon='HEMAT';const r=f.context.createOrder(p);assert.equal(r.success,false);assert.match(r.message,/habis/);assert.equal(f.tables.orders.length,1);assert.equal(f.tables.coupons[1][4],0);});
test('coupon minimum is enforced using actual prices',()=>{const f=fixture();f.tables.coupons[1][3]=100000;const p=f.payload();p.kode_kupon='HEMAT';rejected(f,p,/Minimal belanja/);});
test('percentage above 100 is rejected',()=>{const f=fixture();f.tables.coupons[1][2]=150;const p=f.payload();p.kode_kupon='HEMAT';rejected(f,p,/nilai kupon/);});
for(const qty of [0,-1,1.5,'abc',null,true,Infinity]){
 test('invalid quantity rejected: '+String(qty),()=>{const f=fixture(),p=f.payload();p.items[0].qty=qty;rejected(f,p,/Jumlah|jumlah/);});
}
test('duplicate product quantities are aggregated with no inventory cap',()=>{const f=fixture(),p=f.payload();p.items=[{id:'P1',qty:6},{id:'P1',qty:5}];const r=f.context.createOrder(p);assert.equal(r.success,true);assert.equal(r.summary.items[0].qty,11);});
test('valid duplicate product lines are aggregated once',()=>{const f=fixture(),p=f.payload();p.items=[{id:'P1',qty:2},{id:'P1',qty:3}];const r=f.context.createOrder(p);assert.equal(r.success,true);assert.equal(r.summary.items.length,1);assert.equal(r.summary.items[0].qty,5);});
test('legacy stock values never block manual-confirmation orders',()=>{for(const stock of [0,1,-1,'not used']){const f=fixture();f.tables.products[1][6]=stock;const r=f.context.createOrder(f.payload());assert.equal(r.success,true);assert.equal(r.summary.items[0].qty,2);}});
test('missing product rejected',()=>{const f=fixture(),p=f.payload();p.items[0].id='MISSING';rejected(f,p,/tidak ditemukan/);});
test('invalid stored price rejected rather than silently charging zero',()=>{const f=fixture();f.tables.products[1][4]='Rp 34.500';rejected(f,f.payload(),/Harga/);});
test('duplicate IDs in product database rejected',()=>{const f=fixture();f.tables.products.push([...f.tables.products[1]]);rejected(f,f.payload(),/duplikat/);});
test('invalid delivery mode rejected',()=>{const f=fixture(),p=f.payload();p.tipe_pengiriman='Unknown';rejected(f,p,/Metode/);});
test('delivery address required',()=>{const f=fixture(),p=f.payload();p.alamat='';rejected(f,p,/Alamat/);});
test('empty cart rejected',()=>{const f=fixture(),p=f.payload();p.items=[];rejected(f,p,/Keranjang/);});
test('takeaway does not require or store delivery address',()=>{const f=fixture(),p=f.payload();p.tipe_pengiriman='Takeaway';p.alamat='';const r=f.context.createOrder(p);assert.equal(r.success,true);assert.equal(r.summary.alamat,'');});
test('unavailable lock returns retry message without mutating orders or coupons',()=>{const f=fixture({busy:true});const r=f.context.createOrder(f.payload());assert.equal(r.success,false);assert.match(r.message,/coba lagi/);assert.equal(f.tables.orders.length,1);assert.equal(f.releases(),0);});
test('serialized calls use distinct order IDs and coupon cannot be used after quota exhausted',()=>{const f=fixture(),p=f.payload();p.kode_kupon='HEMAT';const a=f.context.createOrder(p),b=f.context.createOrder(p),c=f.context.createOrder(p);assert.equal(a.success,true);assert.equal(b.success,true);assert.notEqual(a.orderId,b.orderId);assert.equal(c.success,false);assert.equal(f.tables.orders.length,3);assert.equal(f.tables.coupons[1][4],0);assert.equal(f.releases(),3);});
test('coupon quota restored when append fails',()=>{const f=fixture({failAppend:true}),p=f.payload();p.kode_kupon='HEMAT';rejected(f,p,/Gagal menulis/);});
test('order columns map by header even when reordered',()=>{const f=fixture();f.tables.orders[0].reverse();const r=f.context.createOrder(f.payload());assert.equal(r.success,true);assert.equal(f.tables.orders[1][f.tables.orders[0].indexOf('id_pesanan')],r.orderId);});
test('customer text is not interpreted as a sheet formula',()=>{const f=fixture(),p=f.payload();p.nama_pemesan='=1+1';const r=f.context.createOrder(p);assert.equal(r.success,true);assert.equal(f.tables.orders[1][2],"'=1+1");});
test('formatted currency in Sheets does not alter displayed product price',()=>{const f=fixture();const p=f.context.getProducts('','ALL','ALL',1,6);assert.equal(p.success,true);assert.equal(p.data[0].harga,34500);const detail=f.context.getProductById('P1');assert.equal(detail.product.harga,34500);const initial=f.context.getInitialData();assert.equal(initial.success,true);assert.equal(initial.featuredProducts[0].harga,34500);});


test('new orders track with ID alone without creating a token or hash column',()=>{
 const f=fixture(),o=f.context.createOrder(f.payload());assert.equal(o.success,true);
 assert.equal(Object.hasOwn(o,'trackingToken'),false);assert.equal(f.tables.orders[0].includes('tracking_token_hash'),false);
 const r=f.context.trackOrder(' '+o.orderId.toLowerCase()+' ');assert.equal(r.success,true);
 assert.equal(r.order.total_harga,69000);assert.equal(r.order.items[0].nama,'Beras');
 for(const key of ['nama_pemesan','no_whatsapp','alamat','catatan','tracking_token_hash','trackingToken'])assert.equal(Object.hasOwn(r.order,key),false);
 assert.doesNotMatch(new URL(o.waUrl).searchParams.get('text'),/kode pelacakan/i);
});
test('invalid and unknown IDs fail without returning order data',()=>{
 const f=fixture();f.context.createOrder(f.payload());
 for(const id of ['', 'bad', 'TA-20990101-999']){const r=f.context.trackOrder(id);assert.equal(r.success,false);assert.equal(Object.hasOwn(r,'order'),false);}
});
test('legacy orders with or without a hash track without modifying stored data',()=>{
 for(const hash of [false,true]){
 const f=fixture();if(hash)f.tables.orders[0].push('tracking_token_hash');
 f.tables.orders.push(['TA-20261020-001','20/10/2026','Nama pribadi','081234567890','Alamat pribadi','Catatan','Delivery','[]',10000,'Selesai',...(hash?['oldhash']:[])]);
 const before=JSON.stringify(f.tables);assert.equal(f.context.trackOrder('TA-20261020-001').success,true);assert.equal(JSON.stringify(f.tables),before);
 const o=f.context.createOrder(f.payload());assert.equal(o.success,true);assert.equal(f.tables.orders[1][2],'Nama pribadi');
 }
});
test('tracking maps reordered columns and hides backend exceptions',()=>{
 const f=fixture();f.tables.orders[0].reverse();const o=f.context.createOrder(f.payload());
 const r=f.context.trackOrder(o.orderId);assert.equal(r.success,true);assert.equal(r.order.total_harga,69000);
 f.sheets.orders.getDataRange=()=>{throw Error('PRIVATE BACKEND DETAILS');};
 const failure=f.context.trackOrder(o.orderId);assert.equal(failure.success,false);assert.equal(JSON.stringify(failure).includes('PRIVATE BACKEND DETAILS'),false);
});
test('cart snapshot returns current catalog fields and ignores saved display data',()=>{
 const f=fixture();f.tables.products[1][4]=40000;
 const before=JSON.stringify(f.tables);
 const r=f.context.getCartSnapshot([{id:'P1',qty:2,harga:1,nama:'Forged',maxStock:9999}]);
 assert.equal(r.success,true);assert.equal(r.items[0].harga,40000);assert.equal(r.items[0].nama,'Beras');assert.equal(Object.hasOwn(r.items[0],'maxStock'),false);
 assert.equal(JSON.stringify(f.tables),before);assert.equal(f.attempts(),0);
});
test('cart snapshot preserves quantities irrespective of legacy stock',()=>{
 const f=fixture();f.tables.products[1][6]=3;
 const r=f.context.getCartSnapshot([{id:'P1',qty:2},{id:'P1',qty:4}]);
 assert.equal(r.success,true);assert.equal(r.items.length,1);assert.equal(r.items[0].qty,6);assert.equal(r.adjustments.length,0);
});
test('cart snapshot drops only removed products and keeps zero-inventory products',()=>{
 const f=fixture();f.tables.products[1][6]=0;
 const r=f.context.getCartSnapshot([{id:'P1',qty:2},{id:'REMOVED',qty:1}]);
 assert.equal(r.success,true);assert.equal(r.items.length,1);assert.equal(r.items[0].qty,2);assert.equal(r.adjustments.length,1);assert.equal(r.adjustments[0].reason,'removed');
});
test('cart snapshot validates saved structure and quantity types',()=>{
 const f=fixture();
 for(const input of [null,{},Array.from({length:101},()=>({id:'P1',qty:1})),[{id:'',qty:1}],[{id:'a'.repeat(129),qty:1}],[{id:'P1',qty:0}],[{id:'P1',qty:-1}],[{id:'P1',qty:1.5}],[{id:'P1',qty:'2'}],[{id:'P1',qty:true}],[{id:'P1',qty:Number.MAX_SAFE_INTEGER},{id:'P1',qty:1}]]) {
  assert.equal(f.context.getCartSnapshot(input).success,false);
 }
 assert.equal(f.context.getCartSnapshot([]).success,true);
});
test('cart snapshot fails rather than replacing a cart with misleading catalog data',()=>{
 const f=fixture();f.tables.products[1][4]='Rp 34.500';assert.equal(f.context.getCartSnapshot([{id:'P1',qty:1}]).success,false);
 f.tables.products[1][4]=34500;f.tables.products.push([...f.tables.products[1]]);assert.equal(f.context.getCartSnapshot([{id:'P1',qty:1}]).success,false);
});


test('wholesale applies to all units exactly at the minimum and reverts below it',()=>{
 const f=fixture();f.tables.products[1][9]=30000;f.tables.products[1][10]=3;
 for(const [qty,price] of [[2,34500],[3,30000],[4,30000],[1,34500]]) {
  const p=f.payload();p.items=[{id:'P1',qty:qty,harga:1,harga_grosir:1,min_beli_grosir:1}];
  const r=f.context.createOrder(p);assert.equal(r.success,true);assert.equal(r.summary.items[0].harga,price);assert.equal(r.summary.total_harga,price*qty);
  assert.match(new URL(r.waUrl).searchParams.get('text'),new RegExp((price*qty).toLocaleString('id-ID').replaceAll('.', '\\.')));
 }
});
test('wholesale threshold uses aggregated quantities for the same SKU only',()=>{
 const f=fixture();f.tables.products[1][9]=30000;f.tables.products[1][10]=3;
 const other=[...f.tables.products[1]];other[0]='P2';f.tables.products.push(other);
 const p=f.payload();p.items=[{id:'P1',qty:1},{id:'P1',qty:2},{id:'P2',qty:1}];
 const r=f.context.createOrder(p);assert.equal(r.success,true);assert.equal(r.summary.items[0].harga,30000);assert.equal(r.summary.items[1].harga,34500);assert.equal(r.summary.total_harga,124500);
});
test('coupons use wholesale subtotal as their base',()=>{
 const f=fixture();f.tables.products[1][9]=30000;f.tables.products[1][10]=2;
 const p=f.payload();p.kode_kupon='HEMAT';const r=f.context.createOrder(p);
 assert.equal(r.success,true);assert.equal(r.summary.subtotal,60000);assert.equal(r.summary.diskon,6000);assert.equal(r.summary.total_harga,54000);
 f.tables.coupons[1][3]=65000;assert.equal(f.context.createOrder(p).success,false);
});
test('wholesale metadata is consistent across initial catalog, search, detail and saved cart',()=>{
 const f=fixture();f.tables.products[1][9]=30000;f.tables.products[1][10]=3;
 const products=[f.context.getInitialData().featuredProducts[0],f.context.getProducts('','ALL','ALL',1,6).data[0],f.context.getProductById('P1').product];
 for(const p of products){assert.equal(p.harga,34500);assert.equal(p.harga_grosir,30000);assert.equal(p.min_beli_grosir,3);assert.equal(Object.hasOwn(p,'stok'),false);}
 const cart=f.context.getCartSnapshot([{id:'P1',qty:3}]);assert.equal(cart.items[0].harga,30000);assert.equal(cart.items[0].harga_normal,34500);assert.equal(cart.items[0].qty,3);
});
test('absent wholesale and stock columns remain compatible with existing products',()=>{
 const f=fixture();f.tables.products[0]=f.tables.products[0].slice(0,9);f.tables.products[1]=f.tables.products[1].slice(0,9);
 f.tables.products[0].splice(6,1);f.tables.products[1].splice(6,1);
 const r=f.context.createOrder(f.payload());assert.equal(r.success,true);assert.equal(r.summary.total_harga,69000);
 const original=f.tables.products[1].slice();const initial=f.context.getInitialData();assert.equal(initial.success,true);
 assert.ok(f.tables.products[0].includes('harga_grosir'));assert.ok(f.tables.products[0].includes('min_beli_grosir'));assert.deepEqual(f.tables.products[1],original);
 const len=f.tables.products[0].length;f.context.getInitialData();assert.equal(f.tables.products[0].length,len);
});
test('incomplete or invalid wholesale configuration is rejected without writing an order',()=>{
 for(const pair of [[30000,''],['',3],[40000,3],[-1,3],[30000,1.5],[30000,0],['Rp30.000',3]]) {
  const f=fixture();f.tables.products[1][9]=pair[0];f.tables.products[1][10]=pair[1];rejected(f,f.payload(),/grosir|Grosir/);
 }
});


test('product seeding maps by actual headers without restoring an inventory dependency',()=>{
 const f=fixture();vm.runInContext(fs.readFileSync(path.join(__dirname,'..','setup.gs'),'utf8'),f.context);
 const headers=['nama','harga_grosir','id_produk','url_foto','min_beli_grosir','harga','is_unggulan','deskripsi','brand','id_kategori','stok'];
 f.tables.products.splice(0,f.tables.products.length,headers);
 f.context.seedProductsIfEmpty(f.sheets.products);
 assert.equal(f.tables.products.length,6);
 const row=f.tables.products[1];assert.equal(row[headers.indexOf('id_produk')],'PRD-001');assert.equal(row[headers.indexOf('harga')],34500);
 assert.equal(row[headers.indexOf('stok')],'');assert.equal(row[headers.indexOf('harga_grosir')],'');assert.match(row[headers.indexOf('url_foto')],/^https:/);
 const before=JSON.stringify(f.tables.products);f.context.seedProductsIfEmpty(f.sheets.products);assert.equal(JSON.stringify(f.tables.products),before);
});
console.log(`${passed} checkout, tracking, cart and wholesale checks passed.`);
