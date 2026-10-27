const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {fixture}=require('./helpers/apps-script.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try {
  const f=fixture();f.tables.products[1][6]=0;f.tables.products[1][9]=30000;f.tables.products[1][10]=3;
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('__shopServer',(method,args)=>{
   assert.ok(['getInitialData','getProducts','getProductById','getCartSnapshot','validateCoupon','createOrder','trackOrder'].includes(method));
   return JSON.parse(JSON.stringify(f.context[method](...args)));
  });
  const bridge=`<script>window.finishedRPCs=0;window.google={script:{run:{withSuccessHandler(success){return {withFailureHandler(failure){return new Proxy({}, {get(_,method){return (...args)=>window.__shopServer(method,args).then(success,failure).finally(()=>window.finishedRPCs++);}});}};}}}};</script>`;
  const root=path.join(__dirname,'..');
  let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<\?!= include\('js'\);?\s*\?>/,()=>bridge+fs.readFileSync(path.join(root,'js.html'),'utf8')).replace('</head>','<style>'+fs.readFileSync(path.join(__dirname,'fixtures','tailwind.css'),'utf8')+'</style></head>');
  await page.route('https://**/*',r=>r.abort());
  await page.route('http://toko-grosir.test/**',r=>r.fulfill({contentType:'text/html',body:html}));
  await page.goto('http://toko-grosir.test/');
  await page.waitForFunction(()=>document.querySelector('#homeProductsGrid [data-product-id]'));
  const card=page.locator('#homeProductsGrid [data-product-id="P1"]');
  assert.equal(/stok|habis|sisa/i.test(await card.innerText()),false);
  assert.match(await card.locator('[data-role="wholesale"]').innerText(),/30\.000.*3/);
  // Home category labels wrap in full, including names containing quotes.
  const label=page.locator('#categoryGrid .category-name').first();
  assert.equal(await label.innerText(),'Kebutuhan Rumah Tangga & Perawatan Keluarga');
  assert.equal(await label.evaluate(e=>getComputedStyle(e).whiteSpace),'normal');
  assert.equal(await label.evaluate(e=>e.scrollHeight<=e.clientHeight+1),true);
  assert.equal(await label.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
  await page.getByRole('button',{name:"Vitamin 'A' dan Kesehatan Anak",exact:true}).first().click();
  await page.locator('#pageKatalog').waitFor({state:'visible'});
  await page.evaluate(()=>switchTab('home'));
  // The + control updates both price and wholesale badge exactly at the threshold.
  await card.locator('[data-role="add"]').click();
  assert.equal(await card.locator('[data-role="quantity"]').innerText(),'1');
  assert.match(await page.locator('#cartItemsContainer').innerText(),/Tambahkan 2 lagi untuk dapat harga grosir/);
  assert.match(await page.locator('#checkoutItemsReview').innerText(),/Tambahkan 2 lagi untuk dapat harga grosir/);
  assert.equal(await card.locator('[data-role="price"]').innerText(),'Rp 34.500');
  await card.getByRole('button',{name:'Tambah Beras',exact:true}).click();
  assert.equal(await card.locator('[data-role="quantity"]').innerText(),'2');
  assert.match(await page.locator('#checkoutItemsReview').innerText(),/Tambahkan 1 lagi untuk dapat harga grosir/);
  assert.equal(await card.locator('[data-role="price"]').innerText(),'Rp 34.500');
  await card.getByRole('button',{name:'Tambah Beras',exact:true}).click();
  assert.equal(await card.locator('[data-role="quantity"]').innerText(),'3');
  assert.equal(await card.locator('[data-role="price"]').innerText(),'Rp 30.000');
  assert.equal(await card.locator('[data-role="wholesale"]').innerText(),'Harga grosir aktif');
  assert.match(await page.locator('#checkoutItemsReview').innerText(),/Harga grosir aktif/);
  assert.doesNotMatch(await page.locator('#checkoutItemsReview').innerText(),/Tambahkan/);
  await page.evaluate(()=>toggleCartDrawer(true));
  assert.match(await page.locator('#cartItemsContainer').innerText(),/Harga grosir/);
  assert.match(await page.locator('#cartTotalPrice').innerText(),/90\.000/);
  await page.evaluate(()=>toggleCartDrawer(false));
  await card.getByRole('button',{name:'Kurangi Beras',exact:true}).click();
  assert.equal(await card.locator('[data-role="price"]').innerText(),'Rp 34.500');
  assert.equal(await page.evaluate(()=>cartState[0].harga),34500);
  assert.match(await page.locator('#cartItemsContainer').innerText(),/Tambahkan 1 lagi untuk dapat harga grosir/);
  // Modal price includes quantities already in the cart and has no stock gate.
  await card.getByRole('button',{name:'Lihat detail Beras',exact:true}).click();
  await page.locator('#productDetailModal').waitFor({state:'visible'});
  assert.equal(await page.locator('#modalProductPrice').innerText(),'Rp 30.000');
  assert.match(await page.locator('#modalWholesaleInfo').innerText(),/Total setelah ditambah: 3/);
  await page.locator('#modalBtnAddToCart').click();
  assert.equal(await page.evaluate(()=>cartState[0].qty),3);
  await page.evaluate(()=>changeCartQty(0,-1));
  assert.equal(await page.evaluate(()=>cartState[0].harga),34500);
  await page.evaluate(()=>changeCartQty(0,1));
  assert.equal(await page.evaluate(()=>cartState[0].harga),30000);
  await page.evaluate(()=>toggleCartDrawer(false));
  // Restoration retains full requested quantities despite a zero legacy inventory field.
  await page.reload();
  await page.waitForFunction(()=>!cartRestoreRequired&&cartState.length===1&&document.querySelector('#homeProductsGrid [data-product-id]'));
  assert.equal(await page.evaluate(()=>cartState[0].qty),3);
  assert.equal(await page.evaluate(()=>cartState[0].harga),30000);
  // Coupon and final receipt use the wholesale subtotal; raw browser pricing is not submitted.
  await page.evaluate(()=>switchTab('checkout'));
  await page.locator('#coNama').fill('Pembeli Grosir');await page.locator('#coWa').fill('081234567890');await page.locator('#coAlamat').fill('Jalan Grosir 1');
  await page.locator('#coCouponCode').fill('HEMAT');await page.locator('#btnApplyCoupon').click();
  await page.waitForFunction(()=>!document.getElementById('couponAppliedBox').classList.contains('hidden'));
  assert.match(await page.locator('#coTotalTagihan').innerText(),/81\.000/);
  await page.locator('#btnSubmitCheckout').click();await page.locator('#pageKonfirmasi').waitFor({state:'visible'});
  assert.match(await page.locator('#confirmSummary').innerText(),/81\.000/);
  const id=await page.locator('#confirmOrderId').innerText();const token=await page.locator('#confirmTrackingToken').inputValue();
  const order=f.context.trackOrder(id,token);assert.equal(order.order.total_harga,81000);assert.equal(order.order.items[0].harga,30000);
  const message=new URL(await page.locator('#confirmWhatsAppLink').getAttribute('href')).searchParams.get('text');assert.match(message,/90\.000/);assert.match(message,/81\.000/);
  // Very narrow mobile and desktop widths do not clip category labels.
  for(const width of [320,768,1280]){
   await page.setViewportSize({width,height:844});await page.evaluate(()=>switchTab('home'));
   for(const node of await page.locator('#categoryGrid .category-name').all())assert.equal(await node.evaluate(e=>e.scrollHeight<=e.clientHeight+1&&e.scrollWidth<=e.clientWidth+1),true);
  }
  await page.screenshot({path:'/tmp/abangda-wholesale-categories.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS wholesale browser + backend: no stock gate, full category labels, SKU +/- threshold and reversal, modal combined quantity, cart pricing, persistence, coupon, receipt/WhatsApp/tracking, mobile/desktop widths.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
