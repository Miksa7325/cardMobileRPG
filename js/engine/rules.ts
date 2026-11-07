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

export const rerollsPerTurn = (combat: Combat): number => T.rerolls + relicBonus(combat, "rerolls");
export const openDrawCount = (combat: Combat): number => T.openDraws + relicBonus(combat, "openDraws");
export const blockCells = (combat: Combat): number => T.blockCells + relicBonus(combat, "blockCells");
export const zeroWeightPerTurn = (combat: Combat): number => T.maxZeroWeight + relicBonus(combat, "zeroWeight");
export const brewOptionCount = (combat: Combat): number => 2 + relicBonus(combat, "brewOptions");
export const capacityBonus = (combat: Combat): number => relicBonus(combat, "capacity");

// Вес подготовки Мага: 0 — у героя подготовки нет вовсе (реликвия её не даёт)
export function prepCapacity(combat: Combat): number {
  const base = HEROES[combat.hero.heroId].prepCapacity ?? 0;
  return base > 0 ? base + relicBonus(combat, "prepCapacity") : 0;
}

export function finalTwice(combat: Combat): boolean {
  return combat.relics.some((relicId) => RELICS[relicId]?.rules?.finalTwice);
}
