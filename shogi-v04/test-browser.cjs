/* Browser acceptance test for the deployed v0.4 engine */
'use strict';
const assert = require('node:assert/strict');
const { chromium }=require('playwright');
(async()=>{
  const browser=await chromium.launch({
    executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome',
    headless:true,
    args:['--no-sandbox','--disable-dev-shm-usage']
  });
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  const url=process.env.SHOGI_URL || 'https://yoshisuke1111-svg.github.io/element-maze1/shogi-v04/';
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:35000});
  await page.waitForFunction(()=>window.crossOriginIsolated===true,{timeout:30000});
  await page.waitForSelector('[data-act="launch"]',{timeout:15000});
  await page.locator('[data-act="side"][data-value="-1"]').click();
  await page.locator('[data-act="preset"][data-level="100"]').click();
  await page.locator('#home-clock').selectOption('3');
  const slider=page.locator('#home-time');
  await slider.evaluate(el=>{
    el.value='2';
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.locator('[data-act="launch"]').click();
  await page.waitForFunction(()=>{
    const board=document.querySelector('.board');
    const record=document.querySelectorAll('.record-item');
    return board && board.querySelectorAll('.cell').length===81 && record.length>=1;
  },{timeout:65000});
  const view=await page.evaluate(()=>({
    status:window.ShogiLabDebug.getEngineStatus(),
    lastMoves:[...document.querySelectorAll('.record-item')].map(x=>x.textContent),
    arrows:document.querySelectorAll('.cell.cpu-from,.cell.cpu-to').length,
    width:document.documentElement.scrollWidth,
    viewport:innerWidth,
    isolated:crossOriginIsolated,
  }));
  console.log('Browser result:',JSON.stringify(view));
  assert.equal(view.isolated,true,'browser must be cross-origin isolated');
  assert.equal(view.status.engineKind,'WASM','must use the WASM engine');
  assert.ok(view.status.strongStatus.includes('Fairy-Stockfish'));
  assert.equal(view.arrows,2,'CPU move must be highlighted from/to');
  assert.ok(view.width<=view.viewport,'no mobile horizontal overflow');
  assert.equal(await page.evaluate(()=>ShogiLabDebug.getClock().limit),3);
  assert.equal(await page.locator('[data-clock-side]').count(),2,'two chess clocks must be displayed');
  await page.evaluate(()=>{const s=ShogiLabDebug.getSession();s.s.hands[s.side].P=2;});
  await page.locator('[data-act="help"]').click();
  await page.locator('[data-act="modal-close"]').click();
  assert.ok(await page.locator('.hand-koma').count()>0,'captured-piece illustration must appear');
  await page.evaluate(()=>{
    const s=ShogiLabDebug.getSession();s.remaining[s.s.turn]=650;s.clockAt=Date.now();
  });
  await page.waitForFunction(()=>ShogiLabDebug.getSession().done===true,{timeout:8000});
  assert.ok((await page.locator('.board-result-heading').innerText()).includes('敗北'));
  assert.ok((await page.locator('.board-result-detail').innerText()).includes('時間切れ'));
  assert.deepEqual(errors,[],'no JavaScript runtime errors');
  await browser.close();
  console.log('Browser WASM SHOGI PASS - clock, result overlay and captured piece icon');
})().catch(e=>{console.error(e);process.exit(1);});
