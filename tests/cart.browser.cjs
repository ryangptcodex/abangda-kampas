const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {fixture} = require('./helpers/apps-script.cjs');
const KEY = 'tokoAbangda.cart.v1';
(async()=>{
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
  try {
    const f = fixture();
    const flags = {failSnapshot:false,delaySnapshot:false,failOrder:false,delayOrder:false};
    const counts = {};
    let releaseSnapshot,releaseOrder;
    const context = await browser.newContext({viewport:{width:390,height:844}});
    const errors = [];
    const bridge = `<script>
      window.finishedRPCs = 0;
      window.google={script:{run:{withSuccessHandler(success){return {withFailureHandler(failure){return new Proxy({}, {get(_,method){return (...args)=>window.__cartServer(method,args).then(success,failure).finally(()=>window.finishedRPCs++);}});}};}}}};
    </script>`;
    const root = path.join(__dirname,'..');
    const html = fs.readFileSync(path.join(root,'index.html'),'utf8')
      .replace(/<\?!= include\('js'\);?\s*\?>/,()=>bridge+fs.readFileSync(path.join(root,'js.html'),'utf8'))
      .replace('</head>','<style>'+fs.readFileSync(path.join(__dirname,'fixtures','tailwind.css'),'utf8')+'</style></head>');
    async function configure(ctx) {
      ctx.on('page',p=>{p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));});
      await ctx.route('https://**/*',r=>r.abort());
      await ctx.route('http://toko-abangda.test/**',r=>r.fulfill({contentType:'text/html',body:html}));
      await ctx.exposeBinding('__cartServer',async(_,method,args)=>{
        assert.ok(['getInitialData','getProducts','getCartSnapshot','getProductById','createOrder','validateCoupon','trackOrder'].includes(method));
        counts[method]=(counts[method]||0)+1;
        if(method==='getCartSnapshot' && flags.failSnapshot) throw Error('Uji koneksi terputus');
        if(method==='createOrder' && flags.failOrder) return {success:false,message:'Uji order ditolak'};
        const res=JSON.parse(JSON.stringify(f.context[method](...args)));
        if(method==='getCartSnapshot' && flags.delaySnapshot){flags.delaySnapshot=false;return new Promise(resolve=>{releaseSnapshot=()=>resolve(res);});}
        if(method==='createOrder' && flags.delayOrder){flags.delayOrder=false;return new Promise(resolve=>{releaseOrder=()=>resolve(res);});}
        return res;
      });
    }
    await configure(context);
    const page = await context.newPage();
    async function ready(p=page){await p.waitForFunction(()=>document.getElementById('homeProductsGrid').textContent.includes('Beras') && !cartIsRestoring);}
    async function seed(items,extra={}){await page.evaluate(({key,items,extra})=>localStorage.setItem(key,JSON.stringify({version:1,savedAt:Date.now(),items,...extra})),{key:KEY,items,extra});}
    const stored = () => page.evaluate(key=>localStorage.getItem(key),KEY);
    await page.goto('http://toko-abangda.test/');await ready();
    await page.evaluate(()=>{quickAddToCart('P1','Beras',34500,10,'','Abangda');quickAddToCart('P1','Beras',34500,10,'','Abangda');});
    const initial=JSON.parse(await stored());
    assert.deepEqual(Object.keys(initial).sort(),['items','savedAt','version']);
    assert.deepEqual(initial.items,[{id:'P1',qty:2}]);
    f.tables.products[1][4]=40000;f.tables.products[1][6]=1;
    await page.reload();await ready();
    assert.equal(await page.evaluate(()=>cartState[0].harga),40000);
    assert.equal(await page.evaluate(()=>cartState[0].qty),1);
    await page.evaluate(()=>toggleCartDrawer(true));
    assert.match(await page.locator('#cartStorageNotice').innerText(),/disesuaikan/);
    assert.match(await page.locator('#cartItemsContainer').innerText(),/40\.000/);
    // Quantity/remove actions are persisted, including deleting an empty cart.
    await page.evaluate(()=>changeCartQty(0,-1));assert.equal(await stored(),null);
    f.tables.products[1][6]=10;
    await page.evaluate(()=>quickAddToCart('P1','Beras',40000,10,'','Abangda'));
    const second=await context.newPage();await second.goto('http://toko-abangda.test/');await ready(second);
    assert.equal(await second.locator('#cartBadge').innerText(),'1');await second.close();
    await page.evaluate(()=>removeCartItem(0));assert.equal(await stored(),null);
    // Extra forged cached fields never populate the cart and are removed on rewrite.
    await seed([{id:'P1',qty:2,harga:1,nama:'FORGED',alamat:'PRIVATE',trackingToken:'SECRET'}]);
    await page.reload();await ready();
    assert.equal(await page.evaluate(()=>cartState[0].nama),'Beras');
    assert.equal(await page.evaluate(()=>cartState[0].harga),40000);
    assert.deepEqual(JSON.parse(await stored()).items,[{id:'P1',qty:2}]);
    assert.equal((await stored()).includes('SECRET'),false);
    // Unknown/deleted and sold-out items are removed after a successful lookup.
    f.tables.products[1][6]=0;
    await seed([{id:'P1',qty:1},{id:'DELETED',qty:1}]);await page.reload();await ready();
    assert.equal(await stored(),null);assert.equal(await page.evaluate(()=>cartState.length),0);
    f.tables.products[1][6]=10;
    // Malformed and expired carts do not crash startup or trigger restoration RPCs.
    const snapshotsBefore=counts.getCartSnapshot;
    for(const value of ['{broken',JSON.stringify({version:99,savedAt:Date.now(),items:[]}),JSON.stringify({version:1,savedAt:Date.now(),items:[{id:'P1',qty:-1}]}),JSON.stringify({version:1,savedAt:Date.now()-31*86400000,items:[{id:'P1',qty:1}]})]){
      await page.evaluate(({key,value})=>localStorage.setItem(key,value),{key:KEY,value});
      await page.reload();await ready();assert.equal(await stored(),null);
    }
    assert.equal(counts.getCartSnapshot,snapshotsBefore);
    // A transient server failure preserves storage and requires retry/discard.
    await seed([{id:'P1',qty:2}]);const savedBeforeFailure=await stored();flags.failSnapshot=true;
    await page.reload();await ready();
    assert.equal(await stored(),savedBeforeFailure);
    assert.equal(await page.evaluate(()=>cartRestoreRequired),true);
    await page.evaluate(()=>quickAddToCart('P1','Beras',40000,10,'','Abangda'));
    assert.equal(await page.evaluate(()=>cartState.length),0);
    assert.equal(await stored(),savedBeforeFailure);
    flags.failSnapshot=false;
    await page.getByRole('button',{name:'Coba pulihkan lagi',exact:true}).click();
    await page.waitForFunction(()=>!cartRestoreRequired);
    assert.equal(await page.locator('#cartBadge').innerText(),'2');
    // Discard wins over a late successful restore; the cart cannot reappear.
    flags.delaySnapshot=true;releaseSnapshot=null;
    await page.reload();await page.waitForFunction(()=>cartIsRestoring);
    while(!releaseSnapshot)await new Promise(r=>setTimeout(r,10));
    await page.evaluate(()=>toggleCartDrawer(true));
    await page.getByRole('button',{name:'Kosongkan keranjang tersimpan',exact:true}).click();
    const completed=await page.evaluate(()=>window.finishedRPCs);
    releaseSnapshot();await page.waitForFunction(n=>window.finishedRPCs>n,completed);
    assert.equal(await stored(),null);assert.equal(await page.evaluate(()=>cartState.length),0);
    // Checkout failure preserves saved items; success clears them. Pending checkout blocks edits.
    await page.evaluate(()=>{quickAddToCart('P1','Beras',40000,10,'','Abangda');toggleCartDrawer(false);switchTab('checkout');});
    await page.locator('#coNama').fill('Nama tidak disimpan');
    await page.locator('#coWa').fill('081234567890');await page.locator('#coAlamat').fill('Alamat tidak disimpan');
    const beforeOrder=await stored();assert.equal(beforeOrder.includes('Nama'),false);
    flags.failOrder=true;await page.locator('#btnSubmitCheckout').click();
    await page.waitForFunction(()=>!cartCheckoutPending);
    assert.equal(await stored(),beforeOrder);assert.equal(await page.evaluate(()=>cartState.length),1);
    flags.failOrder=false;flags.delayOrder=true;releaseOrder=null;
    await page.locator('#btnSubmitCheckout').click();await page.waitForFunction(()=>cartCheckoutPending);
    while(!releaseOrder)await new Promise(r=>setTimeout(r,10));
    await page.evaluate(()=>quickAddToCart('P1','Beras',40000,10,'','Abangda'));
    assert.equal(await stored(),beforeOrder);assert.equal(await page.evaluate(()=>cartState[0].qty),1);
    releaseOrder();await page.locator('#pageKonfirmasi').waitFor({state:'visible'});
    assert.equal(await stored(),null);
    await page.reload();await ready();assert.equal(await page.evaluate(()=>cartState.length),0);
    // Storage denied by browser privacy settings falls back to a working in-memory cart.
    const blocked=await browser.newContext();await configure(blocked);
    await blocked.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Denied','SecurityError');}}));
    const blockedPage=await blocked.newPage();await blockedPage.goto('http://toko-abangda.test/');await ready(blockedPage);
    await blockedPage.evaluate(()=>{quickAddToCart('P1','Beras',40000,10,'','Abangda');toggleCartDrawer(true);});
    assert.equal(await blockedPage.locator('#cartBadge').innerText(),'1');
    assert.match(await blockedPage.locator('#cartStorageNotice').innerText(),/tidak dapat disimpan/);
    // Write quota errors also preserve the usable in-memory cart.
    const full=await browser.newContext();await configure(full);
    await full.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Quota','QuotaExceededError');};});
    const fullPage=await full.newPage();await fullPage.goto('http://toko-abangda.test/');await ready(fullPage);
    await fullPage.evaluate(()=>quickAddToCart('P1','Beras',40000,10,'','Abangda'));
    assert.equal(await fullPage.locator('#cartBadge').innerText(),'1');
    assert.equal(await fullPage.evaluate(()=>cartStorageAvailable),false);
    assert.deepEqual(errors,[]);
    console.log('PASS persistent cart browser + actual backend: refresh/reopen, canonical price/stock, adjustments/removal, minimal storage, invalid/expired data, failure/retry, discard race, checkout clear/failure/edit lock, denied/full storage.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
