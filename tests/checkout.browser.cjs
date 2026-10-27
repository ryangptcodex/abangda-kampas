const {chromium} = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try {
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('https://**/*',r=>r.abort());
 const mock=`<script>
 const product={id_produk:'P1',nama:'Beras',brand:'Abangda',id_kategori:'Sembako',harga:34500,stok:10,url_foto:'',deskripsi:'Beras 5kg'};
 const responses={
 getInitialData:{success:true,settings:{nama_toko:'TOKO ABANGDA'},categories:[{id_kategori:'Sembako',nama:'Sembako',url_ikon:''}],brands:[],banners:[],featuredProducts:[product]},
 getProducts:{success:true,data:[product],currentPage:1,totalPages:1,totalItems:1},
 getProductById:{success:true,product},
 validateCoupon:{success:true,code:'HEMAT',type:'PERSEN',value:10,discountAmount:6900,minBelanja:30000,message:'Kupon diterapkan'}
 };
 window.google={script:{run:{withSuccessHandler(success){return {withFailureHandler(failure){return new Proxy({}, {get(_,method){return (...args)=>setTimeout(()=>{
 if(method==='createOrder'){
 window.submitted=args[0];window.orderCalls=(window.orderCalls||0)+1;
 if(window.failOrder){success({success:false,message:'Kuota kupon telah habis.'});return;}
 success({success:true,orderId:'TA-20261025-001',trackingToken:'a'.repeat(64),waUrl:'https://wa.me/6282331463166?text=pesanan',summary:{nama_pemesan:args[0].nama_pemesan,tipe_pengiriman:'Delivery',subtotal:69000,kode_kupon:'HEMAT',diskon:6900,total_harga:62100}});
 }else success(responses[method]);
 },10);}});}};}}}};
 window.open=()=>{throw Error('Automatic popup must not be used');};
 </script>`;
 const root=path.join(__dirname,'..');
 let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<\?!= include\('js'\);?\s*\?>/,()=>mock+fs.readFileSync(path.join(root,'js.html'),'utf8'));
 // A trusted local stylesheet lets behavior run without external CDN connectivity.
 const css=fs.readFileSync(path.join(__dirname,'fixtures','tailwind.css'),'utf8');
 html=html.replace('</head>','<style>'+css+'</style></head>');
 await page.setContent(html,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#homeProductsGrid').textContent.includes('Beras'));
 await page.evaluate(()=>toggleSidebar());
 await page.getByRole('button',{name:'Cara Order',exact:true}).click();
 assert.equal(await page.locator('#pageCaraOrder').isVisible(),true);
 await page.getByRole('button',{name:'Mulai Belanja',exact:true}).click();
 assert.equal(await page.locator('#pageCaraOrder').isVisible(),false);
 await page.evaluate(()=>{quickAddToCart('P1','Beras',34500,10,'','Abangda');quickAddToCart('P1','Beras',34500,10,'','Abangda');toggleCartDrawer(true);});
 await page.getByRole('button',{name:'Lanjut ke Form Pemesanan',exact:true}).click();
 await page.locator('#coNama').fill('<img src=x onerror=alert(1)>');
 await page.locator('#coWa').fill('081234567890');
 await page.locator('#coAlamat').fill('Jalan Toko 1');
 await page.locator('#coCouponCode').fill('HEMAT');
 await page.locator('#btnApplyCoupon').click();
 await page.waitForFunction(()=>!document.querySelector('#couponAppliedBox').classList.contains('hidden'));
 // Simulate a tampered browser price after applying the coupon.
 await page.evaluate(()=>{cartState[0].harga=1;window.failOrder=true;});
 await page.locator('#btnSubmitCheckout').click();
 await page.waitForFunction(()=>document.querySelector('#btnSubmitCheckout').disabled===false);
 assert.equal(await page.locator('#pageCheckout').isVisible(),true);
 assert.equal(await page.locator('#cartBadge').innerText(),'2');
 assert.match(await page.locator('#toastMsg').innerText(),/habis/);
 assert.equal(await page.evaluate(()=>Object.hasOwn(window.submitted,'total_harga')),false);
 assert.equal(await page.evaluate(()=>Object.hasOwn(window.submitted.items[0],'harga')),false);
 await page.evaluate(()=>{window.failOrder=false;});
 await page.locator('#btnSubmitCheckout').click();
 await page.locator('#pageKonfirmasi').waitFor({state:'visible'});
 assert.match(await page.locator('#confirmSummary').innerText(),/62\.100/);
 assert.equal(await page.locator('#confirmSummary img').count(),0);
 assert.equal(await page.locator('#confirmWhatsAppLink').isVisible(),true);
 assert.match(await page.locator('#confirmWhatsAppLink').getAttribute('href'),/^https:\/\/wa\.me\//);
 assert.equal(await page.locator('#confirmWhatsAppLink').getAttribute('target'),'_blank');
 assert.equal(await page.locator('#trackOrderIdInput').inputValue(),'TA-20261025-001');
 assert.equal(await page.locator('#cartBadge').isVisible(),false);
 assert.equal(context.pages().length,1);
 // Reopening the confirmation link does not submit createOrder again.
 const calls=await page.evaluate(()=>window.orderCalls);
 const popupPromise=context.waitForEvent('page');
 await page.locator('#confirmWhatsAppLink').click();
 const popup=await popupPromise;await popup.close();
 assert.equal(await page.evaluate(()=>window.orderCalls),calls);
 // Compatibility with an older index: restore dynamically if the link is absent.
 await page.evaluate(()=>{document.getElementById('confirmWhatsAppLink').remove();quickAddToCart('P1','Beras',34500,10,'','Abangda');switchTab('checkout');});
 await page.locator('#btnSubmitCheckout').click();
 await page.locator('#confirmWhatsAppLink').waitFor({state:'visible'});
 assert.deepEqual(errors,[]);
 console.log('PASS browser: mobile home, Cara Order, checkout failure retains cart, canonical server total, escaped name, direct WhatsApp link, link reuse without resubmission, compatibility with previous index.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
