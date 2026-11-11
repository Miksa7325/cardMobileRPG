// Автотесты новых колод (этап 7): состав по редкостям, рисунки и описания, легендарные силы-правила. Запуск: npm test
import { describe, expect, it } from "vitest";
import { CARDS } from "../js/data/cards.ts";
import { HEROES } from "../js/data/heroes.ts";
import { addCardToHand, advance, chooseBrew, launch, placeCard } from "../js/engine/combat.ts";
import { getCardData } from "../js/engine/deck.ts";
import { formatDescription } from "../js/ui/components/card.ts";
import { CARD_ART } from "../js/ui/cardArt.js";
import { fight, giveBlock, quiet, setLane } from "./helpers.ts";

// Классы, у которых колода уже собрана заново: стартовые карты по порядку «атака, защита, починка, карта темы»
const NEW_DECKS: Record<string, string[]> = {
  warrior: ["strike", "defend", "patch", "bash"],
  assassin: ["a_strike", "a_roll", "a_tighten", "a_finisher"],
  warlock: ["w_bolt", "w_shield", "w_bone_patch", "w_sacrifice"],
  mage: ["m_spark", "m_barrier", "m_rune_ward", "m_arcane_blast"],
  alchemist: ["al_toss", "al_guard", "al_resin", "al_brew"],
};

// Бой без ходов врага с одной нужной картой в руке
function withCard(cardId: string) {
  const combat = fight();
  quiet(combat);
  combat.piles.hand = [];
  addCardToHand(combat, cardId);
  return { combat, uid: combat.piles.hand[0].uid, enemy: combat.enemies[0] };
}

describe.each(Object.entries(NEW_DECKS))("новая колода: %s", (heroId, starters) => {
  const cards = Object.values(CARDS).filter((card) => card.hero === heroId);
  const count = (rarity: string) => cards.filter((card) => card.rarity === rarity).length;

  it("54 карты: 4 стартовых вида, 16 обычных, 14 необычных, 10 редких, 7 эпических, 3 легендарных", () => {
    expect(cards).toHaveLength(54);
    expect(["starter", "common", "uncommon", "rare", "epic", "legendary"].map(count)).toEqual([4, 16, 14, 10, 7, 3]);
  });

  it("стартовая колода — 4 + 4 + 1 + 1 из стартовых карт", () => {
    const deck = HEROES[heroId as keyof typeof HEROES].deck;
    expect(deck).toHaveLength(10);
    expect(deck.every((id) => CARDS[id].rarity === "starter")).toBe(true);
    expect(starters.map((id) => deck.filter((entry) => entry === id).length)).toEqual([4, 4, 1, 1]);
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

describe("легендарные карты Убийцы", () => {
  // Бой Убийцы без ходов врага с нужными картами в руке
  function assassin(cardIds: string[]) {
    const combat = fight({ heroId: "assassin" });
    quiet(combat);
    combat.piles.hand = [];
    for (const id of cardIds) addCardToHand(combat, id);
    return { combat, uids: combat.piles.hand.map((card) => card.uid), enemy: combat.enemies[0] };
  }

  it("Бесконечная цепь: пустая клетка не обнуляет Комбо, потолок — 12", () => {
    const { combat, uids } = assassin(["a_endless_chain"]);
    placeCard(combat, uids[0], 1);
    advance(combat, 6); // сила сработала в клетке 2: +3 Комбо и ещё +1 за саму карту; дальше — пустые клетки
    expect(combat.hero.statuses.combo).toBe(4);
    combat.hero.statuses.combo = 11;
    addCardToHand(combat, "a_feint"); // +2 Комбо и +1 за карту
    placeCard(combat, combat.piles.hand.find((card) => card.cardId === "a_feint")!.uid, 7);
    advance(combat, 1);
    expect(combat.hero.statuses.combo).toBe(12);
  });

  it("Королева ядов: Яд на врагах перестаёт убывать, на герое — убывает", () => {
    const { combat, uids, enemy } = assassin(["a_poison_queen"]);
    enemy.hp = enemy.maxHp = 200;
    combat.hero.statuses.poison = 2;
    placeCard(combat, uids[0], 1);
    advance(combat, 9); // сработала в клетке 2 (Яд 3 всем), потом начала тактов 2, 3 и 4
    expect(enemy.statuses.poison).toBe(3);
    expect(enemy.hp).toBe(200 - 9);
    expect(combat.hero.statuses.poison).toBeUndefined();
  });

  // Правило Призрака переделывается (docs/cards/ghost.md): пока проверяем, что и с ним на стыке одна карта весом 0
  it("Призрак: на стыке — всё равно одна карта весом 0", () => {
    const { combat, uids } = assassin(["a_ghost", "a_flourish", "a_flourish", "a_flourish", "a_flourish"]);
    placeCard(combat, uids[0], 1);
    advance(combat, 3);
    for (const [index, uid] of uids.slice(1, 4).entries()) expect(placeCard(combat, uid, 3 + index).ok).toBe(true);
    expect(placeCard(combat, uids[4], 3)).toEqual({ ok: false, reason: "boundaryTaken" });
  });
});

describe("карты Чернокнижника", () => {
  // Бой Чернокнижника без ходов врага с нужными картами в руке
  function warlock(cardIds: string[]) {
    const combat = fight({ heroId: "warlock" });
    quiet(combat);
    combat.piles.hand = [];
    for (const id of cardIds) addCardToHand(combat, id);
    return { combat, uids: combat.piles.hand.map((card) => card.uid), enemy: combat.enemies[0] };
  }

  it("«Сжечь все Раны в руке» сжигает Раны и даёт Тьму за каждую", () => {
    const { combat, uids } = warlock(["w_cauterize", "wound", "wound"]);
    placeCard(combat, uids[0], 1);
    advance(combat, 1);
    expect(combat.piles.hand.some((card) => card.cardId === "wound")).toBe(false);
    expect(combat.piles.exhaust.filter((card) => card.cardId === "wound")).toHaveLength(2);
    expect(combat.hero.statuses.darkness).toBe(2);
  });

  it("Кровавый алтарь: плата HP при розыгрыше — уже первая плата", () => {
    const { combat, uids, enemy } = warlock(["w_blood_rite"]);
    placeCard(combat, uids[0], 1);
    advance(combat, 2);
    expect(combat.hero.hp).toBe(combat.hero.maxHp - 2);
    expect(enemy.statuses.leech).toBe(1);
    expect(combat.hero.block).toBe(2);
    expect(combat.hero.statuses.darkness).toBe(1);
  });

  it("Бог крови: Печать крови на врагах не убывает", () => {
    const { combat, uids, enemy } = warlock(["w_blood_god"]);
    enemy.hp = enemy.maxHp = 200;
    placeCard(combat, uids[0], 1);
    advance(combat, 9); // сработала в клетке 2, потом начала тактов 2, 3 и 4
    expect(enemy.statuses.leech).toBe(1);
    expect(enemy.hp).toBe(197);
  });

  it("Феникс: сожжённая карта уходит в сброс, Тьма за сожжение — как обычно", () => {
    const { combat, uids, enemy } = warlock(["w_phoenix", "w_soul_burn"]);
    placeCard(combat, uids[0], 1);
    placeCard(combat, uids[1], 3, enemy.instanceId);
    advance(combat, 3);
    expect(combat.piles.exhaust.some((card) => card.cardId === "w_soul_burn")).toBe(false);
    const piles = [...combat.piles.discard, ...combat.piles.draw, ...combat.piles.hand];
    expect(piles.some((card) => card.cardId === "w_soul_burn")).toBe(true);
    expect(combat.hero.statuses.darkness).toBe(3); // 2 от Феникса и 1 за сожжение
  });

  it("Владыка проклятий: Слабость на врагах не убывает после их атак", () => {
    const { combat, uids, enemy } = warlock(["w_curse_lord"]);
    placeCard(combat, uids[0], 1);
    advance(combat, 2);
    expect(enemy.statuses.weak).toBe(3);
    setLane(enemy, ["hack"], combat.clock);
    advance(combat, 3);
    expect(enemy.statuses.weak).toBe(3);
  });
});

describe("легендарные карты Мага", () => {
  // Бой Мага без ходов врага с нужными картами в руке; у врага много HP
  function mage(cardIds: string[]) {
    const combat = fight({ heroId: "mage" });
    quiet(combat);
    combat.piles.hand = [];
    for (const id of cardIds) addCardToHand(combat, id);
    const enemy = combat.enemies[0];
    enemy.hp = enemy.maxHp = 500;
    return { combat, uids: combat.piles.hand.map((card) => card.uid), enemy };
  }

  it("Вечное пламя: Горение на врагах не убывает", () => {
    const { combat, uids, enemy } = mage(["m_eternal_flame"]);
    placeCard(combat, uids[0], 1);
    advance(combat, 9); // сработала в клетке 2 (Горение 4), потом начала тактов 2, 3 и 4
    expect(enemy.statuses.burning).toBe(4);
    expect(enemy.hp).toBe(500 - 12);
  });

  it("Властелин времени: Замедление на врагах не тратится", () => {
    const { combat, uids, enemy } = mage(["m_time_lord"]);
    placeCard(combat, uids[0], 1);
    advance(combat, 2);
    setLane(enemy, ["guard", "guard"], combat.clock);
    advance(combat, 6); // два хода защиты весом 2 стали весом 3 каждый
    expect(enemy.statuses.slow).toBe(1);
    expect(enemy.lane.filter((action) => action.resolved)).toHaveLength(2);
  });

  it("Архимагия: подготовленное заклинание вдвое сильнее, потолок Прилива — 10", () => {
    const { combat, uids, enemy } = mage(["m_archmagic", "m_spark"]);
    placeCard(combat, uids[0], 1);
    advance(combat, 2);
    combat.hero.statuses.surge = 9;
    placeCard(combat, uids[1], 0, enemy.instanceId, { prepare: true });
    advance(combat, 1); // пустая клетка: Искра готова за одну клетку; начался такт 2 — Прилив +1
    expect(combat.events.find((event) => event.type === "hit")!.damage).toBe(12);
    advance(combat, 6);
    expect(combat.hero.statuses.surge).toBe(10);
  });
});

describe("легендарные карты Алхимика", () => {
  // Бой Алхимика без ходов врага с нужными картами в руке
  function alchemist(cardIds: string[]) {
    const combat = fight({ heroId: "alchemist" });
    quiet(combat);
    combat.piles.hand = [];
    for (const id of cardIds) addCardToHand(combat, id);
    const enemy = combat.enemies[0];
    enemy.hp = enemy.maxHp = 500;
    return { combat, uids: combat.piles.hand.map((card) => card.uid), enemy };
  }

  it("Бездонный котёл: несколько карт варки за такт и две лишние ячейки в сумке", () => {
    const { combat, uids } = alchemist(["al_bottomless", "al_brew", "al_brew"]);
    const before = combat.maxPotions;
    placeCard(combat, uids[0], 1);
    chooseBrew(combat, 0, combat.brewChoices[0].options[0]); // варка самой карты: выбор до начала боя
    advance(combat, 2);
    expect(combat.maxPotions).toBe(before + 2);
    expect(placeCard(combat, uids[1], 4).ok).toBe(true);
    expect(placeCard(combat, uids[2], 5).ok).toBe(true); // вторая карта варки в том же такте 2
  });

  it("Философский камень: «Реагенты N» не тратят Реагенты", () => {
    const { combat, uids, enemy } = alchemist(["al_philosopher", "al_burst"]);
    placeCard(combat, uids[0], 1);
    placeCard(combat, uids[1], 3, enemy.instanceId);
    advance(combat, 3);
    expect(combat.hero.statuses.reagents).toBe(3);
    expect(enemy.hp).toBe(500 - 12); // 4 и ещё 8 за «Реагенты 2»
  });

  it("Алкагест: Сокрушение, Горение и Яд героя сильнее на 1", () => {
    const { combat, uids, enemy } = alchemist(["al_alkahest", "al_acid"]);
    placeCard(combat, uids[0], 1);
    advance(combat, 2);
    expect(enemy.statuses.burning).toBe(3); // 2 + 1
    expect(enemy.statuses.poison).toBe(3);
    placeCard(combat, uids[1], 3, enemy.instanceId);
    advance(combat, 1);
    expect(enemy.statuses.vulnerable).toBe(2); // Сокрушение 1 + 1
  });
});
