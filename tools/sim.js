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
//   --only=boss          только бои этого вида: battle, elite или boss (через запятую)
//   --patch=вариант.js   поменять данные только в памяти перед прогоном (как в tools/sim-run.js)
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { CONFIG } from "../js/config.ts";
import { ACTS } from "../js/data/acts.ts";
import { ENEMIES } from "../js/data/enemies.ts";
import { HEROES } from "../js/data/heroes.ts";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CARDS } from "../js/data/cards.ts";
import { POTIONS } from "../js/data/potions.ts";
import { RELICS } from "../js/data/relics.ts";
import { applyStrengthScale, runFight, setBeam } from "./bot.js";

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

if (args.patch) (await import(pathToFileURL(resolve(args.patch)).href)).default({ ENEMIES, CARDS, ACTS, CONFIG, HEROES, RELICS, POTIONS });
applyStrengthScale(STRENGTH_SCALE);
const ONLY = args.only ? args.only.split(",") : null;
setBeam(BEAM);
const HERO_IDS = args.heroes ? args.heroes.split(",") : Object.keys(HEROES);

// ---------- Бои акта ----------

// Те же множители, что в createNodeCombat (js/engine/run.js), без случайного выбора группы
function actSetup(act, type) {
  const depth = type === "boss" ? 0 : FLOOR;
  const depthHp = 1 + CONFIG.depth.hpPerFloor * depth;
  const depthStrength = Math.floor(depth / CONFIG.depth.floorsPerStrength) * CONFIG.depth.strengthPerStep;
  const actMultiplier = type === "boss" ? act.bossHpMultiplier ?? act.enemyHpMultiplier : act.enemyHpMultiplier;
  return {
    enemyHpMultiplier: CONFIG.enemyHpMultiplier * depthHp * actMultiplier,
    enemyStrength: act.enemyStrength + (act.mechanic.enemyStrength ?? 0) + depthStrength,
    enemyBlock: act.mechanic.enemyBlock ?? 0,
    enemyRamp: act.mechanic.enemyRamp ?? 0,
    heroStatuses: act.mechanic.heroPoison ? { poison: act.mechanic.heroPoison } : {},
    extraPassives: act.mechanic.heroPassives ?? [],
    blockedCells: act.mechanic.blockedCells ?? [],
    minCardWeight: act.mechanic.minCardWeight ?? 0,
    enemyHaste: act.mechanic.enemyHaste ?? 0,
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
const encounters = listEncounters(act).filter((encounter) => !ONLY || ONLY.includes(encounter.type));
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
