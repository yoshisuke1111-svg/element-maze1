'use strict';
const assert=require('node:assert/strict'),E=require('./game.js');
const s=E.newGame({rules:{jokers:1},random:()=>0.37});
assert.equal(s.players.length,4);assert.equal(s.phase,'playing');
const all=s.players.flatMap(p=>p.hand),ids=new Set(all.map(c=>c.id));
assert.equal(all.length,53);assert.equal(ids.size,53);
assert.deepEqual(E.publicView(s,1).hand.map(c=>c.id),s.players[1].hand.map(c=>c.id));
assert.ok(!JSON.stringify(E.publicView(s,1)).includes('"hand":['+JSON.stringify(s.players[0].hand[0])));
const before=E.publicView(s,0).seq;
const first=E.legalMoves(s,s.turn)[0];assert.ok(first);E.move(s,0,first.ids);
assert.equal(s.seq,before+1);assert.equal(s.turn,1);
assert.throws(()=>E.move(s,2,first.ids),/手番/);
const stub=()=>E.newGame({rules:{jokers:0},random:()=>.19});
const revol=stub();revol.players[0].hand=[{id:'S5',suit:'S',rank:5},{id:'H5',suit:'H',rank:5},{id:'D5',suit:'D',rank:5},{id:'C5',suit:'C',rank:5},{id:'S9',suit:'S',rank:9}];
E.move(revol,0,['S5','H5','D5','C5']);assert.equal(revol.revolution,true,'natural four of a kind must cause revolution');
const cut=stub();cut.players[0].hand=[{id:'S8',suit:'S',rank:8},{id:'S9',suit:'S',rank:9}];
E.move(cut,0,['S8']);assert.equal(cut.table,null);assert.equal(cut.turn,0);
const passes=stub();passes.players[0].hand=[{id:'S3',suit:'S',rank:3},{id:'S4',suit:'S',rank:4}];passes.players[1].hand=[{id:'S6',suit:'S',rank:6}];passes.players[2].hand=[{id:'S7',suit:'S',rank:7}];passes.players[3].hand=[{id:'S9',suit:'S',rank:9}];
E.move(passes,0,['S3']);E.pass(passes,1);E.pass(passes,2);E.pass(passes,3);
assert.equal(passes.table,null);assert.equal(passes.turn,0);
const joker=stub();joker.table={type:'set',count:1,rank:16,signature:'',owner:3};
assert.ok(E.choose(joker,[{id:'S3',suit:'S',rank:3}]),'spade 3 beats singleton joker');
assert.equal(E.choose(joker,[{id:'H3',suit:'H',rank:3}]),null,'other 3 cannot beat joker');
const suit={...E.DEFAULT_RULES,jokers:1};
assert.ok(E.classify([{id:'H3',suit:'H',rank:3},{id:'H4',suit:'H',rank:4},{id:'H5',suit:'H',rank:5}],suit).some(x=>x.type==='run'));
const many=E.newGame({rules:{jokers:0},random:Math.random});
let steps=0;const start=Date.now();
while(many.phase==='playing'&&steps<330){
 const player=many.turn;
 const next=E.pickCPU(many,player,68);
 if(next)E.move(many,player,next);
 else E.pass(many,player);
 steps++;
}
assert.equal(many.phase,'results','Game did not finish within '+steps+' turns');
assert.equal(new Set(many.lastRanking).size,4);
const previous=many.lastRanking.slice();E.startRound(many,previous);
assert.equal(many.phase,'playing');assert.equal(many.round,2);
assert.equal(many.players.reduce((a,p)=>a+p.hand.length,0),52);

const card=(rank,suit='S')=>({id:suit+rank,suit,rank});
const make=rules=>E.newGame({rules:{jokers:0,...rules},random:()=>.32});
{
 const g=make({sevenGive:true});g.players[0].hand=[card(7),card(4)];
 E.move(g,0,['S7']);
 assert.equal(g.pending.type,'give');assert.equal(g.pending.owner,0);assert.equal(g.pending.target,1);
 assert.equal(g.pending.max,1);assert.equal(g.turn,0);
 assert.throws(()=>E.move(g,0,['S4']),/先に7渡し/);
 assert.throws(()=>E.resolveSpecial(g,0,[]),/指定された枚数/);
 assert.ok(!E.legalMoves(g,0).length,'player cannot make new normal move while a special action is pending');
 E.resolveSpecial(g,0,['S4']);
 assert.equal(g.pending,null);assert.ok(g.players[1].hand.some(x=>x.id==='S4'));
 assert.ok(g.finishOrder.includes(0),'giving away the last card ends your participation');
}
{
 const g=make({tenDiscard:true});g.players[0].hand=[card(10),card(4)];
 E.move(g,0,['S10']);assert.equal(g.pending.type,'discard');
 E.resolveSpecial(g,0,['S4']);assert.equal(g.pending,null);
 assert.ok(!g.players[0].hand.length);assert.equal(g.finishOrder[0],0);
}
{
 const g=make({fiveSkip:true});g.players[0].hand=[card(5),card(11)];
 E.move(g,0,['S5']);assert.equal(g.turn,2,'5 must skip next player');
 const h=make({fiveSkip:false});h.players[0].hand=[card(5),card(11)];
 E.move(h,0,['S5']);assert.equal(h.turn,1,'disabled 5-skip cannot skip');
}
{
 const g=make({nineReverse:true});g.players[0].hand=[card(9),card(11)];
 E.move(g,0,['S9']);assert.equal(g.direction,-1);assert.equal(g.turn,3);
 const h=make({nineReverse:false});h.players[0].hand=[card(9),card(11)];
 E.move(h,0,['S9']);assert.equal(h.direction,1);assert.equal(h.turn,1);
}
{
 const g=make({sixBack:true});g.players[0].hand=[card(6),card(11)];
 E.move(g,0,['S6']);assert.equal(g.sixBack,true);
 assert.ok(E.choose(g,[card(3,'H')]),'3 should beat 6 while six-back is active');
 for(const id of [1,2,3])E.pass(g,id);
 assert.equal(g.sixBack,false,'strength must return to normal once the table is cleared');
}
{
 const g=make({capitalFall:true});g.round=2;g.lastRanking=[0,1,2,3];
 g.players[0].hand=[card(5),card(11)];g.players[1].hand=[card(4)];
 g.players[2].hand=[card(8)];g.players[3].hand=[card(12)];
 g.turn=1;E.move(g,1,['S4']);
 assert.equal(g.lockedBottom,0,'previous winner is reserved for bottom after losing first place');
 g.table=null;g.turn=2;E.move(g,2,['S8']);
 assert.equal(g.phase,'results');assert.deepEqual(g.lastRanking,[1,2,3,0]);
}
{
 for(let x=0;x<8;x++){
  const g=make({fiveSkip:true,sixBack:true,sevenGive:true,nineReverse:true,tenDiscard:true,capitalFall:true});
  let turns=0;
  while(g.phase==='playing'&&turns<400){
   if(g.pending)E.resolveSpecial(g,g.turn,E.pickCPUSpecial(g,g.turn));
   else {
    const ids=E.pickCPU(g,g.turn,65);
    if(ids)E.move(g,g.turn,ids);else E.pass(g,g.turn);
   }
   turns++;
  }
  assert.equal(g.phase,'results','full local-rule game must finish');
  assert.equal(new Set(g.lastRanking).size,4);
 }
}


for(let playerCount=2;playerCount<=6;playerCount++){
 const handSize=Math.min(13,Math.floor(53/playerCount));
 const players=Array.from({length:playerCount},(_,i)=>({name:'参加者'+i,isCPU:i>0}));
 const room=E.newGame({rules:{jokers:1,exchange:true,sevenGive:true,tenDiscard:true},players,initialCards:handSize,random:()=>0.23});
 assert.equal(room.players.length,playerCount);
 assert.ok(room.players.every(p=>p.hand.length===handSize),'all players start with the selected number of cards');
 assert.equal(room.players.flatMap(p=>p.hand).length,playerCount*handSize);
 assert.equal(room.players.flatMap(p=>p.hand).filter(c=>c.rank===16).length,1,'configured joker is part of the dealt cards');
 assert.equal(E.publicView(room,0).initialCards,handSize);
 assert.equal(E.publicView(room,0).playerCount,playerCount);
 const run=()=>{
  let steps=0;
  while(room.phase==='playing'&&steps<380){
   const seat=room.turn;
   if(room.pending)E.resolveSpecial(room,seat,E.pickCPUSpecial(room,seat));
   else{
    const ids=E.pickCPU(room,seat,65);
    if(ids)E.move(room,seat,ids);
    else E.pass(room,seat);
   }
   steps++;
  }
  assert.equal(room.phase,'results','variable player count must finish a game');
  assert.equal(new Set(room.lastRanking).size,playerCount);
 };
 run();
 E.startRound(room,room.lastRanking);
 assert.equal(room.players.length,playerCount);
 assert.ok(room.players.every(p=>p.hand.length===handSize),'rank exchange must preserve cards per player');
 run();
}
assert.throws(()=>E.newGame({players:Array.from({length:6},(_,i)=>({name:String(i)})),initialCards:13,rules:{jokers:1}}),/手札枚数/);

console.log('Daifugo rules engine PASS | turns=',steps,'elapsed=',Date.now()-start,'ms');
