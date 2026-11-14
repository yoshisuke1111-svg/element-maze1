/*
 * Kido v0.4 - Fairy-Stockfish USI WebAssembly adapter.
 * The chess engine itself is not authored here. It is provided by
 * fairy-stockfish-nnue.wasm 1.1.12 (GPL-3.0), built from
 * https://github.com/fairy-stockfish/fairy-stockfish.wasm
 * For licensing, see ENGINE_SOURCE.md and engine/Copying.txt.
 */
'use strict';
const DIR = new URL('./engine/', self.location.href);
let stockfish = null;
let ready = false;
let loading = false;
let processing = false;
let waiting = [];
let queue = [];

function onLine(raw) {
  for (const line of String(raw).split(/\r?\n/)) {
    if (!line) continue;
    for (let i = 0; i < waiting.length; i++) {
      const x = waiting[i];
      if (x.test(line)) {
        waiting.splice(i, 1);
        clearTimeout(x.timer);
        x.resolve(line);
        break;
      }
    }
  }
}
function waitLine(test, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const item = {test, resolve, reject, timer: 0};
    item.timer = setTimeout(() => {
      const i = waiting.indexOf(item);
      if (i >= 0) waiting.splice(i, 1);
      reject(new Error('エンジン応答タイムアウト'));
    }, timeoutMs);
    waiting.push(item);
  });
}
function command(s) {stockfish.postMessage(s);}
async function initialize() {
  if (ready || loading) return;
  loading = true;
  postMessage({status:'loading'});
  try {
    importScripts(new URL('./stockfish.js', DIR).href);
    if (typeof Stockfish !== 'function') throw new Error('Stockfishの読み込みに失敗');
    // The glue code spawns workers for Emscripten pthreads, so use local same-origin assets.
    stockfish = await Stockfish({
      locateFile: file => new URL(file, DIR).href,
      mainScriptUrlOrBlob: new URL('stockfish.js', DIR).href,
    });
    stockfish.addMessageListener(onLine);
    let waiter = waitLine(x => x.trim() === 'usiok', 18000);
    command('usi');
    await waiter;
    // USI is necessary for genuine 9x9 Shogi coordinates such as 7g7f and P*5e.
    command('setoption name UCI_Variant value shogi');
    command('setoption name Threads value 1');
    command('setoption name Hash value 32');
    command('setoption name MultiPV value 1');
    // The optional NNUE net is loaded if it was packaged; classical eval remains a fallback.
    try {
      const response = await fetch(new URL('shogi.nnue', DIR));
      if (response.ok) {
        stockfish.FS.writeFile('/shogi.nnue', new Uint8Array(await response.arrayBuffer()));
        command('setoption name EvalFile value /shogi.nnue');
        command('setoption name Use NNUE value true');
      } else command('setoption name Use NNUE value false');
    } catch (_) {command('setoption name Use NNUE value false');}
    waiter = waitLine(x => x.trim() === 'readyok', 18000);
    command('isready');
    await waiter;
    ready = true;
    postMessage({status:'ready'});
  } catch (error) {
    postMessage({error:'WASMエンジン起動失敗: '+String(error)});
    loading = false;
    queue = [];
    return;
  }
  loading = false;
  pump();
}
async function pump() {
  if (!ready || processing || queue.length === 0) return;
  processing = true;
  const data = queue.shift();
  try {
    // The game UI is authoritative for legal moves. Always validate the engine reply there.
    const list = Array.isArray(data.moves) ? data.moves : [];
    if (list.some(m => !/^(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])$/.test(m)))
      throw new Error('局面情報が正しくありません');
    command('position startpos'+(list.length ? ' moves '+list.join(' ') : ''));
    const waiter = waitLine(line => line.startsWith('bestmove '), Math.min(60000, data.ms + 24000));
    command('go movetime '+Math.max(1000, Math.min(30000, Number(data.ms)||12000)));
    const answer = await waiter;
    const usi = answer.trim().split(/\s+/)[1];
    postMessage({id:data.id, usi, status:'move'});
  } catch (err) {
    postMessage({id:data.id,error:String(err)});
  } finally {
    processing = false;
    pump();
  }
}
self.onmessage = event => {
  const data = event.data;
  if (!data || typeof data.id !== 'number') return;
  queue.push(data);
  if (!loading && !ready) initialize();
  if (ready) pump();
};