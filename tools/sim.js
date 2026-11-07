// Симулятор боёв: гоняет настоящий движок игры (js/engine) без браузера.
// Бот в каждом ходу перебирает, какие карты и зелья поставить на шкалу и в каком порядке,
// для каждого варианта доигрывает шкалу на копии боя (вместе с ходами врагов) и берёт лучший.
//
// Запуск:   node tools/sim.js
// Параметры (все необязательные):
//   --fights=30          сколько боёв на каждую пару «герой — враги»
//   --beam=32            ширина поиска: сколько лучших недостроенных расстановок бот держит на каждом шаге (больше — умнее, но медленнее)
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
import { cardWeight, chooseBrew, createCombat, endTurn, launch, placeCard, placePotion, setKeep } from "../js/engine/combat.ts";
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
const BEAM = Number(args.beam ?? 32);
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
      if (HEROES[combat.hero.heroId].prepCapacity) actions.push({ kind: "card", uid: instance.uid, start: 0, targetId, prepare: true });
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
function planTurn(combat) {
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

// Играет один бой до конца. uid и номера зелий в копии совпадают с настоящими: копия — точный слепок боя
function runFight(heroId, enemyIds, seed, setup) {
  const combat = createCombat({ heroId, enemyIds, seed, relics: HEROES[heroId].relics, ...setup });
  const startHp = combat.hero.hp;

  while (combat.status === "planning" && combat.turn <= MAX_TURNS) {
    for (const action of planTurn(combat)) {
      if (!applyAction(combat, action)) break;
    }
    // Если варка осталась невыбранной (бюджет кончился), берём первое зелье
    while (combat.brewChoices.length > 0) chooseBrew(combat, 0, combat.brewChoices[0].options[0]);
    chooseKeep(combat);
    // Розыгрыш может встать на паузу: тогда бот снова планирует с этого места
    launch(combat);
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

console.log(`Акт ${ACT_INDEX + 1} «${act.name}», этаж ${FLOOR}, боёв на пару: ${FIGHTS}, ширина поиска: ${BEAM}, Сила ×${STRENGTH_SCALE}\n`);

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
  const meta = { date: new Date().toISOString().slice(0, 10), act: ACT_INDEX + 1, actName: act.name, floor: FLOOR, fights: FIGHTS, beam: BEAM, strengthScale: STRENGTH_SCALE };
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
    `Дата: ${meta.date}. Этаж: ${meta.floor}. Боёв на пару: ${meta.fights}. Ширина поиска бота: ${meta.beam}.`,
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
