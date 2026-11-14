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
  await solo.locator('#player-name').fill('テスト利用者');
  await solo.locator('[data-act="solo"]').click();
  await until(solo,()=>DaifugoDebug.screen()==='lobby');
  assert.equal(await solo.locator('#skill').count(),0,'CPU strength must not be displayed');
  await solo.locator('#room-players').selectOption('5');
  await solo.locator('#initial-cards').selectOption('10');
  assert.equal(await solo.locator('#room-players').inputValue(),'5');
  await solo.locator('[data-act="start-solo"]').click();
  await until(solo,()=>DaifugoDebug.screen()==='game');
  assert.equal(await solo.locator('.play-card').count(),10);
  assert.equal(await solo.evaluate(()=>DaifugoDebug.full().players.length),5);
  assert.equal(await solo.evaluate(()=>DaifugoDebug.full().initialCards),10);
  await solo.locator('.play-card').first().click();
  await solo.locator('[data-act="play"]').click();
  await until(solo,()=>DaifugoDebug.view()?.seq>=2);
  const soloV=await solo.evaluate(()=>({mode:DaifugoDebug.mode(),count:DaifugoDebug.view().hand.length,seq:DaifugoDebug.view().seq}));
  assert.equal(soloV.mode,'solo');assert.equal(soloV.count,9);
  console.log('CPU GAME OK',soloV);
  await solo.locator('[data-act="home"]').first().click();
  await solo.locator('[data-act="solo"]').click();
  await until(solo,()=>DaifugoDebug.screen()==='lobby');
  await solo.locator('#room-players').selectOption('4');
  await solo.locator('#initial-cards').selectOption('13');
  for(const rule of ['fiveSkip','sixBack','sevenGive','nineReverse','tenDiscard','capitalFall']){
    await solo.locator('[data-rule="'+rule+'"]').check();
  }
  await solo.locator('[data-act="start-solo"]').click();
  await until(solo,()=>DaifugoDebug.view()?.ruleSummary.sevenGive===true);
  await solo.evaluate(()=>{
    const p=DaifugoDebug.full().players[0];
    p.hand=[{id:'S7',suit:'S',rank:7},{id:'S4',suit:'S',rank:4},{id:'S5',suit:'S',rank:5}];
    DaifugoDebug.play(['S7']);
  });
  await until(solo,()=>DaifugoDebug.view()?.pending?.type==='give');
  assert.ok((await solo.locator('.special-banner').innerText()).includes('7渡し'));
  await solo.locator('[data-act="card"][data-id="S4"]').click();
  await solo.locator('[data-act="play"]').click();
  await until(solo,()=>DaifugoDebug.view()?.pending===null);
  assert.ok(await solo.evaluate(()=>DaifugoDebug.full().players[1].hand.some(x=>x.id==='S4')),'selected card must move to next player');
  console.log('7 GIVE UI OK');
  await solo.locator('[data-act="home"]').first().click();
  await solo.locator('[data-act="solo"]').click();
  await solo.locator('[data-act="start-solo"]').click();
  await solo.evaluate(()=>{
    const p=DaifugoDebug.full().players[0];
    p.hand=[{id:'S10',suit:'S',rank:10},{id:'S4',suit:'S',rank:4}];
    DaifugoDebug.play(['S10']);
  });
  await until(solo,()=>DaifugoDebug.view()?.pending?.type==='discard');
  assert.ok((await solo.locator('.special-banner').innerText()).includes('10捨て'));
  await solo.locator('[data-act="card"][data-id="S4"]').click();
  await solo.locator('[data-act="play"]').click();
  await until(solo,()=>DaifugoDebug.full()?.finishOrder.includes(0));
  console.log('10 DISCARD UI OK');
  const host=await boot(browser);
  const guest=await browser.newPage({viewport:{width:390,height:844},isMobile:true});
  const guest2=await browser.newPage({viewport:{width:390,height:844},isMobile:true});
  for(const [name,page] of [['host',host],['guest',guest],['guest2',guest2]])page.on('pageerror',e=>errs.push(name+' '+e.message));
  const code='大富豪-'+require('node:crypto').randomBytes(4).toString('hex').toUpperCase();
  assert.equal(await host.evaluate(()=>DaifugoDebug.normalizeRoomCode('放課後-１')),'放課後-1');
  await host.locator('[data-act="host"]').click();
  assert.ok(await host.locator('#room-error').isVisible(),'blank code must be rejected');
  await host.locator('#create-room-code').fill(code);
  await host.locator('[data-act="host"]').click();
  await host.waitForSelector('#room-code-display',{timeout:20000});
  await until(host,()=>document.body.textContent.includes('参加者を待っています'),30000);
  assert.equal(await host.locator('#room-code-display').inputValue(),code);
  await host.locator('#room-players').selectOption('6');
  await host.locator('#initial-cards').selectOption('8');
  await host.locator('[data-rule="capitalFall"]').check();
  assert.equal(await host.locator('.seat-grid .seat').count(),6);
  assert.equal(await host.evaluate(()=>DaifugoDebug.roomSettings().initialCards),8);
  for(const participant of [guest,guest2]){
    await participant.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
    await participant.waitForSelector('[data-act="join"]',{timeout:30000});
    await participant.locator('#join-room-code').fill(code);
    await participant.locator('[data-act="join"]').click();
  }
  await until(guest,()=>DaifugoDebug.seat()>0,60000);
  await until(guest2,()=>DaifugoDebug.seat()>0,60000);
  await until(host,()=>document.querySelectorAll('.seat strong').length===6&&document.body.textContent.includes('参加中'),40000);
  await until(guest,()=>DaifugoDebug.roomSettings().playerCount===6&&DaifugoDebug.roomSettings().initialCards===8);
  assert.ok((await guest.locator('body').innerText()).includes('8枚 / 人'));
  const seats=[await guest.evaluate(()=>DaifugoDebug.seat()),await guest2.evaluate(()=>DaifugoDebug.seat())];
  assert.equal(new Set(seats).size,2,'two guests must get different seats');
  console.log('ROOM JOIN',seats);
  await host.locator('[data-act="start-online"]').click();
  for(const page of [host,guest,guest2])await until(page,()=>DaifugoDebug.screen()==='game',30000);
  const privateState=await guest.evaluate(()=>({role:DaifugoDebug.mode(),full:DaifugoDebug.full(),view:DaifugoDebug.view()}));
  assert.equal(privateState.role,'guest');
  assert.equal(privateState.full,null);
  assert.equal(privateState.view.hand.length,8);
  assert.equal(privateState.view.players.length,6);
  assert.equal(await host.evaluate(()=>DaifugoDebug.full().players.every(p=>p.hand.length===8)),true);
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
  console.log('DAIFUGO CODE ROOM ONLINE PASS',finalState,code);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
