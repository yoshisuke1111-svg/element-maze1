/* Tabletop Controls 1.2 — optional drag & keyboard controls.
   Calls existing game buttons; never mutates rules, turns, or networking. */
(()=>{
'use strict';
const tag=document.currentScript;
const game=tag?.dataset.game;
if(!['shogi','mahjong','daifugo'].includes(game))return;
const root=document.getElementById('app')||document.body;
const gestureHint={
  shogi:'操作：タップで選択／駒をドラッグして移動。矢印キーで升を移動、Enterで決定。',
  mahjong:'操作：牌をタップ、または上へ滑らせて選択 → 打牌で確定。左右キーで牌を選べます。',
  daifugo:'操作：カードをタップ、または上へ滑らせて選択 →「出す」で確定。左右キーにも対応。'
};
let active=null, suppress=null;
const escapeHTML=String;
function buttonOf(target){
 if(!(target instanceof Element))return null;
 if(game==='shogi'){
  const b=target.closest('button[data-act="cell"],button[data-act="hand"]');
  if(!b||b.disabled)return null;
  if(b.dataset.act==='cell' && !b.querySelector('.koma:not(.opp)'))return null;
  return b;
 }
 if(game==='mahjong')return target.closest('.hand-tiles button.tile.hand:not(:disabled)');
 return target.closest('.myhand button.play-card:not(:disabled)');
}
function tip(){
 if(!root.isConnected)return;
 const gameArea=game==='shogi'?root.querySelector('.game-center .board-wrap')
                :game==='mahjong'?root.querySelector('.hand-panel')
                :root.querySelector('.my-zone');
 if(!gameArea)return;
 const where=(game==='mahjong')?gameArea.querySelector('.handline'):(game==='daifugo')?gameArea.querySelector('.my-zone-head'):gameArea;
 if(!where||gameArea.querySelector('.ttm-gesture-hint'))return;
 const p=document.createElement('p');p.className='ttm-gesture-hint';p.textContent=gestureHint[game];
 if(game==='shogi')where.insertAdjacentElement('afterend',p);
 else where.insertAdjacentElement('afterend',p);
}
const ro=new MutationObserver(tip);
ro.observe(root,{childList:true});
tip();
const rect=e=>{let r=e.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};};
function createGhost(o){
 const original=o.btn.querySelector(game==='shogi'?'.koma,.hand-koma':game==='mahjong'?'.tile .val,.val':'.corner')||o.btn;
 const r=rect(o.btn);
 const ghost=(game==='shogi'&&original!==o.btn?original:o.btn).cloneNode(true);
 ghost.removeAttribute('id');ghost.removeAttribute('data-act');ghost.removeAttribute('data-square');
 ghost.removeAttribute('disabled');
 ghost.setAttribute('aria-hidden','true');
 ghost.classList.add('ttm-pointer-ghost');
 ghost.style.cssText='position:fixed!important;top:'+r.y+'px!important;left:'+r.x+'px!important;width:'+r.w+'px!important;height:'+r.h+'px!important;z-index:99999!important;pointer-events:none!important;opacity:.94!important;margin:0!important;transition:none!important;filter:drop-shadow(0 12px 6px #0008)!important;transform-origin:center!important;';
 document.body.appendChild(ghost);
 o.ghost=ghost;o.origin=r;
 o.btn.classList.add('ttm-being-dragged');
}
function track(e){
 const a=active;if(!a||a.pid!==e.pointerId)return;
 const dx=e.clientX-a.x,dy=e.clientY-a.y;
 if(!a.dragged){
  if(Math.hypot(dx,dy)<(game==='shogi'?11:18))return;
  if(game!=='shogi' && (dy>-16||Math.abs(dx)>Math.abs(dy)*1.5))return;
  a.dragged=true;createGhost(a);
 }
 if(a.ghost){
  const angle=game==='shogi'?-Math.min(7,dx*.045):Math.max(-15,Math.min(15,dx*.08-9));
  a.ghost.style.transform='translate3d('+dx+'px,'+dy+'px,25px) rotateZ('+angle+'deg) rotateX(10deg)';
 }
 if(game==='shogi'){
  const el=document.elementFromPoint(e.clientX,e.clientY)?.closest('button[data-act="cell"]');
  if(a.hover!==el){a.hover?.classList.remove('ttm-drag-target');a.hover=el;if(el)el.classList.add('ttm-drag-target');}
 }
 e.preventDefault();
}
function clean(a){
 if(a?.hover)a.hover.classList.remove('ttm-drag-target');
 if(a?.ghost)a.ghost.remove();
 a?.btn?.classList.remove('ttm-being-dragged');
}
document.addEventListener('pointerdown',e=>{
 if(active||(!e.isPrimary)||e.button!==0)return;
 const btn=buttonOf(e.target);
 if(!btn)return;
 active={pid:e.pointerId,btn,x:e.clientX,y:e.clientY,dragged:false,ghost:null,hover:null};
},{passive:true});
document.addEventListener('pointermove',track,{passive:false});
document.addEventListener('pointercancel',()=>{clean(active);active=null;});
document.addEventListener('pointerup',e=>{
 const a=active;if(!a||a.pid!==e.pointerId)return;
 active=null;
 const drop=e.target instanceof Element?document.elementFromPoint(e.clientX,e.clientY):null;
 const square=drop?.closest('button[data-act="cell"]')?.dataset.square;
 const didDrag=a.dragged;
 clean(a);
 if(!didDrag)return;
 suppress={btn:a.btn,until:performance.now()+550};
 if(game==='shogi'&&square!=null){
   // First select the originating piece, then use the existing legality check.
   const from=a.btn.dataset.act==='cell'?a.btn.dataset.square:null;
   const alreadySelected=a.btn.classList.contains('selected');
   if(!alreadySelected)a.btn.click();
   const destination=root.querySelector('button[data-act="cell"][data-square="'+square+'"]');
   if(destination && destination.classList.contains('target') && !destination.disabled){
     destination.click();
   }else if(from!=null && from===square){
     // End of a tiny drag on the source: keep the chosen piece visibly selected.
   }
 }else if((game==='mahjong'||game==='daifugo')&&e.clientY<a.y-34){
   // Swipe means select, never submit a move or discard automatically.
   if(a.btn.isConnected)a.btn.click();
 }
 e.preventDefault();
},{passive:false});
document.addEventListener('click',e=>{
 const s=suppress;
 if(!s||performance.now()>s.until){suppress=null;return;}
 if(e.isTrusted && (s.btn===e.target||s.btn.contains(e.target))){
    e.preventDefault();e.stopImmediatePropagation();suppress=null;
 }
},true);
document.addEventListener('keydown',e=>{
 if(e.altKey||e.metaKey)return;
 const ae=document.activeElement;
 if(!ae || !root.contains(ae))return;
 const tag=ae.tagName;
 if(['INPUT','TEXTAREA','SELECT'].includes(tag)||ae.isContentEditable)return;
 const isGrid=game==='shogi'&&ae.matches('button[data-act="cell"]');
 let nodes=[];
 if(isGrid)nodes=[...root.querySelectorAll('.board-plane button[data-act="cell"]:not(:disabled)')];
 else if(game==='mahjong'&&ae.matches('.hand-tiles button.tile.hand'))nodes=[...root.querySelectorAll('.hand-tiles button.tile.hand:not(:disabled)')];
 else if(game==='daifugo'&&ae.matches('.myhand button.play-card'))nodes=[...root.querySelectorAll('.myhand button.play-card:not(:disabled)')];
 if(!nodes.length)return;
 const at=nodes.indexOf(ae);if(at<0)return;
 if(e.key==='Escape'){
  const selected=game==='shogi'?root.querySelector('.board-plane .cell.selected'):
    game==='daifugo'?root.querySelector('.myhand .play-card.selected'):
    root.querySelector('.hand-tiles .tile.hand.is-chosen');
  if(selected && !selected.disabled)selected.click();
  e.preventDefault();return;
 }
 if(e.ctrlKey&&e.key==='Enter'){
  const confirm=game==='mahjong'?root.querySelector('[data-v02="discardConfirm"]:not(:disabled)'):
                game==='daifugo'?root.querySelector('[data-act="play"]:not(:disabled)'):null;
  if(confirm){e.preventDefault();confirm.click();}
  return;
 }
 let next=null;
 switch(e.key){
 case 'ArrowLeft':next=isGrid?(at%9===0?at:at-1):Math.max(0,at-1);break;
 case 'ArrowRight':next=isGrid?(at%9===8?at:at+1):Math.min(nodes.length-1,at+1);break;
 case 'ArrowUp':next=isGrid?Math.max(0,at-9):Math.max(0,at-1);break;
 case 'ArrowDown':next=isGrid?Math.min(nodes.length-1,at+9):Math.min(nodes.length-1,at+1);break;
 case 'Home':next=isGrid?Math.floor(at/9)*9:0;break;
 case 'End':next=isGrid?Math.min(nodes.length-1,Math.floor(at/9)*9+8):nodes.length-1;break;
 }
 if(next!==null){e.preventDefault();nodes[next]?.focus({preventScroll:true});}
},true);
})();
