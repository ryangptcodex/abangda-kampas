const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:390,height:844}});await page.route('**/*',r=>r.abort());
 const html=fs.readFileSync('index.html','utf8').replace(/<\?!= include\('css'\);?\s*\?>/,()=>fs.readFileSync('css.html','utf8')).replace(/<\?!= include\('js'\);?\s*\?>/,()=>fs.readFileSync('js.html','utf8'));
 await page.setContent(html,{waitUntil:'domcontentloaded'});
 const css=await page.evaluate(()=>({grid:getComputedStyle(document.getElementById('categoryGrid')).display,drawer:getComputedStyle(document.getElementById('cartDrawer')).transform}));assert.equal(css.grid,'grid');assert.notEqual(css.drawer,'none');
 assert.doesNotMatch(fs.readFileSync('index.html','utf8')+fs.readFileSync('css.html','utf8'),/cdn\.tailwindcss\.com/);
 const race=await page.evaluate(()=>{
  window.calls=[];window.callbacks=[];safeRun=(name,cb,...args)=>{calls.push({name,args});callbacks.push(cb);};
  isLoadingProducts=false;activeCategoryFilter='A';loadProducts(false);filterByCategory('B');
  const data=nama=>({success:true,data:[{id_produk:nama,nama,harga:100,brand:'',url_foto:''}],currentPage:1,totalPages:1,totalItems:1});
  callbacks[1](data('Produk B'));callbacks[0](data('Produk A'));
  return {calls:calls.length,text:document.getElementById('catalogProductsGrid').textContent};
 });assert.equal(race.calls,2);assert.match(race.text,/Produk B/);assert.doesNotMatch(race.text,/Produk A/);
 const suggestions=await page.evaluate(()=>{callbacks=[];fetchSearchSuggestions('lama');fetchSearchSuggestions('baru');callbacks[1]({success:true,data:[{id_produk:'b',nama:'baru',harga:100,url_foto:''}]});callbacks[0]({success:true,data:[{id_produk:'a',nama:'lama',harga:100,url_foto:''}]});return document.getElementById('searchSuggestionsBox').textContent;});assert.match(suggestions,/baru/);assert.doesNotMatch(suggestions,/lama/);
 await page.evaluate(()=>{callbacks=[];openProductDetail('a');closeProductModal();callbacks[0]({success:true,product:{id_produk:'a',nama:'A',harga:100}});});assert.equal(await page.locator('#productDetailModal').isVisible(),false);
 const security=await page.evaluate(()=>{
  window.auditScriptRan=0; const name='<img src=x onerror="window.auditScriptRan=1">';
  cartState=[{id:'safe',nama:name,brand:'Brand "Premium"',harga:100,harga_normal:100,qty:1,url_foto:'javascript:alert(1)'}];renderCartUI();
  renderBrands([{nama_brand:'Brand "Premium"'}]);
  let clicked='';navFromSidebar=(_,__,brand)=>{clicked=brand;};document.querySelector('#sidebarBrandList button').click();
  bindSocialLink('footerLinkFb','javascript:alert(1)');renderBanners([{keterangan:name,url_gambar:'javascript:alert(1)',link:'javascript:alert(1)'}]);
  return {ran:window.auditScriptRan,text:document.getElementById('cartItemsContainer').textContent,images:document.querySelectorAll('#cartItemsContainer img').length,clicked,socialHidden:document.getElementById('footerLinkFb').classList.contains('hidden'),bannerLinks:document.querySelectorAll('#bannerSlider a').length,src:document.querySelector('#bannerSlider img').src};
 });assert.equal(security.ran,0);assert.match(security.text,/<img/);assert.equal(security.images,1);assert.equal(security.clicked,'Brand "Premium"');assert.equal(security.socialHidden,true);assert.equal(security.bannerLinks,0);assert.match(security.src,/^https:/);
 console.log('PASS latest category/search response wins; closing modal rejects delayed detail; product/brand markup is text, quoted brand buttons work, unsafe URLs are rejected.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
