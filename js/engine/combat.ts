// Бой на бесконечной шкале. Этот файл не трогает HTML: только меняет данные боя.
//
// Как идёт бой:
// 1. Начало боя: рука по классу, враги ставят ходы на свои дорожки на 6 клеток вперёд, время стоит (status "planning").
//    Игрок расставляет карты на клетки 1–6.
// 2. «Начать» (startCombat): время идёт. Экран вызывает tick — одна клетка — раз в 1–2 секунды; пауза — экран
//    просто не вызывает tick. Карты и зелья можно ставить (placeCard, placePotion), убирать (removeFromLane) и
//    переставлять (moveLaneItem) прямо во время боя, не дальше 6 клеток вперёд от указателя времени.
// 3. Действие срабатывает в своей последней клетке, карта весом 0 — на своём стыке клеток. При ничьей первым герой,
//    если только у врага нет Ускорения. Каждая сработавшая карта приводит в руку новую.
// 4. Ходов нет — есть такты по 3 клетки: в начале такта Яд, Горение, Прилив, переброс; в конце — Слабость убывает.
// launch — для тестов и бота: начать и прогнать 6 клеток подряд.
import { CONFIG } from "../config.ts";
import { ENEMIES } from "../data/enemies.ts";
import { HEROES, getMaxPotions } from "../data/heroes.ts";
import { POTIONS } from "../data/potions.ts";
import { RELICS } from "../data/relics.ts";
import {
  brewOptionCount, canPrepare, drawOnResolve, finalTwice, openDrawCount, prepEmptyGain, rerollsPerTact, zeroWeightPerTact,
} from "./rules.ts";
import type {
  ActionResult, CardData, CardInstance, CardTarget, Combat, Effect, EnemyAction, EnemyMove, EnemyUnit, HeroId, HeroUnit, Intent,
  LaneItem, Power, PreparedSpell, Rng, RunCard, StatusId, Statuses,
} from "../types.ts";
import { createCardInstance, createPiles, drawCards, getCardData, takeFromHand } from "./deck.ts";
import {
  PLANNING_EFFECTS, addTally, applyBurning, applyLeech, applyPoison, boostEffects, calculateBlock,
  calculateDamage, executeEffects, expireBlocks, fireTrigger, isOver, recordEvent, reduceStatus, setSummonHandler,
} from "./effects.ts";
import { createRng, nextInt } from "./rng.ts";

const T = CONFIG.timeline;
// Горизонт: на сколько клеток вперёд от указателя можно ставить карты и видны ходы врагов
const HORIZON = T.cells;

// Убывают на 1 в конце такта. Уязвимость сама не проходит, её снимает только Починка.
// Сила и Ловкость остаются; Яд, Горение, Замедление, Ускорение и прочие убывают по своим правилам
const DECAYING_STATUSES: StatusId[] = ["weak"];
// Сгорают целиком в конце такта: Комбо Убийцы
const TACT_STATUSES: StatusId[] = ["combo"];

type Fail = { ok: false; reason: string };
const fail = (reason: string): Fail => ({ ok: false, reason });
const OK: ActionResult = { ok: true };

// ---------- Создание боя ----------

// hp, maxHp, deck, relics и potions приходят из забега; в тестовом режиме их нет, тогда берём стартовые значения героя.
// enemyHpMultiplier, enemyStrength и enemyBlock усиливают врагов, enemyRamp — сколько Силы враг набирает за каждый свой ход,
// heroStatuses — статусы героя с начала боя, extraPassives — триггеры, которые акт навешивает на героя (жар)
export interface CombatSetup {
  heroId: HeroId;
  enemyIds: string[];
  seed: number;
  hp?: number;
  maxHp?: number;
  deck?: (RunCard | { cardId: string; level: number })[];
  relics?: string[];
  potions?: string[];
  enemyHpMultiplier?: number;
  enemyStrength?: number;
  enemyBlock?: number;
  enemyRamp?: number;
  heroStatuses?: Statuses;
  extraPassives?: Power[];
  potionPool?: string[];
  blockedCells?: number[]; // особенность акта: клетки каждого такта (1–3), закрытые для героя
  minCardWeight?: number; // особенность акта: карты легче этого весят столько
  enemyHaste?: number; // особенность акта: враги начинают бой с Ускорением
}

export function createCombat({
  heroId, enemyIds, seed, hp, maxHp, deck, relics = [], potions = [], enemyHpMultiplier = 1, enemyStrength = 0, enemyBlock = 0,
  enemyRamp = 0, heroStatuses = {}, extraPassives = [], potionPool = Object.keys(POTIONS), blockedCells = [], minCardWeight = 0,
  enemyHaste = 0,
}: CombatSetup): Combat {
  const rng = createRng(seed);
  const heroData = HEROES[heroId];
  const startingDeck = heroData.deck.map((cardId) => ({ cardId, level: 0 }));

  const combat: Combat = {
    rng,
    status: "planning",
    turn: 0,
    clock: 0,
    lane: [],
    prepared: [],
    nextLaneId: 0,
    rerollsLeft: 0,
    brewChoices: [],
    frozenCells: [],
    blockedCells: [...blockedCells],
    minCardWeight,
    hero: {
      heroId,
      hp: hp ?? heroData.maxHp,
      maxHp: maxHp ?? heroData.maxHp,
      block: 0,
      blocks: [],
      statuses: { ...heroStatuses },
      powers: [], // разыгранные карты-силы с триггерами
      // Врождённая особенность класса (как герой копит свой ресурс) и то, что навешивает акт
      passives: [...(heroData.mechanic?.passives ?? []), ...extraPassives],
      damageReduction: heroData.mechanic.damageReduction ?? 0,
    },
    enemies: enemyIds.map((enemyId, index) => {
      const enemy = createEnemy(enemyId, index, rng, enemyHpMultiplier, enemyStrength, enemyBlock);
      if (enemyHaste > 0) enemy.statuses.haste = enemyHaste;
      return enemy;
    }),
    piles: createPiles(deck ?? startingDeck, rng),
    relics: [...relics],
    relicCounters: {}, // счётчики реликвий «каждый N-й раз»
    potions: [...potions],
    maxPotions: getMaxPotions(heroId),
    potionPool, // какие зелья может сварить Алхимик: только открытые
    enemyRamp,
    enemyHpMultiplier,
    events: [], // что произошло за последнее действие игрока: интерфейс проигрывает это как анимацию
  };

  // Рука на начало боя; дальше карты приходят взамен сработавших
  drawCards(combat.piles, heroData.drawPerTurn, combat.rng);
  for (const enemy of combat.enemies) fillEnemyLane(combat, enemy);
  // Замёрзшие клетки решаются на такт вперёд горизонта: на первую расстановку — сразу для тактов 1–3
  freezeTact(combat, 1);
  freezeTact(combat, 2);
  startTact(combat);
  fireTrigger(combat, "onCombatStart");
  return combat;
}

function createEnemy(enemyId: string, index: number, rng: Rng, hpMultiplier: number, strength: number, block: number): EnemyUnit {
  const data = ENEMIES[enemyId];
  const hp = Math.floor(nextInt(rng, data.hp[0], data.hp[1]) * hpMultiplier);
  return {
    instanceId: `${enemyId}-${index}`,
    enemyId,
    hp,
    maxHp: hp,
    // Блок от особенности акта держится первые 6 клеток
    block,
    blocks: block > 0 ? [{ amount: block, expires: T.blockCells }] : [],
    statuses: strength > 0 ? { strength } : {},
    patternIndex: 0,
    lane: [],
    nextActionId: 0,
    laneStart: 0,
    phase: 0,
  };
}

// Помощник, призванный посреди боя: встаёт рядом, его дорожка начинается с этого момента
setSummonHandler((combat, enemyId) => {
  const enemy = createEnemy(enemyId, combat.enemies.length, combat.rng, combat.enemyHpMultiplier, 0, 0);
  combat.enemies.push(enemy);
  enemy.laneStart = combat.clock;
  fillEnemyLane(combat, enemy);
  recordEvent(combat, { type: "summon", targetId: enemy.instanceId, enemyId });
});

// Набор ходов врага сейчас: у босса во второй фазе — свой
function currentPattern(enemy: EnemyUnit): string[] {
  const data = ENEMIES[enemy.enemyId];
  return enemy.phase > 0 ? data.phases![enemy.phase - 1].pattern : data.pattern;
}

// Номер такта, к которому относится клетка (с 1): клетки 1–3 — такт 1, 4–6 — такт 2 …
function tactOfCell(cell: number): number {
  return Math.floor((cell - 1) / T.tactCells) + 1;
}

// Номер такта, в начале которого срабатывает карта весом 0 на стыке: стык 0 — такт 1, стык 3 — такт 2 …
function tactOfBoundary(boundary: number): number {
  return Math.floor(boundary / T.tactCells) + 1;
}

// ---------- Расписание: где на шкале что стоит ----------

// Расчёт одного действия героя с учётом Ловкости, Замедления и Ускорения
export interface HeroSlot {
  start: number; // первая клетка (у веса 0 — стык)
  end: number; // клетка, в которой сработает (у веса 0 — стык)
  weight: number; // вес с учётом статусов
  slowed: boolean; // на это действие ушёл стак Замедления
  hasted: boolean; // и стак Ускорения
}

// Сколько клеток срезает Ловкость с первой карты боя на дорожке: каждые 2 стака — 1 клетка
function dexterityCut(combat: Combat): number {
  return Math.floor((combat.hero.statuses.dexterity ?? 0) / 2);
}

// Расписание карт героя на дорожке и заклинаний на подготовке.
// Замедление и Ускорение действуют на ближайшие по времени действия (сколько стаков — столько действий),
// поэтому считаем в два прохода: сначала времена без них, потом раздаём стаки по порядку и считаем заново.
// lane можно подменить: так проверяем расстановку до того, как её принять
export function heroSchedule(combat: Combat, lane: LaneItem[] = combat.lane, prepared: PreparedSpell[] = combat.prepared) {
  const marks = new Map<string, { slowed: boolean; hasted: boolean }>();
  const laneSlots = () => chainLane(combat, lane, marks);
  const preparedSlots = (slots: Map<number, HeroSlot>) => prepSlots(combat, lane, slots, prepared, marks);

  // Первый проход: без Замедления и Ускорения
  const roughLane = laneSlots();
  const roughPrepared = preparedSlots(roughLane);
  const order = [
    ...lane.filter((item) => !item.resolved && item.weight > 0).map((item) => ({ key: `l${item.id}`, end: roughLane.get(item.id)!.end, side: 0, id: item.id })),
    ...prepared.map((spell) => ({ key: `p${spell.id}`, end: roughPrepared.get(spell.id)!.end, side: 1, id: spell.id })),
  ].sort((a, b) => a.end - b.end || a.side - b.side || a.id - b.id);
  const slow = combat.hero.statuses.slow ?? 0;
  const haste = combat.hero.statuses.haste ?? 0;
  order.forEach((action, index) => marks.set(action.key, { slowed: index < slow, hasted: index < haste }));

  const finalLane = laneSlots();
  return { lane: finalLane, prepared: preparedSlots(finalLane) };
}

// Сколько клеток подготовки нужно заклинанию: 2 × вес, Замедление +1, Ускорение −1 (не меньше 1)
function prepWork(spell: PreparedSpell, mark: { slowed: boolean; hasted: boolean } | undefined): number {
  return Math.max(1, T.prepWorkPerWeight * spell.weight + (mark?.slowed ? 1 : 0) - (mark?.hasted ? 1 : 0));
}

// Клетки основной шкалы, занятые картами и зельями (карты весом 0 клеток не занимают)
function busyCells(lane: LaneItem[], slots: Map<number, HeroSlot>): Set<number> {
  const busy = new Set<number>();
  for (const item of lane) {
    const slot = slots.get(item.id);
    if (item.weight === 0 || !slot) continue;
    for (let cell = slot.start; cell <= slot.end; cell++) busy.add(cell);
  }
  return busy;
}

// Сколько подготовки даёт клетка: 1, а пустая клетка основной шкалы — ещё prepEmptyGain.
// Клетки дальше горизонта считаем без ускорения: какими они будут, ещё неизвестно
function cellPrepGain(combat: Combat, busy: Set<number>, cell: number): number {
  return 1 + (cell <= combat.clock + HORIZON && !busy.has(cell) ? prepEmptyGain(combat) : 0);
}

// Когда сработают заклинания на подготовке. Они готовятся очередью с текущей клетки; лишняя подготовка
// клетки переходит к следующему в очереди. start — первая клетка подготовки, end — клетка, после которой сработает
function prepSlots(
  combat: Combat, lane: LaneItem[], laneSlots: Map<number, HeroSlot>, prepared: PreparedSpell[],
  marks: Map<string, { slowed: boolean; hasted: boolean }>,
): Map<number, HeroSlot> {
  const busy = busyCells(lane, laneSlots);
  const slots = new Map<number, HeroSlot>();
  let cell = combat.clock;
  let spare = 0;
  for (const spell of prepared) {
    const mark = marks.get(`p${spell.id}`);
    let need = prepWork(spell, mark) - spell.progress - spare;
    const start = spare > 0 ? Math.max(cell, 1) : cell + 1;
    spare = 0;
    while (need > 0) {
      cell += 1;
      need -= cellPrepGain(combat, busy, cell);
    }
    spare = -need;
    slots.set(spell.id, { start: Math.min(start, cell), end: Math.max(cell, combat.clock), weight: spell.weight, slowed: mark?.slowed ?? false, hasted: mark?.hasted ?? false });
  }
  return slots;
}

// Прошла клетка cell: заклинания на подготовке продвигаются по очереди (лишнее — следующему)
function advancePreparation(combat: Combat, cell: number): void {
  if (combat.prepared.length === 0) return;
  const schedule = heroSchedule(combat);
  let gain = cellPrepGain(combat, busyCells(combat.lane, schedule.lane), cell);
  for (const spell of combat.prepared) {
    if (gain <= 0) break;
    const slot = schedule.prepared.get(spell.id);
    const left = prepWork(spell, slot) - spell.progress;
    if (left <= 0) continue;
    const step = Math.min(left, gain);
    spell.progress += step;
    gain -= step;
  }
}

// Карты на дорожке героя по порядку: следующая не может начаться раньше, чем кончилась предыдущая
function chainLane(combat: Combat, lane: LaneItem[], marks: Map<string, { slowed: boolean; hasted: boolean }>): Map<number, HeroSlot> {
  const slots = new Map<number, HeroSlot>();
  const cut = dexterityCut(combat);
  let prevEnd = 0;
  let first = true;
  const weighted = lane.filter((item) => item.weight > 0).sort((a, b) => a.start - b.start || a.id - b.id);
  for (const item of weighted) {
    const isFirst = first;
    first = false;
    if (item.resolved) {
      prevEnd = item.end ?? prevEnd;
      slots.set(item.id, { start: item.start, end: prevEnd, weight: item.weight, slowed: false, hasted: false });
      continue;
    }
    const mark = marks.get(`l${item.id}`);
    let weight = isFirst ? Math.max(1, item.weight - cut) : item.weight;
    if (mark?.slowed) weight += 1;
    if (mark?.hasted) weight = Math.max(1, weight - 1);
    const start = Math.max(item.start, prevEnd + 1);
    const end = Math.max(combat.clock, start + weight - 1);
    prevEnd = end;
    slots.set(item.id, { start, end, weight, slowed: mark?.slowed ?? false, hasted: mark?.hasted ?? false });
  }
  for (const item of lane.filter((entry) => entry.weight === 0)) {
    slots.set(item.id, { start: item.start, end: item.start, weight: 0, slowed: false, hasted: false });
  }
  return slots;
}

// Расписание ходов врага: стоят встык с начала его дорожки. Замедление и Ускорение — на ближайшие ходы
export function enemySchedule(combat: Combat, enemy: EnemyUnit, lane: EnemyAction[] = enemy.lane) {
  const slow = enemy.statuses.slow ?? 0;
  const haste = enemy.statuses.haste ?? 0;
  let prevEnd = enemy.laneStart;
  let index = 0;
  return lane.map((action) => {
    if (action.resolved) {
      const end = action.end ?? prevEnd;
      prevEnd = Math.max(prevEnd, end);
      return { action, start: end - action.weight + 1, end, weight: action.weight, slowed: false, hasted: false };
    }
    const slowed = index < slow;
    const hasted = index < haste;
    index += 1;
    const weight = Math.max(1, action.weight + (slowed ? 1 : 0) - (hasted ? 1 : 0));
    const start = prevEnd + 1;
    const end = Math.max(combat.clock, prevEnd + weight);
    prevEnd = end;
    return { action, start, end, weight, slowed, hasted };
  });
}

// Враг ставит ходы по своему кругу непрерывно: пока его дорожка не дотягивается на 6 клеток вперёд, добавляет следующий
function fillEnemyLane(combat: Combat, enemy: EnemyUnit): void {
  if (enemy.hp <= 0 || enemy.idle) return;
  const data = ENEMIES[enemy.enemyId];
  for (let guard = 0; guard < 50; guard++) {
    const schedule = enemySchedule(combat, enemy);
    const lastEnd = schedule.length > 0 ? schedule[schedule.length - 1].end : enemy.laneStart;
    if (lastEnd >= combat.clock + HORIZON) return;
    const pattern = currentPattern(enemy);
    const move = pattern[enemy.patternIndex % pattern.length];
    enemy.lane.push({ id: enemy.nextActionId, move, weight: data.moves[move].weight, resolved: false });
    enemy.nextActionId += 1;
    enemy.patternIndex = (enemy.patternIndex + 1) % pattern.length;
  }
}

// Старые сработавшие действия больше не нужны ни расписанию, ни экрану: убираем, чтобы дорожки не росли без конца
function pruneOldActions(combat: Combat): void {
  const keepFrom = combat.clock - HORIZON;
  combat.lane = combat.lane.filter((item) => !item.resolved || (item.end ?? item.start) >= keepFrom);
  for (const enemy of combat.enemies) {
    while (enemy.lane.length > 0 && enemy.lane[0].resolved && (enemy.lane[0].end ?? 0) < keepFrom) {
      enemy.laneStart = Math.max(enemy.laneStart, enemy.lane[0].end ?? 0);
      enemy.lane.shift();
    }
  }
  combat.frozenCells = combat.frozenCells.filter((cell) => cell > combat.clock - HORIZON);
}

// Фазы боссов: HP упало до доли below — новый набор ходов. Несыгранные ходы старой фазы пропадают
function checkPhases(combat: Combat): void {
  for (const enemy of combat.enemies) {
    const phases = ENEMIES[enemy.enemyId].phases;
    const next = phases?.[enemy.phase];
    if (!next || enemy.hp <= 0 || enemy.hp > enemy.maxHp * next.below) continue;
    enemy.phase += 1;
    enemy.patternIndex = 0;
    enemy.lane = enemy.lane.filter((action) => action.resolved);
    recordEvent(combat, { type: "phase", targetId: enemy.instanceId, phase: enemy.phase });
    if (next.onEnter) executeEffects(combat, next.onEnter, { source: enemy, targets: [combat.hero], fromCard: false });
    enemy.laneStart = Math.max(combat.clock, enemy.laneStart, ...enemy.lane.map((action) => action.end ?? 0));
    fillEnemyLane(combat, enemy);
  }
}

// Замёрзшие клетки такта tact (номер с 1): клетки, закрытые особенностью акта (Трясина, Иней), и по одной
// случайной от каждого врага с ледяной печатью. Решаются заранее — пока эти клетки ещё за горизонтом расстановки
function freezeTact(combat: Combat, tact: number): void {
  const first = (tact - 1) * T.tactCells + 1;
  const cells = Array.from({ length: T.tactCells }, (_, index) => first + index);
  for (const position of combat.blockedCells ?? []) {
    const cell = first + position - 1;
    if (!combat.frozenCells.includes(cell)) combat.frozenCells.push(cell);
  }
  for (const enemy of aliveEnemies(combat)) {
    if (!ENEMIES[enemy.enemyId].freezeCell) continue;
    const free = cells.filter((cell) => !combat.frozenCells.includes(cell));
    if (free.length === 0) continue;
    const cell = free[nextInt(combat.rng, 0, free.length - 1)];
    combat.frozenCells.push(cell);
    recordEvent(combat, { type: "freeze", targetId: enemy.instanceId, cell });
  }
}

// ---------- Расстановка ----------

// Вес карты в этом бою: её стоимость. null — карту нельзя разыграть.
// Особенность акта может поднять вес лёгких карт (Железная дисциплина: вес 0 → 1)
export function cardWeight(instance: CardInstance, combat?: Combat): number | null {
  const cost = getCardData(instance).cost;
  if (cost === null || !combat?.minCardWeight) return cost;
  return Math.max(cost, combat.minCardWeight);
}

function potionWeight(combat: Combat): number {
  return HEROES[combat.hero.heroId].potionWeight;
}

// Начала ли карта срабатывать: указатель времени уже внутри её клеток (или прошёл её стык)
function hasStarted(combat: Combat, item: LaneItem, slots = heroSchedule(combat).lane): boolean {
  if (item.resolved) return true;
  const slot = slots.get(item.id);
  if (!slot) return false;
  return item.weight === 0 ? slot.start < combat.clock : slot.start <= combat.clock;
}

// Проверяет расстановку после того, как checked поставили или передвинули: она стоит там, куда её поставили,
// не дальше горизонта, не на замёрзших клетках, и никого из ещё не начавших не сдвинула
function checkLane(combat: Combat, lane: LaneItem[], checked: LaneItem): string | null {
  const slots = heroSchedule(combat, lane).lane;
  const slot = slots.get(checked.id)!;
  if (checked.weight === 0) {
    if (checked.start < combat.clock || checked.start > combat.clock + HORIZON) return "outOfTimeline";
  } else {
    if (checked.start <= combat.clock) return "pastCell";
    if (slot.start !== checked.start) return "overlap";
    if (slot.end > combat.clock + HORIZON) return "outOfTimeline";
    if (combat.frozenCells.some((cell) => cell >= slot.start && cell <= slot.end)) return "frozen";
  }
  for (const item of lane) {
    if (item === checked || item.resolved || item.weight === 0) continue;
    const other = slots.get(item.id)!;
    if (item.start > combat.clock && other.start !== item.start) return "overlap";
  }
  return null;
}

function aliveEnemies(combat: Combat): EnemyUnit[] {
  return combat.enemies.filter((enemy) => enemy.hp > 0);
}

// Цель нужна только картам и зельям «на врага»
function checkTarget(combat: Combat, target: CardTarget, targetId: string | null | undefined): string | null {
  if (target !== "enemy") return null;
  return aliveEnemies(combat).some((enemy) => enemy.instanceId === targetId) ? null : "invalidTarget";
}

// Эффекты добора и варки срабатывают сразу при постановке. Возвращает, были ли они:
// тогда карту уже нельзя вернуть в руку
function runPlanningEffects(combat: Combat, effects: Effect[]): boolean {
  const planning = effects.filter((effect) => PLANNING_EFFECTS.has(effect.type));
  for (const effect of planning) {
    if (effect.type === "brewPotion") {
      // Варка с выбором: из двух случайных зелий игрок выберет одно (chooseBrew); пока не выбрал, время стоит
      for (let i = 0; i < effect.amount; i++) offerBrew(combat);
    } else {
      executeEffects(combat, [effect], { source: combat.hero, targets: [], fromCard: true });
    }
  }
  return planning.length > 0;
}

function offerBrew(combat: Combat): void {
  const pool = [...combat.potionPool];
  if (pool.length === 0) return;
  const options: string[] = [];
  while (options.length < brewOptionCount(combat) && pool.length > 0) options.push(pool.splice(nextInt(combat.rng, 0, pool.length - 1), 1)[0]);
  combat.brewChoices.push({ options });
}

// Карт весом 0 — не больше zeroWeightPerTact за такт: считаем те, что стоят (или сработали) на стыках этого такта
function zeroWeightInTact(combat: Combat, tact: number): number {
  return combat.lane.filter((item) => item.kind === "card" && item.weight === 0 && tactOfBoundary(item.start) === tact).length;
}

function canAct(combat: Combat): boolean {
  return combat.status === "planning" || combat.status === "running";
}

export interface PlaceOptions {
  prepare?: boolean; // Маг: поставить на подготовку
}

// Ставит карту из руки на шкалу. start — первая клетка (не дальше 6 впереди указателя), у карты весом 0 — стык.
// Возвращает { ok: true } или { ok: false, reason }
export function placeCard(combat: Combat, uid: number, start: number, targetId: string | null = null, options: PlaceOptions = {}): ActionResult {
  if (!canAct(combat)) return fail("notPlanning");
  const instance = combat.piles.hand.find((card) => card.uid === uid);
  if (!instance) return fail("cardNotInHand");
  const weight = cardWeight(instance, combat);
  if (weight === null) return fail("cannotPlay");
  const card = getCardData(instance);
  const targetError = checkTarget(combat, card.target, targetId);
  if (targetError) return fail(targetError);
  if (options.prepare) return prepareSpell(combat, instance, card, weight, targetId);

  if (weight === 0 && zeroWeightInTact(combat, tactOfBoundary(start)) >= zeroWeightPerTact(combat)) return fail("zeroLimit");
  const item: LaneItem = {
    id: combat.nextLaneId, kind: "card", card: instance, start, weight, targetId, locked: false, resolved: false,
  };
  const error = checkLane(combat, [...combat.lane, item], item);
  if (error) return fail(error);

  combat.nextLaneId += 1;
  takeFromHand(combat.piles, uid);
  combat.lane.push(item);
  combat.events = [];
  item.locked = runPlanningEffects(combat, card.effects);
  return OK;
}

// Маг ставит заклинание на подготовку: оно встаёт в очередь, готовится 2 × вес клеток и срабатывает само, на 50% сильнее.
// Пустые клетки основной шкалы ускоряют подготовку, предела по весу нет
function prepareSpell(combat: Combat, instance: CardInstance, card: CardData, weight: number, targetId: string | null): ActionResult {
  if (!canPrepare(combat)) return fail("noPreparation");
  const spell: PreparedSpell = {
    id: combat.nextLaneId, card: instance, turn: combat.turn, locked: false, weight, targetId, progress: 0,
  };
  combat.nextLaneId += 1;
  takeFromHand(combat.piles, instance.uid);
  combat.prepared.push(spell);
  combat.events = [];
  spell.locked = runPlanningEffects(combat, card.effects);
  return OK;
}

// Ставит зелье из сумки на шкалу: весит 1, у Алхимика 0
export function placePotion(combat: Combat, index: number, start: number, targetId: string | null = null): ActionResult {
  if (!canAct(combat)) return fail("notPlanning");
  const potionId = combat.potions[index];
  const potion = POTIONS[potionId];
  if (!potion) return fail("noPotion");
  const targetError = checkTarget(combat, potion.target, targetId);
  if (targetError) return fail(targetError);
  const item: LaneItem = {
    id: combat.nextLaneId, kind: "potion", potionId, start, weight: potionWeight(combat), targetId, locked: false, resolved: false,
  };
  const error = checkLane(combat, [...combat.lane, item], item);
  if (error) return fail(error);

  combat.nextLaneId += 1;
  combat.potions.splice(index, 1);
  combat.lane.push(item);
  combat.events = [];
  item.locked = runPlanningEffects(combat, potion.effects);
  return OK;
}

// Возвращает карту или зелье со шкалы (или с подготовки) обратно. Нельзя, если она уже начала срабатывать
// или при постановке уже сработали добор или варка
export function removeFromLane(combat: Combat, id: number): ActionResult {
  if (!canAct(combat)) return fail("notPlanning");
  const item = combat.lane.find((entry) => entry.id === id);
  if (item) {
    if (item.locked || hasStarted(combat, item)) return fail("locked");
    // Убрать можно всегда: от этого остальные карты не сдвигаются
    combat.lane = combat.lane.filter((entry) => entry !== item);
    if (item.card) combat.piles.hand.push(item.card);
    if (item.potionId) combat.potions.push(item.potionId);
    return OK;
  }
  const spell = combat.prepared.find((entry) => entry.id === id);
  if (!spell) return fail("notOnLane");
  if (spell.locked || spell.progress > 0) return fail("locked");
  combat.prepared = combat.prepared.filter((entry) => entry !== spell);
  combat.piles.hand.push(spell.card);
  return OK;
}

// Переставляет карту или зелье на другую клетку (и цель). Если на новом месте нельзя, всё остаётся как было
export function moveLaneItem(combat: Combat, id: number, start: number, targetId?: string | null): ActionResult {
  if (!canAct(combat)) return fail("notPlanning");
  const item = combat.lane.find((entry) => entry.id === id);
  if (!item) return fail("notOnLane");
  if (item.locked || hasStarted(combat, item)) return fail("locked");
  const moved = { ...item, start, targetId: targetId === undefined ? item.targetId : targetId };
  const target = item.card ? getCardData(item.card).target : POTIONS[item.potionId!].target;
  const targetError = checkTarget(combat, target, moved.targetId);
  if (targetError) return fail(targetError);
  if (item.weight === 0 && tactOfBoundary(start) !== tactOfBoundary(item.start)
    && zeroWeightInTact(combat, tactOfBoundary(start)) >= zeroWeightPerTact(combat)) return fail("zeroLimit");
  const lane = combat.lane.map((entry) => (entry === item ? moved : entry));
  const error = checkLane(combat, lane, moved);
  if (error) return fail(error);
  combat.lane = lane;
  return OK;
}

// Раз в такт: карта из руки уходит в сброс, вместо неё берётся новая
export function rerollCard(combat: Combat, uid: number): ActionResult {
  if (!canAct(combat)) return fail("notPlanning");
  if (combat.rerollsLeft <= 0) return fail("noRerolls");
  if (!combat.piles.hand.some((card) => card.uid === uid)) return fail("cardNotInHand");
  combat.rerollsLeft -= 1;
  combat.piles.discard.push(takeFromHand(combat.piles, uid));
  drawCards(combat.piles, 1, combat.rng);
  return OK;
}

// Алхимик выбирает одно из двух сваренных зелий. Если сумка полна, зелье пропадает
export function chooseBrew(combat: Combat, choiceIndex: number, potionId: string): ActionResult {
  const choice = combat.brewChoices[choiceIndex];
  if (!choice || !choice.options.includes(potionId)) return fail("invalidChoice");
  combat.brewChoices.splice(choiceIndex, 1);
  if (combat.potions.length < combat.maxPotions) {
    combat.potions.push(potionId);
    fireTrigger(combat, "onPotionBrewed");
  }
  return OK;
}

// Верхние карты добора: их видно заранее
export function getUpcomingDraws(combat: Combat): CardInstance[] {
  return combat.piles.draw.slice(-openDrawCount(combat)).reverse();
}

// Куда можно поставить карту такого веса: первая подходящая клетка или null
export function findFreeStart(combat: Combat, weight: number): number | null {
  if (weight === 0) {
    for (let boundary = combat.clock; boundary <= combat.clock + HORIZON; boundary++) {
      if (zeroWeightInTact(combat, tactOfBoundary(boundary)) < zeroWeightPerTact(combat)) return boundary;
    }
    return null;
  }
  for (let start = combat.clock + 1; start + weight - 1 <= combat.clock + HORIZON; start++) {
    const probe: LaneItem = { id: -1, kind: "card", start, weight, targetId: null, locked: false, resolved: false };
    if (!checkLane(combat, [...combat.lane, probe], probe)) return start;
  }
  return null;
}

// ---------- Бонусы цепочки ----------

// Звено цепочки — карта на дорожке героя. start и end — стыки клеток: карта в клетках 2–3 занимает стыки 1…3,
// карта весом 0 на стыке 4 — стык 4…4
interface ChainLink {
  item: LaneItem;
  card: CardData;
  start: number;
  end: number;
}

function chainLinks(combat: Combat): ChainLink[] {
  const slots = heroSchedule(combat).lane;
  return combat.lane
    .filter((item) => item.kind === "card" && item.card)
    .map((item) => {
      const slot = slots.get(item.id)!;
      const start = item.weight === 0 ? slot.start : slot.start - 1;
      const end = item.weight === 0 ? slot.start : slot.end;
      return { item, card: getCardData(item.card!), start, end };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end || a.item.id - b.item.id);
}

// Встык ли две карты: между ними нет пустых клеток (клетки под зельем пустыми не считаются)
function linksTouch(combat: Combat, previous: ChainLink, next: ChainLink): boolean {
  if (previous.end >= next.start) return true;
  const slots = heroSchedule(combat).lane;
  const potions = combat.lane.filter((item) => item.kind === "potion" && item.weight > 0).map((item) => slots.get(item.id)!);
  for (let cell = previous.end + 1; cell <= next.start; cell++) {
    if (!potions.some((slot) => slot.start <= cell && cell <= slot.end)) return false;
  }
  return true;
}

// Какая по счёту карта в своей цепочке (0 — первая): цепочка — карты встык, пустая клетка её рвёт
function chainPosition(combat: Combat, links: ChainLink[], index: number): number {
  let position = 0;
  for (let i = index; i > 0 && linksTouch(combat, links[i - 1], links[i]); i--) position += 1;
  return position;
}

// «Первая» ещё и при смене цели: карта бьёт другого врага, чем предыдущая карта цепочки с одной целью
function switchesTarget(combat: Combat, links: ChainLink[], index: number): boolean {
  const link = links[index];
  if (link.card.target !== "enemy") return false;
  for (let i = index - 1, position = chainPosition(combat, links, index); i >= 0 && position > 0; i--, position--) {
    if (links[i].card.target === "enemy") return links[i].item.targetId !== link.item.targetId;
  }
  return false;
}

// Сработает ли бонус цепочки у этой карты прямо сейчас (добивание для «Финала» проверяется после её эффектов)
function chainBonusMet(combat: Combat, links: ChainLink[], index: number): boolean {
  const link = links[index];
  const bonus = link.card.chain;
  if (!bonus) return false;
  const previous = index > 0 ? links[index - 1] : null;
  const touching = previous !== null && linksTouch(combat, previous, link);
  const position = chainPosition(combat, links, index);
  switch (bonus.kind) {
    case "first":
      return position === 0 || switchesTarget(combat, links, index);
    case "final":
      // Конец цепочки: в момент срабатывания за картой встык ничего нет
      return index === links.length - 1 || !linksTouch(combat, link, links[index + 1]);
    case "afterAttack":
      return touching && previous!.card.type === "attack";
    case "afterSkill":
      return touching && previous!.card.type === "skill";
    case "joint":
      return touching && Boolean(link.card.joints?.left) && previous!.card.joints?.right === link.card.joints?.left;
    case "chain":
      return position + 1 >= (bonus.n ?? 3);
  }
}

// Эффекты бонуса цепочки с учётом Сердца бездны («Финал» срабатывает дважды)
function bonusEffects(combat: Combat, item: LaneItem, card: CardData): Effect[] {
  const bonus = card.chain!;
  recordEvent(combat, { type: "chainBonus", laneId: item.id, kind: bonus.kind, cardId: card.id });
  return bonus.kind === "final" && finalTwice(combat) ? [...bonus.effects, ...bonus.effects] : bonus.effects;
}

// Эффекты бонуса цепочки для карты, которая сейчас срабатывает, или пусто
function chainBonusEffects(combat: Combat, item: LaneItem): Effect[] {
  const links = chainLinks(combat);
  const index = links.findIndex((link) => link.item === item);
  if (index < 0 || !chainBonusMet(combat, links, index)) return [];
  return bonusEffects(combat, item, links[index].card);
}

// ---------- Ход времени ----------

// «Начать»: время пошло. Карты весом 0 на стыке 0 срабатывают сразу
export function startCombat(combat: Combat): ActionResult {
  if (combat.status !== "planning") return fail("notPlanning");
  combat.events = [];
  combat.status = "running";
  resolveZeroWeight(combat, combat.clock);
  checkPhases(combat);
  return OK;
}

// Одна клетка времени. Пока не выбрано зелье варки, время стоит
export function tick(combat: Combat): ActionResult {
  if (combat.status !== "running") return fail("notRunning");
  if (combat.brewChoices.length > 0) return fail("chooseBrew");
  combat.events = [];
  // Карты весом 0, поставленные на текущий стык во время паузы
  resolveZeroWeight(combat, combat.clock);
  if (!isOver(combat)) resolveBoundary(combat, combat.clock + 1);
  if (!isOver(combat)) {
    pruneOldActions(combat);
    for (const enemy of combat.enemies) fillEnemyLane(combat, enemy);
  }
  return OK;
}

// Для тестов и бота: начать (если ещё не начат) и прогнать cells клеток подряд. События всех клеток копятся.
// Встаёт, если бой кончился или надо выбрать зелье варки
export function advance(combat: Combat, cells: number = HORIZON): ActionResult {
  if (combat.status === "planning") startCombat(combat);
  if (combat.status !== "running") return fail("notRunning");
  const events = [...combat.events];
  for (let i = 0; i < cells && combat.status === "running" && combat.brewChoices.length === 0; i++) {
    tick(combat);
    events.push(...combat.events);
  }
  combat.events = events;
  return OK;
}

// Для тестов и бота: прогнать 6 клеток (горизонт)
export function launch(combat: Combat): ActionResult {
  if (!canAct(combat)) return fail("notPlanning");
  if (combat.brewChoices.length > 0) return fail("chooseBrew");
  return advance(combat, HORIZON);
}

// Всё, что происходит на одном стыке: действия, кончившиеся в этой клетке, карты весом 0 на стыке, такты
function resolveBoundary(combat: Combat, boundary: number): void {
  advancePreparation(combat, boundary);
  combat.clock = boundary;
  for (const unit of [combat.hero, ...combat.enemies]) expireBlocks(combat, unit);

  for (let next = pickNextAction(combat); next && !isOver(combat); next = pickNextAction(combat)) {
    next();
    checkPhases(combat);
  }
  if (isOver(combat)) return;
  resolveZeroWeight(combat, boundary);
  checkPhases(combat);
  if (isOver(combat)) return;

  if (boundary % T.tactCells === 0) {
    finishTact(combat);
    if (!isOver(combat)) startTact(combat);
  }
}

// Следующее действие, которое срабатывает на текущем стыке, или null. Первым ходит герой,
// если только у врага нет Ускорения, а у героя нет. Между врагами — по порядку.
// Подготовленное заклинание Мага срабатывает сразу, как готово: после карт героя этой клетки
function pickNextAction(combat: Combat): (() => void) | null {
  const now = combat.clock;
  const schedule = heroSchedule(combat);
  const hero: { end: number; id: number; run: () => void }[] = [];
  for (const item of combat.lane) {
    if (item.resolved || item.weight === 0) continue;
    const slot = schedule.lane.get(item.id)!;
    if (slot.end <= now) hero.push({ end: slot.end, id: item.id, run: () => resolveLaneItem(combat, item, slot) });
  }
  for (const spell of combat.prepared) {
    const slot = schedule.prepared.get(spell.id)!;
    if (slot.end <= now) hero.push({ end: slot.end + 0.5, id: spell.id, run: () => resolvePrepared(combat, spell, slot) });
  }
  hero.sort((a, b) => a.end - b.end || a.id - b.id);

  const enemies: { hasty: boolean; run: () => void }[] = [];
  for (const enemy of combat.enemies) {
    if (enemy.hp <= 0) continue;
    const slot = enemySchedule(combat, enemy).find((entry) => !entry.action.resolved);
    if (slot && slot.end <= now) enemies.push({ hasty: (enemy.statuses.haste ?? 0) > 0, run: () => resolveEnemyAction(combat, enemy, slot) });
  }

  const heroHasty = (combat.hero.statuses.haste ?? 0) > 0;
  const hastyEnemy = !heroHasty ? enemies.find((entry) => entry.hasty) : undefined;
  if (hastyEnemy) return hastyEnemy.run;
  return hero[0]?.run ?? enemies[0]?.run ?? null;
}

// Действие героя или врага сработало: стаки Замедления и Ускорения, ушедшие на него, тратятся
function spendTimingStacks(unit: HeroUnit | EnemyUnit, slot: { slowed: boolean; hasted: boolean }): void {
  if (slot.slowed) reduceStatus(unit, "slow");
  if (slot.hasted) reduceStatus(unit, "haste");
}

// Оглушение срывает действие. Возвращает true, если сорвало
function stunned(combat: Combat, unit: HeroUnit | EnemyUnit, targetId: string): boolean {
  if (!unit.statuses.stun) return false;
  reduceStatus(unit, "stun");
  recordEvent(combat, { type: "stunned", targetId });
  return true;
}

// Кровотечение: за каждую клетку веса действия — столько HP, сколько стаков, мимо блока. Потом −1 стак
function bleed(combat: Combat, unit: HeroUnit | EnemyUnit, weight: number, targetId: string): void {
  const stacks = unit.statuses.bleed ?? 0;
  if (!stacks || weight <= 0) return;
  const lost = Math.min(unit.hp, stacks * weight);
  if (unit !== combat.hero) addTally(combat, "damageDealt", lost);
  unit.hp -= lost;
  if (unit === combat.hero && lost > 0 && unit.hp > 0) fireTrigger(combat, "onHpLost");
  recordEvent(combat, { type: "bleed", targetId, amount: lost, hp: unit.hp, block: unit.block });
  reduceStatus(unit, "bleed");
  if (combat.hero.hp <= 0) combat.status = "lost";
  else if (combat.enemies.every((enemy) => enemy.hp <= 0)) combat.status = "won";
  else if (unit !== combat.hero && unit.hp <= 0) fireTrigger(combat, "onEnemyDeath");
}

// Сработавшая карта приводит в руку новую (Корона углей — две). Рука не больше 10
function drawAfterResolve(combat: Combat): void {
  if (isOver(combat)) return;
  drawCards(combat.piles, drawOnResolve(combat), combat.rng);
}

function resolveLaneItem(combat: Combat, item: LaneItem, slot: HeroSlot): void {
  combat.acting = `lane:${item.id}`;
  // Бонус цепочки проверяем, пока карта ещё на своём месте среди несыгранных
  const links = item.card ? chainLinks(combat) : [];
  const index = links.findIndex((link) => link.item === item);
  const card = index >= 0 ? links[index].card : null;
  const bonusMet = index >= 0 && chainBonusMet(combat, links, index);
  const bonus = bonusMet ? bonusEffects(combat, item, card!) : [];
  // «Финал» при добивании: если бонус не сработал по цепочке, а карта убила врага — сработает после её эффектов
  const finalOnKill = card?.chain?.kind === "final" && !bonusMet;
  item.resolved = true;
  item.start = slot.start;
  item.end = combat.clock;
  spendTimingStacks(combat.hero, slot);
  // У Мага Оглушение срывает ближайшее подготовленное заклинание, а не карту на дорожке
  if (combat.prepared.length === 0 && stunned(combat, combat.hero, "hero")) {
    if (item.card) {
      combat.piles.discard.push(item.card);
      drawAfterResolve(combat);
    }
    return;
  }
  bleed(combat, combat.hero, slot.weight, "hero");
  if (isOver(combat)) return;
  if (item.card) {
    const alive = aliveEnemies(combat).length;
    playResolvedCard(combat, item.card, item.targetId, 1, bonus);
    if (finalOnKill && !isOver(combat) && aliveEnemies(combat).length < alive) {
      executeEffects(combat, bonusEffects(combat, item, card!), {
        source: combat.hero, targets: resolveTargets(combat, card!.target, item.targetId), fromCard: true,
      });
    }
    drawAfterResolve(combat);
  } else if (item.potionId) {
    drinkPotion(combat, item.potionId, item.targetId);
  }
  combat.acting = undefined;
}

function resolvePrepared(combat: Combat, spell: PreparedSpell, slot: HeroSlot): void {
  combat.acting = `prep:${spell.id}`;
  combat.prepared = combat.prepared.filter((entry) => entry !== spell);
  spendTimingStacks(combat.hero, slot);
  // Сорванное заклинание Мага уходит в сброс
  if (stunned(combat, combat.hero, "hero")) {
    combat.piles.discard.push(spell.card);
    drawAfterResolve(combat);
    return;
  }
  playResolvedCard(combat, spell.card, spell.targetId, T.preparedBoost);
  drawAfterResolve(combat);
  combat.acting = undefined;
}

// Если цель умерла раньше, атака переходит на ближайшего живого врага
function resolveTargets(combat: Combat, target: CardTarget, targetId: string | null): (HeroUnit | EnemyUnit)[] {
  const alive = aliveEnemies(combat);
  if (target === "allEnemies") return alive;
  if (target !== "enemy") return [combat.hero];
  const chosen = alive.find((enemy) => enemy.instanceId === targetId);
  if (chosen || alive.length === 0) return chosen ? [chosen] : [];
  const index = combat.enemies.findIndex((enemy) => enemy.instanceId === targetId);
  const nearest = [...alive].sort((a, b) => Math.abs(combat.enemies.indexOf(a) - index) - Math.abs(combat.enemies.indexOf(b) - index))[0];
  return [nearest];
}

// Карта сработала в своей клетке. Добор и варка уже сработали при постановке
// bonus — эффекты бонуса цепочки: добавляются к эффектам карты и идут по общему порядку
function playResolvedCard(combat: Combat, instance: CardInstance, targetId: string | null, boost: number, bonus: Effect[] = []): void {
  const card = getCardData(instance);
  addTally(combat, "cardsPlayed");
  // Сила остаётся до конца боя, поэтому её карта не попадает ни в одну стопку
  if (card.power) combat.hero.powers.push({ cardId: card.id, ...card.power });

  let effects = [...card.effects.filter((effect) => !PLANNING_EFFECTS.has(effect.type)), ...bonus];
  if (boost !== 1) effects = boostEffects(effects, boost);
  const context = { source: combat.hero, targets: resolveTargets(combat, card.target, targetId), fromCard: true, exhausted: false };
  recordEvent(combat, { type: "cardPlayed", cardId: card.id, targetId });
  executeEffects(combat, effects, context);
  fireTrigger(combat, "onCardPlayed", { cardType: card.type });

  if (context.exhausted) {
    combat.piles.exhaust.push(instance);
    fireTrigger(combat, "onExhaust");
  } else if (card.type !== "power") {
    combat.piles.discard.push(instance);
  }
}

function drinkPotion(combat: Combat, potionId: string, targetId: string | null): void {
  const potion = POTIONS[potionId];
  addTally(combat, "potionsUsed");
  const effects = potion.effects.filter((effect) => !PLANNING_EFFECTS.has(effect.type));
  executeEffects(combat, effects, { source: combat.hero, targets: resolveTargets(combat, potion.target, targetId), fromCard: false });
  fireTrigger(combat, "onPotionUsed");
}

function resolveEnemyAction(combat: Combat, enemy: EnemyUnit, slot: ReturnType<typeof enemySchedule>[number]): void {
  combat.acting = `enemy:${enemy.instanceId}:${slot.action.id}`;
  slot.action.resolved = true;
  slot.action.end = combat.clock;
  spendTimingStacks(enemy, slot);
  if (stunned(combat, enemy, enemy.instanceId)) return;
  bleed(combat, enemy, slot.weight, enemy.instanceId);
  if (isOver(combat) || enemy.hp <= 0) return;

  const move = ENEMIES[enemy.enemyId].moves[slot.action.move];
  recordEvent(combat, { type: "enemyAction", enemyId: enemy.instanceId, intent: move.intent });
  executeEffects(combat, move.effects, { source: enemy, targets: [combat.hero], fromCard: false });
  if (isOver(combat)) return;

  // Безумие: после каждого своего хода враг становится сильнее
  if (combat.enemyRamp) {
    enemy.statuses.strength = (enemy.statuses.strength ?? 0) + combat.enemyRamp;
    recordEvent(combat, { type: "status", targetId: enemy.instanceId, status: "strength", amount: combat.enemyRamp });
  }
  combat.acting = undefined;
}

// Карты весом 0 на стыке — в порядке постановки
function resolveZeroWeight(combat: Combat, boundary: number): void {
  const items = combat.lane.filter((item) => !item.resolved && item.weight === 0 && item.start <= boundary).sort((a, b) => a.id - b.id);
  for (const item of items) {
    if (isOver(combat)) return;
    resolveLaneItem(combat, item, { start: boundary, end: boundary, weight: 0, slowed: false, hasted: false });
  }
}

// ---------- Такты ----------

// Начало такта: переброс, замёрзшие клетки на такт вперёд горизонта, Яд, Горение, Печать крови,
// потом силы, особенности и реликвии «в начале такта» (Прилив Мага)
function startTact(combat: Combat): void {
  combat.turn += 1;
  combat.rerollsLeft = rerollsPerTact(combat);
  freezeTact(combat, combat.turn + 2);
  combat.acting = "tact";
  recordEvent(combat, { type: "tactStart" });
  for (const unit of [combat.hero, ...combat.enemies]) {
    if (unit.hp <= 0 || isOver(combat)) continue;
    applyPoison(combat, unit);
    if (unit.hp > 0 && !isOver(combat)) applyBurning(combat, unit);
    if (unit !== combat.hero && unit.hp > 0 && !isOver(combat)) applyLeech(combat, unit);
  }
  if (!isOver(combat)) fireTrigger(combat, "onTactStart");
  combat.acting = undefined;
  checkPhases(combat);
}

// Конец такта: силы и реликвии «в конце такта», Слабость −1, Комбо сгорает
function finishTact(combat: Combat): void {
  fireTrigger(combat, "onTactEnd");
  for (const unit of [combat.hero, ...combat.enemies]) {
    for (const status of DECAYING_STATUSES) reduceStatus(unit, status);
    for (const status of TACT_STATUSES) delete unit.statuses[status];
  }
}

// ---------- Что показать игроку ----------

// Итог одного действия по предпросмотру: сколько урона нанесёт и блока даст
export interface ActionPreview {
  damage: number; // урон по целям (с блоком и без)
  block: number;
  cell: number;
  chain: boolean; // сработает бонус цепочки
}

// Предпросмотр на 6 клеток вперёд: розыгрыш на копии боя. Числа уже учитывают всё, что сработает раньше на шкале.
// Ключ — чьё действие: «lane:3», «prep:5», «enemy:skeleton-0:1». Пока не выбрано зелье варки, предпросмотра нет
export function previewLaunch(combat: Combat): Map<string, ActionPreview> {
  const result = new Map<string, ActionPreview>();
  if (!canAct(combat) || combat.brewChoices.length > 0) return result;
  const copy = structuredClone(combat);
  advance(copy, HORIZON);
  for (const event of copy.events) {
    const by = event.by as string | undefined;
    if (!by) continue;
    const entry = result.get(by) ?? { damage: 0, block: 0, cell: event.cell as number, chain: false };
    if (event.type === "hit") entry.damage += event.damage as number;
    if (event.type === "block") entry.block += event.amount as number;
    if (event.type === "chainBonus") entry.chain = true;
    result.set(by, entry);
  }
  return result;
}

export interface EnemyIntent {
  intent: Intent;
  hits: number;
  damage: number;
  block: number;
}

export interface EnemyLaneEntry extends EnemyIntent {
  hidden: boolean; // скрытый ход ещё не раскрыт: показывать «?»
  id: number;
  move: string;
  start: number;
  end: number;
  weight: number;
  resolved: boolean;
}

function describeMove(combat: Combat, enemy: EnemyUnit, move: EnemyMove): EnemyIntent {
  const attacks = move.effects.filter((effect) => effect.type === "damage");
  const blockEffect = move.effects.find((effect) => effect.type === "block");
  const heroWhenHit = { statuses: combat.hero.statuses, damageReduction: combat.hero.damageReduction };
  return {
    intent: move.intent,
    hits: attacks.length,
    damage: attacks.length > 0 ? calculateDamage(attacks[0].amount, enemy, heroWhenHit) : 0,
    block: blockEffect ? calculateBlock(blockEffect.amount, enemy, false) : 0,
  };
}

// Дорожка врага: что, сколько и на какой клетке (недавние сработавшие и запланированные на 6 клеток вперёд)
export function getEnemyLane(combat: Combat, enemy: EnemyUnit): EnemyLaneEntry[] {
  const moves = ENEMIES[enemy.enemyId].moves;
  return enemySchedule(combat, enemy).map((slot) => ({
    ...describeMove(combat, enemy, moves[slot.action.move]),
    hidden: isHidden(combat, moves[slot.action.move], slot.end, slot.action.resolved),
    id: slot.action.id,
    move: slot.action.move,
    start: slot.start,
    end: slot.end,
    weight: slot.weight,
    resolved: slot.action.resolved,
  }));
}

// Скрытый ход раскрывается за 2 клетки до срабатывания
const REVEAL_CELLS = 2;
function isHidden(combat: Combat, move: EnemyMove, end: number, resolved: boolean): boolean {
  return Boolean(move.hidden) && !resolved && combat.clock < end - REVEAL_CELLS;
}

// Ближайший ход врага: его показывают над головой. hidden — пока не раскрыт
export function getEnemyIntent(combat: Combat, enemy: EnemyUnit): EnemyIntent & { hidden: boolean } {
  const data = ENEMIES[enemy.enemyId];
  const slot = enemySchedule(combat, enemy).find((entry) => !entry.action.resolved);
  const move = data.moves[slot?.action.move ?? currentPattern(enemy)[enemy.patternIndex % currentPattern(enemy).length]];
  return { ...describeMove(combat, enemy, move), hidden: slot ? isHidden(combat, move, slot.end, false) : false };
}

// ---------- Для тестового режима, бота и старых тестов ----------

// Можно ли поставить карту хоть куда-нибудь
export function canPlayCard(combat: Combat, instance: CardInstance): boolean {
  const weight = cardWeight(instance, combat);
  return canAct(combat) && weight !== null && findFreeStart(combat, weight) !== null;
}

// «Сыграть карту»: ставит её в первую свободную клетку
export function playCard(combat: Combat, uid: number, targetId?: string | null): ActionResult {
  const instance = combat.piles.hand.find((card) => card.uid === uid);
  if (!instance) return fail("cardNotInHand");
  const weight = cardWeight(instance, combat);
  const start = weight === null ? null : findFreeStart(combat, weight);
  if (start === null) return fail("cannotPlay");
  return placeCard(combat, uid, start, targetId ?? null);
}

// «Выпить зелье»: ставит его в первую свободную клетку
export function usePotion(combat: Combat, index: number, targetId?: string | null): ActionResult {
  const start = findFreeStart(combat, potionWeight(combat));
  if (start === null) return fail("noRoom");
  return placePotion(combat, index, start, targetId ?? null);
}

// Прогнать 6 клеток; если надо выбрать зелье варки — берётся первое
export function endTurn(combat: Combat): void {
  const target = combat.clock + HORIZON;
  while (canAct(combat) && combat.clock < target) {
    while (combat.brewChoices.length > 0) chooseBrew(combat, 0, combat.brewChoices[0].options[0]);
    advance(combat, target - combat.clock);
  }
}

// Тестовый режим: кладёт любую карту в руку. Возвращает false, если рука полна
export function addCardToHand(combat: Combat, cardId: string, level = 0): boolean {
  if (combat.piles.hand.length >= CONFIG.maxHandSize) return false;
  combat.piles.hand.push(createCardInstance(combat.piles, cardId, level));
  return true;
}

// Тестовый режим: даёт реликвию посреди боя. Эффект начала боя срабатывает сразу
export function addRelicToCombat(combat: Combat, relicId: string): void {
  combat.relics.push(relicId);
  if (RELICS[relicId].trigger !== "onCombatStart") return;
  executeEffects(combat, RELICS[relicId].effects, { source: combat.hero, targets: [], fromCard: false });
}

// Тестовый режим: даёт зелье. Возвращает false, если места нет
export function addPotionToCombat(combat: Combat, potionId: string): boolean {
  if (combat.potions.length >= combat.maxPotions) return false;
  combat.potions.push(potionId);
  return true;
}
