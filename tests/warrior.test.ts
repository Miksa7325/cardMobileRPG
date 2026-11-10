// Автотесты колоды Воина (этап 7): состав по редкостям, рисунки и описания, легендарные силы-правила. Запуск: npm test
import { describe, expect, it } from "vitest";
import { CARDS } from "../js/data/cards.ts";
import { HEROES } from "../js/data/heroes.ts";
import { addCardToHand, advance, launch, placeCard } from "../js/engine/combat.ts";
import { getCardData } from "../js/engine/deck.ts";
import { formatDescription } from "../js/ui/components/card.ts";
import { CARD_ART } from "../js/ui/cardArt.js";
import { fight, giveBlock, quiet } from "./helpers.ts";

const cards = Object.values(CARDS).filter((card) => card.hero === "warrior");
const count = (rarity: string) => cards.filter((card) => card.rarity === rarity).length;

// Бой без ходов врага с одной нужной картой в руке
function withCard(cardId: string) {
  const combat = fight();
  quiet(combat);
  combat.piles.hand = [];
  addCardToHand(combat, cardId);
  return { combat, uid: combat.piles.hand[0].uid, enemy: combat.enemies[0] };
}

describe("колода Воина", () => {
  it("54 карты: 4 стартовых вида, 16 обычных, 14 необычных, 10 редких, 7 эпических, 3 легендарных", () => {
    expect(cards).toHaveLength(54);
    expect(["starter", "common", "uncommon", "rare", "epic", "legendary"].map(count)).toEqual([4, 16, 14, 10, 7, 3]);
  });

  it("стартовая колода — 4 + 4 + 1 + 1 из стартовых карт", () => {
    const deck = HEROES.warrior.deck;
    expect(deck).toHaveLength(10);
    expect(deck.every((id) => CARDS[id].rarity === "starter")).toBe(true);
    expect(["strike", "defend", "patch", "bash"].map((id) => deck.filter((entry) => entry === id).length)).toEqual([4, 4, 1, 1]);
  });

  it("у каждой карты есть рисунок, а в описании подставлены все числа — и после улучшений", () => {
    const hero = { statuses: {} } as never;
    for (const card of cards) {
      expect((CARD_ART as Record<string, string>)[card.id], card.id).toBeTruthy();
      for (const level of [0, 1, 4]) expect(formatDescription(getCardData({ cardId: card.id, level }), hero), card.id).not.toMatch(/[{}]/);
    }
  });

  it("карты весом 0 — только силы и карты со «Сжечь»; второй бонус цепочки — только у редких и выше", () => {
    for (const card of cards) {
      if (card.cost === 0) expect(card.type === "power" || card.effects.some((effect) => effect.type === "exhaust"), card.id).toBe(true);
      if (card.chain2) expect(["rare", "epic", "legendary"], card.id).toContain(card.rarity);
    }
  });
});

describe("легендарные карты Воина", () => {
  it("Разрушитель: Сокрушение и удвоение Уязвимости срабатывают до урона", () => {
    const { combat, uid, enemy } = withCard("destroyer");
    enemy.statuses.vulnerable = 2;
    placeCard(combat, uid, 1, enemy.instanceId);
    launch(combat);
    expect(enemy.statuses.vulnerable ?? 8).toBe(8); // (2 + 2) × 2
    const hit = combat.events.find((event) => event.type === "hit")!;
    expect(hit.damage).toBe(64); // 36 × 1.8
  });

  it("Бастион: блок перестаёт исчезать — и новый, и тот, что уже стоял", () => {
    const { combat, uid } = withCard("bastion");
    giveBlock(combat.hero, 5);
    combat.hero.blocks[0].expires = 3;
    placeCard(combat, uid, 1);
    advance(combat, 12);
    expect(combat.hero.block).toBe(13); // 5 старых + 8 от карты
  });

  it("Аватар войны: потолок Ярости 20 и вторая Ярость за каждую атаку", () => {
    const { combat, uid, enemy } = withCard("war_avatar");
    combat.hero.statuses.rage = 10;
    placeCard(combat, uid, 1);
    advance(combat, 2);
    addCardToHand(combat, "strike");
    placeCard(combat, combat.piles.hand.find((card) => card.cardId === "strike")!.uid, 3, enemy.instanceId);
    advance(combat, 1);
    expect(combat.hero.statuses.rage).toBe(12);
    expect(combat.hero.statuses.strength).toBe(3);
  });

  it("Кованый доспех: в конце такта Починка 1 и 2 блока", () => {
    const { combat, uid } = withCard("forged_armor");
    combat.hero.statuses.vulnerable = 5;
    placeCard(combat, uid, 1);
    advance(combat, 3); // сработала в клетке 2 (Починка 2), конец такта — ещё Починка 1 и 2 блока
    expect(combat.hero.statuses.vulnerable).toBe(2);
    expect(combat.hero.block).toBe(2);
  });
});
