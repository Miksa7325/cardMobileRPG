// Симулятор полного забега: бот новым героем проходит акт от входа до босса.
// Им проверяем главную цель баланса: «сильный бот новым героем проходит 1 акт примерно в 70% забегов».
//
// Бот видит всю карту акта (как с картой подземелья) и на каждом шаге выбирает путь к боссу по ценности комнат:
// бои и элита — награды, отдых — когда мало HP, события — по выгоде вариантов. Бои играет тот же бот, что и в tools/sim.js.
// Город он не посещает: забег идёт одним спуском. С --to бот идёт дальше через акты и в комнатах сохранения
// и после босса поднимается в город только отдохнуть (полное HP), без улучшений.
//
// Запуск:   node tools/sim-run.js
// Параметры (все необязательные):
//   --runs=30            сколько забегов на каждого героя
//   --first=0            с какого номера забега начать: так один большой прогон делится на части, которые идут параллельно
//   --beam=32            ширина поиска бота в бою
//   --act=1              какой акт проходить (герой начинает с него)
//   --to=10              идти дальше через акты до этого, пока герой жив: итог — сколько дошли до каждого акта
//                        и какая доля дошедших его прошла
//   --heroes=warrior,mage   только эти герои
//   --strength-scale=2   умножить все числа Силы — для подбора чисел
//   --patch=вариант.js   поменять данные только в памяти перед прогоном: export default (data) => { data.ENEMIES… }
//                        (data: ENEMIES, CARDS, ACTS, CONFIG, HEROES, RELICS, POTIONS) — для подбора чисел, файлы игры не меняются
//   --out=tools/baseline/run-act1   сохранить итог в .json и .md
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CONFIG } from "../js/config.ts";
import { ENEMIES } from "../js/data/enemies.ts";
import { CARDS } from "../js/data/cards.ts";
import { ACTS } from "../js/data/acts.ts";
import { HEROES } from "../js/data/heroes.ts";
import { RELICS } from "../js/data/relics.ts";
import { POTIONS } from "../js/data/potions.ts";
import { chooseEventOption, finishEvent, getEventData, startEvent } from "../js/engine/events.ts";
import {
  completeReward, createNodeCombat, createRun, enterNode, finishCombat, getAvailableNodeIds, getCurrentNode, getUpgradableCards,
  goToNextAct, healInCity, openCache, openChest, restHeal, takeFromCache,
} from "../js/engine/run.ts";
import { upgradeCard } from "../js/engine/deck.ts";
import { applyStrengthScale, playCombat, setBeam } from "./bot.js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, "").split("=");
  return [key, value ?? "true"];
}));
const RUNS = Number(args.runs ?? 30);
const FIRST = Number(args.first ?? 0);
const ACT = Number(args.act ?? 1);
const TO = Number(args.to ?? ACT);
const MULTI = TO > ACT;
const HERO_IDS = args.heroes ? args.heroes.split(",") : Object.keys(HEROES);
setBeam(Number(args.beam ?? 32));
if (args.patch) (await import(pathToFileURL(resolve(args.patch)).href)).default({ ENEMIES, CARDS, ACTS, CONFIG, HEROES, RELICS, POTIONS });
applyStrengthScale(Number(args["strength-scale"] ?? 1));

// ---------- Выбор пути ----------

// Сколько стоит зайти в комнату такого вида при таком здоровье. Тупики к боссу не ведут и в расчёт не попадают
function roomValue(type, hpShare) {
  switch (type) {
    case "battle": return hpShare > 0.35 ? 3 : -2;
    case "elite": return hpShare > 0.7 ? 6 : -12;
    case "rest": return hpShare < 0.55 ? 9 : 2;
    case "event": return 2;
    case "chest": return 5;
    case "cache": return 3;
    // Через несколько актов бот отдыхает в городе из комнаты сохранения
    case "save": return MULTI && hpShare < 0.7 ? 8 : 0;
    default: return 0;
  }
}

// Лучшая сумма ценностей от комнаты до босса; -Infinity — к боссу отсюда не дойти
function bestToBoss(run, nodeId, hpShare, memo) {
  if (memo.has(nodeId)) return memo.get(nodeId);
  const node = run.map.nodes[nodeId];
  let value;
  if (node.type === "boss") value = 0;
  else {
    const next = node.next.map((id) => bestToBoss(run, id, hpShare, memo));
    const best = Math.max(-Infinity, ...next);
    value = best === -Infinity ? -Infinity : best + (run.visitedNodeIds.includes(nodeId) ? 0 : roomValue(node.type, hpShare));
  }
  memo.set(nodeId, value);
  return value;
}

function chooseNextNode(run) {
  const hpShare = run.hp / run.maxHp;
  const memo = new Map();
  const options = getAvailableNodeIds(run).map((id) => ({ id, value: bestToBoss(run, id, hpShare, memo) }));
  options.sort((a, b) => b.value - a.value);
  return options[0]?.value === -Infinity ? null : options[0]?.id ?? null;
}

// ---------- Награды, отдых, события ----------

const RARITY_SCORE = { common: 1, uncommon: 2, rare: 3 };

// Карта в награду: самая редкая из предложенных. Колода больше 22 карт — новые не берём
function chooseRewardCard(run, cardIds) {
  if (cardIds.length === 0 || run.deck.length >= 22) return null;
  return [...cardIds].sort((a, b) => (RARITY_SCORE[CARDS[b].rarity] ?? 0) - (RARITY_SCORE[CARDS[a].rarity] ?? 0))[0];
}

// Отдых: мало HP — лечиться, иначе улучшить самую редкую карту
function rest(run) {
  const upgradable = getUpgradableCards(run);
  if (run.hp / run.maxHp < 0.7 || upgradable.length === 0) {
    restHeal(run);
    return;
  }
  upgradable.sort((a, b) => (RARITY_SCORE[CARDS[b.cardId].rarity] ?? 0) - (RARITY_SCORE[CARDS[a.cardId].rarity] ?? 0));
  upgradeCard(upgradable[0]);
}

// Насколько хорош вариант события. Золото в подземелье не тратится, поэтому почти ничего не стоит
function choiceValue(run, effects) {
  const lowHp = run.hp / run.maxHp < 0.4;
  let value = 0;
  for (const effect of effects) {
    switch (effect.type) {
      case "loseHp": value -= effect.amount * (lowHp ? 3 : 1); break;
      case "heal": value += Math.min(effect.amount, run.maxHp - run.hp); break;
      case "gainMaxHp": value += effect.amount * 2; break;
      case "loseMaxHp": value -= effect.amount * 2; break;
      case "gainRelic": value += 15; break;
      case "gainPotion": value += 5; break;
      case "gainShards": value += 2 * effect.amount; break;
      case "losePotion": value -= 4; break;
      case "upgradeRandomCards": value += 6 * effect.count; break;
      case "addCard": value += effect.cardId === "wound" ? -8 : 3; break;
      case "removeRandomCard": value += 2; break;
      case "gainGold": value += 0.1 * effect.amount; break;
      case "loseGold": value -= 0.1 * effect.amount; break;
    }
  }
  return value;
}

function playEvent(run) {
  startEvent(run);
  const data = getEventData(run.activeEvent);
  if (data) {
    const values = data.choices.map((choice) => choiceValue(run, choice.effects));
    chooseEventOption(run, values.indexOf(Math.max(...values)));
  }
  finishEvent(run);
}

// ---------- Забег ----------

function playRun(heroId, seed) {
  const run = createRun({ heroId, seed, startAct: ACT });
  const log = { won: false, floor: 0, fights: 0, hpBeforeBoss: null, deckSize: 0, diedTo: null, cleared: 0, diedInAct: null };
  while (run.status === "active" && run.act <= TO) {
    const nextId = chooseNextNode(run);
    if (nextId === null) break; // к боссу не дойти — так быть не должно
    enterNode(run, nextId);
    const node = getCurrentNode(run);
    log.floor = node.floor;
    if (["battle", "elite", "boss"].includes(node.type)) {
      if (node.type === "boss") log.hpBeforeBoss = run.hp;
      const combat = createNodeCombat(run);
      playCombat(combat);
      finishCombat(run, combat);
      log.fights += 1;
      if (run.status === "lost") {
        log.diedTo = node.type;
        log.diedInAct = run.act;
        break;
      }
      const act = run.act;
      completeReward(run, chooseRewardCard(run, run.pendingReward?.cardIds ?? []));
      if (node.type === "boss") {
        log.won = true;
        log.cleared = act - ACT + 1;
        // После босса акт сам не кончается: бот сразу спускается в следующий
        goToNextAct(run);
        // После босса — выход в город: отдохнуть перед следующим актом
        if (MULTI) healInCity(run);
      }
    } else if (node.type === "save") {
      if (MULTI) healInCity(run);
    } else if (node.type === "rest") {
      rest(run);
    } else if (node.type === "event") {
      playEvent(run);
    } else if (node.type === "cache") {
      const offer = openCache(run);
      takeFromCache(run, offer.potionId ? "potion" : "shards");
    } else if (node.type === "chest") {
      openChest(run);
      completeReward(run, null);
    }
  }
  log.deckSize = run.deck.length;
  return log;
}

// ---------- Запуск ----------
const started = Date.now();
const results = [];
console.log(MULTI
  ? `Акты ${ACT}–${TO} подряд, забегов на героя: ${RUNS}. «акт: доля дошедших, кто его прошёл (сколько дошли)»\n`
  : `Акт ${ACT} «${ACTS[ACT - 1].name}», забегов на героя: ${RUNS}\n`);
for (const heroId of HERO_IDS) {
  const logs = [];
  for (let i = 0; i < RUNS; i++) logs.push(playRun(heroId, 5000 + FIRST + i));
  if (MULTI) {
    // По актам: сколько героев дошли до акта и сколько из них его прошли
    const acts = [];
    for (let act = ACT; act <= TO; act++) {
      const reached = logs.filter((log) => log.cleared >= act - ACT).length;
      const cleared = logs.filter((log) => log.cleared >= act - ACT + 1).length;
      acts.push({ act, reached, cleared });
    }
    results.push({ hero: heroId, heroName: HEROES[heroId].name, acts });
    const cells = acts.map((a) => `${a.act}: ${a.reached ? Math.round((a.cleared / a.reached) * 100) : "—"}% (${a.reached})`);
    console.log(`${HEROES[heroId].name.padEnd(13)} ${cells.join("  ")}`);
    continue;
  }
  const won = logs.filter((log) => log.won).length;
  const reachedBoss = logs.filter((log) => log.hpBeforeBoss !== null);
  const avg = (items, pick) => (items.length ? Math.round((items.reduce((sum, item) => sum + pick(item), 0) / items.length) * 10) / 10 : null);
  const died = { battle: 0, elite: 0, boss: 0 };
  for (const log of logs) if (log.diedTo) died[log.diedTo] += 1;
  const row = {
    hero: heroId,
    heroName: HEROES[heroId].name,
    winRate: Math.round((won / RUNS) * 1000) / 1000,
    reachedBossRate: Math.round((reachedBoss.length / RUNS) * 1000) / 1000,
    avgHpBeforeBoss: avg(reachedBoss, (log) => log.hpBeforeBoss),
    avgFights: avg(logs, (log) => log.fights),
    avgDeck: avg(logs, (log) => log.deckSize),
    died,
  };
  results.push(row);
  console.log(
    `${row.heroName.padEnd(13)} прошли акт ${String(Math.round(row.winRate * 100)).padStart(3)}%  дошли до босса ${String(Math.round(row.reachedBossRate * 100)).padStart(3)}%  ` +
      `HP перед боссом ${row.avgHpBeforeBoss ?? "—"}  боёв ${row.avgFights}  колода ${row.avgDeck}  гибель: бой ${died.battle}, элита ${died.elite}, босс ${died.boss}`,
  );
}
console.log(`\nГотово за ${Math.round((Date.now() - started) / 1000)} с`);

if (args.out && MULTI) {
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(`${args.out}.json`, JSON.stringify({ meta: { from: ACT, to: TO, runs: RUNS }, results }, null, 2));
  console.log(`Сохранено: ${args.out}.json`);
} else if (args.out) {
  const meta = { date: new Date().toISOString().slice(0, 10), act: ACT, runs: RUNS };
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(`${args.out}.json`, JSON.stringify({ meta, results }, null, 2));
  const lines = [
    `# Полный забег: акт ${ACT} «${ACTS[ACT - 1].name}»`,
    "",
    `Дата: ${meta.date}. Забегов на героя: ${RUNS}. Новый герой со стартовой колодой, без города.`,
    "",
    "| Герой | Прошли акт | Дошли до босса | HP перед боссом | Боёв | Колода | Гибель: бой / элита / босс |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...results.map((r) => `| ${r.heroName} | ${Math.round(r.winRate * 100)}% | ${Math.round(r.reachedBossRate * 100)}% | ${r.avgHpBeforeBoss ?? "—"} | ${r.avgFights} | ${r.avgDeck} | ${r.died.battle} / ${r.died.elite} / ${r.died.boss} |`),
  ];
  writeFileSync(`${args.out}.md`, lines.join("\n") + "\n");
  console.log(`Сохранено: ${args.out}.json и ${args.out}.md`);
}
