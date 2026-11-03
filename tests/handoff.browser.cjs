const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/apps-script.cjs');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
 for(const mode of ['direct','blocked','failure']){
  const context=await browser.newContext({viewport:{width:390,height:844}});const f=fixture();let release,orderCalls=0;
  await context.route('https://**/*',r=>r.abort());await context.route('https://wa.me/**',r=>r.fulfill({contentType:'text/html',body:'WhatsApp test destination'}));
  const page=await context.newPage();page.setDefaultTimeout(10000);if(mode==='blocked')await page.addInitScript(()=>window.open=()=>null);
  await page.exposeFunction('__server',(method,args)=>{
   if(method==='createOrder'){orderCalls++;return new Promise(resolve=>release=()=>resolve(mode==='failure'?{success:false,message:'Uji server gagal'}:JSON.parse(JSON.stringify(f.context.createOrder(...args)))));}
   return JSON.parse(JSON.stringify(f.context[method](...args)));
  });
  const bridge=`<script>window.google={script:{run:{withSuccessHandler(ok){return {withFailureHandler(fail){return new Proxy({}, {get(_,method){return (...args)=>window.__server(method,args).then(ok,fail);}});}};}}}};</script>`;
  const html=fs.readFileSync('index.html','utf8').replace(/<\?!= include\('css'\);?\s*\?>/,()=>fs.readFileSync('css.html','utf8')).replace(/<\?!= include\('js'\);?\s*\?>/,()=>bridge+fs.readFileSync('js.html','utf8'));
  await context.route('http://handoff.test/**',r=>r.fulfill({contentType:'text/html',body:html}));await page.goto('http://handoff.test/');
  await page.waitForFunction(()=>document.querySelector('#homeProductsGrid [data-role="add"]'));await page.locator('#homeProductsGrid [data-role="add"]').first().click();await page.evaluate(()=>switchTab('checkout'));
  await page.locator('#coNama').fill('Pembeli');await page.locator('#coWa').fill('081234567890');await page.locator('#coAlamat').fill('Alamat');
  const popupPromise=mode==='blocked'?null:context.waitForEvent('page');
  await page.locator('#btnSubmitCheckout').click();
  const popup=popupPromise?await popupPromise:null;
  await page.waitForFunction(()=>cartCheckoutPending);while(!release)await new Promise(r=>setTimeout(r,5));
  assert.equal(f.tables.orders.length,1,'WhatsApp must open before order write finishes');
  if(popup){await popup.waitForURL('https://wa.me/**');assert.equal(await popup.evaluate(()=>window.opener),null);const message=new URL(popup.url()).searchParams.get('text');assert.match(message,/Estimasi total produk/);assert.match(message,/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} WIB/);assert.match(message,/• Beras \[Abangda\] — 1 pcs × Rp 34\.500 = Rp 34\.500/);assert.match(message,/Pelacakan tersedia setelah pencatatan berhasil/);assert.doesNotMatch(message,/&#x20;|Pencatatan pesanan sedang diproses/);}
  else{assert.equal(context.pages().length,1);assert.match(await page.locator('#instantWhatsAppFallback').getAttribute('href'),/^https:\/\/wa.me\//);}
  const sentHref=await page.locator('#instantWhatsAppFallback').getAttribute('href');
  const expectedId=new URL(sentHref).searchParams.get('text').match(/TA-[A-F0-9]{20}/)[0];
  release();await page.waitForFunction(()=>!cartCheckoutPending);
  if(mode==='failure'){assert.equal(await page.evaluate(()=>cartState.length),1);assert.equal(await page.locator('#orderHandoffNotice').count(),0);assert.equal(await page.locator('#btnSubmitCheckout').isVisible(),true);if(popup)assert.equal(popup.isClosed(),false);}
  else{
   await page.locator('#orderHandoffNotice').waitFor({state:'visible'});assert.equal(await page.locator('#pageKonfirmasi').count(),0);assert.equal(await page.locator('#pageHome').isVisible(),true);assert.equal(f.tables.orders.length,2);
   assert.equal(f.tables.orders[1][0],expectedId,'Immediate message and stored order must use same ID');
   assert.equal(orderCalls,1);assert.equal(context.pages().length,mode==='blocked'?1:2,'Response must not open another WhatsApp tab');
  }
  await context.close();
 }
 console.log('PASS WhatsApp opens from first click before delayed RPC finishes; same order ID, no blank tab, no second popup, fallback and save failure retain recovery.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
