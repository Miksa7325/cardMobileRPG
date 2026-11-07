// Автотесты нынешних правил боя. Запуск: npm test
// Каждый тест строит маленький бой и проверяет одно правило. Если правку сломала правило — тест упадёт.
import { describe, expect, it } from "vitest";
import { CONFIG } from "../js/config.ts";
import { canPlayCard, createCombat, endTurn, playCard } from "../js/engine/combat.ts";
import { applyPoison, calculateBlock, calculateDamage, executeEffects } from "../js/engine/effects.ts";

type Statuses = Record<string, number>;
const unit = (statuses: Statuses = {}) => ({ statuses });

// Колода из одинаковых карт: в руке точно окажутся именно они
const deckOf = (cardId: string, count = 10) => Array.from({ length: count }, () => ({ cardId, upgraded: false }));

function fight(options: Record<string, unknown> = {}) {
  return createCombat({ heroId: "warrior", enemyIds: ["skeleton"], seed: 1, deck: deckOf("strike"), ...options });
}

describe("формула урона", () => {
  it("Сила прибавляется к каждому удару", () => {
    expect(calculateDamage(6, unit({ strength: 2 }), unit())).toBe(8);
  });
  it("Слабость атакующего — ×0.75, с округлением вниз", () => {
    expect(calculateDamage(6, unit({ weak: 1 }), unit())).toBe(4);
  });
  it("Уязвимость цели — ×1.5", () => {
    expect(calculateDamage(6, unit(), unit({ vulnerable: 1 }))).toBe(9);
  });
  it("Сила считается до множителей", () => {
    expect(calculateDamage(6, unit({ strength: 2, weak: 1 }), unit({ vulnerable: 1 }))).toBe(9);
  });
  it("без цели (описание карты) Уязвимость не учитывается", () => {
    expect(calculateDamage(6, unit(), null)).toBe(6);
  });
});

describe("блок", () => {
  it("Ловкость прибавляется только к блоку от карт", () => {
    expect(calculateBlock(5, unit({ dexterity: 2 }), true)).toBe(7);
    expect(calculateBlock(5, unit({ dexterity: 2 }), false)).toBe(5);
  });
  it("Хрупкость — ×0.75 блока", () => {
    expect(calculateBlock(8, unit({ frail: 1 }), true)).toBe(6);
  });
  it("урон сначала снимает блок, остаток — HP", () => {
    const combat = fight();
    const enemy = combat.enemies[0];
    enemy.block = 4;
    const hp = enemy.hp;
    executeEffects(combat, [{ type: "damage", amount: 6 }], { source: combat.hero, targets: [enemy], fromCard: true });
    expect(enemy.block).toBe(0);
    expect(enemy.hp).toBe(hp - 2);
  });
  it("блок героя пропадает в начале его хода", () => {
    const combat = fight({ deck: deckOf("defend") });
    playCard(combat, combat.piles.hand[0].uid);
    expect(combat.hero.block).toBe(5);
    combat.enemies[0].patternIndex = 1; // Скелет защищается и не бьёт
    endTurn(combat);
    expect(combat.hero.block).toBe(0);
  });
});

describe("статусы", () => {
  it("Яд бьёт мимо блока и убывает на 1", () => {
    const combat = fight();
    const enemy = combat.enemies[0];
    enemy.block = 10;
    enemy.statuses.poison = 3;
    const hp = enemy.hp;
    applyPoison(combat, enemy);
    expect(enemy.hp).toBe(hp - 3);
    expect(enemy.block).toBe(10);
    expect(enemy.statuses.poison).toBe(2);
  });
  it("Уязвимость и Слабость героя убывают на 1 в конце его хода, Сила остаётся", () => {
    const combat = fight();
    Object.assign(combat.hero.statuses, { vulnerable: 2, weak: 1, strength: 3 });
    combat.enemies[0].patternIndex = 1;
    endTurn(combat);
    expect(combat.hero.statuses).toMatchObject({ vulnerable: 1, strength: 3 });
    expect(combat.hero.statuses.weak).toBeUndefined();
  });
  it("Комбо Убийцы сгорает в конце хода", () => {
    const combat = fight({ heroId: "assassin", deck: deckOf("a_strike") });
    playCard(combat, combat.piles.hand[0].uid, combat.enemies[0].instanceId);
    expect(combat.hero.statuses.combo).toBe(1);
    endTurn(combat);
    expect(combat.hero.statuses.combo).toBeUndefined();
  });
});

describe("энергия и розыгрыш карт", () => {
  it("в начале хода энергия и добор по CONFIG", () => {
    const combat = fight();
    expect(combat.energy).toBe(CONFIG.energyPerTurn);
    expect(combat.piles.hand).toHaveLength(CONFIG.cardsPerTurn);
  });
  it("карта тратит энергию и уходит в сброс", () => {
    const combat = fight();
    const card = combat.piles.hand[0];
    expect(playCard(combat, card.uid, combat.enemies[0].instanceId).ok).toBe(true);
    expect(combat.energy).toBe(CONFIG.energyPerTurn - 1);
    expect(combat.piles.discard).toContain(card);
  });
  it("без энергии карту не сыграть", () => {
    const combat = fight();
    combat.energy = 0;
    expect(playCard(combat, combat.piles.hand[0].uid, combat.enemies[0].instanceId)).toEqual({ ok: false, reason: "cannotPlay" });
  });
  it("Рану разыграть нельзя", () => {
    const combat = fight({ deck: deckOf("wound") });
    expect(canPlayCard(combat, combat.piles.hand[0])).toBe(false);
  });
  it("атака без цели не играется", () => {
    const combat = fight();
    expect(playCard(combat, combat.piles.hand[0].uid, "nobody").ok).toBe(false);
  });
  it("когда добор пуст, сброс перемешивается в добор", () => {
    const combat = fight({ deck: deckOf("defend", 6) });
    combat.enemies[0].patternIndex = 1;
    endTurn(combat); // 5 карт ушли в сброс, в доборе 1
    expect(combat.piles.hand).toHaveLength(5);
    expect(combat.piles.draw.length + combat.piles.discard.length).toBe(1);
  });
});

describe("враги", () => {
  it("ходы врага идут по кругу pattern", () => {
    const combat = fight({ deck: deckOf("defend") });
    const enemy = combat.enemies[0];
    const seen: number[] = [];
    for (let turn = 0; turn < 4; turn++) {
      seen.push(enemy.patternIndex);
      combat.hero.hp = 999;
      endTurn(combat);
    }
    expect(seen).toEqual([0, 1, 2, 0]);
  });
  it("победа, когда все враги мертвы", () => {
    const combat = fight();
    combat.enemies[0].hp = 1;
    playCard(combat, combat.piles.hand[0].uid, combat.enemies[0].instanceId);
    expect(combat.status).toBe("won");
  });
  it("поражение, когда у героя кончилось HP", () => {
    const combat = fight();
    combat.hero.hp = 1;
    combat.enemies[0].patternIndex = 0; // Рубка на 9
    endTurn(combat);
    expect(combat.status).toBe("lost");
  });
});

describe("Ярость Воина", () => {
  it("+1 за разыгранную атаку", () => {
    const combat = fight();
    playCard(combat, combat.piles.hand[0].uid, combat.enemies[0].instanceId);
    expect(combat.hero.statuses.rage).toBe(1);
  });
  it("+1 за пропущенный удар", () => {
    const combat = fight({ deck: deckOf("defend") });
    combat.enemies[0].patternIndex = 0;
    endTurn(combat);
    expect(combat.hero.statuses.rage).toBe(1);
  });
  it("«Ярость N» тратит Ярость на сильный эффект, если её хватает", () => {
    const combat = fight({ deck: deckOf("rage_burst") });
    const enemy = combat.enemies[0];
    combat.hero.statuses.rage = 3;
    const hp = enemy.hp;
    playCard(combat, combat.piles.hand[0].uid, enemy.instanceId);
    expect(enemy.hp).toBe(hp - 15);
    expect(combat.hero.statuses.rage).toBe(1); // 3 потрачено, +1 за атаку
  });
});

describe("случайность", () => {
  it("одинаковый seed — одинаковый бой", () => {
    const a = createCombat({ heroId: "mage", enemyIds: ["spider", "spider"], seed: 42 });
    const b = createCombat({ heroId: "mage", enemyIds: ["spider", "spider"], seed: 42 });
    expect(a.piles.hand).toEqual(b.piles.hand);
    expect(a.enemies.map((e) => e.hp)).toEqual(b.enemies.map((e) => e.hp));
  });
});
