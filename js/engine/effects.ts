// Исполнение эффектов в бою: от карт, врагов, сил, реликвий и зелий.
// Новый тип эффекта — новая запись в EFFECT_HANDLERS.
import { CONFIG } from "../config.ts";
import { CARDS } from "../data/cards.ts";
import { RELICS } from "../data/relics.ts";
import { blockCells } from "./rules.ts";
import type {
  CardType, Combat, CombatEvent, Effect, EffectContext, EffectOf, EffectType, EnemyUnit, HeroUnit, RelicData, StatusId,
  Trigger, Unit,
} from "../types.ts";
import { createCardInstance, drawCards } from "./deck.ts";
import { nextInt } from "./rng.ts";

// Для формул хватает статусов: так можно посчитать урон и для «пустого» бойца из предпросмотра.
// damageReduction — защита класса в процентах (у Воина)
type HasStatuses = Pick<Unit, "statuses">;
type DamageTarget = HasStatuses & { damageReduction?: number };

// Больше этого числа стаков статус не набирает
const STATUS_CAPS: Partial<Record<StatusId, number>> = {
  weak: CONFIG.weakMaxStacks,
  vulnerable: CONFIG.vulnerableMaxStacks,
};

// Формула урона: база × (1 + 10% за Силу) × (1 − 10% за Слабость) × (1 + 10% за Уязвимость цели) × (1 − защита класса).
// Множители перемножаются, поэтому урон не уходит в минус. Округление вниз — один раз, в конце.
// Считаем в целых процентах: так 10 × 0.7 не превращается в 6.9999 из-за дробей компьютера.
// target может быть null: тогда это число для описания карты, без учёта цели
export function calculateDamage(base: number, attacker: HasStatuses, target: DamageTarget | null): number {
  const strength = attacker.statuses.strength ?? 0;
  const weak = Math.min(attacker.statuses.weak ?? 0, CONFIG.weakMaxStacks);
  const vulnerable = Math.min(target?.statuses.vulnerable ?? 0, CONFIG.vulnerableMaxStacks);
  const reduction = target?.damageReduction ?? 0;
  const percent = (100 + strength * CONFIG.strengthPercent)
    * (100 - weak * CONFIG.weakPercent)
    * (100 + vulnerable * CONFIG.vulnerablePercent)
    * (100 - reduction);
  return Math.max(0, Math.floor((base * percent) / 100 ** 4));
}

// Блок не зависит от статусов: Ловкость стала постоянным Ускорением. fromCard оставлен для описаний карт
export function calculateBlock(base: number, _unit: HasStatuses, _fromCard: boolean): number {
  return base;
}

// ---------- Время и блок ----------

// Абсолютное время боя в клетках: ход 1 — клетки 1–6, ход 2 — 7–12. Нужно для блока, который переживает конец хода
export function absoluteTime(combat: Combat, cell = combat.clock): number {
  return (combat.turn - 1) * CONFIG.timeline.cells + cell;
}

// Новая порция блока: держится blockCells клеток с этого момента
export function addBlock(combat: Combat, unit: Unit, amount: number): void {
  if (amount <= 0) return;
  unit.blocks.push({ amount, expires: absoluteTime(combat) + blockCells(combat) });
  unit.block += amount;
}

// Убирает порции, срок которых вышел
export function expireBlocks(combat: Combat, unit: Unit): void {
  const now = absoluteTime(combat);
  unit.blocks = unit.blocks.filter((portion) => portion.expires >= now);
  unit.block = unit.blocks.reduce((sum, portion) => sum + portion.amount, 0);
}

// Урон по блоку: сначала тратится порция, которая исчезнет раньше. Возвращает, сколько поглощено
function absorbBlock(unit: Unit, damage: number): number {
  let left = damage;
  unit.blocks.sort((a, b) => a.expires - b.expires);
  for (const portion of unit.blocks) {
    const used = Math.min(portion.amount, left);
    portion.amount -= used;
    left -= used;
  }
  unit.blocks = unit.blocks.filter((portion) => portion.amount > 0);
  unit.block = unit.blocks.reduce((sum, portion) => sum + portion.amount, 0);
  return damage - left;
}

// Бой окончен: дальше эффекты не исполняются
export function isOver(combat: Combat): boolean {
  return combat.status === "won" || combat.status === "lost";
}

// Эффекты, которые срабатывают сразу при постановке карты на шкалу, а не в её клетке
export const PLANNING_EFFECTS: ReadonlySet<EffectType> = new Set(["draw", "gainEnergy", "brewPotion"]);

// Подготовленное заклинание Мага сильнее: урон, блок, статусы и Сокрушение × boost, с округлением вниз
export function boostEffects(effects: Effect[], boost: number): Effect[] {
  return effects.map((effect) => {
    if (effect.type === "spend") return { ...effect, effects: boostEffects(effect.effects, boost) };
    if (effect.type === "damage" || effect.type === "block" || effect.type === "applyStatus" || effect.type === "sunder") {
      return { ...effect, amount: Math.floor(effect.amount * boost) };
    }
    return effect;
  });
}

// Прибавляет стаки статуса с учётом потолка. Возвращает, сколько стаков реально добавилось
function addStatus(unit: HasStatuses, status: StatusId, amount: number): number {
  const before = unit.statuses[status] ?? 0;
  const cap = STATUS_CAPS[status] ?? Infinity;
  const after = Math.min(before + amount, cap);
  if (after > 0) unit.statuses[status] = after;
  return after - before;
}

// Порядок эффектов внутри карты: сначала статусы на цель (Сокрушение, Уязвимость, Слабость, Яд…), потом урон,
// потом всё остальное в записанном порядке. Так Сокрушение ломает броню до удара этой же карты,
// а у многоударной карты статус ложится один раз, перед первым ударом
function isTargetStatus(effect: Effect): boolean {
  return (effect.type === "applyStatus" && effect.target !== "self") || effect.type === "sunder";
}

export function orderEffects(effects: Effect[]): Effect[] {
  return [
    ...effects.filter(isTargetStatus),
    ...effects.filter((effect) => effect.type === "damage"),
    ...effects.filter((effect) => !isTargetStatus(effect) && effect.type !== "damage"),
  ];
}

// Исполняет эффекты по очереди; после каждого проверяет победу и поражение.
// context: source — кто действует, targets — цели, fromCard — эффект идёт от разыгранной карты
export function executeEffects(combat: Combat, effects: Effect[], context: EffectContext): void {
  for (const effect of orderEffects(effects)) {
    if (isOver(combat)) return;
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
  // Номер клетки нужен анимации: событие проигрывается, когда указатель дойдёт до неё
  // by — чьё это действие: так экран показывает итоговые числа у каждой карты и каждого хода врага
  (combat.events ??= []).push({ cell: combat.clock, by: combat.acting, ...event });
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
  if (unit === combat.hero && unit.hp > 0) fireTrigger(combat, "onHpLost");
  recordEvent(combat, { type: "poison", targetId: unitId(combat, unit), amount: stacks, hp: unit.hp, block: unit.block });
  reduceStatus(unit, "poison");
  notifyIfEnemyDied(combat, unit);
  checkCombatEnd(combat);
}

// Горение: урон равен числу стаков, сначала снимает блок. Потом половина стаков сгорает, остаётся меньшая часть: 5 → 2 → 1 → 0.
// Это не удар: Сила, Уязвимость и защита Воина на него не действуют, Ярость за него не копится
export function applyBurning(combat: Combat, unit: HeroUnit | EnemyUnit): void {
  const stacks = unit.statuses.burning;
  if (!stacks) return;
  const absorbed = absorbBlock(unit, stacks);
  const hpLost = Math.min(unit.hp, stacks - absorbed);
  if (unit !== combat.hero) addTally(combat, "damageDealt", hpLost);
  unit.hp -= hpLost;
  if (unit === combat.hero && hpLost > 0 && unit.hp > 0) fireTrigger(combat, "onHpLost");
  recordEvent(combat, { type: "burning", targetId: unitId(combat, unit), amount: stacks, hpLost, blocked: absorbed, hp: unit.hp, block: unit.block });
  const left = Math.floor(stacks / 2);
  if (left > 0) unit.statuses.burning = left;
  else delete unit.statuses.burning;
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

// Призыв помощника умеет только бой (engine/combat.ts): он передаёт сюда свою функцию при загрузке
let summonEnemy: (combat: Combat, enemyId: string) => void = () => {};
export function setSummonHandler(handler: (combat: Combat, enemyId: string) => void): void {
  summonEnemy = handler;
}

// Из чего сложился урон: для журнала расчёта в тестовом режиме
export interface DamageBreakdown {
  base: number;
  strength: number;
  weak: number;
  vulnerable: number;
  reduction: number;
  fixed: boolean;
}

// Урон сначала снимает блок, остаток — HP
function dealDamage(
  combat: Combat, source: HeroUnit | EnemyUnit, target: HeroUnit | EnemyUnit, damage: number, breakdown?: DamageBreakdown,
): number {
  const absorbed = absorbBlock(target, damage);
  const hpLost = damage - absorbed;
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
    damage,
    breakdown,
  });
  if (target === combat.hero && hpLost > 0) {
    fireTrigger(combat, "onDamageTaken");
    fireTrigger(combat, "onHpLost");
  }
  notifyIfEnemyDied(combat, target);
  return Math.min(hpLost, target.hp + hpLost);
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
      const breakdown: DamageBreakdown = {
        base,
        strength: context.source.statuses.strength ?? 0,
        weak: context.source.statuses.weak ?? 0,
        vulnerable: target.statuses.vulnerable ?? 0,
        reduction: (target as HeroUnit).damageReduction ?? 0,
        fixed: Boolean(effect.fixed),
      };
      const hpLost = dealDamage(combat, context.source, target, amount, breakdown);
      // Вампиризм: бьющий лечится на долю урона, снятого с HP
      if (effect.lifesteal && hpLost > 0) {
        const source = context.source;
        const before = source.hp;
        source.hp = Math.min(source.maxHp, source.hp + Math.floor(hpLost * effect.lifesteal));
        if (source.hp > before) recordEvent(combat, { type: "heal", targetId: unitId(combat, source), amount: source.hp - before, hp: source.hp, block: source.block });
      }
    }
  },
  block(combat, effect, context) {
    for (const target of getTargets(combat, effect, context)) {
      const amount = calculateBlock(effect.amount + getBonus(effect, context.source), target, context.fromCard);
      addBlock(combat, target, amount);
      recordEvent(combat, { type: "block", targetId: unitId(combat, target), amount, hp: target.hp, block: target.block });
    }
  },
  applyStatus(combat, effect, context) {
    const amount = effect.amount + getBonus(effect, context.source);
    if (amount <= 0) return;
    for (const target of getTargets(combat, effect, context)) {
      const added = addStatus(target, effect.status, amount);
      if (added > 0) recordEvent(combat, { type: "status", targetId: unitId(combat, target), status: effect.status, amount: added });
    }
  },
  // Сокрушение: ломает броню цели. Стоит среди статусов на цель, поэтому срабатывает до урона этой же карты
  sunder(combat, effect, context) {
    for (const target of getTargets(combat, effect, context)) {
      const added = addStatus(target, "vulnerable", effect.amount);
      if (added > 0) recordEvent(combat, { type: "status", targetId: unitId(combat, target), status: "vulnerable", amount: added });
    }
  },
  // Починка: снимает Уязвимость с того, кто играет карту. Обычный блок броню не чинит
  repair(combat, effect, context) {
    const unit = context.source;
    const stacks = unit.statuses.vulnerable ?? 0;
    const removed = Math.min(stacks, effect.amount);
    if (removed === 0) return;
    if (removed === stacks) delete unit.statuses.vulnerable;
    else unit.statuses.vulnerable = stacks - removed;
    recordEvent(combat, { type: "repair", targetId: unitId(combat, unit), amount: removed });
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
    if (unit === combat.hero && unit.hp > 0) {
      fireTrigger(combat, "onHpPaid");
      fireTrigger(combat, "onHpLost");
    }
  },
  // Во время розыгрыша новые карты можно доложить на шкалу: розыгрыш встанет на паузу
  draw(combat, effect) {
    const before = combat.piles.hand.length;
    drawCards(combat.piles, effect.amount, combat.rng);
    if (combat.status === "resolving" && combat.piles.hand.length > before) combat.launchGains = true;
  },
  // Бывшая энергия: +N вместимости шкалы в этом ходу
  gainEnergy(combat, effect, context) {
    const amount = effect.amount + getBonus(effect, context.source);
    combat.capacityBonus += amount;
    if (combat.status === "resolving" && amount > 0) combat.launchGains = true;
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
  // Враг зовёт помощника: если живых помощников этого вида меньше max (по умолчанию 1) и есть место
  summon(combat, effect) {
    const alive = combat.enemies.filter((enemy) => enemy.hp > 0);
    const helpers = alive.filter((enemy) => enemy.enemyId === effect.enemyId).length;
    if (helpers >= (effect.max ?? 1) || alive.length >= CONFIG.maxEnemiesInCombat) return;
    summonEnemy(combat, effect.enemyId);
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
