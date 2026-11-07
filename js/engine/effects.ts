// Исполнение эффектов в бою: от карт, врагов, сил, реликвий и зелий.
// Новый тип эффекта — новая запись в EFFECT_HANDLERS.
import { CONFIG } from "../config.ts";
import { CARDS } from "../data/cards.ts";
import { RELICS } from "../data/relics.ts";
import type {
  CardType, Combat, CombatEvent, Effect, EffectContext, EffectOf, EffectType, EnemyUnit, HeroUnit, RelicData, StatusId,
  Trigger, Unit,
} from "../types.ts";
import { createCardInstance, drawCards } from "./deck.ts";
import { nextInt } from "./rng.ts";

// Для формул хватает статусов: так можно посчитать урон и для «пустого» бойца из предпросмотра
type HasStatuses = Pick<Unit, "statuses">;

// Формула урона: (база + Сила) × 0.75 при Слабости × 1.5 при Уязвимости цели, округление вниз.
// target может быть null: тогда это число для описания карты, без учёта цели.
export function calculateDamage(base: number, attacker: HasStatuses, target: HasStatuses | null): number {
  let damage = base + (attacker.statuses.strength ?? 0);
  if (attacker.statuses.weak) damage *= CONFIG.weakMultiplier;
  if (target && target.statuses.vulnerable) damage *= CONFIG.vulnerableMultiplier;
  return Math.floor(damage);
}

// Ловкость прибавляется только к блоку от карт, Хрупкость уменьшает любой блок
export function calculateBlock(base: number, unit: HasStatuses, fromCard: boolean): number {
  let block = base + (fromCard ? unit.statuses.dexterity ?? 0 : 0);
  if (unit.statuses.frail) block *= CONFIG.frailMultiplier;
  return Math.floor(block);
}

// Исполняет эффекты по очереди; после каждого проверяет победу и поражение.
// context: source — кто действует, targets — цели, fromCard — эффект идёт от разыгранной карты
export function executeEffects(combat: Combat, effects: Effect[], context: EffectContext): void {
  for (const effect of effects) {
    if (combat.status !== "playerTurn") return;
    const handler = EFFECT_HANDLERS[effect.type] as Handler<EffectType> | undefined;
    if (!handler) throw new Error(`Эффект «${effect.type}» не работает в бою`);
    handler(combat, effect, context);
    checkCombatEnd(combat);
  }
}

// Прибавка к числу эффекта за ресурс героя: bonus: { status: "rage", per: 2 } — +2 за каждую Ярость.
// Так работают карты, которые растут от Ярости, Комбо, Тьмы и Реагентов
export function getBonus(effect: { bonus?: { status: StatusId; per: number } }, unit: HasStatuses): number {
  return effect.bonus ? effect.bonus.per * (unit.statuses[effect.bonus.status] ?? 0) : 0;
}

// Запускает силы, реликвии и врождённую особенность класса героя с этим триггером.
// details.cardType — тип разыгранной карты
export function fireTrigger(combat: Combat, trigger: Trigger, details: { cardType?: CardType } = {}): void {
  for (const power of [...combat.hero.powers, ...(combat.hero.passives ?? [])]) {
    const typeMatches = !power.cardType || power.cardType === details.cardType;
    if (power.trigger === trigger && typeMatches) runTriggerEffects(combat, power.effects);
  }
  for (const relicId of combat.relics) {
    const relic = RELICS[relicId];
    if (relic.trigger === trigger && relicConditionMet(combat, relic, details)) {
      runTriggerEffects(combat, relic.effects);
    }
  }
}

function runTriggerEffects(combat: Combat, effects: Effect[]): void {
  executeEffects(combat, effects, { source: combat.hero, targets: [], fromCard: false });
}

// Проверяет условия реликвии: нужный тип карты и «каждый N-й раз»
function relicConditionMet(combat: Combat, relic: RelicData, details: { cardType?: CardType }): boolean {
  if (relic.cardType && relic.cardType !== details.cardType) return false;
  if (!relic.everyN) return true;
  const count = (combat.relicCounters[relic.id] ?? 0) + 1;
  combat.relicCounters[relic.id] = count;
  return count % relic.everyN === 0;
}

// Записывает, что произошло в бою. Логика считается мгновенно, а интерфейс потом
// проигрывает эти события по очереди: удары, числа урона, изменение HP
export function recordEvent(combat: Combat, event: CombatEvent): void {
  (combat.events ??= []).push(event);
}

// Счётчики боя для заданий: сколько карт разыграно, урона нанесено и зелий выпито
export function addTally(combat: Combat, key: string, amount = 1): void {
  combat.tally ??= {};
  combat.tally[key] = (combat.tally[key] ?? 0) + amount;
}

function unitId(combat: Combat, unit: HeroUnit | EnemyUnit): string {
  return unit === combat.hero ? "hero" : (unit as EnemyUnit).instanceId;
}

// Яд: урон равен числу стаков, игнорирует блок, потом стаков становится на 1 меньше
export function applyPoison(combat: Combat, unit: HeroUnit | EnemyUnit): void {
  const stacks = unit.statuses.poison;
  if (!stacks) return;
  // В задания идут только реально снятые HP: удар сильнее, чем осталось у врага, не накручивает счётчик
  if (unit !== combat.hero) addTally(combat, "damageDealt", Math.min(unit.hp, stacks));
  unit.hp = Math.max(0, unit.hp - stacks);
  recordEvent(combat, { type: "poison", targetId: unitId(combat, unit), amount: stacks, hp: unit.hp, block: unit.block });
  reduceStatus(unit, "poison");
  notifyIfEnemyDied(combat, unit);
  checkCombatEnd(combat);
}

// Печать крови на враге: он теряет HP по числу стаков мимо блока, а герой лечится на столько же.
// Стаки складываются, а после каждого срабатывания их становится на 1 меньше — как у Яда
export function applyLeech(combat: Combat, unit: HeroUnit | EnemyUnit): void {
  const stacks = unit.statuses.leech;
  if (!stacks || unit === combat.hero) return;
  const drained = Math.min(unit.hp, stacks);
  addTally(combat, "damageDealt", drained);
  unit.hp -= drained;
  recordEvent(combat, { type: "leech", targetId: unitId(combat, unit), amount: stacks, hp: unit.hp, block: unit.block });
  const hero = combat.hero;
  const before = hero.hp;
  hero.hp = Math.min(hero.maxHp, hero.hp + drained);
  recordEvent(combat, { type: "heal", targetId: "hero", amount: hero.hp - before, hp: hero.hp, block: hero.block });
  reduceStatus(unit, "leech");
  notifyIfEnemyDied(combat, unit);
  checkCombatEnd(combat);
}

export function reduceStatus(unit: HasStatuses, status: StatusId): void {
  const stacks = unit.statuses[status];
  if (!stacks) return;
  if (stacks === 1) delete unit.statuses[status];
  else unit.statuses[status] = stacks - 1;
}

function checkCombatEnd(combat: Combat): void {
  if (combat.hero.hp <= 0) {
    combat.status = "lost";
  } else if (combat.enemies.every((enemy) => enemy.hp <= 0)) {
    combat.status = "won";
  }
}

function notifyIfEnemyDied(combat: Combat, unit: HeroUnit | EnemyUnit): void {
  if (unit !== combat.hero && unit.hp === 0) fireTrigger(combat, "onEnemyDeath");
}

// target в эффекте главнее целей карты: "self" — сам действующий, "allEnemies" — все живые враги
function getTargets(combat: Combat, effect: { target?: string }, context: EffectContext): (HeroUnit | EnemyUnit)[] {
  if (effect.target === "self") return [context.source];
  if (effect.target === "allEnemies") return combat.enemies.filter((enemy) => enemy.hp > 0);
  return context.targets.filter((target) => target.hp > 0);
}

// Урон сначала снимает блок, остаток — HP
function dealDamage(combat: Combat, source: HeroUnit | EnemyUnit, target: HeroUnit | EnemyUnit, damage: number): void {
  const absorbed = Math.min(target.block, damage);
  const hpLost = damage - absorbed;
  target.block -= absorbed;
  if (target !== combat.hero) addTally(combat, "damageDealt", Math.min(target.hp, hpLost));
  target.hp = Math.max(0, target.hp - hpLost);
  recordEvent(combat, {
    type: "hit",
    sourceId: unitId(combat, source),
    targetId: unitId(combat, target),
    hpLost,
    blocked: absorbed,
    hp: target.hp,
    block: target.block,
  });
  if (target === combat.hero && hpLost > 0) fireTrigger(combat, "onDamageTaken");
  notifyIfEnemyDied(combat, target);
}

// Обработчик эффекта одного вида: получает эффект именно этого вида
type Handler<T extends EffectType> = (combat: Combat, effect: EffectOf<T>, context: EffectContext) => void;
// Эффекты вне боя (золото, реликвии) здесь не обрабатываются: их исполняет engine/run.ts
type CombatEffectType = Exclude<EffectType,
  "gainGold" | "loseGold" | "losePotion" | "gainMaxHp" | "loseMaxHp" | "removeRandomCard" | "upgradeRandomCards" | "gainRelic" | "gainPotion">;

const EFFECT_HANDLERS: { [T in CombatEffectType]: Handler<T> } & Partial<Record<EffectType, unknown>> = {
  damage(combat, effect, context) {
    for (const target of getTargets(combat, effect, context)) {
      const base = effect.amount + getBonus(effect, context.source);
      const amount = effect.fixed ? base : calculateDamage(base, context.source, target);
      dealDamage(combat, context.source, target, amount);
    }
  },
  block(combat, effect, context) {
    for (const target of getTargets(combat, effect, context)) {
      const amount = calculateBlock(effect.amount + getBonus(effect, context.source), target, context.fromCard);
      target.block += amount;
      recordEvent(combat, { type: "block", targetId: unitId(combat, target), amount, hp: target.hp, block: target.block });
    }
  },
  applyStatus(combat, effect, context) {
    const amount = effect.amount + getBonus(effect, context.source);
    if (amount <= 0) return;
    for (const target of getTargets(combat, effect, context)) {
      target.statuses[effect.status] = (target.statuses[effect.status] ?? 0) + amount;
      recordEvent(combat, { type: "status", targetId: unitId(combat, target), status: effect.status, amount });
    }
  },
  // Тратит ресурс героя (Ярость, Комбо, Тьму, Реагенты) на сильный эффект. Если ресурса не хватает, ничего не происходит
  spend(combat, effect, context) {
    const unit = context.source;
    const stacks = unit.statuses[effect.status] ?? 0;
    if (stacks < effect.amount) return;
    if (stacks === effect.amount) delete unit.statuses[effect.status];
    else unit.statuses[effect.status] = stacks - effect.amount;
    executeEffects(combat, effect.effects, context);
  },
  // Алхимик варит случайное зелье прямо в бою, если в сумке есть место
  brewPotion(combat, effect) {
    for (let i = 0; i < effect.amount; i++) {
      if (combat.potions.length >= combat.maxPotions || combat.potionPool.length === 0) return;
      combat.potions.push(combat.potionPool[nextInt(combat.rng, 0, combat.potionPool.length - 1)]);
      fireTrigger(combat, "onPotionBrewed");
    }
  },
  heal(combat, effect, context) {
    const unit = context.source;
    const before = unit.hp;
    unit.hp = Math.min(unit.maxHp, unit.hp + effect.amount);
    recordEvent(combat, { type: "heal", targetId: unitId(combat, unit), amount: unit.hp - before, hp: unit.hp, block: unit.block });
  },
  // Плата своим HP за сильную карту: блок не помогает, силы «при потере HP от атаки» не срабатывают
  loseHp(combat, effect, context) {
    const unit = context.source;
    unit.hp = Math.max(0, unit.hp - effect.amount);
    recordEvent(combat, { type: "hpLoss", targetId: unitId(combat, unit), amount: effect.amount, hp: unit.hp, block: unit.block });
    // Чернокнижник копит Тьму, когда платит своим здоровьем
    if (unit === combat.hero && unit.hp > 0) fireTrigger(combat, "onHpPaid");
  },
  draw(combat, effect) {
    drawCards(combat.piles, effect.amount, combat.rng);
  },
  // Энергия может расти от ресурса: так Маг получает энергию за Прилив
  gainEnergy(combat, effect, context) {
    combat.energy += effect.amount + getBonus(effect, context.source);
  },
  addCard(combat, effect) {
    if (!effect.cardId || !effect.pile) throw new Error("addCard в бою: нужны cardId и pile");
    combat.piles[effect.pile].push(createCardInstance(combat.piles, effect.cardId));
  },
  // Сжигает разыгранную карту: куда её положить, решает playCard, когда эффекты закончатся
  exhaust(combat, effect, context) {
    context.exhausted = true;
  },
  // Умножает статус цели: например, удваивает Яд. Если статуса нет, ничего не происходит
  multiplyStatus(combat, effect, context) {
    for (const target of getTargets(combat, effect, context)) {
      const stacks = target.statuses[effect.status];
      if (stacks) target.statuses[effect.status] = stacks * effect.factor;
    }
  },
  // Сжигает все Раны и другие карты, которые нельзя разыграть, из руки
  exhaustWounds(combat) {
    const { piles } = combat;
    const wounds = piles.hand.filter((card) => CARDS[card.cardId].cost === null);
    piles.hand = piles.hand.filter((card) => !wounds.includes(card));
    for (const card of wounds) {
      piles.exhaust.push(card);
      fireTrigger(combat, "onExhaust");
      fireTrigger(combat, "onWoundBurned");
    }
  },
};
