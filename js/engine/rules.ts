// Правила шкалы с поправкой на реликвии: обычное число из настроек + прибавки правил-реликвий героя
import { CONFIG } from "../config.ts";
import { HEROES } from "../data/heroes.ts";
import { RELICS } from "../data/relics.ts";
import type { Combat, RelicRules } from "../types.ts";

type NumberRule = Exclude<keyof RelicRules, "finalTwice">;

// Сумма прибавок к правилу от всех реликвий героя
function relicBonus(combat: Combat, rule: NumberRule): number {
  return combat.relics.reduce((sum, relicId) => sum + (RELICS[relicId]?.rules?.[rule] ?? 0), 0);
}

const T = CONFIG.timeline;

export const rerollsPerTact = (combat: Combat): number => T.rerolls + relicBonus(combat, "rerolls");
export const openDrawCount = (combat: Combat): number => T.openDraws + relicBonus(combat, "openDraws");
export const blockCells = (combat: Combat): number => T.blockCells + relicBonus(combat, "blockCells");
export const zeroWeightPerTact = (combat: Combat): number => T.maxZeroWeight + relicBonus(combat, "zeroWeight");
export const brewOptionCount = (combat: Combat): number => 2 + relicBonus(combat, "brewOptions");
// Сколько новых карт приводит сработавшая карта (Корона углей — на одну больше)
export const drawOnResolve = (combat: Combat): number => T.drawOnResolve + relicBonus(combat, "extraDraw");

// Есть ли у героя подготовка (только у Мага; реликвия её не даёт)
export function canPrepare(combat: Combat): boolean {
  return Boolean(HEROES[combat.hero.heroId].prepares);
}

// На сколько пустая клетка основной шкалы ускоряет подготовку
export const prepEmptyGain = (combat: Combat): number => T.prepEmptyCell + relicBonus(combat, "prepEmptyBonus");

export function finalTwice(combat: Combat): boolean {
  return combat.relics.some((relicId) => RELICS[relicId]?.rules?.finalTwice);
}
