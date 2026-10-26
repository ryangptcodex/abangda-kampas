const assert = require('node:assert/strict');
const crypto = require('node:crypto');
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
test('duplicate product lines are aggregated before checking current stock',()=>{const f=fixture(),p=f.payload();p.items=[{id:'P1',qty:6},{id:'P1',qty:5}];rejected(f,p,/Stok/);});
test('valid duplicate product lines are aggregated once',()=>{const f=fixture(),p=f.payload();p.items=[{id:'P1',qty:2},{id:'P1',qty:3}];const r=f.context.createOrder(p);assert.equal(r.success,true);assert.equal(r.summary.items.length,1);assert.equal(r.summary.items[0].qty,5);});
test('changed stock is checked again at submission',()=>{const f=fixture();f.tables.products[1][6]=1;rejected(f,f.payload(),/Stok/);});
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


test('new orders return independent random tokens but store only SHA-256 hashes',()=>{
 const f=fixture();const a=f.context.createOrder(f.payload()),b=f.context.createOrder(f.payload());
 assert.match(a.trackingToken,/^[a-f0-9]{64}$/);assert.notEqual(a.trackingToken,b.trackingToken);
 const col=f.tables.orders[0].indexOf('tracking_token_hash');assert.equal(col,10);
 const digest=crypto.createHash('sha256').update(a.trackingToken).digest('hex');
 assert.equal(f.tables.orders[1][col],digest);assert.notEqual(digest,a.trackingToken);
 assert.equal(JSON.stringify(f.tables).includes(a.trackingToken),false);
 const message=new URL(a.waUrl).searchParams.get('text');assert.match(message,new RegExp(a.trackingToken));
});
test('valid token authorizes status and canonical total without returning contact details or token',()=>{
 const f=fixture(),order=f.context.createOrder(f.payload());
 const r=f.context.trackOrder(order.orderId,order.trackingToken);assert.equal(r.success,true);
 assert.equal(r.order.total_harga,69000);assert.equal(r.order.items[0].nama,'Beras');
 for(const key of ['nama_pemesan','no_whatsapp','alamat','catatan','tracking_token_hash','trackingToken']) assert.equal(Object.hasOwn(r.order,key),false);
 assert.equal(JSON.stringify(r).includes(order.trackingToken),false);
});
test('ID alone, wrong code, unknown order and missing code return identical generic denial',()=>{
 const f=fixture(),o=f.context.createOrder(f.payload());
 const denied=f.context.trackOrder(o.orderId);
 for(const args of [[o.orderId,'a'.repeat(64)],['TA-20990101-999',o.trackingToken],[o.orderId,'short'],['',o.trackingToken]]) {
  const r=f.context.trackOrder(...args);assert.equal(JSON.stringify(r),JSON.stringify(denied));assert.equal(Object.hasOwn(r,'order'),false);
 }
});
test('a different valid order token cannot unlock another order',()=>{
 const f=fixture(),a=f.context.createOrder(f.payload()),b=f.context.createOrder(f.payload());
 assert.equal(f.context.trackOrder(a.orderId,b.trackingToken).success,false);
 assert.equal(f.context.trackOrder(b.orderId,a.trackingToken).success,false);
});
test('copied credentials tolerate whitespace and uppercase without changing authentication',()=>{
 const f=fixture(),o=f.context.createOrder(f.payload());
 assert.equal(f.context.trackOrder(' '+o.orderId.toLowerCase()+' ', ' '+o.trackingToken.toUpperCase()+' ').success,true);
});
test('legacy rows without a hash never fall back to ID-only tracking',()=>{
 const f=fixture();f.tables.orders.push(['TA-20261020-001','20/10/2026','Nama pribadi','081234567890','Alamat pribadi','Catatan','Delivery','[]',10000,'Selesai']);
 const r=f.context.trackOrder('TA-20261020-001','a'.repeat(64));assert.equal(r.success,false);assert.equal(Object.hasOwn(r,'order'),false);
 const o=f.context.createOrder(f.payload());assert.equal(f.tables.orders[0].filter(x=>x==='tracking_token_hash').length,1);
 assert.equal(f.context.trackOrder('TA-20261020-001',o.trackingToken).success,false);
 assert.equal(f.tables.orders[1][2],'Nama pribadi');assert.equal(f.tables.orders.length,3);
});
test('tracking remains correct if order columns are reordered',()=>{
 const f=fixture();f.tables.orders[0].reverse();const o=f.context.createOrder(f.payload());
 const r=f.context.trackOrder(o.orderId,o.trackingToken);assert.equal(r.success,true);assert.equal(r.order.id_pesanan,o.orderId);assert.equal(r.order.total_harga,69000);
});
test('backend tracking errors do not expose infrastructure exceptions or personal data',()=>{
 const f=fixture(),o=f.context.createOrder(f.payload());f.sheets.orders.getDataRange=()=>{throw Error('PRIVATE BACKEND DETAILS');};
 const r=f.context.trackOrder(o.orderId,o.trackingToken);assert.equal(r.success,false);assert.equal(JSON.stringify(r).includes('PRIVATE BACKEND DETAILS'),false);
});
test('admin menu issues a legacy code, stores only its hash and preserves existing order fields',()=>{
 const f=fixture();f.tables.orders.push(['TA-20261020-001','20/10/2026','Nama','081234567890','Alamat','Catatan','Delivery','[]',10000,'Selesai']);
 const before=[...f.tables.orders[1]];f.context.issueTrackingCodeForSelectedOrder_();
 const token=f.alerts.at(-1)[1].match(/Kode: ([a-f0-9]{64})/)[1];
 assert.deepEqual(f.tables.orders[1].slice(0,10),before);assert.equal(f.context.trackOrder('TA-20261020-001',token).success,true);
 assert.equal(JSON.stringify(f.tables).includes(token),false);assert.equal(f.releases(),1);
});
test('admin rotation invalidates an old token while keeping the order intact',()=>{
 const f=fixture(),o=f.context.createOrder(f.payload());const row=f.tables.orders[1].slice(0,10);
 f.context.issueTrackingCodeForSelectedOrder_();const token=f.alerts.at(-1)[1].match(/Kode: ([a-f0-9]{64})/)[1];
 assert.equal(f.context.trackOrder(o.orderId,o.trackingToken).success,false);
 assert.equal(f.context.trackOrder(o.orderId,token).success,true);assert.deepEqual(f.tables.orders[1].slice(0,10),row);
});
test('cancelling admin rotation leaves the current code active',()=>{
 const f=fixture({confirm:'NO'}),o=f.context.createOrder(f.payload());const before=f.tables.orders[1].slice();
 f.context.issueTrackingCodeForSelectedOrder_();assert.deepEqual(f.tables.orders[1],before);assert.equal(f.context.trackOrder(o.orderId,o.trackingToken).success,true);assert.equal(f.releases(),1);
});
test('admin action rejects a changed selected row before writing',()=>{
 const f=fixture({onConfirm:tables=>{tables.orders[1][0]='TA-20261020-999';}}),o=f.context.createOrder(f.payload());
 const hash=f.tables.orders[1][10];f.context.issueTrackingCodeForSelectedOrder_();assert.equal(f.tables.orders[1][10],hash);assert.match(f.alerts.at(-1)[0],/berubah/);
});
test('admin action rejects wrong sheet, header selection and multiple rows without a write',()=>{
 for(const opts of [{activeSheet:'products'},{selectedRow:1},{selectedCount:2}]) {
  const f=fixture(opts);f.context.createOrder(f.payload());const before=JSON.stringify(f.tables);
  f.context.issueTrackingCodeForSelectedOrder_();assert.equal(JSON.stringify(f.tables),before);assert.match(f.alerts.at(-1)[0],/Pilih satu baris/);
 }
});
test('cart snapshot returns current catalog fields and ignores saved display data',()=>{
 const f=fixture();f.tables.products[1][4]=40000;
 const before=JSON.stringify(f.tables);
 const r=f.context.getCartSnapshot([{id:'P1',qty:2,harga:1,nama:'Forged',maxStock:9999}]);
 assert.equal(r.success,true);assert.equal(r.items[0].harga,40000);assert.equal(r.items[0].nama,'Beras');assert.equal(r.items[0].maxStock,10);
 assert.equal(JSON.stringify(f.tables),before);assert.equal(f.attempts(),0);
});
test('cart snapshot caps aggregated quantities at current stock',()=>{
 const f=fixture();f.tables.products[1][6]=3;
 const r=f.context.getCartSnapshot([{id:'P1',qty:2},{id:'P1',qty:4}]);
 assert.equal(r.success,true);assert.equal(r.items.length,1);assert.equal(r.items[0].qty,3);assert.equal(r.adjustments[0].reason,'quantity_reduced');
});
test('cart snapshot drops removed and sold-out products with explanations',()=>{
 const f=fixture();f.tables.products[1][6]=0;
 const r=f.context.getCartSnapshot([{id:'P1',qty:2},{id:'REMOVED',qty:1}]);
 assert.equal(r.success,true);assert.equal(r.items.length,0);assert.equal(r.adjustments.length,2);
 assert.equal(r.adjustments[0].reason,'out_of_stock');assert.equal(r.adjustments[1].reason,'removed');
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
console.log(`${passed} checkout, tracking and cart checks passed.`);
