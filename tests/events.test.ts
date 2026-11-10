// Автотест баланса событий (этап 7): каждый вариант укладывается в правила docs/events.md. Запуск: npm test
import { describe, expect, it } from "vitest";
import { EVENTS, TRAVEL_EVENTS } from "../js/data/events.ts";
import type { Effect } from "../js/types.ts";

// Цена эффекта в очках события (1 ОЧ = 1 HP героя) — таблица из docs/balance.md, раздел 8
const CARD_VALUE: Record<string, number> = { common: 4, uncommon: 8, rare: 14, epic: 22 };
function value(effect: Effect): number {
  switch (effect.type) {
    case "heal": return effect.amount;
    case "loseHp": return -effect.amount;
    case "gainMaxHp": return 3 * effect.amount;
    case "loseMaxHp": return -3 * effect.amount;
    case "gainGold": return 0.3 * effect.amount;
    case "gainShards": return 6 * effect.amount;
    case "gainPotion": return 8;
    case "losePotion": return -8;
    case "upgradeRandomCards": return 8 * effect.count;
    case "removeRandomCard": return 8;
    case "gainRelic": return 20;
    case "addCard": return effect.cardId === "wound" ? -8 : CARD_VALUE[effect.rarity ?? "common"];
    default: throw new Error(`нет цены для «${effect.type}»`);
  }
}
const total = (effects: Effect[]) => effects.reduce((sum, effect) => sum + value(effect), 0);

describe("баланс событий", () => {
  it("в комнате: каждый вариант — либо спокойный (+4…+6), либо с риском (+8…+10); «уйти» — 0", () => {
    for (const event of Object.values(EVENTS)) {
      for (const choice of event.choices) {
        if (choice.effects.length === 0) continue;
        const sum = total(choice.effects);
        const calm = sum >= 4 && sum <= 6;
        const risky = sum >= 8 && sum <= 10;
        expect(calm || risky, `${event.id}: ${choice.text} = ${sum}`).toBe(true);
      }
    }
  });

  it("в пути: каждый вариант стоит от −5 до −9 (или ничего)", () => {
    for (const event of Object.values(TRAVEL_EVENTS)) {
      for (const choice of event.choices) {
        if (choice.effects.length === 0) continue;
        const sum = total(choice.effects);
        expect(sum, `${event.id}: ${choice.text}`).toBeGreaterThanOrEqual(-9);
        expect(sum, `${event.id}: ${choice.text}`).toBeLessThanOrEqual(-5);
      }
    }
  });

  it("плата HP не больше 12, плата максимумом HP не больше 5", () => {
    for (const event of [...Object.values(EVENTS), ...Object.values(TRAVEL_EVENTS)]) {
      for (const effect of event.choices.flatMap((choice) => choice.effects)) {
        if (effect.type === "loseHp") expect(effect.amount).toBeLessThanOrEqual(12);
        if (effect.type === "loseMaxHp") expect(effect.amount).toBeLessThanOrEqual(5);
      }
    }
  });
});
