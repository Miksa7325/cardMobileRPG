// Бот симулятора: играет бой на шкале так, как сильный игрок. Его используют tools/sim.js (отдельные бои)
// и tools/sim-run.js (полный забег).
import { CONFIG } from "../js/config.ts";
import { ACTS } from "../js/data/acts.ts";
import { CARDS } from "../js/data/cards.ts";
import { ENEMIES } from "../js/data/enemies.ts";
import { HEROES } from "../js/data/heroes.ts";
import { POTIONS } from "../js/data/potions.ts";
import { RELICS } from "../js/data/relics.ts";
import { cardWeight, chooseBrew, createCombat, endTurn, launch, placeCard, placePotion, setKeep } from "../js/engine/combat.ts";
import { getCardData } from "../js/engine/deck.ts";

const MAX_TURNS = 60; // бой дольше считается поражением: бот застрял
let BEAM = 32;

// Ширина поиска: сколько лучших недостроенных расстановок бот держит на каждом шаге
export function setBeam(beam) {
  BEAM = beam;
}

// Опыт с числами Силы: умножаем Силу во всех данных только в памяти симулятора, файлы не меняются
export function applyStrengthScale(scale) {
  if (scale === 1) return;
  const walk = (value) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== "object") return;
    if (value.type === "applyStatus" && value.status === "strength") value.amount *= scale;
    for (const child of Object.values(value)) walk(child);
  };
  [CARDS, ENEMIES, RELICS, POTIONS].forEach(walk);
  CONFIG.depth.strengthPerStep *= scale;
  for (const act of ACTS) {
    act.enemyStrength *= scale;
    if (act.mechanic.enemyStrength) act.mechanic.enemyStrength *= scale;
    if (act.mechanic.enemyRamp) act.mechanic.enemyRamp *= scale;
  }
}

// ---------- Бот ----------
//
// Бот строит дорожку слева направо: на каждом шаге выбирает, что поставить следующим (карту, зелье или подготовку Мага)
// и на кого. Следующая карта встаёт сразу за предыдущей, без пустых клеток: пустые клетки бот не пробует.
// Каждый вариант он доигрывает на копии боя до конца шкалы — вместе с ходами врагов — и берёт лучший.

// Где кончается то, что уже стоит на дорожке: следующее встанет после этого
function laneEnd(combat) {
  let end = combat.clock;
  for (const item of combat.lane) {
    if (item.weight === 0) end = Math.max(end, item.start);
    else end = Math.max(end, item.end ?? item.start + item.weight - 1);
  }
  return end;
}

// Все действия, которые можно сделать прямо сейчас. Одинаковые карты (два Удара) — одно действие
function listActions(combat) {
  // Алхимик сначала выбирает, какое из двух сваренных зелий взять
  if (combat.brewChoices.length > 0) {
    return combat.brewChoices[0].options.map((potionId) => ({ kind: "brew", potionId }));
  }
  const actions = [];
  const seen = new Set();
  const alive = combat.enemies.filter((enemy) => enemy.hp > 0);
  const end = laneEnd(combat);
  const targetsFor = (target) => (target === "enemy" ? alive.map((enemy) => enemy.instanceId) : [null]);

  for (const instance of combat.piles.hand) {
    const weight = cardWeight(instance);
    if (weight === null) continue;
    const card = getCardData(instance);
    const start = weight === 0 ? end : end + 1;
    for (const targetId of targetsFor(card.target)) {
      const key = `card:${instance.cardId}:${instance.level}:${targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      actions.push({ kind: "card", uid: instance.uid, start, targetId });
      // Маг может поставить заклинание на подготовку
      if (HEROES[combat.hero.heroId].prepares) actions.push({ kind: "card", uid: instance.uid, start: 0, targetId, prepare: true });
    }
  }

  combat.potions.forEach((potionId, index) => {
    const potion = POTIONS[potionId];
    const weight = HEROES[combat.hero.heroId].potionWeight;
    for (const targetId of targetsFor(potion.target)) {
      const key = `potion:${potionId}:${targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      actions.push({ kind: "potion", index, start: weight === 0 ? end : end + 1, targetId });
    }
  });
  return actions;
}

function applyAction(combat, action) {
  if (action.kind === "brew") return chooseBrew(combat, 0, action.potionId).ok;
  if (action.kind === "card") return placeCard(combat, action.uid, action.start, action.targetId, { prepare: action.prepare }).ok;
  return placePotion(combat, action.index, action.start, action.targetId).ok;
}

// Копия боя: бот пробует ходы на ней, настоящий бой не трогается
function cloneCombat(combat) {
  const copy = structuredClone(combat);
  copy.events = [];
  return copy;
}

// В руке остаются 2 самые тяжёлые карты, которые не поставлены: их проще всего разыграть потом
function chooseKeep(combat) {
  const playable = combat.piles.hand.filter((card) => cardWeight(card) !== null);
  playable.sort((a, b) => cardWeight(b) - cardWeight(a));
  setKeep(combat, playable.slice(0, CONFIG.timeline.keepInHand).map((card) => card.uid));
}

// Насколько хорошо положение после конца шкалы. Больше — лучше
function evaluate(combat) {
  const hero = combat.hero;
  if (combat.status === "lost") return -1e6;
  if (combat.status === "won") return 1e6 + hero.hp * 10 + combat.potions.length * 5;

  const s = hero.statuses;
  let score = hero.hp * 10 + hero.block * 3; // блок переживает конец хода
  score += (s.strength ?? 0) * 12 + (s.dexterity ?? 0) * 6 + (s.haste ?? 0) * 4;
  score += (s.rage ?? 0) * 2 + (s.darkness ?? 0) * 2 + (s.surge ?? 0) * 3 + (s.reagents ?? 0) * 2;
  score -= (s.poison ?? 0) * 8 + (s.burning ?? 0) * 6 + (s.weak ?? 0) * 6 + (s.vulnerable ?? 0) * 8;
  score -= (s.slow ?? 0) * 6 + (s.stun ?? 0) * 15 + (s.bleed ?? 0) * 8;
  score += hero.powers.length * 15;
  score += combat.potions.length * 5 + combat.prepared.length * 8;

  for (const enemy of combat.enemies) {
    if (enemy.hp <= 0) {
      score += 60; // мёртвый враг больше не бьёт
      continue;
    }
    const es = enemy.statuses;
    score -= enemy.hp * 4 + enemy.block * 2;
    score += (es.poison ?? 0) * 5 + (es.burning ?? 0) * 4 + (es.leech ?? 0) * 6 + (es.vulnerable ?? 0) * 6 + (es.weak ?? 0) * 5;
    score += (es.slow ?? 0) * 5 + (es.stun ?? 0) * 15 + (es.bleed ?? 0) * 5;
    score -= (es.strength ?? 0) * 10;
  }
  return score;
}

// Доигрывает копию до конца шкалы: паузы пропускает, выбор варки — первое зелье
function finishOnCopy(state) {
  const copy = cloneCombat(state);
  if (copy.status !== "planning") return copy;
  chooseKeep(copy);
  endTurn(copy);
  return copy;
}

// Поиск лучом: на каждом шаге из всех расстановок «на одну карту длиннее» оставляем BEAM лучших
// и продолжаем только их. Любую из них можно запустить — лучшая из всех проверенных и есть план хода
export function planTurn(combat) {
  const score = (state) => (state.brewChoices.length > 0 ? -Infinity : evaluate(finishOnCopy(state)));
  let best = { score: score(combat), actions: [] };
  let frontier = [{ state: combat, actions: [] }];
  while (frontier.length > 0) {
    const children = [];
    for (const node of frontier) {
      if (node.state.status !== "planning") continue;
      for (const action of listActions(node.state)) {
        const next = cloneCombat(node.state);
        if (!applyAction(next, action)) continue;
        // Пока зелье варки не выбрано, запускать нельзя: оцениваем по лучшему выбору на следующем шаге
        const value = next.brewChoices.length > 0 ? evaluate(finishOnCopy(next)) : score(next);
        const child = { state: next, actions: [...node.actions, action], value };
        if (next.brewChoices.length === 0 && value > best.score) best = { score: value, actions: child.actions };
        children.push(child);
      }
    }
    children.sort((x, y) => y.value - x.value);
    frontier = children.slice(0, BEAM);
  }
  return best.actions;
}

// Доигрывает уже созданный бой до конца: каждый ход бот планирует, ставит и запускает.
// uid и номера зелий в копии совпадают с настоящими: копия — точный слепок боя
export function playCombat(combat) {
  while (combat.status === "planning" && combat.turn <= MAX_TURNS) {
    for (const action of planTurn(combat)) {
      if (!applyAction(combat, action)) break;
    }
    // Если варка осталась невыбранной, берём первое зелье
    while (combat.brewChoices.length > 0) chooseBrew(combat, 0, combat.brewChoices[0].options[0]);
    chooseKeep(combat);
    // Розыгрыш может встать на паузу: тогда бот снова планирует с этого места
    launch(combat);
  }
  // Застрял дольше MAX_TURNS — считаем поражением
  if (combat.status === "planning") combat.status = "lost";
  return combat;
}

// Создаёт бой и играет его до конца
export function runFight(heroId, enemyIds, seed, setup) {
  const combat = createCombat({ heroId, enemyIds, seed, relics: HEROES[heroId].relics, ...setup });
  const startHp = combat.hero.hp;
  playCombat(combat);
  return { won: combat.status === "won", hpLost: startHp - combat.hero.hp, turns: combat.turn };
}
