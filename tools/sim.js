// Симулятор боёв: гоняет настоящий движок игры (js/engine) без браузера.
// Бот в каждом ходу перебирает, какие карты и зелья сыграть и в каком порядке,
// для каждого варианта доигрывает ход врагов на копии боя и берёт лучший.
//
// Запуск:   node tools/sim.js
// Параметры (все необязательные):
//   --fights=30          сколько боёв на каждую пару «герой — враги»
//   --budget=400         сколько вариантов хода бот проверяет за ход (больше — умнее, но медленнее)
//   --act=1              какой акт (номер с 1)
//   --floor=0            этаж, на котором идёт обычный бой и элита (глубже — враги крепче)
//   --heroes=warrior,mage   только эти герои
//   --strength-scale=2   умножить все числа Силы (карты, враги, реликвии, зелья, акты) — для подбора чисел
//   --out=tools/baseline/current   сохранить итог в .json и .md с этим именем
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { CONFIG } from "../js/config.ts";
import { ACTS } from "../js/data/acts.ts";
import { CARDS } from "../js/data/cards.ts";
import { RELICS } from "../js/data/relics.ts";
import { ENEMIES } from "../js/data/enemies.ts";
import { HEROES } from "../js/data/heroes.ts";
import { POTIONS } from "../js/data/potions.ts";
import { canPlayCard, createCombat, endTurn, playCard, usePotion } from "../js/engine/combat.ts";
import { getCardData } from "../js/engine/deck.ts";

const MAX_TURNS = 60; // бой дольше считается поражением: бот застрял

// ---------- Параметры командной строки ----------
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "true"];
  }),
);
const FIGHTS = Number(args.fights ?? 30);
const BUDGET = Number(args.budget ?? 400);
const ACT_INDEX = Number(args.act ?? 1) - 1;
const FLOOR = Number(args.floor ?? 0);
const STRENGTH_SCALE = Number(args["strength-scale"] ?? 1);

// Опыт с числами Силы: умножаем Силу во всех данных только в памяти симулятора, файлы не меняются
function scaleStrength(value) {
  if (Array.isArray(value)) return value.forEach(scaleStrength);
  if (!value || typeof value !== "object") return;
  if (value.type === "applyStatus" && value.status === "strength") value.amount *= STRENGTH_SCALE;
  for (const child of Object.values(value)) scaleStrength(child);
}
if (STRENGTH_SCALE !== 1) {
  [CARDS, ENEMIES, RELICS, POTIONS].forEach(scaleStrength);
  for (const act of ACTS) {
    act.enemyStrength *= STRENGTH_SCALE;
    if (act.mechanic.enemyStrength) act.mechanic.enemyStrength *= STRENGTH_SCALE;
    if (act.mechanic.enemyRamp) act.mechanic.enemyRamp *= STRENGTH_SCALE;
  }
}
const HERO_IDS = args.heroes ? args.heroes.split(",") : Object.keys(HEROES);

// ---------- Бот ----------

// Все действия, которые можно сделать прямо сейчас. Одинаковые карты (два Удара) — одно действие
function listActions(combat) {
  const actions = [];
  const seen = new Set();
  const alive = combat.enemies.filter((enemy) => enemy.hp > 0);

  for (const instance of combat.piles.hand) {
    if (!canPlayCard(combat, instance)) continue;
    const card = getCardData(instance);
    const targets = card.target === "enemy" ? alive.map((enemy) => enemy.instanceId) : [null];
    for (const targetId of targets) {
      const key = `card:${instance.cardId}:${instance.upgraded}:${targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      actions.push({ kind: "card", uid: instance.uid, targetId, label: `${card.name}${targetId ? " → " + targetId : ""}` });
    }
  }

  combat.potions.forEach((potionId, index) => {
    const potion = POTIONS[potionId];
    const targets = potion.target === "enemy" ? alive.map((enemy) => enemy.instanceId) : [null];
    for (const targetId of targets) {
      const key = `potion:${potionId}:${targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      actions.push({ kind: "potion", index, targetId, label: `зелье ${potion.name}` });
    }
  });
  return actions;
}

function applyAction(combat, action) {
  if (action.kind === "card") return playCard(combat, action.uid, action.targetId).ok;
  return usePotion(combat, action.index, action.targetId).ok;
}

// Копия боя: бот пробует ходы на ней, настоящий бой не трогается
function cloneCombat(combat) {
  const copy = structuredClone(combat);
  copy.events = [];
  return copy;
}

// Насколько хорошо положение после хода врагов. Больше — лучше
function evaluate(combat) {
  const hero = combat.hero;
  if (combat.status === "lost") return -1e6;
  if (combat.status === "won") return 1e6 + hero.hp * 10 + combat.potions.length * 5;

  const s = hero.statuses;
  let score = hero.hp * 10;
  score += (s.strength ?? 0) * 12 + (s.dexterity ?? 0) * 10;
  score += (s.rage ?? 0) * 2 + (s.darkness ?? 0) * 2 + (s.surge ?? 0) * 3 + (s.reagents ?? 0) * 2;
  score -= (s.poison ?? 0) * 8 + (s.burning ?? 0) * 6 + (s.weak ?? 0) * 6 + (s.vulnerable ?? 0) * 8;
  score += hero.powers.length * 15;
  score += combat.potions.length * 5;

  for (const enemy of combat.enemies) {
    if (enemy.hp <= 0) {
      score += 60; // мёртвый враг больше не бьёт
      continue;
    }
    const es = enemy.statuses;
    score -= enemy.hp * 4 + enemy.block * 2;
    score += (es.poison ?? 0) * 5 + (es.burning ?? 0) * 4 + (es.leech ?? 0) * 6 + (es.vulnerable ?? 0) * 6 + (es.weak ?? 0) * 5;
    score -= (es.strength ?? 0) * 10;
  }
  return score;
}

// Перебор: в каждой точке можно закончить ход или сделать ещё одно действие.
// Возвращает лучшую последовательность действий на этот ход
function planTurn(combat) {
  let best = { score: -Infinity, actions: [] };
  let budget = BUDGET;

  function explore(state, actions) {
    if (budget <= 0) return;
    budget -= 1;

    // Вариант «закончить ход здесь»: доигрываем ход врагов на копии
    const ended = cloneCombat(state);
    if (ended.status === "playerTurn") endTurn(ended);
    const score = evaluate(ended);
    if (score > best.score) best = { score, actions };
    if (state.status !== "playerTurn") return;

    for (const action of listActions(state)) {
      const next = cloneCombat(state);
      if (!applyAction(next, action)) continue;
      explore(next, [...actions, action]);
      if (budget <= 0) return;
    }
  }

  explore(combat, []);
  return best.actions;
}

// Играет один бой до конца. Карты ищем заново по названию и цели: uid в копии совпадают с настоящими
function runFight(heroId, enemyIds, seed, setup) {
  const combat = createCombat({ heroId, enemyIds, seed, relics: HEROES[heroId].relics, ...setup });
  const startHp = combat.hero.hp;

  while (combat.status === "playerTurn" && combat.turn <= MAX_TURNS) {
    for (const action of planTurn(combat)) {
      if (combat.status !== "playerTurn") break;
      // Зелья сдвигают номера в сумке: ищем то же зелье заново
      if (action.kind === "potion") {
        const potionId = combat.potions[action.index];
        action.index = combat.potions.indexOf(potionId);
      }
      applyAction(combat, action);
    }
    if (combat.status === "playerTurn") endTurn(combat);
  }

  const won = combat.status === "won";
  return { won, hpLost: startHp - combat.hero.hp, turns: combat.turn };
}

// ---------- Бои акта ----------

// Те же множители, что в createNodeCombat (js/engine/run.js), без случайного выбора группы
function actSetup(act, type) {
  const depth = type === "boss" ? 0 : FLOOR;
  const depthHp = 1 + CONFIG.depth.hpPerFloor * depth;
  const depthStrength = Math.floor(depth / CONFIG.depth.floorsPerStrength) * STRENGTH_SCALE;
  const actMultiplier = type === "boss" ? act.bossHpMultiplier ?? act.enemyHpMultiplier : act.enemyHpMultiplier;
  return {
    enemyHpMultiplier: CONFIG.enemyHpMultiplier * depthHp * actMultiplier,
    enemyStrength: act.enemyStrength + (act.mechanic.enemyStrength ?? 0) + depthStrength,
    enemyBlock: act.mechanic.enemyBlock ?? 0,
    enemyRamp: act.mechanic.enemyRamp ?? 0,
    heroStatuses: act.mechanic.heroPoison ? { poison: act.mechanic.heroPoison } : {},
    extraPassives: act.mechanic.heroPassives ?? [],
  };
}

function listEncounters(act) {
  return [
    ...act.encounters.map((enemyIds) => ({ type: "battle", enemyIds })),
    ...act.elites.map((enemyIds) => ({ type: "elite", enemyIds })),
    { type: "boss", enemyIds: act.boss },
  ];
}

const encounterName = (enemyIds) => enemyIds.map((id) => ENEMIES[id].name).join(" + ");
const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

// ---------- Запуск ----------
const act = ACTS[ACT_INDEX];
const encounters = listEncounters(act);
const results = [];
const started = Date.now();

console.log(`Акт ${ACT_INDEX + 1} «${act.name}», этаж ${FLOOR}, боёв на пару: ${FIGHTS}, перебор: ${BUDGET} вариантов за ход, Сила ×${STRENGTH_SCALE}\n`);

for (const heroId of HERO_IDS) {
  for (const encounter of encounters) {
    const setup = actSetup(act, encounter.type);
    let wins = 0, hpLost = 0, turns = 0;
    for (let i = 0; i < FIGHTS; i++) {
      const fight = runFight(heroId, encounter.enemyIds, 1000 + i, setup);
      if (fight.won) wins += 1;
      hpLost += fight.hpLost;
      turns += fight.turns;
    }
    const row = {
      hero: heroId,
      heroName: HEROES[heroId].name,
      type: encounter.type,
      enemies: encounter.enemyIds,
      enemiesName: encounterName(encounter.enemyIds),
      winRate: round(wins / FIGHTS, 3),
      avgHpLost: round(hpLost / FIGHTS),
      avgTurns: round(turns / FIGHTS),
    };
    results.push(row);
    console.log(
      `${row.heroName.padEnd(13)} ${row.type.padEnd(6)} ${row.enemiesName.padEnd(36)} ` +
        `победы ${String(Math.round(row.winRate * 100)).padStart(3)}%  HP −${String(row.avgHpLost).padStart(5)}  ходов ${row.avgTurns}`,
    );
  }
  console.log("");
}

console.log(`Готово за ${round((Date.now() - started) / 1000)} с`);

// ---------- Сохранение ----------
if (args.out) {
  const meta = { date: new Date().toISOString().slice(0, 10), act: ACT_INDEX + 1, actName: act.name, floor: FLOOR, fights: FIGHTS, budget: BUDGET, strengthScale: STRENGTH_SCALE };
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(`${args.out}.json`, JSON.stringify({ meta, results }, null, 2));
  writeFileSync(`${args.out}.md`, toMarkdown(meta, results));
  console.log(`Сохранено: ${args.out}.json и ${args.out}.md`);
}

function toMarkdown(meta, rows) {
  const heroes = [...new Set(rows.map((row) => row.hero))];
  const fights = [...new Set(rows.map((row) => `${row.type}|${row.enemiesName}`))];
  const typeName = { battle: "бой", elite: "элита", boss: "босс" };
  const lines = [
    `# Эталон сложности: акт ${meta.act} «${meta.actName}»`,
    "",
    `Дата: ${meta.date}. Этаж: ${meta.floor}. Боёв на пару: ${meta.fights}. Бот проверяет ${meta.budget} вариантов за ход.`,
    "Герой со стартовой колодой, стартовой реликвией и полным HP, без зелий. В клетке: победы / потеря HP / ходов.",
    "",
    `| Бой | ${heroes.map((id) => HEROES[id].name).join(" | ")} |`,
    `| --- | ${heroes.map(() => "---").join(" | ")} |`,
  ];
  for (const fight of fights) {
    const [type, name] = fight.split("|");
    const cells = heroes.map((hero) => {
      const row = rows.find((r) => r.hero === hero && `${r.type}|${r.enemiesName}` === fight);
      return `${Math.round(row.winRate * 100)}% / −${row.avgHpLost} / ${row.avgTurns}`;
    });
    lines.push(`| ${typeName[type]}: ${name} | ${cells.join(" | ")} |`);
  }
  return lines.join("\n") + "\n";
}
