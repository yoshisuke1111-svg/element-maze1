/* 大富豪 v0.1 - 4 player authoritative rules engine (independent of other games).
 * Cards use 3=3 ... 14=A 15=2 16=Joker.
 * Host alone mutates full state; guests receive per-seat views without opponents' hands.
 */
(function(root,factory){
  const E=factory();
  if(typeof module==='object'&&module.exports)module.exports=E;
  root.DaifugoEngine=E;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const SUITS=['S','H','D','C'],SUIT_LABEL={S:'♠',H:'♥',D:'♦',C:'♣'};
const DEFAULT_RULES=Object.freeze({
  jokers:1,revolution:true,eightCut:true,elevenBack:false,
  shibari:true,stairs:true,stairRevolution:false,spadeThree:true,exchange:true
});
const LABEL={3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',15:'2',16:'JOKER'};
const PLACE=['大富豪','富豪','貧民','大貧民'];
const err=(s)=>{throw Error(s);};
function settings(input={}){
 const o={...DEFAULT_RULES};
 for(const k of Object.keys(o)){
  if(k==='jokers')o.jokers=Math.min(2,Math.max(0,Math.floor(Number(input[k]??o[k]))));
  else if(Object.hasOwn(input,k))o[k]=!!input[k];
 }
 return o;
}
function deck(jokers=1){
 const cards=[];
 for(let rank=3;rank<=15;rank++)for(const suit of SUITS)cards.push({id:suit+rank,suit,rank});
 for(let j=0;j<jokers;j++)cards.push({id:'J'+j,suit:'',rank:16});
 return cards;
}
function shuffle(cards,random=Math.random){
 const a=cards.slice();
 for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
 return a;
}
function sortHand(cards){
 return cards.slice().sort((a,b)=>a.rank-b.rank||(a.suit||'Z').localeCompare(b.suit||'Z')||a.id.localeCompare(b.id));
}
function combinations(a,k){
 const out=[],path=[];
 function walk(start,left){
  if(left===0){out.push(path.slice());return;}
  for(let i=start;i<=a.length-left;i++){path.push(a[i]);walk(i+1,left-1);path.pop();}
 }
 walk(0,k);return out;
}
function classify(cards,rules=DEFAULT_RULES){
 if(!Array.isArray(cards)||!cards.length||new Set(cards.map(c=>c.id)).size!==cards.length)return [];
 const n=cards.length,natural=cards.filter(c=>c.rank!==16),jokers=n-natural.length;
 if(jokers>rules.jokers)return [];
 const result=[];
 if(n<=4 && (natural.length===0?n===1:natural.every(c=>c.rank===natural[0].rank))){
   const rank=natural.length?natural[0].rank:16;
   const signature=jokers?'':natural.map(c=>c.suit).sort().join('');
   result.push({type:'set',count:n,rank,signature,hasEight:natural.some(c=>c.rank===8),
    hasEleven:natural.some(c=>c.rank===11),jokerCount:jokers,
    fourNatural:n===4&&jokers===0,stairRevolution:false});
 }
 if(rules.stairs&&n>=3&&n<=13&&natural.length>0){
  const suit=natural[0].suit;
  if(natural.every(c=>c.suit===suit)&&new Set(natural.map(c=>c.rank)).size===natural.length){
   for(let start=3;start<=15-n+1;start++){
    if(natural.every(c=>c.rank>=start&&c.rank<start+n)){
     result.push({type:'run',count:n,rank:start+n-1,start,signature:jokers?'':suit,
      hasEight:natural.some(c=>c.rank===8),hasEleven:natural.some(c=>c.rank===11),
      jokerCount:jokers,fourNatural:false,stairRevolution:n>=5&&jokers===0});
    }
   }
  }
 }
 return result;
}
function inversed(s){return !!s.revolution!==!!s.elevenBack;}
function compareRank(a,b,reverse){
 if(a===b)return 0;
 if(a===16)return 1;if(b===16)return -1;
 return reverse?b-a:a-b;
}
function beats(s,candidate){
 if(!s.table)return true;
 const target=s.table;
 if(s.rules.spadeThree&&target.type==='set'&&target.count===1&&target.rank===16
   &&candidate.type==='set'&&candidate.count===1&&candidate.rank===3
   &&candidate.signature==='S')return true;
 if(candidate.type!==target.type||candidate.count!==target.count)return false;
 if(s.bound&&candidate.signature!==s.bound)return false;
 return compareRank(candidate.rank,target.rank,inversed(s))>0;
}
function choose(s,cards){
 const options=classify(cards,s.rules).filter(c=>beats(s,c));
 if(!options.length)return null;
 options.sort((a,b)=>compareRank(a.rank,b.rank,inversed(s))||a.start-b.start);
 return options[0];
}
function active(s,id){return s.players[id] && s.players[id].hand.length>0;}
function nextPlayer(s,after,predicate=()=>true){
 for(let d=1;d<=s.players.length;d++){
  const id=(after+d)%s.players.length;
  if(active(s,id)&&predicate(id))return id;
 }
 return null;
}
function countFinish(s){
 if(s.finishOrder.length===s.players.length-1){
  const remain=s.players.find(p=>p.hand.length>0&&!s.finishOrder.includes(p.id));
  if(remain)s.finishOrder.push(remain.id);
 }
 if(s.finishOrder.length===s.players.length){
  s.phase='results';s.turn=null;s.table=null;s.bound='';s.elevenBack=false;s.passes=[];
  s.lastRanking=s.finishOrder.slice();
  s.log.push({kind:'result',text:'対局終了',who:null});
  return true;
 }
 return false;
}
function resetTable(s,leader){
 s.table=null;s.bound='';s.elevenBack=false;s.passes=[];
 s.turn=active(s,leader)?leader:nextPlayer(s,leader);
 s.log.push({kind:'clear',text:'場が流れました',who:null});
}
function startRound(s,previousRanking=null,random=Math.random){
 const cards=shuffle(deck(s.rules.jokers),random);
 for(const p of s.players){p.hand=[];p.place=previousRanking?previousRanking.indexOf(p.id):null;}
 cards.forEach((card,i)=>s.players[i%s.players.length].hand.push(card));
 for(const p of s.players)p.hand=sortHand(p.hand);
 if(previousRanking&&s.rules.exchange&&s.players.length===4){
  const trade=(upper,lower,n)=>{
   const top=s.players[upper],bottom=s.players[lower];
   const fromTop=top.hand.slice(0,n),fromBottom=bottom.hand.slice(-n);
   top.hand=sortHand(top.hand.filter(c=>!fromTop.some(x=>x.id===c.id)).concat(fromBottom));
   bottom.hand=sortHand(bottom.hand.filter(c=>!fromBottom.some(x=>x.id===c.id)).concat(fromTop));
  };
  trade(previousRanking[0],previousRanking[3],2);
  trade(previousRanking[1],previousRanking[2],1);
 }
 s.turn=previousRanking?previousRanking[0]:0;
 s.table=null;s.bound='';s.elevenBack=false;s.revolution=false;s.passes=[];
 s.finishOrder=[];s.phase='playing';s.log=[];s.round=(s.round||0)+1;s.seq=(s.seq||0)+1;
 s.log.push({kind:'start',text:previousRanking?'次の対局を開始しました':'対局開始',who:null});
 return s;
}
function newGame(options={}){
 const rules=settings(options.rules||{});
 const people=options.players||Array.from({length:4},(_,i)=>({name:i===0?'あなた':'CPU '+i,isCPU:i!==0}));
 if(people.length!==4)err('4人用のゲームです。');
 const s={players:people.map((p,i)=>({id:i,name:String(p.name||'プレイヤー '+(i+1)).slice(0,20),
   isCPU:!!p.isCPU,hand:[],place:null})),rules,phase:'playing',turn:0,round:0,
   table:null,bound:'',revolution:false,elevenBack:false,passes:[],finishOrder:[],lastRanking:null,log:[],seq:0};
 return startRound(s,null,options.random||Math.random);
}
function move(s,playerId,ids){
 if(s.phase!=='playing')err('対局が終了しています。');
 if(s.turn!==playerId)err('このプレイヤーの手番ではありません。');
 if(!Array.isArray(ids)||ids.length===0||ids.length>13||new Set(ids).size!==ids.length)err('カードの選択が正しくありません。');
 const player=s.players[playerId],chosen=ids.map(id=>player.hand.find(c=>c.id===id));
 if(chosen.some(c=>!c))err('持っていないカードは出せません。');
 const combo=choose(s,chosen);
 if(!combo)err('このカードは出せません。');
 const previous=s.table,oldBound=s.bound,spadeCut=s.rules.spadeThree&&previous?.rank===16&&previous?.count===1
  &&combo.rank===3&&combo.signature==='S';
 const newBound=s.rules.shibari&&!oldBound&&previous&&previous.signature&&combo.signature
  &&previous.signature===combo.signature?combo.signature:oldBound;
 player.hand=player.hand.filter(c=>!ids.includes(c.id));
 s.table={...combo,cards:chosen.map(c=>({...c})),owner:playerId};
 s.bound=newBound||''; // Passes remain until this trick is cleared.
 if(s.rules.revolution&&(combo.fourNatural||(s.rules.stairRevolution&&combo.stairRevolution)))s.revolution=!s.revolution;
 if(s.rules.elevenBack&&combo.hasEleven)s.elevenBack=true;
 s.seq++;
 s.log.push({kind:'play',who:playerId,name:player.name,cards:ids.slice(),type:combo.type,count:ids.length,
   text:player.name+'：'+chosen.map(c=>c.rank===16?'JOKER':SUIT_LABEL[c.suit]+LABEL[c.rank]).join(' ')});
 if(player.hand.length===0){s.finishOrder.push(playerId);s.log.push({kind:'finish',who:playerId,text:player.name+' 上がり ('+PLACE[s.finishOrder.length-1]+')'});}
 if(countFinish(s))return s;
 if((s.rules.eightCut&&combo.hasEight)||spadeCut){
  resetTable(s,playerId);
  s.log.push({kind:'event',who:playerId,text:spadeCut?'スペ3返し':'8切り'});
 } else {
  const next=nextPlayer(s,playerId,id=>!s.passes.includes(id));
  if(next===null||next===playerId)resetTable(s,playerId);
  else s.turn=next;
 }
 return s;
}
function pass(s,playerId){
 if(s.phase!=='playing')err('対局が終了しています。');
 if(s.turn!==playerId)err('このプレイヤーの手番ではありません。');
 if(!s.table)err('場が空のときはパスできません。');
 if(s.table.owner===playerId)err('自分のカードにパスできません。');
 if(s.passes.includes(playerId))err('すでにパスしています。');
 s.passes.push(playerId);s.seq++;
 s.log.push({kind:'pass',who:playerId,text:s.players[playerId].name+'：パス'});
 const next=nextPlayer(s,playerId,id=>id!==s.table.owner&&!s.passes.includes(id));
 if(next===null)resetTable(s,s.table.owner);
 else s.turn=next;
 return s;
}
function legalMoves(s,playerId){
 if(s.phase!=='playing'||s.turn!==playerId)return [];
 const hand=s.players[playerId].hand;
 const out=[],chosen=[],n=Math.min(hand.length,14);
 function walk(i){
  if(chosen.length){
   const cards=chosen.map(k=>hand[k]);
   const combo=choose(s,cards);
   if(combo)out.push({ids:cards.map(c=>c.id),combo});
  }
  if(chosen.length>=Math.min(7,n))return;
  for(let k=i;k<n;k++){chosen.push(k);walk(k+1);chosen.pop();}
 }
 walk(0);
 return out;
}
function pickCPU(s,playerId,skill=65,random=Math.random){
 const options=legalMoves(s,playerId);
 if(!options.length)return null;
 const p=s.players[playerId],opponents=s.players.filter(x=>x.id!==playerId&&x.hand.length>0);
 const danger=Math.min(...opponents.map(x=>x.hand.length),99)<=3;
 const weights=options.map(entry=>{
  const {ids,combo}=entry,removed=new Set(ids);
  const remaining=p.hand.filter(c=>!removed.has(c.id));
  const jokerCount=combo.jokerCount,power=combo.rank===16?16:inversed(s)?18-combo.rank:combo.rank;
  let score=combo.count*105 - power*5 - jokerCount*105;
  if(remaining.length===0)score+=100000;
  if(combo.type==='run')score+=combo.count*32;
  if(combo.fourNatural&&s.rules.revolution)score+=40;
  if(combo.hasEight&&s.rules.eightCut)score+=danger?115:22;
  if(danger&&s.table)score+=125;
  // Preserve natural pairs/triples when not finishing.
  const counts={};for(const c of p.hand)if(c.rank!==16)counts[c.rank]=(counts[c.rank]||0)+1;
  if(combo.type==='set'&&combo.count===1&&counts[combo.rank]>=2)score-=60;
  if(!s.table&&combo.count===1&&combo.rank>=14)score-=120;
  if(s.rules.spadeThree&&s.table?.rank===16&&combo.rank===3)score+=1000;
  return {entry,score:score+(random()-.5)*Math.max(0,100-skill)*8};
 });
 weights.sort((a,b)=>b.score-a.score);
 // Easier CPU selects a wider range of legal choices.
 const index=skill>=65?0:Math.floor(random()*Math.min(weights.length,1+Math.floor((65-skill)/7)));
 return weights[index].entry.ids;
}
function publicView(s,seat){
 const player=s.players[seat];
 if(!player)err('無効な座席です。');
 return {
  round:s.round,phase:s.phase,turn:s.turn,seq:s.seq,seat,ruleSummary:s.rules,
  players:s.players.map(p=>({id:p.id,name:p.name,isCPU:p.isCPU,count:p.hand.length,place:p.place})),
  hand:player.hand.map(c=>({...c})),
  table:s.table?s.table:null,
  bound:s.bound,revolution:s.revolution,elevenBack:s.elevenBack,
  passes:s.passes.slice(),finishOrder:s.finishOrder.slice(),lastRanking:s.lastRanking?.slice()||null,
  log:s.log.slice(-48)
 };
}
return {SUITS,SUIT_LABEL,DEFAULT_RULES,LABEL,PLACE,settings,deck,shuffle,sortHand,classify,choose,beats,
 newGame,startRound,move,pass,legalMoves,pickCPU,publicView,compareRank};
});
