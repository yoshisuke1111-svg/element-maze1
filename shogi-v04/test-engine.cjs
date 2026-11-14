/* Validate the upstream Shogi WebAssembly engine on GitHub's Node runner. */
'use strict';
const Stockfish=require('./engine/stockfish.js');
let result='';
const timeout=setTimeout(()=>{console.error('Shogi WASM engine check timed out');process.exit(1)},40000);
(async()=>{
  const engine=await Stockfish();
  engine.addMessageListener(raw=>{
    for(const line of String(raw).split(/\r?\n/)){
      if(line.trim()==='usiok'){
        engine.postMessage('setoption name Use NNUE value false');
        engine.postMessage('isready');
      }else if(line.trim()==='readyok'){
        engine.postMessage('position startpos moves 7g7f 3c3d');
        engine.postMessage('go depth 2');
      }else if(line.startsWith('bestmove ')){
        result=line.trim().split(/\s+/)[1];
        const ok=/^(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])$/.test(result);
        if(!ok){console.error('Unexpected engine move: '+result);process.exit(1)}
        console.log('Fairy-Stockfish USI Shogi test passed:',result);
        clearTimeout(timeout);
        engine.postMessage('quit');
        setTimeout(()=>process.exit(0),800);
      }
    }
  });
  engine.postMessage('usi');
})().catch(e=>{console.error(e);process.exit(1)});
