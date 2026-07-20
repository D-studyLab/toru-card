"use strict";
// toru-card gates: determinism, sane monotonicities, and THE LESSON —
// there exist decks where adding a decent card lowers the win rate.
const D = require("./deckev.js");

let pass = true;
function check(n, c, d) { console.log(`${c ? "PASS" : "FAIL"}  ${n}  ${d || ""}`); if (!c) pass = false; }

const BASE = { strike: 5, guard: 4, heavy: 1 }; // 10-card starter analog

// T1: determinism
{
  const a = D.evaluate(7, BASE, 3000);
  const b = D.evaluate(7, BASE, 3000);
  check("T1 determinism", a.winRate === b.winRate, `win=${(a.winRate * 100).toFixed(1)}%`);
}

// T2: base deck is winnable but not trivial (30-90%)
{
  const r = D.evaluate(11, BASE, 5000);
  check("T2 base band", r.winRate > 0.3 && r.winRate < 0.9, `win=${(r.winRate * 100).toFixed(1)}%`);
}

// T3: curse strictly hurts
{
  const r0 = D.evaluate(13, BASE, 5000);
  const r1 = D.evaluate(13, { ...BASE, curse: 2 }, 5000);
  check("T3 curse hurts", r1.winRate < r0.winRate - 0.03,
    `${(r0.winRate * 100).toFixed(1)}% -> ${(r1.winRate * 100).toFixed(1)}%`);
}

// T4: THE LESSON — a combo deck gets WORSE when you add a mediocre card
{
  const comboDeck = { combo: 5, cycle: 3, guard: 2 };
  const r0 = D.evaluate(17, comboDeck, 6000);
  const r1 = D.evaluate(17, { ...comboDeck, mediocre: 1 }, 6000);
  check("T4 dilution lesson exists", r0.winRate > 0.35 && r1.winRate < r0.winRate - 0.02,
    `combo ${(r0.winRate * 100).toFixed(1)}% -> +中途半端 ${(r1.winRate * 100).toFixed(1)}%`);
}

// T5: and the SAME card helps a plain deck (context dependence!)
{
  const plain = { strike: 4, guard: 4 };
  const r0 = D.evaluate(19, plain, 6000);
  const r1 = D.evaluate(19, { ...plain, mediocre: 1 }, 6000);
  check("T5 same card helps elsewhere", r1.winRate > r0.winRate - 0.01,
    `plain ${(r0.winRate * 100).toFixed(1)}% -> +中途半端 ${(r1.winRate * 100).toFixed(1)}%`);
}

// T6: performance — 10000 sims well under a second
{
  const t0 = Date.now();
  D.evaluate(23, BASE, 10000);
  const ms = Date.now() - t0;
  check("T6 performance", ms < 1500, `${ms}ms / 10000 sims`);
}

console.log(pass ? "\nDECKEV CORE PASS" : "\nDECKEV CORE FAIL");
process.exit(pass ? 0 : 1);
