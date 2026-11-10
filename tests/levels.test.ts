// Автотесты уровней улучшений: ступени редкости до легендарной, дальше — потолок (звёзд нет). Запуск: npm test
import { describe, expect, it } from "vitest";
import { canUpgradeFirstStep, canUpgradeFurther, getCardData, getCardRarity, stepsToLegendary, upgradeCard } from "../js/engine/deck.ts";

const strike = (level: number) => ({ cardId: "strike", level });
const damageOf = (card: { cardId: string; level: number }) => {
  const effect = getCardData(card).effects.find((e) => e.type === "damage");
  return effect && "amount" in effect ? effect.amount : 0;
};

describe("уровни улучшений", () => {
  it("уровень 0 — обычная карта, уровень 1 — улучшенная версия", () => {
    expect(damageOf(strike(0))).toBe(6);
    expect(damageOf(strike(1))).toBe(9);
  });
  it("лестница редкости: стартовая → необычная → редкая → эпическая → легендарная", () => {
    expect([0, 1, 2, 3, 4].map((level) => getCardRarity(strike(level)))).toEqual(["starter", "uncommon", "rare", "epic", "legendary"]);
  });
  it("необычной карте до легендарной 3 ступени, редкой — 2", () => {
    expect(stepsToLegendary("strike")).toBe(4);
    expect(stepsToLegendary("rampage")).toBe(3); // необычная
    expect(stepsToLegendary("execution")).toBe(2); // редкая
  });
  it("ступени выше первой без своей версии: +20% к числам первой за каждую, вверх", () => {
    expect(damageOf(strike(2))).toBe(11); // 9 × 1.2 = 10.8
    expect(damageOf(strike(3))).toBe(13); // 9 × 1.4 = 12.6
    expect(damageOf(strike(4))).toBe(15); // 9 × 1.6 = 14.4
  });
  it("звёзд нет: легендарная — потолок, дальше карта не улучшается", () => {
    expect(canUpgradeFurther(strike(3))).toBe(true);
    expect(canUpgradeFurther(strike(4))).toBe(false);
  });
  it("плата HP и добор от ступеней не растут", () => {
    const swing = getCardData({ cardId: "reckless_swing", level: 4 });
    expect(swing.effects.find((e) => e.type === "loseHp")).toMatchObject({ amount: 3 });
  });
  it("улучшения останавливаются на легендарной", () => {
    const card = strike(0);
    for (let i = 0; i < 8; i++) upgradeCard(card);
    expect(card.level).toBe(4);
    expect(getCardRarity(card)).toBe("legendary");
  });
  it("отдых, арена и события дают только первую ступень", () => {
    expect(canUpgradeFirstStep(strike(0))).toBe(true);
    expect(canUpgradeFirstStep(strike(1))).toBe(false);
    expect(canUpgradeFirstStep({ cardId: "wound", level: 0 })).toBe(false);
  });
});
