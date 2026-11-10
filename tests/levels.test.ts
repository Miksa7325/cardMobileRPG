// Автотесты уровней улучшений: ступени редкости до легендарной, дальше — потолок (звёзд нет). Запуск: npm test
import { describe, expect, it } from "vitest";
import { CARDS } from "../js/data/cards.ts";
import { canUpgradeFirstStep, canUpgradeFurther, getCardData, getCardRarity, stepsToLegendary, upgradeCard } from "../js/engine/deck.ts";

const strike = (level: number) => ({ cardId: "strike", level });
const damageOf = (card: { cardId: string; level: number }) => {
  const effect = getCardData(card).effects.find((e) => e.type === "damage");
  return effect && "amount" in effect ? effect.amount : 0;
};

describe("уровни улучшений", () => {
  it("уровень 0 — обычная карта; у карты без своей улучшенной версии каждая ступень — +20% к числам", () => {
    expect(damageOf(strike(0))).toBe(6);
    expect(damageOf(strike(1))).toBe(7); // 6 × 1.2 = 7.2
  });
  it("у карты со своей улучшенной версией первая ступень — она", () => {
    CARDS.t_upgraded = { ...CARDS.strike, id: "t_upgraded", upgraded: { effects: [{ type: "damage", amount: 20 }] } };
    expect(getCardData({ cardId: "t_upgraded", level: 1 }).effects).toEqual([{ type: "damage", amount: 20 }]);
    delete CARDS.t_upgraded;
  });
  it("лестница редкости: стартовая → необычная → редкая → эпическая → легендарная", () => {
    expect([0, 1, 2, 3, 4].map((level) => getCardRarity(strike(level)))).toEqual(["starter", "uncommon", "rare", "epic", "legendary"]);
  });
  it("необычной карте до легендарной 3 ступени, редкой — 2", () => {
    expect(stepsToLegendary("strike")).toBe(4);
    expect(stepsToLegendary("frenzy")).toBe(3); // необычная
    expect(stepsToLegendary("execution")).toBe(2); // редкая
  });
  it("ступени по формуле: +20% к числам за каждую, до целого", () => {
    expect(damageOf(strike(2))).toBe(8); // 6 × 1.4 = 8.4
    expect(damageOf(strike(3))).toBe(10); // 6 × 1.6 = 9.6
    expect(damageOf(strike(4))).toBe(11); // 6 × 1.8 = 10.8
  });
  it("Сокрушение 1 от одной ступени не удваивается", () => {
    const sunderOf = (level: number) => getCardData({ cardId: "seam_strike", level }).effects.find((e) => e.type === "sunder");
    expect(sunderOf(1)).toMatchObject({ amount: 1 });
    expect(sunderOf(3)).toMatchObject({ amount: 2 }); // 1 × 1.6
  });
  it("звёзд нет: легендарная — потолок, дальше карта не улучшается", () => {
    expect(canUpgradeFurther(strike(3))).toBe(true);
    expect(canUpgradeFurther(strike(4))).toBe(false);
  });
  it("плата HP и добор от ступеней не растут", () => {
    const card = getCardData({ cardId: "through_pain", level: 4 });
    expect(card.effects.find((e) => e.type === "loseHp")).toMatchObject({ amount: 2 });
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
