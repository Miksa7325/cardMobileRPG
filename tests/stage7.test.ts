// Автотесты правил этапа 7: потолки ресурсов, свойства классов, шансы редкости карт в наградах. Запуск: npm test
import { describe, expect, it } from "vitest";
import { CONFIG } from "../js/config.ts";
import { CARDS } from "../js/data/cards.ts";
import { ACTS } from "../js/data/acts.ts";
import { placeCard } from "../js/engine/combat.ts";
import { stepsToLegendary } from "../js/engine/deck.ts";
import { executeEffects } from "../js/engine/effects.ts";
import { createRun, enterNode, getRarityWeights, rollCardChoices } from "../js/engine/run.ts";
import { createRng } from "../js/engine/rng.ts";
import { zeroWeightPerTact } from "../js/engine/rules.ts";
import { deckOf, fight, quiet } from "./helpers.ts";

describe("потолки ресурсов", () => {
  it("Ярость, Тьма и Реагенты — не больше 10, Прилив — не больше 6", () => {
    const combat = fight();
    for (const [status, cap] of [["rage", 10], ["darkness", 10], ["reagents", 10], ["surge", 6]] as const) {
      executeEffects(combat, [{ type: "applyStatus", status, amount: 25, target: "self" }], { source: combat.hero, targets: [], fromCard: false });
      expect(combat.hero.statuses[status]).toBe(cap);
    }
  });
});

describe("свойства классов", () => {
  it("Убийца играет 3 карты весом 0 за такт, остальные — 2", () => {
    expect(zeroWeightPerTact(fight({ heroId: "assassin" }))).toBe(3);
    expect(zeroWeightPerTact(fight())).toBe(2);
  });

  it("Алхимик: одна карта варки за такт, в следующем такте — снова можно", () => {
    const combat = fight({ heroId: "alchemist", deck: deckOf("al_brew", 20) });
    quiet(combat);
    expect(placeCard(combat, combat.piles.hand[0].uid, 1).ok).toBe(true);
    expect(placeCard(combat, combat.piles.hand[0].uid, 2)).toEqual({ ok: false, reason: "brewLimit" });
    expect(placeCard(combat, combat.piles.hand[0].uid, 4).ok).toBe(true);
  });
});

describe("редкость карт в наградах", () => {
  it("шансы берутся из таблицы по акту и в сумме дают 100", () => {
    expect(getRarityWeights(1)).toMatchObject({ common: 60, epic: 1, legendary: 0 });
    expect(getRarityWeights(5)).toMatchObject({ common: 38, legendary: 2 });
    expect(getRarityWeights(14)).toMatchObject({ common: 18, legendary: 8 });
    for (const row of CONFIG.rewards.rarityByAct) expect(Object.values(row.weights).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("эпическая и легендарная карты выпадают; если карт нужной редкости нет — берётся редкость ниже", () => {
    const rarityOf = (heroId: "warrior" | "mage", weights: Record<string, number>) => {
      const run = createRun({ heroId, seed: 2 });
      enterNode(run, run.map.rows[0][0]);
      return CARDS[rollCardChoices(run, createRng(1), weights, 1)[0]].rarity;
    };
    expect(rarityOf("warrior", { epic: 100 })).toBe("epic");
    expect(rarityOf("warrior", { legendary: 100 })).toBe("legendary");
    // У Мага новой колоды ещё нет: эпических и легендарных карт нет, берётся редкая
    expect(rarityOf("mage", { legendary: 100 })).toBe("rare");
  });

  it("эпической карте до потолка 1 улучшение, легендарная не улучшается", () => {
    CARDS.t_epic = { ...CARDS.strike, id: "t_epic", rarity: "epic" };
    CARDS.t_leg = { ...CARDS.strike, id: "t_leg", rarity: "legendary" };
    expect(stepsToLegendary("t_epic")).toBe(1);
    expect(stepsToLegendary("t_leg")).toBe(0);
    delete CARDS.t_epic;
    delete CARDS.t_leg;
  });

  it("множитель эссенций акта: 1 + 0,5 × (акт − 1)", () => {
    ACTS.forEach((act, index) => expect(act.rewards.essences).toBe(1 + CONFIG.rewards.essencesPerAct * index));
  });
});
