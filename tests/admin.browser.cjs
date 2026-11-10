const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
for(const width of [390,1280]){
const page=await browser.newPage({viewport:{width,height:844}});await page.route('https://**/*',r=>r.abort());
const mock=`<script>
window.google={script:{run:{withSuccessHandler(cb){
return {withFailureHandler(){return new Proxy({}, {get(_,method){return (...args)=>setTimeout(()=>{
if(method==='adminLogin')cb(args[1]==='valid-password'?{success:true,token:'a'.repeat(64),expiresAt:Date.now()+3600000,username:'owner'}:{success:false,message:'Username atau password salah.'});
else if(method==='adminOrders')cb({success:true,page:1,pages:1,orders:[{id_pesanan:'TA-12345678901234567890',nama_pemesan:'<img src=x onerror=alert(1)>',tgl_pesan:'Today',status:'Menunggu Konfirmasi Stok'}]});
else cb({success:true,settings:{},categories:[],brands:[],banners:[],featuredProducts:[],data:[]});
},0);}});}};
}}}};
</script>`;
const html=fs.readFileSync('index.html','utf8').replace(/<\?!= include\('css'\); \?>/,()=>fs.readFileSync('css.html','utf8')).replace(/<\?!= include\('js'\); \?>/,()=>mock+fs.readFileSync('js.html','utf8'));
await page.setContent(html);await page.evaluate(()=>toggleSidebar());await page.locator('#sidebarAdminButton').click();
assert(await page.locator('#adminLoginForm').isVisible());assert.equal(await page.locator('#adminPassword').getAttribute('type'),'password');
await page.locator('#adminUsername').fill('owner');await page.locator('#adminPassword').fill('wrong');await page.locator('#adminLoginSubmit').click();await page.getByText('Username atau password salah.',{exact:true}).waitFor();assert(await page.locator('#adminPanel').isHidden());
await page.locator('#adminPassword').fill('valid-password');await page.locator('#adminLoginSubmit').click();await page.getByRole('button',{name:'Lihat & Kelola'}).waitFor();assert(await page.locator('#adminPanel').isVisible());assert.equal(await page.locator('#adminOrders img').count(),0);assert.equal(await page.locator('#adminPassword').inputValue(),'');
await page.getByRole('button',{name:'Keluar',exact:true}).click();assert(await page.locator('#adminLoginForm').isVisible());assert.equal(await page.locator('#adminOrders').textContent(),'');await page.close();
}console.log('PASS admin browser: mobile/desktop login, masked password, failed login, dashboard, safe text, logout clears private data.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
