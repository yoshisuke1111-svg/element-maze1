/* Tabletop Motion 1.0 - handless, physically inspired dealing and placing.
   Visual-only enhancement; never changes a game's rules or network state. */
(() => {
  'use strict';
  const tag=document.currentScript;
  const game=tag ? tag.getAttribute('data-game') : '';
  if (!game || !('animate' in Element.prototype)) return;
  const reduced=window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const style=document.createElement('style');
  style.textContent=[
    '.board-plane,.board-wrap,.table-area,.played-area,.hand-tiles,.hand-row,.felt{perspective:980px}',
    '.koma,.tile,.table-card,.play-card,.playing-card,.mini-card{backface-visibility:hidden;transform-style:preserve-3d}',
    '.table-card,.playing-card,.play-card{box-shadow:0 2px 1px #0003,0 7px 14px #0007,inset 0 1px 1px #fff9}',
    '.tile{box-shadow:0 2px 1px #0005,0 5px 8px #0004,inset 0 1px 1px #fff9}',
    '.board-plane .koma{filter:drop-shadow(0 2px 2px #583b2690)}',
    '@media(hover:hover){.play-card:not(.selected):hover,.playing-card:not(.chosen):hover,.tile.hand:not(.is-chosen):hover{filter:brightness(1.045)}}'
  ].join('\n');
  document.head.appendChild(style);
  let last=null;
  let queued=false;
  function textOf(e){return e ? (e.textContent||'').replace(/\s+/g,' ').trim() : '';}
  function spring(el,frames,duration,delay){
    if(reduced || !el || !el.isConnected) return;
    try { el.animate(frames,{duration:duration||600,delay:delay||0,easing:'cubic-bezier(.17,.77,.26,1)',fill:'none'}); } catch(e) {}
  }
  function cardFlight(el,from,delay){
    const direction=from==='top'?-1:1;
    const dy=direction*(from==='top'?105:142);
    const dx=from==='left'?-110:(direction===1?-32:38);
    const turn=direction===1?-16:14;
    spring(el,[
      {offset:0,opacity:.18,transform:'translate3d('+dx+'px,'+dy+'px,70px) rotateZ('+turn+'deg) rotateX(48deg) scale(.94)'},
      {offset:.59,opacity:1,transform:'translate3d(7px,-15px,25px) rotateZ(-4deg) rotateX(17deg) scale(1.035)'},
      {offset:.84,opacity:1,transform:'translate3d(2px,3px,2px) rotateZ(1.3deg) rotateX(0deg) scale(1.005)'},
      {offset:1,opacity:1,transform:'translate3d(0px,0px,0px) rotateZ(0deg) rotateX(0deg) scale(1)'}
    ],600,delay);
  }
  function tileFlight(el,from,delay){
    const dy=from==='hand'?86:-65;
    spring(el,[
      {offset:0,opacity:.35,transform:'translate3d(-24px,'+dy+'px,18px) rotateZ(-13deg) rotateX(38deg) scale(.95)'},
      {offset:.68,opacity:1,transform:'translate3d(1px,-9px,8px) rotateZ(2deg) rotateX(8deg) scale(1.025)'},
      {offset:1,opacity:1,transform:'translate3d(0,0,0) rotateZ(0deg) rotateX(0deg) scale(1)'}
    ],450,delay);
  }
  function boardSnap(){
    const board=document.querySelector('.board-plane .board');
    if(!board)return null;
    const cells=Array.from(board.querySelectorAll('.cell'));
    if(cells.length!==81)return null;
    return cells.map(c=>{
      const piece=c.querySelector('.koma');
      if(!piece) return {id:'',rect:null,el:null};
      const r=piece.getBoundingClientRect();
      return {id:textOf(piece)+'|'+piece.classList.contains('opp')+'|'+piece.classList.contains('promoted'),
        rect:{x:r.left,y:r.top,width:r.width,height:r.height},el:piece};
    });
  }
  function shogiMove(target,source){
    if(reduced || !target || !target.isConnected)return;
    const el=target.el, dest=target.rect;
    if(!el || !dest)return;
    const ghost=el.cloneNode(true);
    const from=source||{x:dest.x-42,y:dest.y+65};
    const dx=from.x-dest.x,dy=from.y-dest.y;
    const rot=el.classList.contains('opp')?180:0;
    ghost.removeAttribute('id');
    ghost.style.cssText='position:fixed;pointer-events:none;z-index:9999;margin:0;left:'+dest.x+'px;top:'+dest.y+'px;width:'+dest.width+'px;height:'+dest.height+'px;';
    document.body.appendChild(ghost);
    el.style.visibility='hidden';
    let finished=false;
    const finish=()=>{if(finished)return;finished=true;ghost.remove();el.style.visibility='';};
    try{
      const a=ghost.animate([
        {offset:0,transform:'translate3d('+dx+'px,'+dy+'px,0) rotateZ('+rot+'deg) rotateX(0deg)'},
        {offset:.48,transform:'translate3d('+(dx*.36)+'px,'+(dy*.36-12)+'px,19px) rotateZ('+(rot-4)+'deg) rotateX(19deg)'},
        {offset:.82,transform:'translate3d(1px,-6px,8px) rotateZ('+(rot+1.5)+'deg) rotateX(7deg)'},
        {offset:1,transform:'translate3d(0,0,0) rotateZ('+rot+'deg) rotateX(0deg)'}
      ],{duration:470,easing:'cubic-bezier(.22,.61,.25,1)',fill:'forwards'});
      a.onfinish=finish;
      a.oncancel=finish;
    }catch(e){finish();}
  }
  function updateShogi(){
    const now=boardSnap();
    if(!now){last=null;return;}
    if(last && last.length===now.length){
      const changed=now.map((p,i)=>i).filter(i=>last[i].id!==now[i].id);
      const outs=changed.filter(i=>last[i].id&&!now[i].id);
      const ins=changed.filter(i=>now[i].id && last[i].id!==now[i].id);
      if(changed.length<=3 && ins.length===1 && outs.length<=1)shogiMove(now[ins[0]],outs.length?last[outs[0]].rect:null);
    }
    last=now;
  }
  function updateDaifugo(){
    const cards=Array.from(document.querySelectorAll('.played-area .table-card'));
    const current=cards.map(textOf).join('|');
    if(last && current!==last.sig && cards.length){
      cards.forEach((el,i)=>cardFlight(el,'bottom',i*65));
    }
    last={sig:current};
  }
  function updateMahjong(){
    const rivers=Array.from(document.querySelectorAll('.river')).map(r=>Array.from(r.querySelectorAll('.tiles .tile')));
    const hand=Array.from(document.querySelectorAll('.hand-tiles .tile.hand'));
    const melds=Array.from(document.querySelectorAll('.seat-melds')).map(r=>Array.from(r.querySelectorAll('.meld')));
    const now={rivers:rivers.map(r=>r.map(textOf)),hand:hand.map(textOf),melds:melds.map(r=>r.length)};
    if(last){
      rivers.forEach((r,i)=>{
        const before=last.rivers[i]||[];
        if(r.length>before.length && r.length-before.length<=3){
          r.slice(before.length).forEach((el,j)=>tileFlight(el,'hand',j*60));
        }
      });
      if(hand.length>last.hand.length){
        const drawn=hand.filter(x=>x.classList.contains('drawn'));
        (drawn.length?drawn:[hand[hand.length-1]]).forEach((el,i)=>tileFlight(el,'top',i*45));
      }
      melds.forEach((m,i)=>{
        if(m.length>(last.melds[i]||0))tileFlight(m[m.length-1],'hand');
      });
    }else if(hand.length){
      hand.forEach((el,i)=>tileFlight(el,'top',Math.min(i*36,360)));
    }
    last=now;
  }
  function updatePoker(){
    const cards=Array.from(document.querySelectorAll('.hero-hand .playing-card, .hand-row .playing-card'));
    const current=cards.map(textOf);
    if(last && cards.length){
      const isDeal=cards.length!==last.hand.length;
      cards.forEach((el,i)=>{
        if(isDeal || current[i]!==last.hand[i])cardFlight(el,'top',i*75);
      });
    }else if(cards.length){
      cards.forEach((el,i)=>cardFlight(el,'top',i*95));
    }
    last={hand:current};
  }
  function update(){
    if(game==='shogi') updateShogi();
    else if(game==='mahjong') updateMahjong();
    else if(game==='daifugo') updateDaifugo();
    else if(game==='poker') updatePoker();
  }
  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;update();});
  }
  const observer=new MutationObserver(schedule);
  observer.observe(document.body,{childList:true,subtree:true});
  schedule();
})();
