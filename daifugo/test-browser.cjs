'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base='https://yoshisuke1111-svg.github.io/element-maze1/daifugo/';
async function until(page,fn,ms=50000){await page.waitForFunction(fn,null,{timeout:ms});}
async function boot(browser){
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true});
 await page.goto(base+'?smoke=20261114',{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForSelector('[data-act="solo"]',{timeout:25000});
 return page;
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const errs=[];
 try{
  const solo=await boot(browser);
  solo.on('pageerror',e=>errs.push('solo '+e.message));
  await solo.locator('[data-act="solo"]').click();
  await until(solo,()=>DaifugoDebug.screen()==='game');
  assert.equal(await solo.locator('.play-card').count(),14);
  await solo.locator('.play-card').first().click();
  await solo.locator('[data-act="play"]').click();
  await until(solo,()=>DaifugoDebug.view()?.seq>=2);
  const soloV=await solo.evaluate(()=>({mode:DaifugoDebug.mode(),count:DaifugoDebug.view().hand.length,seq:DaifugoDebug.view().seq}));
  assert.equal(soloV.mode,'solo');assert.equal(soloV.count,13);
  console.log('CPU GAME OK',soloV);
  const host=await boot(browser);
  const guest=await browser.newPage({viewport:{width:390,height:844},isMobile:true});
  const guest2=await browser.newPage({viewport:{width:390,height:844},isMobile:true});
  for(const [name,page] of [['host',host],['guest',guest],['guest2',guest2]])page.on('pageerror',e=>errs.push(name+' '+e.message));
  await host.locator('[data-act="host"]').click();
  await host.waitForSelector('#invite-url',{timeout:20000});
  await until(host,()=>document.body.textContent.includes('参加者を待っています'),30000);
  const invite=await host.locator('#invite-url').inputValue();
  assert.match(invite,/^https:\/\/.+\/daifugo\/#r=[a-f0-9]{24}$/);
  await guest.goto(invite,{waitUntil:'domcontentloaded',timeout:45000});
  await guest2.goto(invite,{waitUntil:'domcontentloaded',timeout:45000});
  await until(guest,()=>DaifugoDebug.seat()>0,60000);
  await until(guest2,()=>DaifugoDebug.seat()>0,60000);
  await until(host,()=>document.querySelectorAll('.seat strong').length===4&&document.body.textContent.includes('参加中'),40000);
  const seats=[await guest.evaluate(()=>DaifugoDebug.seat()),await guest2.evaluate(()=>DaifugoDebug.seat())];
  assert.equal(new Set(seats).size,2,'two guests must get different seats');
  console.log('ROOM JOIN',seats);
  await host.locator('[data-act="start-online"]').click();
  for(const page of [host,guest,guest2])await until(page,()=>DaifugoDebug.screen()==='game',30000);
  const privateState=await guest.evaluate(()=>({role:DaifugoDebug.mode(),full:DaifugoDebug.full(),view:DaifugoDebug.view()}));
  assert.equal(privateState.role,'guest');
  assert.equal(privateState.full,null);
  assert.ok(privateState.view.hand.length>=13);
  assert.ok(privateState.view.players.every(p=>!Object.prototype.hasOwnProperty.call(p,'hand')));
  await host.locator('.play-card').first().click();
  await host.locator('[data-act="play"]').click();
  await until(guest,()=>DaifugoDebug.view()?.seq>1,30000);
  const first=await guest.evaluate(()=>DaifugoDebug.view());
  assert.equal(first.turn,1);
  const guest1=seats[0]===1?guest:guest2;
  const guest1move=await guest1.evaluate(()=>{
   const v=DaifugoDebug.view(),ctx={rules:v.ruleSummary,table:v.table,bound:v.bound,revolution:v.revolution,elevenBack:v.elevenBack};
   const selected=v.hand.find(c=>DaifugoEngine.choose(ctx,[c]));
   if(!selected)return null;
   document.querySelector('[data-id="'+selected.id+'"]').click();
   return selected.id;
  });
  if(guest1move){
   await guest1.locator('[data-act="play"]').click();
  }else{
   await guest1.locator('[data-act="pass"]').click();
  }
  await until(host,()=>DaifugoDebug.view()?.seq>=3,30000);
  await until(guest2,()=>DaifugoDebug.view()?.seq>=3,30000);
  const finalState=await host.evaluate(()=>({seq:DaifugoDebug.view().seq,turn:DaifugoDebug.view().turn,playCount:DaifugoDebug.view().log.length}));
  assert.deepEqual(errs,[]);
  console.log('DAIFUGO TWO-BROWSER ONLINE PASS',finalState);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
