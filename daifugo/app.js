/* 大富豪 — mobile UI, 4-player CPU play, invite-only WebRTC rooms */
(()=>{
'use strict';
const E=window.DaifugoEngine,root=document.getElementById('app');
if(!E||!root){document.body.textContent='大富豪を読み込めませんでした。';return;}
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const nickname=x=>String(x||'').trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,16)||'プレイヤー';
const drawCode=()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),n=>n.toString(16).padStart(2,'0')).join('');
const codeValid=x=>/^[a-f0-9]{24}$/.test(x||'');
function normalizeRoomCode(value){
 const code=String(value||'').normalize('NFKC').trim().replace(/\s+/g,'').toUpperCase();
 if(!code)throw Error('部屋コードを入力してください。');
 if([...code].length<3||[...code].length>16)throw Error('部屋コードは3〜16文字で入力してください。');
 if(!/^[\p{L}\p{N}_-]+$/u.test(code))throw Error('部屋コードは文字・数字・-・_だけ使えます。');
 return code;
}
async function destPeer(code){
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('daifugo-code-01:'+code)));
 return 'daifugo-custom-'+Array.from(digest.slice(0,16),v=>v.toString(16).padStart(2,'0')).join('');
}
const rankLabel=card=>card.rank===16?'JOKER':E.LABEL[card.rank];
const suitLabel=card=>card.rank===16?'':E.SUIT_LABEL[card.suit]||'';
let initial={};
try{initial=JSON.parse(localStorage.getItem('daifugo-options-1')||'{}')||{};}catch{}
let options=E.settings(initial);
const CPU_DEFAULT_SKILL=65; // 強さは非公開固定値。後日管理画面で設定する。
let myName=nickname(initial.myName||'あなた');
let roomPlayers=4,initialCards=13;
const maxInitial=()=>Math.min(13,Math.floor((52+options.jokers)/roomPlayers));
const publicSettings=()=>({playerCount:roomPlayers,initialCards,rules:{...options}});
function setRoomSettings(data){
 if(!data||!Number.isInteger(data.playerCount)||data.playerCount<2||data.playerCount>6)return;
 roomPlayers=data.playerCount;
 options=E.settings(data.rules||{});
 initialCards=clamp(Number(data.initialCards)||13,1,maxInitial());
}

let mode='home',screen='home',full=null,display=null,mySeat=0;
let chosen=new Set(),message='',error='',roomCode='',lobbySeats=[],roomReady=false,linked=false;
let hostPeer=null,clientPeer=null,guestConn=null,connections=new Map(),tickets=new Map();
let guestTicket='',generation=0,cpuTimer=null,guestLoading=false;
const P=()=>window.Peer||window.peerjs?.Peer;
function persist(){try{localStorage.setItem('daifugo-options-1',JSON.stringify({...options,myName}));}catch{}}
function cancelThinking(){if(cpuTimer){clearTimeout(cpuTimer);cpuTimer=null;}}
function stopNetworking(){
 generation++;cancelThinking();
 if(guestConn){try{guestConn.close();}catch{}guestConn=null;}
 for(const c of connections.values())try{c.close();}catch{}
 connections.clear();tickets.clear();
 if(hostPeer){try{hostPeer.destroy();}catch{}hostPeer=null;}
 if(clientPeer){try{clientPeer.destroy();}catch{}clientPeer=null;}
 linked=false;roomReady=false;guestLoading=false;
}
function menu(){
 stopNetworking();mode='home';screen='home';full=null;display=null;mySeat=0;
 roomCode='';chosen.clear();error='';message='';lobbySeats=[];
 if(location.hash)history.replaceState(null,'',location.pathname+location.search);
 render();
}
function startSolo(){
 rememberName();stopNetworking();
 mode='solo';screen='lobby';mySeat=0;roomCode='';
 lobbySeats=[{id:0,name:myName,connected:true}];full=null;display=null;
 chosen.clear();message='';error='';render();
}
function startSoloGame(){
 if(mode!=='solo'||screen!=='lobby')return;
 const people=Array.from({length:roomPlayers},(_,i)=>({name:i===0?myName:'CPU '+i,isCPU:i!==0}));
 try{
  full=E.newGame({rules:options,players:people,initialCards});
  display=E.publicView(full,0);screen='game';
  chosen.clear();message='';error='';render();scheduleCPU();
 }catch(e){error=e.message;render();}
}
function rememberName(){const f=document.getElementById('player-name');if(f)myName=nickname(f.value);persist();}
async function freshHost(){
 let code;
 try{code=normalizeRoomCode(document.getElementById('create-room-code')?.value);}
 catch(e){const field=document.getElementById('room-error');if(field){field.textContent=e.message;field.style.display='block';}return;}
 rememberName();stopNetworking();mode='host';screen='lobby';roomCode=code;
 lobbySeats=[{id:0,name:myName,connected:true}];full=null;display=null;mySeat=0;
 chosen.clear();roomReady=false;message='部屋を作成しています…';error='';render();
 const C=P();if(!C){error='通信ライブラリを読み込めませんでした。';render();return;}
 const mark=generation;
 try{
  const peerId=await destPeer(roomCode);
  if(mark!==generation)return;
  hostPeer=new C(peerId);
  hostPeer.on('open',()=>{
   if(mark!==generation)return;roomReady=true;message='参加者を待っています。';error='';render();
  });
  hostPeer.on('connection',c=>acceptGuest(c,mark));
  hostPeer.on('error',e=>{
   if(mark!==generation)return;
   error=e?.type==='unavailable-id'?'この部屋コードは使用中です。別のコードを指定してください。':'通信サービスに接続できませんでした。';
   render();
  });
  hostPeer.on('disconnected',()=>{
   if(mark!==generation)return;roomReady=false;message='通信サービスに再接続しています…';
   try{hostPeer.reconnect();}catch{}render();
  });
 }catch(e){error='部屋を作成できませんでした。';render();}
}
function roomRoster(){
 return Array.from({length:roomPlayers},(_,seat)=>{
  const p=lobbySeats.find(p=>p.id===seat);
  return p?{id:seat,name:p.name,connected:p.connected}:{id:seat,name:'参加待ち',connected:false};
 });
}
function acceptGuest(c,mark){
 if(mark!==generation){try{c.close();}catch{}return;}
 let assigned=-1,auth=false;
 c.on('open',()=>{});
 c.on('data',data=>{
  if(mark!==generation||!data||typeof data!=='object')return;
  if(!auth&&data.t==='hello'){
   const ticket=String(data.ticket||'');
   if(!codeValid(ticket)){try{c.send({t:'refused',reason:'接続情報が不正です。'});}catch{}c.close();return;}
   let found=-1;
   for(const [seat,t] of tickets.entries())if(t===ticket)found=seat;
   if(found===-1){
    if(screen!=='lobby'){try{c.send({t:'refused',reason:'すでに対局が始まっています。'});}catch{}c.close();return;}
    for(let seat=1;seat<roomPlayers;seat++)if(!tickets.has(seat)){found=seat;break;}
   }
   if(found<0){try{c.send({t:'refused',reason:'部屋が満員です。'});}catch{}c.close();return;}
   const previous=connections.get(found);
   if(previous&&previous!==c)try{previous.close();}catch{}
   tickets.set(found,ticket);connections.set(found,c);assigned=found;auth=true;
   const n=nickname(data.name);
   const existing=lobbySeats.find(x=>x.id===found);
   if(existing){existing.connected=true;existing.name=n;}
   else lobbySeats.push({id:found,name:n,connected:true});
   try{c.send({t:'welcome',seat:found,room:roomCode});}catch{}
   if(full){
    full.players[found].isCPU=false;
    sendStateTo(found);broadcastState();
    scheduleCPU();
   }else broadcastLobby();
   message='';error='';render();return;
  }
  if(!auth||assigned<1||connections.get(assigned)!==c)return;
  if(data.t==='move'){
   if(!full||full.phase!=='playing'||full.turn!==assigned||!Number.isInteger(data.seq)||data.seq!==full.seq||!Array.isArray(data.ids)){
    sendStateTo(assigned);return;
   }
   try{E.move(full,assigned,data.ids);afterMutation();}
   catch(e){try{c.send({t:'reject',reason:String(e?.message||'カードが出せません。')});}catch{}sendStateTo(assigned);}
  }else if(data.t==='special'){
   if(!full||full.phase!=='playing'||!full.pending||full.pending.owner!==assigned||data.seq!==full.seq||!Array.isArray(data.ids)){
    sendStateTo(assigned);return;
   }
   try{E.resolveSpecial(full,assigned,data.ids);afterMutation();}
   catch(e){try{c.send({t:'reject',reason:String(e?.message||'カードの選択が不正です。')});}catch{}sendStateTo(assigned);}
  }else if(data.t==='pass'){
   if(!full||full.turn!==assigned||data.seq!==full.seq){sendStateTo(assigned);return;}
   try{E.pass(full,assigned);afterMutation();}
   catch(e){try{c.send({t:'reject',reason:String(e?.message||'パスできません。')});}catch{}sendStateTo(assigned);}
  }
 });
 c.on('close',()=>{
  if(mark!==generation||assigned<1||connections.get(assigned)!==c)return;
  connections.delete(assigned);
  const item=lobbySeats.find(x=>x.id===assigned);
  if(item)item.connected=false;
  if(!full)broadcastLobby();else{broadcastState();scheduleCPU();}
  message='参加者の接続が切れました。';render();
 });
 c.on('error',()=>{try{c.close();}catch{}});
}
function broadcastLobby(){
 const seats=roomRoster(),settings=publicSettings();
 for(const c of connections.values())if(c.open)try{c.send({t:'lobby',roster:seats,settings});}catch{}
 render();
}
function sendStateTo(seat){
 const c=connections.get(seat);
 if(!c?.open||!full)return;
 // Only the seat's own hand is sent. Never send full.
 try{c.send({t:'state',view:E.publicView(full,seat)});}catch{}
}
function broadcastState(){
 if(!full)return;
 display=E.publicView(full,0);
 for(const seat of connections.keys())sendStateTo(seat);
 render();
}
function startHost(){
 if(!roomReady)return;
 const people=Array.from({length:roomPlayers},(_,seat)=>{
  const slot=lobbySeats.find(s=>s.id===seat);
  return {name:slot?slot.name:'CPU '+seat,isCPU:seat!==0&&!slot?.connected};
 });
 full=E.newGame({rules:options,players:people,initialCards});screen='game';chosen.clear();
 display=E.publicView(full,0);message='';broadcastState();scheduleCPU();
}
async function beginJoin(value){
 let code;
 try{code=normalizeRoomCode(value);}
 catch(e){const field=document.getElementById('room-error');if(field){field.textContent=e.message;field.style.display='block';}return;}
 rememberName();stopNetworking();mode='guest';screen='lobby';roomCode=code;mySeat=-1;
 chosen.clear();full=null;display=null;roomReady=false;linked=false;
 lobbySeats=[];error='';message='部屋に接続しています…';guestLoading=true;
 try{
  guestTicket=sessionStorage.getItem('daifugo-ticket-'+code)||drawCode();
  sessionStorage.setItem('daifugo-ticket-'+code,guestTicket);
 }catch{guestTicket=drawCode();}
 render();
 const C=P();if(!C){error='通信ライブラリを読み込めませんでした。';render();return;}
 const mark=generation;
 try{
  const peerId=await destPeer(roomCode);
  if(mark!==generation)return;
  clientPeer=new C();
  clientPeer.on('open',()=>{
   if(mark!==generation)return;
   const c=clientPeer.connect(peerId,{reliable:true,serialization:'json'});
   guestConn=c;bindGuest(c,mark);
  });
  clientPeer.on('error',e=>{
   if(mark!==generation)return;
   linked=false;guestLoading=false;
   error=e?.type==='peer-unavailable'?'部屋が見つかりません。部屋主が待機中か確認してください。':'接続できませんでした。';
   render();
  });
 }catch(e){error='入室できませんでした。';guestLoading=false;render();}
}
function bindGuest(c,mark){
 c.on('open',()=>{
  if(mark!==generation||guestConn!==c)return;
  try{c.send({t:'hello',ticket:guestTicket,name:myName});}catch{}
  message='部屋に参加しています…';render();
 });
 c.on('data',data=>{
  if(mark!==generation||guestConn!==c||!data||typeof data!=='object')return;
  if(data.t==='refused'){
   error=String(data.reason||'入室できませんでした。').slice(0,90);
   linked=false;guestLoading=false;c.close();render();return;
  }
  if(data.t==='welcome'){
   mySeat=data.seat;linked=true;guestLoading=false;error='';message='入室しました。';
   render();return;
  }
  if(data.t==='lobby'){
   lobbySeats=Array.isArray(data.roster)?data.roster:[];
   setRoomSettings(data.settings);
   screen='lobby';linked=true;message='部屋主の対局開始を待っています。';render();return;
  }
  if(data.t==='state'){
   const v=data.view;
   if(!v||!Array.isArray(v.players)||!Array.isArray(v.hand)||v.seat!==mySeat||v.players.length<2||v.players.length>6)return;
   display=v;screen='game';linked=true;guestLoading=false;
   chosen.clear();message='';error='';render();return;
  }
  if(data.t==='reject'){error=String(data.reason||'指し手が認められませんでした。').slice(0,90);chosen.clear();render();}
 });
 c.on('close',()=>{
  if(mark!==generation||guestConn!==c)return;
  linked=false;guestLoading=false;guestConn=null;
  error='通信が切れました。「再接続」を押してください。';render();
 });
 c.on('error',()=>{try{c.close();}catch{}});
}
function afterMutation(){
 if(!full)return;
 chosen.clear();error='';message='';
 broadcastState();scheduleCPU();
}
function play(ids){
 if(!display||display.phase!=='playing'||display.turn!==mySeat)return;
 if(mode==='guest'){
  if(!linked||!guestConn?.open)return;
  try{guestConn.send({t:'move',ids,seq:display.seq});message='送信しています…';chosen.clear();render();}
  catch{error='指し手を送信できませんでした。';render();}
 }else{
  try{E.move(full,0,ids);afterMutation();}
  catch(e){error=e.message;render();}
 }
}
function resolveLocal(ids){
 if(!display||!display.pending||display.pending.owner!==mySeat)return;
 if(mode==='guest'){
  if(!linked||!guestConn?.open)return;
  try{guestConn.send({t:'special',ids,seq:display.seq});chosen.clear();message='特殊効果を送信しています…';render();}
  catch{error='カードを送信できませんでした。';render();}
 }else{
  try{E.resolveSpecial(full,0,ids);afterMutation();}
  catch(e){error=e.message;render();}
 }
}
function pass(){
 if(!display||display.pending||display.phase!=='playing'||display.turn!==mySeat||!display.table)return;
 if(mode==='guest'){
  if(!linked||!guestConn?.open)return;
  try{guestConn.send({t:'pass',seq:display.seq});chosen.clear();message='送信しています…';render();}
  catch{error='パスを送信できませんでした。';render();}
 }else{
  try{E.pass(full,0);afterMutation();}
  catch(e){error=e.message;render();}
 }
}
function scheduleCPU(){
 cancelThinking();
 if(!full||full.phase!=='playing'||(mode!=='solo'&&mode!=='host'))return;
 const seat=full.turn,remote=seat!==0&&mode==='host'&&connections.get(seat)?.open;
 if(seat===0||remote)return;
 const temporary=mode==='host'&&seat!==0&&!full.players[seat].isCPU;
 const mark=generation,seq=full.seq;
 cpuTimer=setTimeout(()=>{
  if(mark!==generation||!full||full.phase!=='playing'||full.seq!==seq)return;
  if(mode==='host'&&connections.get(seat)?.open)return;
  try{
   if(full.pending){
    E.resolveSpecial(full,seat,E.pickCPUSpecial(full,seat));
   }else{
    const ids=E.pickCPU(full,seat,CPU_DEFAULT_SKILL);
    if(ids)E.move(full,seat,ids);
    else E.pass(full,seat);
   }
   afterMutation();
  }catch(e){
   console.error('CPU turn failed',e);
   error='CPUの処理でエラーが発生しました。';render();
  }
 },temporary?6500:600);
}
function nextRound(){
 if(!full||full.phase!=='results')return;
 E.startRound(full,full.lastRanking);
 screen='game';message='次の対局を開始しました。';afterMutation();
}
function selectionStatus(){
 if(!display)return {ok:false,text:''};
 if(display.pending?.owner===mySeat){
  const effect=display.pending,kind=effect.type==='give'?'渡す':'捨てる';
  if(chosen.size!==effect.max)return {ok:false,text:kind+'カードを '+effect.max+' 枚選んでください（現在 '+chosen.size+' 枚）'};
  if(display.hand.filter(c=>chosen.has(c.id)).length!==chosen.size)return {ok:false,text:'手札からカードを選んでください。'};
  return {ok:true,text:kind+'カード '+effect.max+' 枚を選択しました'};
 }
 if(chosen.size===0)return {ok:false,text:'カードを選択してください。'};
 const cards=display.hand.filter(c=>chosen.has(c.id));
 if(cards.length!==chosen.size)return {ok:false,text:'カードを選択してください。'};
 const context={table:display.table,bound:display.bound,rules:display.ruleSummary,revolution:display.revolution,elevenBack:display.elevenBack,sixBack:display.sixBack};
 const comb=E.choose(context,cards);
 if(!comb)return {ok:false,text:'この組み合わせは出せません。'};
 return {ok:true,text:comb.type==='run'?'階段 '+cards.length+'枚':cards.length===1?'1枚':cards.length+'枚組'};
}
function card(c,selected=false,disabled=false){
 const joker=c.rank===16,red=c.suit==='H'||c.suit==='D';
 const title=joker?'JOKER':rankLabel(c)+suitLabel(c);
 return '<button type="button" class="play-card '+(joker?'joker ':red?'red ':'')+(selected?'selected':'')+'" data-act="card" data-id="'+esc(c.id)+'" aria-label="'+esc(title)+(selected?' 選択中':'')+'" '+(disabled?'disabled':'')+'>'+
 '<span class="corner">'+(joker?'★':rankLabel(c))+'<span>'+suitLabel(c)+'</span></span>'+
 '<span class="center-suit">'+(joker?'★':suitLabel(c))+'</span>'+
 '<span class="bottom-corner">'+(joker?'J':rankLabel(c))+'</span></button>';
}
function tableCard(c){
 const red=c.suit==='H'||c.suit==='D',joker=c.rank===16;
 return '<div class="table-card '+(joker?'joker ':red?'red':'')+'"><strong>'+esc(rankLabel(c))+'</strong><span>'+esc(suitLabel(c)||'★')+'</span></div>';
}
function participant(p,index){
 const turn=display?.turn===p.id&&display.phase==='playing';
 const place=display?.finishOrder.indexOf(p.id);
 return '<div class="opponent '+(turn?'now':'')+'"><div class="avatar">'+(p.isCPU?'C':(p.id===mySeat?'自':'人'))+'</div><div class="opponent-info"><strong>'+esc(p.name)+'</strong>'+
 '<small>'+(place>=0?E.placeName(place,display.players.length):(p.isCPU?'CPU':'プレイヤー'))+'</small></div>'+
 '<span class="card-count">'+p.count+'枚</span>'+(turn?'<span class="turn-dot"></span>':'')+'</div>';
}
function gameMarkup(){
 const v=display;if(!v)return '<div class="panel">対局情報を読み込んでいます。</div>';
 const mine=v.players[mySeat]||v.players[0],isTurn=v.phase==='playing'&&v.turn===mySeat;
 const other=Array.from({length:v.players.length-1},(_,i)=>v.players[(mySeat+i+1)%v.players.length]);
 const sel=selectionStatus(),allow=isTurn&&(mode!=='guest'||linked);
 const table=v.table,owner=table?v.players[table.owner]:null;
 const status=v.phase==='results'?'対局終了':!linked&&mode==='guest'?'通信が切れています':v.pending?(v.pending.owner===mySeat?'特殊効果のカードを選択':v.players[v.pending.owner]?.name+' がカードを選択中'):isTurn?'あなたの手番':v.players[v.turn]?.name+'の手番';
 const chips=[v.revolution?'革命中':'通常',v.elevenBack?'11バック':'',v.sixBack?'6戻し':'',v.direction===-1?'逆回り':'',v.bound?'縛り '+v.bound:''].filter(Boolean);
 const special=v.pending?.owner===mySeat?v.pending:null;
 const prompt=special?(special.type==='give'?'7渡し：'+v.players[special.target]?.name+' に渡すカードを '+special.max+' 枚選択':'10捨て：捨てるカードを '+special.max+' 枚選択'):null;
 return '<div class="game-shell"><section class="board-main"><div class="game-title"><div><div class="eyebrow">'+(mode==='solo'?'CPU対戦':'オンライン対戦')+' ・ 第'+v.round+'回戦</div><h2>'+esc(status)+'</h2></div><button class="small-button" data-act="home">退出</button></div>'+
 '<div class="players-top" style="--opponents:'+other.length+'">'+other.map((p,i)=>participant(p,i)).join('')+'</div>'+
 '<div class="table-area"><div class="table-head"><span>'+(table?esc(owner?.name||'')+' が出したカード':'場は空です')+'</span><span>'+chips.map(x=>'<em>'+esc(x)+'</em>').join('')+'</span></div>'+
 '<div class="played-area">'+(table?table.cards.map(tableCard).join(''):'<div class="empty-table">新しい場</div>')+'</div>'+
 '<div class="table-meta">'+(table?(table.type==='run'?'階段':'同じ数字')+' ・ '+table.count+'枚':'好きなカードから出せます')+'</div></div>'+
 '<div class="my-zone">'+(prompt?'<div class="special-banner">'+esc(prompt)+'</div>':'')+'<div class="my-zone-head"><div><strong>'+esc(myName)+'</strong><span>'+mine.count+'枚</span></div><small>'+(special?'指定された枚数のカードを選んで確定':isTurn?'カードを選んで「出す」を押してください':'手番を待っています')+'</small></div>'+
 '<div class="myhand">'+v.hand.map(c=>card(c,chosen.has(c.id),!allow)).join('')+'</div>'+
 '<div class="my-action"><div class="validation '+(sel.ok?'ok':'')+'">'+esc(sel.text)+'</div><div class="play-buttons"><button data-act="play" class="action-primary" '+(!allow||!sel.ok?'disabled':'')+'>'+(special?(special.type==='give'?'渡す':'捨てる'):'出す')+'</button>'+(special?'':'<button data-act="pass" class="action-secondary" '+(!allow||!table?'disabled':'')+'>パス</button>')+'<button data-act="clear-select" class="action-quiet" '+(!chosen.size?'disabled':'')+'>選択解除</button></div></div></div>'+
 (v.phase==='results'?resultsMarkup(v):'')+'</section>'+
 '<aside class="side-bar"><section class="panel"><div class="panel-head">対局情報</div><div class="info-item"><span>手番</span><strong>'+esc(status)+'</strong></div><div class="info-item"><span>場</span><strong>'+(table?table.count+'枚':'なし')+'</strong></div>'+
 '<div class="info-item"><span>ルール</span><strong>'+chips.join(' / ')+'</strong></div>'+
 (mode==='host'?'<div class="info-item"><span>部屋コード</span><strong>'+esc(roomCode)+'</strong></div><button class="sub-button" data-act="copy">コードをコピー</button>':mode==='guest'?'<div class="info-item"><span>部屋コード</span><strong>'+esc(roomCode)+'</strong></div>':'')+
 (mode==='guest'?'<div class="info-item"><span>接続</span><strong>'+(linked?'オンライン':'切断')+'</strong></div>'+(linked?'':'<button class="sub-button" data-act="reconnect">再接続</button>'):'')+
 '</section><section class="panel"><div class="panel-head">履歴</div><div class="logs">'+v.log.slice(-16).map(entry=>'<div>'+esc(entry.text)+'</div>').join('')+'</div></section>'+
 '<div class="soft-note">カードは複数選択できます。革命・8切り・縛りなどは部屋の設定に従います。</div></aside></div>'+
 (error?'<div class="toast error">'+esc(error)+'</div>':message?'<div class="toast">'+esc(message)+'</div>':'');
}
function resultsMarkup(v){
 return '<section class="panel rankings"><h3>順位</h3><div class="ranking-grid">'+v.finishOrder.map((seat,i)=>
 '<div><span class="rank-digit">'+(i+1)+'</span><strong>'+esc(v.players[seat].name)+'</strong><small>'+E.placeName(i,v.players.length)+'</small></div>').join('')+'</div>'+
 (mode==='guest'?'<p class="hint">部屋主が次の対局を開始します。</p>':'<button class="action-primary" data-act="next-round">次の対局へ</button>')+
 '<p class="hint">2回戦以降は順位に応じたカード交換を自動で行います（設定時）。</p></section>';
}
function ruleControlMarkup(){
 const rules=[
 ['revolution','革命'],['eightCut','8切り'],['shibari','縛り'],['stairs','階段'],['elevenBack','11バック'],
 ['stairRevolution','階段革命'],['spadeThree','スペ3返し'],['exchange','順位によるカード交換'],
 ['fiveSkip','5飛ばし'],['sixBack','6戻し'],['sevenGive','7渡し'],['nineReverse','9リバース'],
 ['tenDiscard','10捨て'],['capitalFall','都落ち']
 ];
 return '<div class="rule-grid">'+rules.map(([id,label])=>'<label class="rule-option"><input type="checkbox" data-rule="'+id+'" '+(options[id]?'checked':'')+'><span>'+label+'</span></label>').join('')+'</div>';
}
function hostRoomSettingsMarkup(){
 const max=maxInitial();
 return '<section class="panel settings"><div class="panel-head">部屋の設定</div>'+
 '<div class="room-config-grid"><label class="field-label" for="room-players">対局人数<select id="room-players">'+Array.from({length:5},(_,i)=>i+2).map(n=>'<option value="'+n+'" '+(n===roomPlayers?'selected':'')+'>'+n+'人</option>').join('')+'</select></label>'+
 '<label class="field-label" for="initial-cards">最初の手札<select id="initial-cards">'+Array.from({length:max},(_,i)=>i+1).map(n=>'<option value="'+n+'" '+(n===initialCards?'selected':'')+'>'+n+'枚 / 人</option>').join('')+'</select></label>'+
 '<label class="field-label" for="jokers">ジョーカー<select id="jokers">'+[0,1,2].map(n=>'<option value="'+n+'" '+(n===options.jokers?'selected':'')+'>'+n+'枚</option>').join('')+'</select></label></div>'+
 '<div class="soft-note">人数に応じて手札の上限が変わります。使わないカードは山札に残し、対局では使用しません。</div>'+
 '<div class="panel-head rules-title">ローカルルール</div>'+ruleControlMarkup()+
 '<div class="soft-note">7渡し：次の人に手札を渡す。10捨て：カードを選んで捨てる。5飛ばし・6戻し・9リバース・都落ちも個別に選べます。</div></section>';
}
function guestRoomSettingsMarkup(){
 const cfg=publicSettings();
 const names=[['revolution','革命'],['eightCut','8切り'],['shibari','縛り'],['stairs','階段'],['elevenBack','11バック'],
 ['stairRevolution','階段革命'],['spadeThree','スペ3返し'],['exchange','カード交換'],
 ['fiveSkip','5飛ばし'],['sixBack','6戻し'],['sevenGive','7渡し'],['nineReverse','9リバース'],
 ['tenDiscard','10捨て'],['capitalFall','都落ち']];
 const enabled=names.filter(([key])=>cfg.rules[key]).map(([,label])=>label);
 return '<section class="panel"><div class="panel-head">部屋の設定</div><div class="info-item"><span>対局人数</span><strong>'+cfg.playerCount+'人</strong></div>'+
 '<div class="info-item"><span>最初の手札</span><strong>'+cfg.initialCards+'枚 / 人</strong></div>'+
 '<div class="info-item"><span>ジョーカー</span><strong>'+cfg.rules.jokers+'枚</strong></div>'+
 '<p class="soft-note">採用ルール：'+esc(enabled.join('・')||'なし')+'</p><p class="hint">設定は部屋主のみ変更できます。</p></section>';
}
function homeMarkup(){
 return '<section class="home-content"><div class="home-header"><h1>大富豪</h1></div>'+
 '<section class="panel name-panel"><label class="field-label" for="player-name">プレイヤー名</label><input id="player-name" maxlength="16" value="'+esc(myName)+'" placeholder="名前を入力"></section>'+
 '<div class="mode-grid"><section class="panel mode-card"><div class="mode-title">CPU対戦</div><p>CPUとの練習対局</p><button class="action-primary" data-act="solo">CPU対戦の設定へ</button></section>'+
 '<section class="panel mode-card"><div class="mode-title">オンライン対戦</div><label class="field-label" for="create-room-code">部屋を作る</label><input id="create-room-code" maxlength="40" placeholder="部屋コード（3〜16文字）" autocapitalize="characters"><button class="action-primary" data-act="host">部屋を作成</button>'+
 '<label class="field-label" for="join-room-code">部屋に参加</label><input id="join-room-code" maxlength="40" placeholder="部屋コードを入力" autocapitalize="characters"><button class="action-secondary" data-act="join">コードで入室</button><p id="room-error" class="error-note" role="alert" style="display:none"></p></section></div></section>';
}
function waitingMarkup(){
 if(mode==='guest'){
  return '<div class="lobby"><section class="panel"><h1>部屋に参加</h1><h2>'+(!linked?'接続中':'対局開始待ち')+'</h2><p class="muted">'+esc(message||'部屋主の開始を待っています。')+'</p>'+
 (error?'<div class="error-note">'+esc(error)+'</div>':'')+
 '<p class="soft-note">部屋コード：<strong>'+esc(roomCode)+'</strong></p><div class="seat-grid">'+lobbySeats.map(p=>'<div class="seat"><span>席 '+(p.id+1)+'</span><strong>'+esc(p.name)+'</strong><small>'+(p.connected?'参加中':'未接続')+'</small></div>').join('')+'</div>'+
 '<div class="room-actions"><button class="action-secondary" data-act="reconnect" '+(guestLoading?'disabled':'')+'>再接続する</button><button class="action-quiet" data-act="home">戻る</button></div></section>'+guestRoomSettingsMarkup()+'</div>';
 }
 if(mode==='solo'){
  return '<div class="lobby"><section class="panel"><h1>CPU対戦の設定</h1><p class="soft-note">対局の人数とルールを選んでください。</p></section>'+
 hostRoomSettingsMarkup()+
 '<section class="panel"><button class="action-primary start-button" data-act="start-solo">対局を開始</button><button class="action-quiet" data-act="home">戻る</button></section></div>';
 }
 const roster=roomRoster();
 return '<div class="lobby"><section class="panel"><div class="panel-head">オンライン対戦</div><h1>部屋を作成</h1><div class="room-state">'+(roomReady?'参加者を待っています':'通信サービスへ接続中…')+'</div>'+
 (error?'<div class="error-note">'+esc(error)+'</div>':'')+
 '<label class="field-label" for="room-code-display">部屋コード</label><input id="room-code-display" readonly value="'+esc(roomCode)+'"><div class="room-actions"><button class="action-primary" data-act="copy">コードをコピー</button><button class="action-quiet" data-act="home">戻る</button></div>'+
 '<h3>参加者</h3><div class="seat-grid">'+roster.map(p=>'<div class="seat"><span>席 '+(p.id+1)+'</span><strong>'+esc(p.name)+'</strong><small>'+(p.id===0?'部屋主':p.connected?'参加中':'空席')+'</small></div>').join('')+'</div></section>'+
 hostRoomSettingsMarkup()+
 '<section class="panel"><button class="action-primary start-button" data-act="start-online" '+(!roomReady?'disabled':'')+'>対局を開始（空席はCPU）</button>'+
 '<p class="soft-note">参加者が揃ってから開始してください。人数やルールは開始前に確定します。部屋主がページを閉じると終了します。</p></section></div>';
}
function render(){
 const y=window.scrollY;
 root.innerHTML='<div class="app-shell"><header class="top"><div class="logo">大富豪<span>DAIFUGO</span></div><div class="top-links">'+
 (screen!=='home'?'<button class="small-button" data-act="home">タイトルへ</button>':'')+'</div></header><main>'+
 (screen==='home'?homeMarkup():screen==='lobby'?waitingMarkup():gameMarkup())+
 '</main></div>';
 if(window.scrollY!==y)window.scrollTo(0,y);
}
async function copyCode(){
 try{
  if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(roomCode);
  else {const el=document.getElementById('room-code-display');if(!el)throw Error('no input');el.select();document.execCommand('copy');}
  message='部屋コードをコピーしました。';error='';
 }catch{message='';error='コピーできない場合はコード欄を長押ししてください。';}
 render();
}
root.addEventListener('click',event=>{
 const button=event.target.closest('button[data-act]');if(!button)return;
 const action=button.dataset.act;
 if(action==='solo'){startSolo();return;}
 if(action==='start-solo'){startSoloGame();return;}
 if(action==='host'){freshHost();return;}
 if(action==='join'){beginJoin(document.getElementById('join-room-code')?.value);return;}
 if(action==='start-online'){startHost();return;}
 if(action==='home'){menu();return;}
 if(action==='reconnect'){if(mode==='guest')beginJoin(roomCode);return;}
 if(action==='copy'){copyCode();return;}
 if(action==='card'){
  const id=button.dataset.id;
  if(!display||display.phase!=='playing'||display.turn!==mySeat)return;
  if(chosen.has(id))chosen.delete(id);else chosen.add(id);
  render();return;
 }
 if(action==='clear-select'){chosen.clear();render();return;}
 if(action==='play'){const s=selectionStatus();if(s.ok){if(display?.pending)resolveLocal([...chosen]);else play([...chosen]);}return;}
 if(action==='pass'){pass();return;}
 if(action==='next-round'){nextRound();return;}
});
root.addEventListener('change',event=>{
 const el=event.target;
 if(el.id==='player-name'){rememberName();return;}
 if((mode!=='host'&&mode!=='solo')||screen!=='lobby')return;
 if(el.id==='room-players'){
  const desired=clamp(Number(el.value)||4,2,6);
  const occupied=mode==='host'?Math.max(0,...tickets.keys())+1:1;
  if(desired<occupied){error='現在参加しているプレイヤーがいるため、その人数には減らせません。';render();return;}
  roomPlayers=desired;initialCards=Math.min(initialCards,maxInitial());error='';
 }else if(el.id==='initial-cards'){
  initialCards=clamp(Number(el.value)||13,1,maxInitial());error='';
 }else if(el.id==='jokers'){
  options.jokers=clamp(Number(el.value),0,2);initialCards=Math.min(initialCards,maxInitial());error='';
 }else if(el.dataset?.rule){
  options[el.dataset.rule]=el.checked;error='';
 }else return;
 persist();
 if(mode==='host')broadcastLobby();else render();
});
window.DaifugoDebug={
 view:()=>display,screen:()=>screen,mode:()=>mode,room:()=>roomCode,seat:()=>mySeat,normalizeRoomCode,roomSettings:publicSettings,
 full:()=>mode==='guest'?null:full,
 startSolo,play,pass,resolveLocal
};
render();
})();
