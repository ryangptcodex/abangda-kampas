const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/apps-script.cjs');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
 for(const coupon of [false,true]){
  const f=fixture();let loseResponse=true,orderCalls=0;const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.context().route('https://wa.me/**',r=>r.fulfill({contentType:'text/html',body:'WhatsApp handoff test'}));
  await page.exposeFunction('__retryServer',(method,args)=>{const res=JSON.parse(JSON.stringify(f.context[method](...args)));if(method==='createOrder'){orderCalls++;if(loseResponse&&res.success){loseResponse=false;throw Error('Koneksi putus setelah tersimpan');}}return res;});
  const bridge=`<script>window.google={script:{run:{withSuccessHandler(success){return {withFailureHandler(failure){return new Proxy({}, {get(_,method){return (...args)=>window.__retryServer(method,args).then(success,failure);}});}};}}}};</script>`;
  const html=fs.readFileSync('index.html','utf8').replace(/<\?!= include\('css'\);?\s*\?>/,()=>fs.readFileSync('css.html','utf8')).replace(/<\?!= include\('js'\);?\s*\?>/,()=>bridge+fs.readFileSync('js.html','utf8'));
  await page.route('https://**/*',r=>r.abort());await page.route('http://retry.test/**',r=>r.fulfill({contentType:'text/html',body:html}));await page.goto('http://retry.test/');
  await page.waitForFunction(()=>document.querySelector('#homeProductsGrid [data-product-id]'));await page.locator('#homeProductsGrid [data-role="add"]').first().click();await page.evaluate(()=>switchTab('checkout'));
  async function fill(){await page.locator('#coNama').fill('Pembeli');await page.locator('#coWa').fill('081234567890');await page.locator('#coAlamat').fill('Alamat pembeli');}
  await fill();if(coupon){await page.locator('#coCouponCode').fill('HEMAT');await page.locator('#btnApplyCoupon').click();await page.waitForFunction(()=>!!appliedCoupon);}
  await page.locator('#btnSubmitCheckout').click();await page.waitForFunction(()=>!cartCheckoutPending);assert.equal(orderCalls,1);assert.equal(f.tables.orders.length,2);
  const key=await page.evaluate(()=>JSON.parse(localStorage.getItem('tokoAbangda.checkout.v1')).key);assert.match(key,/^[a-f0-9]{64}$/);
  const stored=await page.evaluate(()=>localStorage.getItem('tokoAbangda.checkout.v1'));assert.doesNotMatch(stored,/Pembeli|081234567890|Alamat/);
  await page.reload();await page.waitForFunction(()=>!cartRestoreRequired&&cartState.length===1);await page.evaluate(()=>switchTab('checkout'));await fill();await page.locator('#btnSubmitCheckout').click();await page.waitForFunction(()=>!cartCheckoutPending);
  assert.equal(orderCalls,2);assert.equal(f.tables.orders.length,2);assert.equal(f.tables.coupons[1][4],coupon?1:2);
  if(coupon){await page.locator('#previousCheckoutNotice').waitFor({state:'visible'});assert.match(await page.locator('#previousCheckoutNotice').innerText(),/Pesanan sebelumnya sudah tercatat/);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('tokoAbangda.checkout.v1')).key),key);}
  else{await page.locator('#orderHandoffNotice').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>localStorage.getItem('tokoAbangda.checkout.v1')),null);}
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS real backend + browser: response lost after commit, refresh and retry keep one order; changed coupon state shows previous order without duplicate; pending storage excludes customer fields.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
