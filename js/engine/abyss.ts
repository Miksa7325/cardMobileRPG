// Бесконечная бездна: акты после 10-го. Каждый её акт («круг») собирается случайно из врагов и особенностей актов 1–10,
// но одинаково для одного забега: всё зависит только от seed забега и номера акта. Поэтому акт не нужно хранить
// в сохранении — его можно собрать заново. Чем глубже круг, тем враги крепче и сильнее, а награды богаче.
import { CONFIG } from "../config.ts";
import { ACTS } from "../data/acts.ts";
import { createRng, deriveSeed, pickRandom, shuffle } from "./rng.ts";
import type { ActData, ActMechanic, Rng } from "../types.ts";

// Акт с таким номером — уже бездна
export function isAbyssAct(act: number): boolean {
  return act > ACTS.length;
}

// Номер круга бездны: акт 11 — круг 1
export function getAbyssCircle(act: number): number {
  return act - ACTS.length;
}

// Собранные акты бездны: собирать заново при каждом вызове незачем
const cache = new Map<string, ActData>();

// Данные акта: 1–10 — из data/acts.ts, дальше — собранный круг бездны этого забега
export function getActData(seed: number, act: number): ActData {
  if (!isAbyssAct(act)) return ACTS[act - 1];
  const key = `${seed}:${act}`;
  let data = cache.get(key);
  if (!data) {
    data = buildAbyssAct(seed, act);
    cache.set(key, data);
  }
  return data;
}

// Сколько случайных элементов из списка, без повторов
function pickSome<T>(rng: Rng, items: readonly T[], count: number): T[] {
  const copy = [...items];
  shuffle(rng, copy);
  return copy.slice(0, count);
}

function buildAbyssAct(seed: number, act: number): ActData {
  const rng = createRng(deriveSeed(seed, `abyss:${act}`));
  const circle = getAbyssCircle(act);
  const { hpPerCircle, strengthPerCircle, essencesPerCircle, encounters, mechanics } = CONFIG.abyss;
  // Отсчёт — от последнего акта: бездна начинается там, где он кончился
  const last = ACTS[ACTS.length - 1];
  const growth = 1 + hpPerCircle * circle;
  return {
    name: `Бездна, круг ${circle}`,
    mechanic: mergeMechanics(pickMechanics(rng, mechanics)),
    encounters: pickSome(rng, ACTS.flatMap((data) => data.encounters), encounters),
    elites: pickSome(rng, ACTS.flatMap((data) => data.elites), 2),
    boss: pickRandom(rng, ACTS.map((data) => data.boss)),
    enemyHpMultiplier: last.enemyHpMultiplier * growth,
    bossHpMultiplier: (last.bossHpMultiplier ?? last.enemyHpMultiplier) * growth,
    enemyStrength: last.enemyStrength + strengthPerCircle * circle,
    rewards: { ...last.rewards, essences: last.rewards.essences + essencesPerCircle * circle },
  };
}

// Разные особенности актов. Две, что закрывают клетки (Трясина и Иней), вместе не берём: закрылись бы 2 клетки из 3
function pickMechanics(rng: Rng, count: number): ActMechanic[] {
  const picked: ActMechanic[] = [];
  for (const mechanic of pickSome(rng, ACTS.map((data) => data.mechanic), ACTS.length)) {
    if (picked.length >= count) break;
    if (mechanic.blockedCells?.length && picked.some((other) => other.blockedCells?.length)) continue;
    picked.push(mechanic);
  }
  return picked;
}

// Складывает особенности в одну: числа суммируются (тупики и наименьший вес карт — большее из двух),
// флаги — «хотя бы у одной», списки объединяются
function mergeMechanics(list: ActMechanic[]): ActMechanic {
  const sum = (key: keyof ActMechanic) => {
    const total = list.reduce((acc, item) => acc + ((item[key] as number | undefined) ?? 0), 0);
    return total || undefined;
  };
  const max = (key: keyof ActMechanic) => Math.max(0, ...list.map((item) => (item[key] as number | undefined) ?? 0)) || undefined;
  const any = (key: keyof ActMechanic) => list.some((item) => item[key]) || undefined;
  const merged: ActMechanic = {
    name: list.map((item) => item.name).join(" · "),
    text: list.map((item) => item.text).join(" "),
    deadEnds: max("deadEnds"),
    coldWater: sum("coldWater"),
    enemyBlock: sum("enemyBlock"),
    heroPoison: sum("heroPoison"),
    noRest: any("noRest"),
    enemyStrength: sum("enemyStrength"),
    noMap: any("noMap"),
    heroPassives: list.flatMap((item) => item.heroPassives ?? []),
    wounds: sum("wounds"),
    extraEnemy: any("extraEnemy"),
    enemyRamp: sum("enemyRamp"),
    blockedCells: [...new Set(list.flatMap((item) => item.blockedCells ?? []))],
    minCardWeight: max("minCardWeight"),
    enemyHaste: sum("enemyHaste"),
  };
  // Пустые поля убираем: акт выглядит так же, как обычный, где ненужных полей просто нет
  for (const key of Object.keys(merged) as (keyof ActMechanic)[]) {
    const value = merged[key];
    if (value === undefined || (Array.isArray(value) && value.length === 0)) delete merged[key];
  }
  return merged;
}
