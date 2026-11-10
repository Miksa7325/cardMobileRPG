// Автотесты правил боя: формула урона, порядок эффектов, статусы, защита Воина. Запуск: npm test
// Каждый тест строит маленький бой и проверяет одно правило. Если правка сломала правило — тест упадёт.
import { describe, expect, it } from "vitest";
import { advance, createCombat, getEnemyIntent, launch, placeCard } from "../js/engine/combat.ts";
import { applyBurning, applyPoison, calculateBlock, calculateDamage, executeEffects, orderEffects } from "../js/engine/effects.ts";
import type { Effect } from "../js/types.ts";
import { deckOf, fight, giveBlock, quiet, setLane, unit } from "./helpers.ts";

describe("формула урона", () => {
  it("Сила: +10% за стак", () => {
    expect(calculateDamage(10, unit({ strength: 2 }), unit())).toBe(12);
  });
  it("Слабость: −10% за стак, с округлением вниз", () => {
    expect(calculateDamage(9, unit({ weak: 1 }), unit())).toBe(8); // 8.1
  });
  it("Слабость не больше 3 стаков (−30%)", () => {
    expect(calculateDamage(10, unit({ weak: 5 }), unit())).toBe(7);
  });
  it("Уязвимость: +10% за стак — удар на 9 по 5 стакам = 13", () => {
    expect(calculateDamage(9, unit(), unit({ vulnerable: 5 }))).toBe(13);
  });
  it("Уязвимость не больше 10 стаков (+100%)", () => {
    expect(calculateDamage(6, unit(), unit({ vulnerable: 15 }))).toBe(12);
  });
  it("множители перемножаются, округление один раз в конце", () => {
    // 10 × 1.2 × 0.9 × 1.3 = 14.04
    expect(calculateDamage(10, unit({ strength: 2, weak: 1 }), unit({ vulnerable: 3 }))).toBe(14);
  });
  it("защита класса: −20% урона", () => {
    expect(calculateDamage(10, unit(), { statuses: {}, damageReduction: 20 })).toBe(8);
  });
  it("защита и Уязвимость вместе не дают минуса: 10 × 2 × 0.8 = 16", () => {
    expect(calculateDamage(10, unit(), { statuses: { vulnerable: 10 }, damageReduction: 20 })).toBe(16);
  });
  it("без цели (описание карты) Уязвимость не учитывается", () => {
    expect(calculateDamage(6, unit(), null)).toBe(6);
  });
});

describe("порядок эффектов карты", () => {
  it("статусы на цель → урон → остальное в записанном порядке", () => {
    const effects: Effect[] = [
      { type: "damage", amount: 5 },
      { type: "block", amount: 3, target: "self" },
      { type: "applyStatus", status: "vulnerable", amount: 2 },
      { type: "draw", amount: 1 },
      { type: "sunder", amount: 1 },
      { type: "applyStatus", status: "strength", amount: 1, target: "self" },
    ];
    expect(orderEffects(effects).map((e) => e.type)).toEqual(["applyStatus", "sunder", "damage", "block", "draw", "applyStatus"]);
  });
  it("Уязвимость карты срабатывает до её урона", () => {
    const combat = fight();
    const enemy = combat.enemies[0];
    const hp = enemy.hp;
    // Как старое Сокрушение: 8 урона, потом 2 Уязвимости — теперь Уязвимость идёт первой
    executeEffects(combat, [{ type: "damage", amount: 8 }, { type: "applyStatus", status: "vulnerable", amount: 2 }],
      { source: combat.hero, targets: [enemy], fromCard: true });
    expect(enemy.hp).toBe(hp - 9); // 8 × 1.2 = 9.6
  });
  it("у многоударной карты статус ложится один раз, перед первым ударом", () => {
    const combat = fight();
    const enemy = combat.enemies[0];
    const hp = enemy.hp;
    executeEffects(combat, [{ type: "damage", amount: 5 }, { type: "damage", amount: 5 }, { type: "sunder", amount: 2 }],
      { source: combat.hero, targets: [enemy], fromCard: true });
    expect(enemy.statuses.vulnerable).toBe(2);
    expect(enemy.hp).toBe(hp - 12); // 2 × (5 × 1.2)
  });
});

describe("Сокрушение и Починка", () => {
  it("Сокрушение N кладёт N Уязвимости на цель", () => {
    const combat = fight();
    const enemy = combat.enemies[0];
    executeEffects(combat, [{ type: "sunder", amount: 3 }], { source: combat.hero, targets: [enemy], fromCard: true });
    expect(enemy.statuses.vulnerable).toBe(3);
  });
  it("Сокрушение не поднимает Уязвимость выше 10", () => {
    const combat = fight();
    const enemy = combat.enemies[0];
    enemy.statuses.vulnerable = 9;
    executeEffects(combat, [{ type: "sunder", amount: 3 }], { source: combat.hero, targets: [enemy], fromCard: true });
    expect(enemy.statuses.vulnerable).toBe(10);
  });
  it("Починка N снимает N Уязвимости с того, кто играет", () => {
    const combat = fight();
    combat.hero.statuses.vulnerable = 5;
    executeEffects(combat, [{ type: "repair", amount: 2 }], { source: combat.hero, targets: [], fromCard: true });
    expect(combat.hero.statuses.vulnerable).toBe(3);
  });
  it("Починка больше, чем стаков, просто снимает все", () => {
    const combat = fight();
    combat.hero.statuses.vulnerable = 1;
    executeEffects(combat, [{ type: "repair", amount: 3 }], { source: combat.hero, targets: [], fromCard: true });
    expect(combat.hero.statuses.vulnerable).toBeUndefined();
  });
});

describe("блок", () => {
  it("Ловкость больше не прибавляет блок", () => {
    expect(calculateBlock(5, unit({ dexterity: 2 }), true)).toBe(5);
  });
  it("урон сначала снимает блок, остаток — HP", () => {
    const combat = fight();
    const enemy = combat.enemies[0];
    giveBlock(enemy, 4);
    const hp = enemy.hp;
    executeEffects(combat, [{ type: "damage", amount: 6 }], { source: combat.hero, targets: [enemy], fromCard: true });
    expect(enemy.block).toBe(0);
    expect(enemy.hp).toBe(hp - 2);
  });
  it("урон снимает сначала ту порцию блока, что исчезнет раньше", () => {
    const combat = fight();
    const enemy = combat.enemies[0];
    enemy.blocks = [{ amount: 5, expires: 20 }, { amount: 3, expires: 4 }];
    enemy.block = 8;
    executeEffects(combat, [{ type: "damage", amount: 4 }], { source: combat.hero, targets: [enemy], fromCard: true });
    expect(enemy.blocks).toEqual([{ amount: 4, expires: 20 }]);
  });
});

describe("статусы", () => {
  it("Яд бьёт мимо блока и убывает на 1", () => {
    const combat = fight();
    const enemy = combat.enemies[0];
    giveBlock(enemy, 10);
    enemy.statuses.poison = 3;
    const hp = enemy.hp;
    applyPoison(combat, enemy);
    expect(enemy.hp).toBe(hp - 3);
    expect(enemy.block).toBe(10);
    expect(enemy.statuses.poison).toBe(2);
  });
  it("Горение бьёт сначала по блоку, потом остаётся меньшая половина: 5 → 2 → 1 → 0", () => {
    const combat = fight();
    const enemy = combat.enemies[0];
    giveBlock(enemy, 3);
    enemy.statuses.burning = 5;
    const hp = enemy.hp;
    applyBurning(combat, enemy);
    expect(enemy.block).toBe(0);
    expect(enemy.hp).toBe(hp - 2);
    expect(enemy.statuses.burning).toBe(2);
    applyBurning(combat, enemy);
    expect(enemy.statuses.burning).toBe(1);
    applyBurning(combat, enemy);
    expect(enemy.statuses.burning).toBeUndefined();
  });
  it("Горение героя не даёт Ярости и не снижается защитой Воина", () => {
    const combat = fight();
    combat.hero.statuses.burning = 10;
    const hp = combat.hero.hp;
    applyBurning(combat, combat.hero);
    expect(combat.hero.hp).toBe(hp - 10);
    expect(combat.hero.statuses.rage).toBeUndefined();
  });
  it("Слабость сама не убывает, а теряет стак после каждой атаки носителя; Уязвимость и Сила остаются", () => {
    const combat = fight();
    quiet(combat);
    Object.assign(combat.hero.statuses, { vulnerable: 2, weak: 2, strength: 3 });
    launch(combat);
    expect(combat.hero.statuses).toMatchObject({ vulnerable: 2, weak: 2, strength: 3 });
    placeCard(combat, combat.piles.hand[0].uid, combat.clock + 1, combat.enemies[0].instanceId);
    launch(combat);
    expect(combat.hero.statuses.weak).toBe(1);
  });
  it("Слабость врага убывает после его удара, а не после защиты", () => {
    const combat = fight();
    const enemy = combat.enemies[0];
    setLane(enemy, ["guard"]);
    enemy.statuses.weak = 2;
    launch(combat);
    expect(enemy.statuses.weak).toBe(2);
    setLane(enemy, ["hack"], combat.clock);
    launch(combat);
    expect(enemy.statuses.weak).toBe(1);
  });
  it("порция блока от 10 снимает 1 Уязвимость с того, кто её получил, меньшая — нет", () => {
    const combat = fight();
    combat.hero.statuses.vulnerable = 3;
    executeEffects(combat, [{ type: "block", amount: 9 }], { source: combat.hero, targets: [combat.hero], fromCard: true });
    expect(combat.hero.statuses.vulnerable).toBe(3);
    executeEffects(combat, [{ type: "block", amount: 10 }], { source: combat.hero, targets: [combat.hero], fromCard: true });
    expect(combat.hero.statuses.vulnerable).toBe(2);
  });
  it("Слабость не набирается больше 3", () => {
    const combat = fight();
    const enemy = combat.enemies[0];
    executeEffects(combat, [{ type: "applyStatus", status: "weak", amount: 5 }], { source: combat.hero, targets: [enemy], fromCard: true });
    expect(enemy.statuses.weak).toBe(3);
  });
  it("Комбо Убийцы — длина цепочки: через конец такта не рвётся, пустая клетка обнуляет", () => {
    const combat = fight({ heroId: "assassin", deck: deckOf("a_strike") });
    quiet(combat);
    const target = combat.enemies[0].instanceId;
    for (const cell of [1, 2, 3, 4]) placeCard(combat, combat.piles.hand[0].uid, cell, target);
    advance(combat, 4);
    expect(combat.hero.statuses.combo).toBe(4); // такт кончился на клетке 3, а цепочка идёт дальше
    advance(combat, 1); // клетка 5 пустая
    expect(combat.hero.statuses.combo).toBeUndefined();
  });
  it("Тьма Чернокнижника — только за плату своим HP, не за удары врага", () => {
    const combat = fight({ heroId: "warlock", deck: deckOf("w_bolt") });
    const enemy = combat.enemies[0];
    setLane(enemy, ["hack"]);
    launch(combat);
    expect(combat.hero.hp).toBeLessThan(combat.hero.maxHp);
    expect(combat.hero.statuses.darkness).toBeUndefined();
    executeEffects(combat, [{ type: "loseHp", amount: 2 }], { source: combat.hero, targets: [], fromCard: true });
    expect(combat.hero.statuses.darkness).toBe(1);
    executeEffects(combat, [{ type: "loseHp", amount: 2, notPaid: true }], { source: combat.hero, targets: [], fromCard: false });
    expect(combat.hero.statuses.darkness).toBe(1); // Жар — не плата
  });
});

describe("защита Воина", () => {
  it("удар Скелета на 9 бьёт Воина на 7", () => {
    const combat = fight();
    setLane(combat.enemies[0], ["hack"]);
    const hp = combat.hero.hp;
    launch(combat);
    expect(combat.hero.hp).toBe(hp - 7);
  });
  it("у других классов защиты нет", () => {
    const combat = fight({ heroId: "mage", deck: deckOf("m_spark") });
    setLane(combat.enemies[0], ["hack"]);
    const hp = combat.hero.hp;
    launch(combat);
    expect(combat.hero.hp).toBe(hp - 9);
  });
  it("намерение врага показывает урон уже с защитой", () => {
    const combat = fight();
    setLane(combat.enemies[0], ["hack"]);
    expect(getEnemyIntent(combat, combat.enemies[0]).damage).toBe(7);
  });
  it("плата своим HP защитой не снижается", () => {
    const combat = fight();
    const hp = combat.hero.hp;
    executeEffects(combat, [{ type: "loseHp", amount: 5 }], { source: combat.hero, targets: [], fromCard: true });
    expect(combat.hero.hp).toBe(hp - 5);
  });
});

describe("враги", () => {
  it("победа, когда все враги мертвы", () => {
    const combat = fight();
    quiet(combat);
    combat.enemies[0].hp = 1;
    placeCard(combat, combat.piles.hand[0].uid, 1, combat.enemies[0].instanceId);
    launch(combat);
    expect(combat.status).toBe("won");
  });
  it("поражение, когда у героя кончилось HP", () => {
    const combat = fight();
    setLane(combat.enemies[0], ["hack"]);
    combat.hero.hp = 1;
    launch(combat);
    expect(combat.status).toBe("lost");
  });
});

describe("Ярость Воина", () => {
  it("+1 за сработавшую атаку", () => {
    const combat = fight();
    quiet(combat);
    placeCard(combat, combat.piles.hand[0].uid, 1, combat.enemies[0].instanceId);
    expect(combat.hero.statuses.rage).toBeUndefined(); // пока карта только стоит на шкале
    launch(combat);
    expect(combat.hero.statuses.rage).toBe(1);
  });
  it("+1 за пропущенный удар", () => {
    const combat = fight();
    setLane(combat.enemies[0], ["hack"]);
    launch(combat);
    expect(combat.hero.statuses.rage).toBe(1);
  });
  it("«Ярость N» тратит Ярость на сильный эффект, если её хватает", () => {
    const combat = fight({ deck: deckOf("rage_flash") });
    quiet(combat);
    const enemy = combat.enemies[0];
    combat.hero.statuses.rage = 3;
    const hp = enemy.hp;
    placeCard(combat, combat.piles.hand[0].uid, 1, enemy.instanceId);
    launch(combat);
    expect(enemy.hp).toBe(hp - 16); // 4 + 12 за Ярость 3
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
