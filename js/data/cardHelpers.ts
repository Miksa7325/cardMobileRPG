// Короткие записи для карт: большие таблицы карт героев собираются из них.
import type {
  CardData, ChainKind, CardRarity, CardTarget, CardType, Effect, EffectOf, Power, StatusId, Trigger,
} from "../types.ts";

export const damage = (amount: number): EffectOf<"damage"> => ({ type: "damage", amount });
export const hits = (amount: number, times: number): EffectOf<"damage">[] => Array.from({ length: times }, () => damage(amount));
export const fixedDamageToAll = (amount: number): EffectOf<"damage"> => ({ type: "damage", amount, fixed: true, target: "allEnemies" });
export const block = (amount: number): EffectOf<"block"> => ({ type: "block", amount, target: "self" });
export const status = (name: StatusId, amount: number): EffectOf<"applyStatus"> => ({ type: "applyStatus", status: name, amount });
export const selfStatus = (name: StatusId, amount: number): EffectOf<"applyStatus"> => ({ ...status(name, amount), target: "self" });
export const allStatus = (name: StatusId, amount: number): EffectOf<"applyStatus"> => ({ ...status(name, amount), target: "allEnemies" });
export const draw = (amount: number): EffectOf<"draw"> => ({ type: "draw", amount });
export const energy = (amount: number): EffectOf<"gainEnergy"> => ({ type: "gainEnergy", amount });
export const heal = (amount: number): EffectOf<"heal"> => ({ type: "heal", amount });
export const loseHp = (amount: number): EffectOf<"loseHp"> => ({ type: "loseHp", amount });
export const multiplyStatus = (name: StatusId, factor: number): EffectOf<"multiplyStatus"> => ({ type: "multiplyStatus", status: name, factor });
export const exhaustWounds: EffectOf<"exhaustWounds"> = { type: "exhaustWounds" };
export const wound: EffectOf<"addCard"> = { type: "addCard", cardId: "wound", pile: "discard" };
export const burn: EffectOf<"exhaust"> = { type: "exhaust" };
// Сокрушение N: N Уязвимости на цель до урона этой же карты. Починка N: снять с себя N Уязвимости
export const sunder = (amount: number): EffectOf<"sunder"> => ({ type: "sunder", amount });
export const repair = (amount: number): EffectOf<"repair"> => ({ type: "repair", amount });

// Механики классов. Ресурсы — статусы героя: rage — Ярость, combo — Комбо, darkness — Тьма, reagents — Реагенты.
// spend: потратить N ресурса на эффекты; если ресурса меньше, ничего не случится
export const spend = (resource: StatusId, amount: number, effects: Effect[]): EffectOf<"spend"> => (
  { type: "spend", status: resource, amount, effects }
);
// grow: эффект растёт на per за каждую единицу ресурса: grow(damage(4), "rage", 2) — 4 урона +2 за Ярость
export const grow = <E extends EffectOf<"damage" | "block" | "applyStatus" | "gainEnergy">>(effect: E, resource: StatusId, per: number): E => (
  { ...effect, bonus: { status: resource, per } }
);
export const gainResource = (resource: StatusId, amount: number) => selfStatus(resource, amount);
// brew: Алхимик варит зелье в бою
export const brew = (amount = 1): EffectOf<"brewPotion"> => ({ type: "brewPotion", amount });

type Upgrade = CardData["upgraded"];

// Бонус цепочки на карте: chained(card(...), "final", [damage(8)], [damage(10)]) — второй список для улучшенной версии.
// n — для «Цепь N»
export function chained(base: CardData, kind: ChainKind, effects: Effect[], upgradedEffects: Effect[] = effects, n?: number): CardData {
  const chain = { kind, effects, ...(n ? { n } : {}) };
  const upgradedChain = { kind, effects: upgradedEffects, ...(n ? { n } : {}) };
  return { ...base, chain, upgraded: { ...base.upgraded, chain: upgradedChain } };
}

// Порядок: id, название, тип, редкость, стоимость, цель, описание, эффекты, улучшение, сила
export function card(
  id: string, name: string, type: CardType, rarity: CardRarity, cost: number | null, target: CardTarget,
  description: string, effects: Effect[], upgraded?: Upgrade, power?: Power,
): CardData {
  return { id, name, type, rarity, cost, target, description, effects, upgraded, ...(power ? { power } : {}) };
}

// Карта-сила с триггером. upgradedEffects — эффекты улучшенной версии
export function triggerPower(
  id: string, name: string, rarity: CardRarity, cost: number, description: string, trigger: Trigger,
  effects: Effect[], upgradedEffects: Effect[], cardType?: CardType,
): CardData {
  const power = (list: Effect[]): Power => ({ trigger, ...(cardType ? { cardType } : {}), effects: list });
  return card(id, name, "power", rarity, cost, "self", description, [], { power: power(upgradedEffects) }, power(effects));
}

// То же, но улучшение только снижает стоимость
export function cheaperPower(
  id: string, name: string, rarity: CardRarity, cost: number, description: string, trigger: Trigger,
  effects: Effect[], upgradedCost: number, cardType?: CardType,
): CardData {
  const power: Power = { trigger, ...(cardType ? { cardType } : {}), effects };
  return card(id, name, "power", rarity, cost, "self", description, [], { cost: upgradedCost }, power);
}
