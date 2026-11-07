// Логика боя. Этот файл не трогает HTML: только меняет данные боя.
import { CONFIG } from "../config.ts";
import { ENEMIES } from "../data/enemies.ts";
import { HEROES, getMaxPotions } from "../data/heroes.ts";
import { POTIONS } from "../data/potions.ts";
import { RELICS } from "../data/relics.ts";
import { createCardInstance, createPiles, discardHand, drawCards, getCardData, takeFromHand } from "./deck.ts";
import { addTally, applyBurning, applyLeech, applyPoison, calculateBlock, calculateDamage, executeEffects, fireTrigger, recordEvent, reduceStatus } from "./effects.ts";
import { createRng, nextInt } from "./rng.ts";
import type {
  ActionResult, CardInstance, CardTarget, Combat, EnemyMove, EnemyUnit, HeroId, HeroUnit, Intent, Power, Rng, RunCard, StatusId, Statuses,
} from "../types.ts";

// Статусы, которые убывают на 1 в конце хода владельца. Уязвимость сама не проходит, её снимает только Починка.
// Сила и Ловкость тоже остаются, у Яда и Горения свой порядок
const DECAYING_STATUSES: StatusId[] = ["weak"];
// Статусы, которые сгорают целиком в конце хода: Комбо Убийцы живёт один ход
const TURN_STATUSES: StatusId[] = ["combo"];

// Создаёт бой. hp, maxHp, deck, relics и potions приходят из забега; в тестовом режиме их нет,
// тогда берём стартовые значения героя, а реликвий и зелий у него нет.
// enemyHpMultiplier, enemyStrength и enemyBlock усиливают врагов, enemyRamp — сколько Силы враг набирает за каждый свой ход,
// heroStatuses — статусы героя с начала боя, extraPassives — триггеры, которые акт навешивает на героя (жар).
// Так работают особенности актов
export interface CombatSetup {
  heroId: HeroId;
  enemyIds: string[];
  seed: number;
  hp?: number;
  maxHp?: number;
  deck?: (RunCard | { cardId: string; upgraded: boolean })[];
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
  const startingDeck = heroData.deck.map((cardId) => ({ cardId, upgraded: false }));

  const combat: Combat = {
    rng,
    status: "playerTurn", // playerTurn | won | lost
    turn: 0,
    energy: 0,
    hero: {
      heroId,
      hp: hp ?? heroData.maxHp,
      maxHp: maxHp ?? heroData.maxHp,
      block: 0,
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
    events: [], // что произошло за последнее действие игрока: интерфейс проигрывает это как анимацию
  };

  startPlayerTurn(combat);
  // Начало боя идёт после первого хода: блок и энергия от реликвий не обнулятся
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
    block,
    statuses: strength > 0 ? { strength } : {},
    patternIndex: 0, // какой ход из pattern сейчас показан как намерение
  };
}

// Можно ли разыграть карту: статусы и проклятия нельзя (у них cost: null), на остальные нужна энергия
export function canPlayCard(combat: Combat, cardInstance: CardInstance): boolean {
  const { cost } = getCardData(cardInstance);
  return cost !== null && cost <= combat.energy;
}

// Что показать над врагом: тип намерения, урон за удар, количество ударов и блок
export interface EnemyIntent {
  intent: Intent;
  hits: number;
  damage: number;
  block: number;
}

export function getEnemyIntent(combat: Combat, enemy: EnemyUnit): EnemyIntent {
  const move = getCurrentMove(enemy);
  const attacks = move.effects.filter((effect) => effect.type === "damage");
  const blockEffect = move.effects.find((effect) => effect.type === "block");
  // Статусы героя убывают в конце его хода, то есть раньше удара: считаем по тем, что останутся. Защита Воина тоже учитывается
  const heroWhenHit = { statuses: { ...combat.hero.statuses }, damageReduction: combat.hero.damageReduction };
  decayStatuses(heroWhenHit);
  return {
    intent: move.intent,
    hits: attacks.length,
    damage: attacks.length > 0 ? calculateDamage(attacks[0].amount, enemy, heroWhenHit) : 0,
    block: blockEffect ? calculateBlock(blockEffect.amount, enemy, false) : 0,
  };
}

// Разыгрывает карту из руки. Возвращает { ok: true } или { ok: false, reason: "..." }
export function playCard(combat: Combat, uid: number, targetId?: string | null): ActionResult {
  if (combat.status !== "playerTurn") return { ok: false, reason: "notPlayerTurn" };

  const instance = combat.piles.hand.find((card) => card.uid === uid);
  if (!instance) return { ok: false, reason: "cardNotInHand" };
  if (!canPlayCard(combat, instance)) return { ok: false, reason: "cannotPlay" };

  const card = getCardData(instance);
  const targets = findTargets(combat, card.target, targetId);
  if (targets.length === 0) return { ok: false, reason: "invalidTarget" };

  combat.events = [];
  addTally(combat, "cardsPlayed");
  combat.energy -= card.cost ?? 0; // null не пройдёт canPlayCard
  takeFromHand(combat.piles, uid);

  // Сила остаётся до конца боя, поэтому её карта не попадает ни в одну стопку
  if (card.power) combat.hero.powers.push({ cardId: card.id, ...card.power });

  const context = { source: combat.hero, targets, fromCard: true, exhausted: false };
  executeEffects(combat, card.effects, context);
  fireTrigger(combat, "onCardPlayed", { cardType: card.type });

  if (context.exhausted) {
    combat.piles.exhaust.push(instance);
    fireTrigger(combat, "onExhaust");
  } else if (card.type !== "power") {
    combat.piles.discard.push(instance);
  }
  return { ok: true };
}

// Выпивает зелье. Возвращает { ok: true } или { ok: false, reason: "..." }
export function usePotion(combat: Combat, index: number, targetId?: string | null): ActionResult {
  if (combat.status !== "playerTurn") return { ok: false, reason: "notPlayerTurn" };

  const potion = POTIONS[combat.potions[index]];
  if (!potion) return { ok: false, reason: "noPotion" };

  const targets = findTargets(combat, potion.target, targetId);
  if (targets.length === 0) return { ok: false, reason: "invalidTarget" };

  combat.events = [];
  addTally(combat, "potionsUsed");
  combat.potions.splice(index, 1);
  executeEffects(combat, potion.effects, { source: combat.hero, targets, fromCard: false });
  fireTrigger(combat, "onPotionUsed");
  return { ok: true };
}

// Игрок нажал «Конец хода»: срабатывают эффекты конца хода, рука уходит в сброс, ходят враги
export function endTurn(combat: Combat): void {
  if (combat.status !== "playerTurn") return;

  combat.events = [];
  fireTrigger(combat, "onTurnEnd");
  discardHand(combat.piles);
  decayStatuses(combat.hero);
  runEnemyTurn(combat);

  if (combat.status === "playerTurn") startPlayerTurn(combat);
}

// Для тестового режима: кладёт любую карту в руку. Возвращает false, если рука полна
export function addCardToHand(combat: Combat, cardId: string, upgraded = false): boolean {
  if (combat.piles.hand.length >= CONFIG.maxHandSize) return false;
  combat.piles.hand.push(createCardInstance(combat.piles, cardId, upgraded));
  return true;
}

// Для тестового режима: даёт реликвию посреди боя. Эффект начала боя срабатывает сразу
export function addRelicToCombat(combat: Combat, relicId: string): void {
  combat.relics.push(relicId);
  if (RELICS[relicId].trigger !== "onCombatStart") return;
  executeEffects(combat, RELICS[relicId].effects, { source: combat.hero, targets: [], fromCard: false });
}

// Для тестового режима: даёт зелье. Возвращает false, если места нет
export function addPotionToCombat(combat: Combat, potionId: string): boolean {
  if (combat.potions.length >= combat.maxPotions) return false;
  combat.potions.push(potionId);
  return true;
}

function startPlayerTurn(combat: Combat): void {
  combat.turn += 1;
  combat.hero.block = 0;
  combat.energy = CONFIG.energyPerTurn;

  applyPoison(combat, combat.hero);
  applyBurning(combat, combat.hero);
  if (combat.status !== "playerTurn") return;
  fireTrigger(combat, "onTurnStart");
  if (combat.status !== "playerTurn") return;

  drawCards(combat.piles, CONFIG.cardsPerTurn, combat.rng);
}

function runEnemyTurn(combat: Combat): void {
  for (const enemy of combat.enemies) {
    if (enemy.hp <= 0) continue;

    enemy.block = 0;
    applyPoison(combat, enemy);
    if (combat.status !== "playerTurn") return;
    if (enemy.hp <= 0) continue;
    applyLeech(combat, enemy);
    if (combat.status !== "playerTurn") return;
    if (enemy.hp <= 0) continue;
    applyBurning(combat, enemy);
    if (combat.status !== "playerTurn") return;
    if (enemy.hp <= 0) continue;

    const move = getCurrentMove(enemy);
    recordEvent(combat, { type: "enemyAction", enemyId: enemy.instanceId, intent: move.intent });
    const context = { source: enemy, targets: [combat.hero], fromCard: false };
    executeEffects(combat, move.effects, context);
    if (combat.status !== "playerTurn") return;

    // Безумие: после каждого своего хода враг становится сильнее
    if (combat.enemyRamp) {
      enemy.statuses.strength = (enemy.statuses.strength ?? 0) + combat.enemyRamp;
      recordEvent(combat, { type: "status", targetId: enemy.instanceId, status: "strength", amount: combat.enemyRamp });
    }
    decayStatuses(enemy);
    chooseNextIntent(enemy);
  }
}

function getCurrentMove(enemy: EnemyUnit): EnemyMove {
  const data = ENEMIES[enemy.enemyId];
  return data.moves[data.pattern[enemy.patternIndex]];
}

// Намерения идут по кругу
function chooseNextIntent(enemy: EnemyUnit): void {
  const pattern = ENEMIES[enemy.enemyId].pattern;
  enemy.patternIndex = (enemy.patternIndex + 1) % pattern.length;
}

// Кого затронет карта или зелье: одного врага, всех врагов или самого героя
function findTargets(combat: Combat, targetType: CardTarget, targetId?: string | null): (HeroUnit | EnemyUnit)[] {
  const alive = combat.enemies.filter((enemy) => enemy.hp > 0);
  if (targetType === "enemy") return alive.filter((enemy) => enemy.instanceId === targetId);
  if (targetType === "allEnemies") return alive;
  return [combat.hero];
}

function decayStatuses(unit: { statuses: Statuses }): void {
  for (const status of DECAYING_STATUSES) reduceStatus(unit, status);
  for (const status of TURN_STATUSES) delete unit.statuses[status];
}
