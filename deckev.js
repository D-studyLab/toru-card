"use strict";
// toru-card core: a compact roguelike-deckbuilder combat model + Monte Carlo EV.
// Not a StS clone — an abstract model that captures the real lessons
// (deck thinning, draw consistency, curse cost). Shared with tests.
(function (root) {
  function mulberry(seed) { let a = seed >>> 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // card types
  const CARDS = {
    strike:  { name: 'ストライク',   cost: 1, dmg: 6,  block: 0,  desc: '6ダメージ' },
    heavy:   { name: 'ヘビーブロー', cost: 2, dmg: 14, block: 0,  desc: '14ダメージ' },
    combo:   { name: 'コンボ',       cost: 1, dmg: 0,  block: 0,  combo: 2, desc: '手札のコンボ1枚につき2ダメージ×枚数（自身含む・枚数の2乗で伸びる）' },
    guard:   { name: 'ガード',       cost: 1, dmg: 0,  block: 6,  desc: 'ブロック6' },
    bigwall: { name: '大城壁',       cost: 2, dmg: 0,  block: 14, desc: 'ブロック14' },
    cycle:   { name: 'サイクル',     cost: 0, dmg: 0,  block: 0,  draw: 1, desc: '0コスト・1枚引く' },
    curse:   { name: '呪い',         cost: 0, unplayable: true, desc: '使えない・手札を圧迫' },
    mediocre:{ name: '中途半端',     cost: 1, dmg: 4,  block: 3,  desc: '4ダメージ+ブロック3（器用貧乏）' },
  };

  // attack swings each turn (intent variance) and ramps so fights can't stall.
  // Calibrated so the 10-card starter deck wins ~69% (visible headroom both ways).
  const ENEMY = { hp: 95, atk: 6, atkVar: 12, ramp: 1 };
  // draw 4 keeps hands tight so every card slot matters (grid-searched so that
  // curses hurt, dilution of a combo deck hurts, and the same card helps a weak deck)
  const PLAYER = { hp: 70, energy: 3, draw: 4 };
  const MAX_TURNS = 14;

  // deck: {cardKey: count}
  function deckList(deck) {
    const list = [];
    for (const [k, n] of Object.entries(deck)) for (let i = 0; i < n; i++) list.push(k);
    return list;
  }

  function simulateOne(rng, deck) {
    let php = PLAYER.hp, ehp = ENEMY.hp;
    let drawPile = deckList(deck);
    // shuffle
    for (let i = drawPile.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [drawPile[i], drawPile[j]] = [drawPile[j], drawPile[i]]; }
    let discard = [];
    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      // draw
      const hand = [];
      let need = PLAYER.draw;
      while (need > 0) {
        if (drawPile.length === 0) {
          if (discard.length === 0) break;
          drawPile = discard; discard = [];
          for (let i = drawPile.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [drawPile[i], drawPile[j]] = [drawPile[j], drawPile[i]]; }
        }
        hand.push(drawPile.pop()); need--;
      }
      // play phase: greedy policy
      let energy = PLAYER.energy, block = 0;
      const incoming = ENEMY.atk + (turn - 1) * ENEMY.ramp + Math.floor(rng() * (ENEMY.atkVar + 1));
      // extra draws first (cycle is free value)
      for (let i = 0; i < hand.length; i++) {
        if (hand[i] === 'cycle' && energy >= 0) {
          if (drawPile.length === 0 && discard.length) {
            drawPile = discard; discard = [];
            for (let k = drawPile.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [drawPile[k], drawPile[j]] = [drawPile[j], drawPile[k]]; }
          }
          if (drawPile.length) hand.push(drawPile.pop());
          discard.push('cycle'); hand.splice(i, 1); i--;
        }
      }
      // decide: how much block do we need to survive?
      const lethalDanger = incoming >= php;
      // playable cards by priority
      const playable = hand.filter(k => !CARDS[k].unplayable && k !== 'cycle');
      // damage values (combo counts combo cards in hand)
      const comboN = hand.filter(k => k === 'combo').length;
      const dmgOf = k => CARDS[k].combo ? CARDS[k].combo * comboN : (CARDS[k].dmg || 0);
      // if in lethal danger: block first, then attack; else attack first, then block leftovers
      const order = playable.slice().sort((a, b) => {
        const aBlock = CARDS[a].block || 0, bBlock = CARDS[b].block || 0;
        if (lethalDanger) {
          if (bBlock !== aBlock) return bBlock - aBlock;
          return dmgOf(b) - dmgOf(a);
        }
        const aScore = dmgOf(a) / (CARDS[a].cost || 1), bScore = dmgOf(b) / (CARDS[b].cost || 1);
        if (bScore !== aScore) return bScore - aScore;
        return bBlock - aBlock;
      });
      for (const k of order) {
        const c = CARDS[k];
        if (c.cost > energy) continue;
        energy -= c.cost;
        ehp -= dmgOf(k);
        block += c.block || 0;
        if (ehp <= 0) return { win: true, turns: turn, hpLeft: php };
      }
      for (const k of hand) discard.push(k);
      // enemy attacks
      php -= Math.max(0, incoming - block);
      if (php <= 0) return { win: false, turns: turn, hpLeft: 0 };
    }
    return { win: false, turns: MAX_TURNS, hpLeft: php }; // timeout = loss (敵は無限に強くなる)
  }

  function evaluate(seed, deck, n) {
    const rng = mulberry(seed);
    let wins = 0, turnsSum = 0, hpSum = 0;
    for (let i = 0; i < n; i++) {
      const r = simulateOne(rng, deck);
      if (r.win) { wins++; turnsSum += r.turns; hpSum += r.hpLeft; }
    }
    return { n, winRate: wins / n,
      avgTurns: wins ? turnsSum / wins : null,
      avgHp: wins ? hpSum / wins : null };
  }

  const api = { mulberry, CARDS, ENEMY, PLAYER, MAX_TURNS, deckList, simulateOne, evaluate };
  if (typeof module !== 'undefined') module.exports = api;
  else root.DECKEV = api;
})(typeof window !== 'undefined' ? window : globalThis);
