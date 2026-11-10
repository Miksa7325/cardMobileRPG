// Подбор чисел врага симулятором: варианты меняют врага только в памяти, файлы игры не трогаются.
// Запуск: node tools/tune.js --file=варианты.js [--fights=20] [--floor=3] [--heroes=warrior,mage]
// В файле вариантов: export const encounters = [["spider","spider","spider"], ...];
//                    export const variants = { "имя": (ENEMIES) => { ...поменять ENEMIES... }, ... };
// Вариант «как есть» добавляется сам. Итог — таблица: победы и потеря HP по каждому бою и герою.
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { CONFIG } from "../js/config.ts";
import { ACTS } from "../js/data/acts.ts";
import { ENEMIES } from "../js/data/enemies.ts";
import { HEROES } from "../js/data/heroes.ts";
import { runFight, setBeam } from "./bot.js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, "").split("=");
  return [key, value ?? "true"];
}));
const FIGHTS = Number(args.fights ?? 20);
const FLOOR = Number(args.floor ?? 3);
const HERO_IDS = args.heroes ? args.heroes.split(",") : Object.keys(HEROES);
setBeam(Number(args.beam ?? 32));

const { encounters, variants } = await import(pathToFileURL(resolve(args.file)).href);
const original = structuredClone(ENEMIES);
const act = ACTS[0];

function setupFor(enemyIds) {
  const boss = enemyIds.some((id) => act.boss.includes(id));
  return {
    enemyHpMultiplier: CONFIG.enemyHpMultiplier * (boss ? act.bossHpMultiplier ?? 1 : act.enemyHpMultiplier),
    enemyStrength: act.enemyStrength,
  };
}

for (const [name, change] of [["как есть", () => {}], ...Object.entries(variants)]) {
  for (const key of Object.keys(ENEMIES)) ENEMIES[key] = structuredClone(original[key]);
  change(ENEMIES);
  console.log(`\n=== ${name} ===`);
  for (const enemyIds of encounters) {
    const cells = HERO_IDS.map((heroId) => {
      let wins = 0, hp = 0;
      for (let i = 0; i < FIGHTS; i++) {
        const fight = runFight(heroId, enemyIds, 7000 + i, setupFor(enemyIds));
        if (fight.won) wins += 1;
        hp += fight.hpLost;
      }
      return `${HEROES[heroId].name.slice(0, 6)} ${String(Math.round((wins / FIGHTS) * 100)).padStart(3)}% −${String(Math.round(hp / FIGHTS)).padStart(2)}`;
    });
    console.log(`${enemyIds.join("+").padEnd(28)} ${cells.join("  ")}`);
  }
}
