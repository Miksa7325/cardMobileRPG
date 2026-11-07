// Бой на шкале хода. Этот файл не трогает HTML: только меняет данные боя.
//
// Как идёт ход:
// 1. Начало хода: добор, враги ставят свои ходы на свои дорожки, начинается такт 1.
// 2. Планирование: игрок ставит карты и зелья на свою дорожку (placeCard, placePotion), убирает и переставляет их
//    (removeFromLane, moveLaneItem), один раз перебрасывает карту (rerollCard), отмечает карты, которые оставит (setKeep).
// 3. «Запуск» (launch): время идёт по клеткам 1–6. Действие срабатывает в своей последней клетке,
//    карта весом 0 — на своём стыке клеток. При ничьей первым герой, если только у врага нет Ускорения.
// 4. Конец шкалы: статусы убывают, рука уходит в сброс (кроме отмеченных), начинается следующий ход.
import { CONFIG } from "../config.ts";
import { ENEMIES } from "../data/enemies.ts";
import { HEROES, getMaxPotions } from "../data/heroes.ts";
import { POTIONS } from "../data/potions.ts";
import { RELICS } from "../data/relics.ts";
import type {
  ActionResult, CardData, CardInstance, CardTarget, Combat, Effect, EnemyAction, EnemyMove, EnemyUnit, HeroId, HeroUnit, Intent,
  LaneItem, Power, PreparedSpell, Rng, RunCard, StatusId, Statuses,
} from "../types.ts";
import { createCardInstance, createPiles, drawCards, getCardData, takeFromHand } from "./deck.ts";
import {
  PLANNING_EFFECTS, absoluteTime, addTally, applyBurning, applyLeech, applyPoison, boostEffects, calculateBlock,
  calculateDamage, executeEffects, expireBlocks, fireTrigger, isOver, recordEvent, reduceStatus, setSummonHandler,
} from "./effects.ts";
import { createRng, nextInt } from "./rng.ts";

const T = CONFIG.timeline;

// Убывают на 1 в конце шкалы. Уязвимость сама не проходит, её снимает только Починка.
// Сила и Ловкость остаются; Яд, Горение, Замедление, Ускорение и прочие убывают по своим правилам
const DECAYING_STATUSES: StatusId[] = ["weak"];
// Сгорают целиком в конце шкалы: Комбо Убийцы живёт один ход
const TURN_STATUSES: StatusId[] = ["combo"];

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
}

export function createCombat({
  heroId, enemyIds, seed, hp, maxHp, deck, relics = [], potions = [], enemyHpMultiplier = 1, enemyStrength = 0, enemyBlock = 0,
  enemyRamp = 0, heroStatuses = {}, extraPassives = [], potionPool = Object.keys(POTIONS),
}: CombatSetup): Combat {
  const rng = createRng(seed);
  const heroData = HEROES[heroId];
  const startingDeck = heroData.deck.map((cardId) => ({ cardId, level: 0 }));

  const combat: Combat = {
    rng,
    status: "planning",
    turn: 0,
    clock: 0,
    capacity: heroData.capacity,
    capacityBonus: 0,
    lane: [],
    prepared: [],
    nextLaneId: 0,
    zeroUsed: 0,
    rerollsLeft: 0,
    keep: [],
    carried: [],
    brewChoices: [],
    launchGains: false,
    frozenCells: [],
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
    enemies: enemyIds.map((enemyId, index) => createEnemy(enemyId, index, rng, enemyHpMultiplier, enemyStrength, enemyBlock)),
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

  startTurn(combat);
  // Начало боя идёт после начала первого хода: блок и вместимость от реликвий не обнулятся
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
    // Блок от особенности акта держится весь первый ход
    block,
    blocks: block > 0 ? [{ amount: block, expires: T.cells }] : [],
    statuses: strength > 0 ? { strength } : {},
    patternIndex: 0,
    lane: [],
    carry: [],
    laneStart: 0,
    phase: 0,
  };
}

// Помощник, призванный посреди хода: встаёт рядом, его дорожка начинается с этого момента
setSummonHandler((combat, enemyId) => {
  const enemy = createEnemy(enemyId, combat.enemies.length, combat.rng, combat.enemyHpMultiplier, 0, 0);
  combat.enemies.push(enemy);
  enemy.laneStart = combat.clock;
  fillEnemyLane(combat, enemy, []);
  recordEvent(combat, { type: "summon", targetId: enemy.instanceId, enemyId });
});

// Набор ходов врага сейчас: у босса во второй фазе — свой
function currentPattern(enemy: EnemyUnit): string[] {
  const data = ENEMIES[enemy.enemyId];
  return enemy.phase > 0 ? data.phases![enemy.phase - 1].pattern : data.pattern;
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

// Сколько клеток срезает Ловкость с первой карты хода: каждые 2 стака — 1 клетка
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
  const preparedSlots = () => new Map(prepared.map((spell) => {
    const mark = marks.get(`p${spell.id}`);
    const base = spell.due - absoluteTime(combat, 0);
    const end = Math.max(combat.clock, base + (mark?.slowed ? 1 : 0) - (mark?.hasted ? 1 : 0));
    return [spell.id, { start: end, end, weight: spell.weight, slowed: mark?.slowed ?? false, hasted: mark?.hasted ?? false }];
  }));

  // Первый проход: без Замедления и Ускорения
  const roughLane = laneSlots();
  const roughPrepared = preparedSlots();
  const order = [
    ...lane.filter((item) => !item.resolved && item.weight > 0).map((item) => ({ key: `l${item.id}`, end: roughLane.get(item.id)!.end, side: 0, id: item.id })),
    ...prepared.map((spell) => ({ key: `p${spell.id}`, end: roughPrepared.get(spell.id)!.end, side: 1, id: spell.id })),
  ].sort((a, b) => a.end - b.end || a.side - b.side || a.id - b.id);
  const slow = combat.hero.statuses.slow ?? 0;
  const haste = combat.hero.statuses.haste ?? 0;
  order.forEach((action, index) => marks.set(action.key, { slowed: index < slow, hasted: index < haste }));

  return { lane: laneSlots(), prepared: preparedSlots() };
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

// Расписание ходов врага: стоят встык с клетки 1. Замедление и Ускорение — на ближайшие ходы
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

// В начале хода враг ставит ходы по своему кругу, пока влезают в шкалу. Сначала — те, что не влезли в прошлый ход
function scheduleEnemy(combat: Combat, enemy: EnemyUnit): void {
  enemy.lane = [];
  enemy.laneStart = 0;
  const queue = [...enemy.carry];
  enemy.carry = [];
  fillEnemyLane(combat, enemy, queue);
}

// Добавляет ходы в конец дорожки, пока влезают в шкалу: сначала из queue, потом по кругу набора ходов
function fillEnemyLane(combat: Combat, enemy: EnemyUnit, queue: string[]): void {
  const data = ENEMIES[enemy.enemyId];
  for (;;) {
    const pattern = currentPattern(enemy);
    let move = queue.shift();
    let fromPattern = false;
    if (move === undefined) {
      move = pattern[enemy.patternIndex % pattern.length];
      fromPattern = true;
    }
    const candidate = [...enemy.lane, { move, weight: data.moves[move].weight, resolved: false }];
    const schedule = enemySchedule(combat, enemy, candidate);
    const pending = enemy.lane.some((action) => !action.resolved);
    if (schedule[schedule.length - 1].end > T.cells && (pending || enemy.laneStart === 0)) {
      // Не влез: подождёт следующего хода
      if (!fromPattern) enemy.carry.push(move, ...queue);
      return;
    }
    if (schedule[schedule.length - 1].end > T.cells) return;
    enemy.lane = candidate;
    if (fromPattern) enemy.patternIndex = (enemy.patternIndex + 1) % pattern.length;
  }
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
    enemy.carry = [];
    recordEvent(combat, { type: "phase", targetId: enemy.instanceId, phase: enemy.phase });
    if (next.onEnter) executeEffects(combat, next.onEnter, { source: enemy, targets: [combat.hero], fromCard: false });
    enemy.laneStart = Math.max(combat.clock, ...enemy.lane.map((action) => action.end ?? 0));
    fillEnemyLane(combat, enemy, []);
  }
}

// Король-лич: в начале хода замораживает случайную клетку дорожки героя
function freezeCells(combat: Combat): void {
  combat.frozenCells = [];
  for (const enemy of aliveEnemies(combat)) {
    if (!ENEMIES[enemy.enemyId].freezeCell) continue;
    const free = [1, 2, 3, 4, 5, 6].filter((cell) => !combat.frozenCells.includes(cell));
    const cell = free[nextInt(combat.rng, 0, free.length - 1)];
    combat.frozenCells.push(cell);
    recordEvent(combat, { type: "freeze", targetId: enemy.instanceId, cell });
  }
}

// ---------- Планирование ----------

// Вес карты на шкале — её старая стоимость. null — карту нельзя разыграть (Рана)
export function cardWeight(instance: CardInstance): number | null {
  return getCardData(instance).cost;
}

function potionWeight(combat: Combat): number {
  return HEROES[combat.hero.heroId].potionWeight;
}

// Сколько вместимости уже занято картами и зельями этого хода
export function usedCapacity(combat: Combat, lane: LaneItem[] = combat.lane): number {
  const slots = heroSchedule(combat, lane).lane;
  return lane.filter((item) => item.weight > 0).reduce((sum, item) => sum + (slots.get(item.id)?.weight ?? item.weight), 0);
}

export function totalCapacity(combat: Combat): number {
  return combat.capacity + combat.capacityBonus;
}

// Проверяет расстановку: все карты стоят там, куда их поставили, не вылезают за шкалу и влезают во вместимость
function checkLane(combat: Combat, lane: LaneItem[]): string | null {
  const slots = heroSchedule(combat, lane).lane;
  for (const item of lane) {
    if (item.resolved) continue;
    const slot = slots.get(item.id)!;
    if (item.weight === 0) {
      if (item.start < combat.clock || item.start > T.cells) return "outOfTimeline";
      continue;
    }
    if (item.start <= combat.clock) return "pastCell";
    if (slot.start !== item.start) return "overlap";
    if (slot.end > T.cells) return "outOfTimeline";
    if (combat.frozenCells.some((cell) => cell >= slot.start && cell <= slot.end)) return "frozen";
  }
  if (usedCapacity(combat, lane) > totalCapacity(combat)) return "noCapacity";
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

// Эффекты добора, вместимости и варки срабатывают сразу при постановке. Возвращает, были ли они:
// тогда карту уже нельзя вернуть в руку
function runPlanningEffects(combat: Combat, effects: Effect[]): boolean {
  const planning = effects.filter((effect) => PLANNING_EFFECTS.has(effect.type));
  for (const effect of planning) {
    if (effect.type === "brewPotion") {
      // Варка с выбором: из двух случайных зелий игрок выберет одно (chooseBrew)
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
  while (options.length < 2 && pool.length > 0) options.push(pool.splice(nextInt(combat.rng, 0, pool.length - 1), 1)[0]);
  combat.brewChoices.push({ options });
}

export interface PlaceOptions {
  prepare?: boolean; // Маг: поставить на подготовку
}

// Ставит карту из руки на шкалу. start — первая клетка (1–6), у карты весом 0 — стык (0–6).
// Возвращает { ok: true } или { ok: false, reason }
export function placeCard(combat: Combat, uid: number, start: number, targetId: string | null = null, options: PlaceOptions = {}): ActionResult {
  if (combat.status !== "planning") return fail("notPlanning");
  const instance = combat.piles.hand.find((card) => card.uid === uid);
  if (!instance) return fail("cardNotInHand");
  const weight = cardWeight(instance);
  if (weight === null) return fail("cannotPlay");
  const card = getCardData(instance);
  const targetError = checkTarget(combat, card.target, targetId);
  if (targetError) return fail(targetError);
  if (options.prepare) return prepareSpell(combat, instance, card, weight, targetId);

  if (weight === 0 && combat.zeroUsed >= T.maxZeroWeight) return fail("zeroLimit");
  const item: LaneItem = {
    id: combat.nextLaneId, kind: "card", card: instance, start, weight, targetId, locked: false, resolved: false,
  };
  const error = checkLane(combat, [...combat.lane, item]);
  if (error) return fail(error);

  combat.nextLaneId += 1;
  takeFromHand(combat.piles, uid);
  combat.lane.push(item);
  if (weight === 0) combat.zeroUsed += 1;
  combat.events = [];
  item.locked = runPlanningEffects(combat, card.effects);
  return OK;
}

// Маг ставит заклинание на подготовку: оно сработает само через 2 × вес клеток (Прилив сокращает), на 50% сильнее
function prepareSpell(combat: Combat, instance: CardInstance, card: CardData, weight: number, targetId: string | null): ActionResult {
  const capacity = HEROES[combat.hero.heroId].prepCapacity;
  if (!capacity) return fail("noPreparation");
  const waiting = combat.prepared.reduce((sum, spell) => sum + spell.weight, 0);
  if (waiting + weight > capacity) return fail("noPrepCapacity");
  const delay = Math.max(1, T.prepDelayPerWeight * weight - (combat.hero.statuses.surge ?? 0));
  const spell: PreparedSpell = {
    id: combat.nextLaneId, card: instance, turn: combat.turn, locked: false, weight, targetId, due: absoluteTime(combat) + delay,
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
  if (combat.status !== "planning") return fail("notPlanning");
  const potionId = combat.potions[index];
  const potion = POTIONS[potionId];
  if (!potion) return fail("noPotion");
  const targetError = checkTarget(combat, potion.target, targetId);
  if (targetError) return fail(targetError);
  const item: LaneItem = {
    id: combat.nextLaneId, kind: "potion", potionId, start, weight: potionWeight(combat), targetId, locked: false, resolved: false,
  };
  const error = checkLane(combat, [...combat.lane, item]);
  if (error) return fail(error);

  combat.nextLaneId += 1;
  combat.potions.splice(index, 1);
  combat.lane.push(item);
  combat.events = [];
  item.locked = runPlanningEffects(combat, potion.effects);
  return OK;
}

// Возвращает карту или зелье со шкалы (или с подготовки) обратно. Нельзя, если уже сработали добор или вместимость
export function removeFromLane(combat: Combat, id: number): ActionResult {
  if (combat.status !== "planning") return fail("notPlanning");
  const item = combat.lane.find((entry) => entry.id === id);
  if (item) {
    if (item.resolved || item.locked) return fail("locked");
    // Убрать можно всегда: от этого остальные карты не сдвигаются
    combat.lane = combat.lane.filter((entry) => entry !== item);
    if (item.card) {
      combat.piles.hand.push(item.card);
      if (item.weight === 0) combat.zeroUsed -= 1;
    }
    if (item.potionId) combat.potions.push(item.potionId);
    return OK;
  }
  const spell = combat.prepared.find((entry) => entry.id === id);
  if (!spell) return fail("notOnLane");
  if (spell.locked || spell.turn !== combat.turn) return fail("locked");
  combat.prepared = combat.prepared.filter((entry) => entry !== spell);
  combat.piles.hand.push(spell.card);
  return OK;
}

// Переставляет карту или зелье на другую клетку (и цель). Если на новом месте нельзя, всё остаётся как было
export function moveLaneItem(combat: Combat, id: number, start: number, targetId?: string | null): ActionResult {
  const item = combat.lane.find((entry) => entry.id === id);
  if (!item) return fail("notOnLane");
  if (item.resolved || item.locked) return fail("locked");
  const moved = { ...item, start, targetId: targetId === undefined ? item.targetId : targetId };
  const target = item.card ? getCardData(item.card).target : POTIONS[item.potionId!].target;
  const targetError = checkTarget(combat, target, moved.targetId);
  if (targetError) return fail(targetError);
  const lane = combat.lane.map((entry) => (entry === item ? moved : entry));
  const error = checkLane(combat, lane);
  if (error) return fail(error);
  combat.lane = lane;
  return OK;
}

// Один раз за ход: карта из руки уходит в сброс, вместо неё берётся новая
export function rerollCard(combat: Combat, uid: number): ActionResult {
  if (combat.status !== "planning") return fail("notPlanning");
  if (combat.rerollsLeft <= 0) return fail("noRerolls");
  if (!combat.piles.hand.some((card) => card.uid === uid)) return fail("cardNotInHand");
  combat.rerollsLeft -= 1;
  combat.piles.discard.push(takeFromHand(combat.piles, uid));
  combat.keep = combat.keep.filter((keptUid) => keptUid !== uid);
  drawCards(combat.piles, 1, combat.rng);
  return OK;
}

// Какие карты останутся в руке на следующий ход: не больше keepInHand. Без отметки не остаётся ни одной
export function setKeep(combat: Combat, uids: number[]): ActionResult {
  if (uids.length > T.keepInHand) return fail("tooMany");
  if (!uids.every((uid) => combat.piles.hand.some((card) => card.uid === uid))) return fail("cardNotInHand");
  combat.keep = [...uids];
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
  return combat.piles.draw.slice(-T.openDraws).reverse();
}

// Куда можно поставить карту такого веса: первая подходящая клетка или null
export function findFreeStart(combat: Combat, weight: number): number | null {
  if (weight === 0) return combat.zeroUsed < T.maxZeroWeight ? combat.clock : null;
  for (let start = combat.clock + 1; start + weight - 1 <= T.cells; start++) {
    const probe: LaneItem = { id: -1, kind: "card", start, weight, targetId: null, locked: false, resolved: false };
    if (!checkLane(combat, [...combat.lane, probe])) return start;
  }
  return null;
}

// Можно ли ещё что-то поставить: есть карта, для которой найдётся место
function canPlaceSomething(combat: Combat): boolean {
  return combat.piles.hand.some((card) => {
    const weight = cardWeight(card);
    return weight !== null && findFreeStart(combat, weight) !== null;
  });
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

// Сработает ли бонус цепочки у этой карты прямо сейчас
function chainBonusMet(combat: Combat, links: ChainLink[], index: number): boolean {
  const link = links[index];
  const bonus = link.card.chain;
  if (!bonus) return false;
  const previous = index > 0 ? links[index - 1] : null;
  const touching = previous !== null && linksTouch(combat, previous, link);
  switch (bonus.kind) {
    case "first":
      return index === 0;
    case "final":
      return index === links.length - 1;
    case "afterAttack":
      return touching && previous!.card.type === "attack";
    case "afterSkill":
      return touching && previous!.card.type === "skill";
    case "joint":
      return touching && Boolean(link.card.joints?.left) && previous!.card.joints?.right === link.card.joints?.left;
    case "chain":
      return index + 1 >= (bonus.n ?? 3);
  }
}

// Эффекты бонуса цепочки для карты, которая сейчас срабатывает, или пусто
function chainBonusEffects(combat: Combat, item: LaneItem): Effect[] {
  const links = chainLinks(combat);
  const index = links.findIndex((link) => link.item === item);
  if (index < 0 || !chainBonusMet(combat, links, index)) return [];
  const bonus = links[index].card.chain!;
  recordEvent(combat, { type: "chainBonus", laneId: item.id, kind: bonus.kind, cardId: links[index].card.id });
  return bonus.effects;
}

// ---------- Розыгрыш ----------

// «Запуск»: время идёт от текущей границы до конца шкалы. Если во время розыгрыша пришли карты или вместимость
// и их есть куда поставить, розыгрыш встаёт на паузу (status снова planning, clock — где остановились)
export function launch(combat: Combat): ActionResult {
  if (combat.status !== "planning") return fail("notPlanning");
  if (combat.brewChoices.length > 0) return fail("chooseBrew");
  combat.events = [];
  combat.status = "resolving";
  combat.launchGains = false;

  // Карты весом 0, поставленные на текущий стык (в том числе на паузе)
  resolveZeroWeight(combat, combat.clock);
  checkPhases(combat);
  for (let boundary = combat.clock + 1; boundary <= T.cells && !isOver(combat); boundary++) {
    resolveBoundary(combat, boundary);
    if (isOver(combat)) break;
    if (boundary < T.cells && combat.launchGains) {
      combat.launchGains = false;
      if (canPlaceSomething(combat)) {
        combat.status = "planning";
        return OK;
      }
    }
  }
  if (!isOver(combat)) finishTurn(combat);
  return OK;
}

// Всё, что происходит на одном стыке: действия, кончившиеся в этой клетке, карты весом 0 на стыке, такты
function resolveBoundary(combat: Combat, boundary: number): void {
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
    fireTrigger(combat, "onTactEnd");
    if (boundary < T.cells && !isOver(combat)) startTact(combat);
  }
}

// Следующее действие, которое срабатывает на текущем стыке, или null. Первым ходит герой,
// если только у врага нет Ускорения, а у героя нет. Между врагами — по порядку
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

function resolveLaneItem(combat: Combat, item: LaneItem, slot: HeroSlot): void {
  combat.acting = `lane:${item.id}`;
  // Бонус цепочки проверяем, пока карта ещё на своём месте среди несыгранных
  const bonus = item.card ? chainBonusEffects(combat, item) : [];
  item.resolved = true;
  item.start = slot.start;
  item.end = combat.clock;
  spendTimingStacks(combat.hero, slot);
  // У Мага Оглушение срывает ближайшее подготовленное заклинание, а не карту на дорожке
  if (combat.prepared.length === 0 && stunned(combat, combat.hero, "hero")) {
    if (item.card) combat.piles.discard.push(item.card);
    return;
  }
  bleed(combat, combat.hero, slot.weight, "hero");
  if (isOver(combat)) return;
  if (item.card) playResolvedCard(combat, item.card, item.targetId, 1, bonus);
  else if (item.potionId) drinkPotion(combat, item.potionId, item.targetId);
  combat.acting = undefined;
}

function resolvePrepared(combat: Combat, spell: PreparedSpell, slot: HeroSlot): void {
  combat.acting = `prep:${spell.id}`;
  combat.prepared = combat.prepared.filter((entry) => entry !== spell);
  spendTimingStacks(combat.hero, slot);
  // Сорванное заклинание Мага уходит в сброс
  if (stunned(combat, combat.hero, "hero")) {
    combat.piles.discard.push(spell.card);
    return;
  }
  playResolvedCard(combat, spell.card, spell.targetId, T.preparedBoost);
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

// Карта сработала в своей клетке. Добор, вместимость и варка уже сработали при постановке
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
  combat.acting = `enemy:${enemy.instanceId}:${enemy.lane.indexOf(slot.action)}`;
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

// ---------- Ход и такты ----------

// Начало такта: Яд, Горение, Печать крови, потом силы и реликвии «в начале такта»
function startTact(combat: Combat): void {
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

function startTurn(combat: Combat): void {
  combat.status = "planning";
  combat.turn += 1;
  combat.clock = 0;
  combat.capacityBonus = 0;
  combat.zeroUsed = 0;
  combat.rerollsLeft = T.rerolls;
  combat.lane = [];
  combat.keep = [];
  for (const unit of [combat.hero, ...combat.enemies]) expireBlocks(combat, unit);
  for (const enemy of aliveEnemies(combat)) scheduleEnemy(combat, enemy);
  freezeCells(combat);

  drawCards(combat.piles, HEROES[combat.hero.heroId].drawPerTurn, combat.rng);
  fireTrigger(combat, "onTurnStart");
  if (!isOver(combat)) startTact(combat);
}

// Конец шкалы: что вылезло за клетку 6, переносится, статусы убывают, рука уходит в сброс, кроме отмеченных
function finishTurn(combat: Combat): void {
  for (const item of combat.lane) {
    if (item.resolved) continue;
    if (item.card) {
      combat.piles.hand.push(item.card);
      combat.carried.push(item.card.uid);
    }
    if (item.potionId) combat.potions.push(item.potionId);
  }
  for (const enemy of combat.enemies) {
    if (enemy.hp <= 0) continue;
    enemy.carry = enemy.lane.filter((action) => !action.resolved).map((action) => action.move);
  }
  for (const unit of [combat.hero, ...combat.enemies]) {
    for (const status of DECAYING_STATUSES) reduceStatus(unit, status);
    for (const status of TURN_STATUSES) delete unit.statuses[status];
  }
  const stays = new Set([...combat.keep, ...combat.carried]);
  combat.piles.discard.push(...combat.piles.hand.filter((card) => !stays.has(card.uid)));
  combat.piles.hand = combat.piles.hand.filter((card) => stays.has(card.uid));
  combat.carried = [];
  // Граница: дальше идут события уже нового хода (добор, Яд в начале такта 1)
  recordEvent(combat, { type: "turnEnd" });
  startTurn(combat);
}

// ---------- Что показать игроку ----------

// Итог одного действия по предпросмотру: сколько урона нанесёт и блока даст
export interface ActionPreview {
  damage: number; // урон по целям (с блоком и без)
  block: number;
  cell: number;
  chain: boolean; // сработает бонус цепочки
}

// Предпросмотр «Запуска»: розыгрыш на копии боя. Числа уже учитывают всё, что сработает раньше на шкале.
// Ключ — чьё действие: «lane:3», «prep:5», «enemy:skeleton-0:1». Пока не выбрано зелье варки, предпросмотра нет
export function previewLaunch(combat: Combat): Map<string, ActionPreview> {
  const result = new Map<string, ActionPreview>();
  if (combat.status !== "planning" || combat.brewChoices.length > 0) return result;
  const copy = structuredClone(combat);
  launch(copy);
  for (const event of copy.events) {
    if (event.type === "turnEnd") break;
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

// Дорожка врага: что, сколько и на какой клетке
export function getEnemyLane(combat: Combat, enemy: EnemyUnit): EnemyLaneEntry[] {
  const moves = ENEMIES[enemy.enemyId].moves;
  return enemySchedule(combat, enemy).map((slot) => ({
    ...describeMove(combat, enemy, moves[slot.action.move]),
    hidden: isHidden(combat, moves[slot.action.move], slot.end, slot.action.resolved),
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

// ---------- Для старого экрана боя (до этапа 3) и тестового режима ----------

// Можно ли поставить карту хоть куда-нибудь
export function canPlayCard(combat: Combat, instance: CardInstance): boolean {
  const weight = cardWeight(instance);
  return combat.status === "planning" && weight !== null && findFreeStart(combat, weight) !== null;
}

// Старое «сыграть карту»: ставит её в первую свободную клетку
export function playCard(combat: Combat, uid: number, targetId?: string | null): ActionResult {
  const instance = combat.piles.hand.find((card) => card.uid === uid);
  if (!instance) return fail("cardNotInHand");
  const weight = cardWeight(instance);
  const start = weight === null ? null : findFreeStart(combat, weight);
  if (start === null) return fail("cannotPlay");
  return placeCard(combat, uid, start, targetId ?? null);
}

// Старое «выпить зелье»: ставит его в первую свободную клетку
export function usePotion(combat: Combat, index: number, targetId?: string | null): ActionResult {
  const start = findFreeStart(combat, potionWeight(combat));
  if (start === null) return fail("noRoom");
  return placePotion(combat, index, start, targetId ?? null);
}

// Старый «конец хода»: запуск шкалы до конца, паузы пропускаются. Если надо выбрать зелье варки — берётся первое
export function endTurn(combat: Combat): void {
  while (combat.status === "planning") {
    while (combat.brewChoices.length > 0) chooseBrew(combat, 0, combat.brewChoices[0].options[0]);
    const turn = combat.turn;
    launch(combat);
    if (combat.turn !== turn) return;
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
