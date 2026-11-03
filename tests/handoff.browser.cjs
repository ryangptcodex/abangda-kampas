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
  await page.locator('#btnSubmitCheckout').click();
  await page.waitForFunction(()=>cartCheckoutPending);while(!release)await new Promise(r=>setTimeout(r,5));assert.equal(f.tables.orders.length,1);
  assert.equal(context.pages().length,1,'Saving must never open a blank tab');
  release();await page.waitForFunction(()=>!cartCheckoutPending);
  if(mode==='failure'){assert.equal(await page.evaluate(()=>cartState.length),1);assert.equal(await page.locator('#orderHandoffNotice').count(),0);assert.equal(await page.locator('#btnSubmitCheckout').isVisible(),true);}
  else{
   await page.locator('#orderHandoffNotice').waitFor({state:'visible'});assert.equal(await page.locator('#pageKonfirmasi').count(),0);assert.equal(await page.locator('#pageCheckout').isVisible(),true);assert.equal(f.tables.orders.length,2);
   assert.equal(context.pages().length,1);assert.equal(await page.locator('#btnSubmitCheckout').isVisible(),false);
   assert.equal(await page.locator('#orderWhatsAppLink').innerText(),'Lanjut ke WhatsApp');
   const next=context.waitForEvent('page');await page.locator('#orderWhatsAppLink').click();const popup=await next;await popup.waitForURL('https://wa.me/**');assert.equal(await popup.evaluate(()=>window.opener),null);assert.match(decodeURIComponent(popup.url()),/Halo Abangda/);
   assert.equal(orderCalls,1);assert.equal(f.tables.orders.length,2);
  }
  await context.close();
 }
 console.log('PASS delayed save stays on form without blank tabs; ready WhatsApp link opens directly without RPC or duplicate orders; save failure retains cart.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
