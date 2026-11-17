/* mutant-pool.js — runs a prover's mutants on every CPU core.

   The gate's slowest provers boot a whole page (jsdom) for each mutant. Run one after another
   that is most of the gate's time; the mutants are independent, so they are split over worker
   processes of the same prover: worker k of n takes the mutants whose index % n === k.

   runMutants(list, runOne) → { bit, dull: [index], failed: [shard] }
     runOne(item, index) resolves true when the mutant turned something red (it bites).
     A runOne that throws counts as red, like the provers' own loops always did.
   Inside a worker (SY_MUT_SHARD=k/n set by the parent) it prints its share and exits; the
   parent runs share 0 itself and adds up the rest. A worker that dies without reporting makes
   the whole run fail (failed lists it) — never a silent pass.

   SY_MUT_JOBS=1 runs everything in one process (old behaviour); default = cores, at most 4. */
'use strict';
const os = require('os');
const { spawn } = require('child_process');

const TAG = '@@MUT ';

function shard() {
  const m = /^(\d+)\/(\d+)$/.exec(process.env.SY_MUT_SHARD || '');
  return m ? { k: +m[1], n: +m[2] } : null;
}
function jobs() {
  const want = parseInt(process.env.SY_MUT_JOBS || '', 10);
  const cores = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  return Math.max(1, Math.min(want > 0 ? want : 4, cores));
}
function spawnShard(k, n) {
  return new Promise(resolve => {
    const env = Object.assign({}, process.env, { SY_MUT_SHARD: k + '/' + n });
    const c = spawn(process.execPath, process.argv.slice(1), { env, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    c.stdout.on('data', d => { out += d; });
    c.on('close', code => {
      const lines = out.split('\n'), i = lines.map(l => l.indexOf(TAG) === 0).lastIndexOf(true);
      lines.forEach((l, j) => { if (j !== i && l.trim()) console.log(l); });
      let res = null;
      if (i > -1) { try { res = JSON.parse(lines[i].slice(TAG.length)); } catch (e) { res = null; } }
      resolve(res && code === 0 ? res : { failed: true, k, code });
    });
  });
}

async function runMutants(list, runOne) {
  const sh = shard(), n = sh ? sh.n : jobs(), k = sh ? sh.k : 0;
  const kids = [];
  if (!sh) for (let j = 1; j < n; j++) kids.push(spawnShard(j, n));
  const mine = { bit: 0, dull: [] };
  for (let i = 0; i < list.length; i++) {
    if (i % n !== k) continue;
    let red;
    try { red = await runOne(list[i], i); } catch (e) { red = true; }
    if (red) mine.bit++; else mine.dull.push(i);
  }
  if (sh) { process.stdout.write('\n' + TAG + JSON.stringify(mine) + '\n'); process.exit(0); }
  const res = { bit: mine.bit, dull: mine.dull.slice(), failed: [] };
  (await Promise.all(kids)).forEach(r => {
    if (r.failed) { res.failed.push(r.k); return; }
    res.bit += r.bit; res.dull = res.dull.concat(r.dull);
  });
  res.dull.sort((a, b) => a - b);
  return res;
}

/* Stop at the first red check, for mutant runs only — one red check already proves the mutant bites.
   BAIL is thrown out of the prover's own checks; the caller treats it as red. */
const BAIL = { bail: 'first red check' };
process.on('unhandledRejection', e => { if (e === BAIL) return; console.error(e && e.stack || e); process.exit(1); });

/* For provers that collect results as r.key = value: keys the live run sets exactly once are final,
   so a falsy value on one of them is red for good and the run can stop there. A key set more than
   once (a falsy value could still be overwritten) is only recorded, never stopped on. */
function counter() {
  const seen = Object.create(null);
  return {
    make: () => new Proxy({}, { set(t, key, v) { t[key] = v; seen[key] = (seen[key] || 0) + 1; return true; } }),
    once: () => new Set(Object.keys(seen).filter(key => seen[key] === 1))
  };
}
function bailing(once) {
  return () => new Proxy({}, { set(t, key, v) { t[key] = v; if (!v && once.has(key)) throw BAIL; return true; } });
}

module.exports = { runMutants, jobs, BAIL, counter, bailing };
