// Складывает части прогона симулятора через несколько актов (sim-run.js --to … --out) в одну таблицу.
// Запуск:   node tools/sim-merge.js папка/с/частями [--out=tools/baseline/run-acts]
// Для каждого героя и акта: сколько героев дошли до акта и какая доля дошедших его прошла.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [dir, ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.map((arg) => arg.replace(/^--/, "").split("=")));
const parts = readdirSync(dir).filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")));

const heroes = new Map();
for (const part of parts) {
  for (const row of part.results) {
    const hero = heroes.get(row.hero) ?? { name: row.heroName, acts: new Map() };
    for (const act of row.acts) {
      const sum = hero.acts.get(act.act) ?? { reached: 0, cleared: 0 };
      sum.reached += act.reached;
      sum.cleared += act.cleared;
      hero.acts.set(act.act, sum);
    }
    heroes.set(row.hero, hero);
  }
}

const runs = parts.reduce((sum, part) => sum + part.meta.runs, 0);
const actNumbers = [...new Set([...heroes.values()].flatMap((hero) => [...hero.acts.keys()]))].sort((a, b) => a - b);
const cell = (sum) => (sum.reached ? `${Math.round((sum.cleared / sum.reached) * 100)}% (${sum.reached})` : "—");
const lines = [
  `Забегов на героя: ${runs}. В клетке: доля дошедших до акта, кто его прошёл (сколько дошли)`,
  "",
  `| Герой | ${actNumbers.map((act) => `Акт ${act}`).join(" | ")} |`,
  `| --- | ${actNumbers.map(() => "---").join(" | ")} |`,
  ...[...heroes.values()].map((hero) => `| ${hero.name} | ${actNumbers.map((act) => cell(hero.acts.get(act))).join(" | ")} |`),
];
// Все герои вместе
const total = actNumbers.map((act) => {
  const sum = { reached: 0, cleared: 0 };
  for (const hero of heroes.values()) {
    sum.reached += hero.acts.get(act)?.reached ?? 0;
    sum.cleared += hero.acts.get(act)?.cleared ?? 0;
  }
  return cell(sum);
});
lines.push(`| **Все** | ${total.join(" | ")} |`);
console.log(lines.join("\n"));
if (args.out) writeFileSync(`${args.out}.md`, lines.join("\n") + "\n");
