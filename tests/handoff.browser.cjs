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
  const popupPromise=mode==='blocked'?null:page.waitForEvent('popup');await page.locator('#btnSubmitCheckout').click();const popup=popupPromise?await popupPromise:null;
  await page.waitForFunction(()=>cartCheckoutPending);while(!release)await new Promise(r=>setTimeout(r,5));assert.equal(f.tables.orders.length,1);
  if(popup){assert.equal(popup.url(),'about:blank');assert.match(await popup.locator('body').innerText(),/Sedang menyimpan/);}
  const closed=mode==='failure'?popup.waitForEvent('close'):null;
  release();await page.waitForFunction(()=>!cartCheckoutPending);
  if(mode==='failure'){await closed;assert.equal(popup.isClosed(),true);assert.equal(await page.evaluate(()=>cartState.length),1);assert.equal(await page.locator('#orderHandoffNotice').count(),0);}
  else{
   await page.locator('#orderHandoffNotice').waitFor({state:'visible'});assert.equal(await page.locator('#pageKonfirmasi').count(),0);assert.equal(await page.locator('#pageHome').isVisible(),true);assert.equal(f.tables.orders.length,2);
   if(mode==='direct'){await popup.waitForURL('https://wa.me/**');assert.equal(await popup.evaluate(()=>window.opener),null);assert.match(decodeURIComponent(popup.url()),/Halo Abangda/);}
   else{const next=context.waitForEvent('page');await page.locator('#orderWhatsAppLink').click();const fallback=await next;await fallback.waitForURL('https://wa.me/**');assert.equal(orderCalls,1);assert.equal(f.tables.orders.length,2);}
  }
  await context.close();
 }
 console.log('PASS actual popup reserved on click, WhatsApp navigated only after commit, no confirmation page, blocked-popup link reuses order, failed checkout closes tab and retains cart.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
