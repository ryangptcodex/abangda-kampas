const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('./helpers/apps-script.cjs');
(async () => {
  const f = fixture();
  const counts = {};
  let delayNextTracking = false;
  let releaseResponse;
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://**/*', route => route.abort());
    await page.exposeFunction('__testServer', async (method,args) => {
      assert.ok(['getInitialData','getProducts','getProductById','createOrder','validateCoupon','trackOrder'].includes(method));
      counts[method] = (counts[method] || 0) + 1;
      const response = JSON.parse(JSON.stringify(f.context[method](...args)));
      if (method === 'trackOrder' && delayNextTracking) {
        delayNextTracking = false;
        return new Promise(resolve => {releaseResponse = () => resolve(response);});
      }
      return response;
    });
    const bridge = `<script>
      window.completedServerCalls = 0;
      window.google = {script:{run:{withSuccessHandler(success){return {withFailureHandler(failure){return new Proxy({}, {get(_,method){return (...args)=>window.__testServer(method,args).then(success,failure).finally(()=>window.completedServerCalls++);}});}};}}}};
    </script>`;
    const root = path.join(__dirname,'..');
    let html = fs.readFileSync(path.join(root,'index.html'),'utf8')
      .replace(/<\?!= include\('js'\);?\s*\?>/, () => bridge + fs.readFileSync(path.join(root,'js.html'),'utf8'))
      .replace('</head>', '<style>'+fs.readFileSync(path.join(__dirname,'fixtures','tailwind.css'),'utf8')+'</style></head>');
    await page.setContent(html,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => document.getElementById('homeProductsGrid').textContent.includes('Beras'));
    await page.evaluate(() => {quickAddToCart('P1','Beras',34500,10,'','Abangda');switchTab('checkout');});
    await page.locator('#coNama').fill('Nama pribadi pemesan');
    await page.locator('#coWa').fill('081234567890');
    await page.locator('#coAlamat').fill('Alamat pribadi pemesan');
    await page.locator('#btnSubmitCheckout').click();
    await page.locator('#pageKonfirmasi').waitFor({state:'visible'});
    const orderId = await page.locator('#confirmOrderId').innerText();
    assert.equal(await page.locator('#confirmTrackingToken, #trackOrderTokenInput').count(),0);
    assert.doesNotMatch(decodeURIComponent(await page.locator('#confirmWhatsAppLink').getAttribute('href')),/kode pelacakan/i);
    await page.getByRole('button',{name:'Lacak Pesanan Ini',exact:true}).click();
    await page.locator('#btnSubmitTrack').click();
    await page.waitForFunction(() => document.getElementById('trackResultBox').textContent.includes('Menunggu Konfirmasi Stok'));
    let result = await page.locator('#trackResultBox').innerText();
    assert.match(result,/34\.500/);
    assert.equal(result.includes('Nama pribadi pemesan'),false);
    assert.equal(result.includes('Alamat pribadi pemesan'),false);
    assert.equal(result.includes('081234567890'),false);
    // Changing the ID immediately clears previous details.
    await page.locator('#trackOrderIdInput').fill('TA-20990101-999');
    assert.equal(await page.locator('#trackResultBox').isVisible(),false);
    assert.equal(await page.locator('#trackResultBox').textContent(),'');
    await page.locator('#btnSubmitTrack').click();
    await page.waitForFunction(() => document.getElementById('trackResultBox').textContent.includes('tidak ditemukan'));
    assert.equal((await page.locator('#trackResultBox').textContent()).includes('Beras'),false);
    // No network lookup with an empty ID, including direct invocation.
    await page.locator('#trackOrderIdInput').fill('');
    const before = counts.trackOrder;
    await page.evaluate(() => submitTrackOrder());
    assert.equal(counts.trackOrder,before);
    assert.equal(await page.locator('#trackResultBox').isVisible(),false);
    // Reject a delayed response after the user switches IDs.
    await page.locator('#trackOrderIdInput').fill(orderId);
    delayNextTracking = true;
    await page.locator('#btnSubmitTrack').click();
    await page.waitForFunction(() => document.getElementById('btnSubmitTrack').disabled);
    while (!releaseResponse) await new Promise(resolve=>setTimeout(resolve,10));
    await page.locator('#trackOrderIdInput').fill('TA-20990101-999');
    const completed = await page.evaluate(() => window.completedServerCalls);
    releaseResponse();
    await page.waitForFunction(n => window.completedServerCalls > n,completed);
    assert.equal(await page.locator('#trackResultBox').textContent(),'');
    assert.equal(await page.locator('#trackResultBox').isVisible(),false);
    // Stored strings are rendered as text.
    f.tables.orders[1][7] = JSON.stringify([{nama:'<img src=x onerror=alert(1)>',brand:'<svg onload=alert(1)>',qty:1,harga:34500}]);
    await page.locator('#trackOrderIdInput').fill(orderId);
    await page.locator('#btnSubmitTrack').click();
    await page.waitForFunction(() => document.getElementById('trackResultBox').textContent.includes('<img'));
    assert.equal(await page.locator('#trackResultBox img, #trackResultBox svg').count(),0);
    assert.deepEqual(errors,[]);
    console.log('PASS browser + actual backend with simulated Sheets: ID-only tracking, unknown/missing ID denial, no contact exposure, stale-response rejection, safe text rendering.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
