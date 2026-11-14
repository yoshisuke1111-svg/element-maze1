
'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
async function waitFor(page,f,timeout=75000){await page.waitForFunction(f,null,{timeout});}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const host=await browser.newPage({viewport:{width:390,height:844},isMobile:true});
 const guest=await browser.newPage({viewport:{width:390,height:844},isMobile:true});
 const errors=[];for(const [kind,page] of [['host',host],['guest',guest]])page.on('pageerror',e=>errors.push(kind+': '+e.message));
 const base='https://yoshisuke1111-svg.github.io/element-maze1/shogi-v05/online.html';
 try{
  const response=await host.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
  console.log('Initial page:',response?.status(),await host.title());
  console.log('Initial app:',(await host.locator('#app').innerText().catch(()=>'' )).slice(0,300));
  await host.waitForSelector('[data-act="create"]',{timeout:22000}).catch(async error=>{console.error('UI INIT ERROR',await host.locator('body').innerText().catch(()=>''),errors);throw error;});
  await host.locator('[data-act="create"]').click();
  await host.waitForSelector('#room-url',{timeout:30000});
  await waitFor(host,()=>document.body.textContent.includes('参加者を待っています'),30000);
  const invitation=await host.locator('#room-url').inputValue();
  console.log('Room URL',invitation.replace(/#room=.*/,'#room=[redacted]'));
  assert.match(invitation,/^https:\/\/.+\/online\.html#room=[a-f0-9]{24}$/);
  await guest.goto(invitation,{waitUntil:'domcontentloaded',timeout:45000});
  await waitFor(host,()=>window.ShogiOnlineDebug?.isConnected()===true,80000);
  await waitFor(guest,()=>window.ShogiOnlineDebug?.isConnected()===true,35000);
  console.log('Room connected',await host.evaluate(()=>({role:ShogiOnlineDebug.getRole(),side:ShogiOnlineDebug.getState().turn})),
  await guest.evaluate(()=>({role:ShogiOnlineDebug.getRole(),side:ShogiOnlineDebug.getState().turn})));
  await host.locator('[data-act="cell"][data-square="56"]').click();
  await host.locator('[data-act="cell"][data-square="47"]').click();
  await waitFor(guest,()=>window.ShogiOnlineDebug?.getState()?.ply===1,22000);
  assert.equal(await guest.evaluate(()=>ShogiOnlineDebug.getState().board[47]?.t),'P');
  await guest.locator('[data-act="cell"][data-square="24"]').click();
  await guest.locator('[data-act="cell"][data-square="33"]').click();
  await waitFor(host,()=>window.ShogiOnlineDebug?.getState()?.ply===2,22000);
  assert.equal(await host.evaluate(()=>ShogiOnlineDebug.getState().board[33]?.t),'P');
  assert.equal(await host.locator('.cell.cpu-to').count(),1);
  assert.deepEqual(errors,[]);
  console.log('LIVE TWO-BROWSER SHOGI TEST PASSED');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
