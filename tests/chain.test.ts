// Автотесты бонусов цепочки: «Первая», «Финал», «После атаки/навыка», символы-стыки, «Цепь N». Запуск: npm test
// Карт с бонусами в игре пока нет (появятся на этапе 5), поэтому тест добавляет свои пробные карты
import { beforeAll, describe, expect, it } from "vitest";
import { CARDS } from "../js/data/cards.ts";
import { addCardToHand, launch, placeCard, placePotion, previewLaunch } from "../js/engine/combat.ts";
import type { CardData, ChainBonus, Combat, JointSymbol } from "../js/types.ts";
import { fight, quiet } from "./helpers.ts";

// Пробная атака: 5 урона, бонус — ещё 10 урона
function probe(id: string, chain: ChainBonus | undefined, type: CardData["type"] = "attack", joints?: { left?: JointSymbol; right?: JointSymbol }): void {
  CARDS[id] = {
    id, name: id, type, rarity: "common", cost: 1, target: "enemy", description: "", effects: [{ type: "damage", amount: 5 }], chain, joints,
  };
}
const bonusDamage = [{ type: "damage" as const, amount: 10 }];

beforeAll(() => {
  probe("t_first", { kind: "first", effects: bonusDamage });
  probe("t_final", { kind: "final", effects: bonusDamage });
  probe("t_after_attack", { kind: "afterAttack", effects: bonusDamage });
  probe("t_after_skill", { kind: "afterSkill", effects: bonusDamage });
  probe("t_joint", { kind: "joint", effects: bonusDamage }, "attack", { left: "blade", right: "blade" });
  probe("t_joint_shield", undefined, "skill", { right: "shield" });
  probe("t_chain3", { kind: "chain", n: 3, effects: bonusDamage });
});

// Бой без ходов врага; в руку кладём нужные карты. Возвращает uid по порядку
function setup(cardIds: string[]): { combat: Combat; uids: number[]; target: string } {
  const combat = fight();
  quiet(combat);
  combat.piles.hand = [];
  for (const id of cardIds) addCardToHand(combat, id);
  return { combat, uids: combat.piles.hand.map((card) => card.uid), target: combat.enemies[0].instanceId };
}

// Сработали ли бонусы у карт с этими номерами постановки
function bonusesFired(combat: Combat): string[] {
  return combat.events.filter((event) => event.type === "chainBonus").map((event) => event.cardId as string);
}

describe("позиция", () => {
  it("«Первая»: карта начинает цепочку", () => {
    const { combat, uids, target } = setup(["t_first", "strike"]);
    placeCard(combat, uids[0], 2, target);
    placeCard(combat, uids[1], 4, target);
    launch(combat);
    expect(bonusesFired(combat)).toEqual(["t_first"]);
  });
  it("«Первая» не срабатывает, если перед ней есть карта", () => {
    const { combat, uids, target } = setup(["t_first", "strike"]);
    placeCard(combat, uids[0], 2, target);
    placeCard(combat, uids[1], 1, target);
    launch(combat);
    expect(bonusesFired(combat)).toEqual([]);
  });
  it("«Финал»: после карты встык больше нет карт", () => {
    const { combat, uids, target } = setup(["t_final", "strike"]);
    placeCard(combat, uids[0], 5, target);
    placeCard(combat, uids[1], 1, target);
    launch(combat);
    expect(bonusesFired(combat)).toEqual(["t_final"]);
  });
  it("«Первая» начинает каждую цепочку: после пустой клетки карта снова первая", () => {
    const { combat, uids, target } = setup(["strike", "t_first"]);
    placeCard(combat, uids[0], 1, target);
    placeCard(combat, uids[1], 3, target);
    launch(combat);
    expect(bonusesFired(combat)).toEqual(["t_first"]);
  });
  it("«Первая» и при смене цели: бьёт другого врага, чем предыдущая карта цепочки", () => {
    const { combat, uids } = setup(["strike", "t_first"]);
    const twoEnemies = fight({ enemyIds: ["skeleton", "skeleton"] });
    Object.assign(combat, { enemies: twoEnemies.enemies });
    quiet(combat);
    const [a, b] = combat.enemies;
    placeCard(combat, uids[0], 1, a.instanceId);
    placeCard(combat, uids[1], 2, b.instanceId);
    launch(combat);
    expect(bonusesFired(combat)).toEqual(["t_first"]);
  });
  it("«Финал» в середине цепочки не срабатывает", () => {
    const { combat, uids, target } = setup(["t_final", "strike"]);
    placeCard(combat, uids[0], 1, target);
    placeCard(combat, uids[1], 2, target);
    launch(combat);
    expect(bonusesFired(combat)).toEqual([]);
  });
  it("«Финал» и при добивании: бонус бьёт следующего врага", () => {
    const { combat, uids } = setup(["t_final", "strike"]);
    const twoEnemies = fight({ enemyIds: ["skeleton", "skeleton"] });
    Object.assign(combat, { enemies: twoEnemies.enemies });
    quiet(combat);
    const [a, b] = combat.enemies;
    a.hp = 1;
    const hp = b.hp;
    placeCard(combat, uids[0], 1, a.instanceId);
    placeCard(combat, uids[1], 2, b.instanceId);
    launch(combat);
    expect(bonusesFired(combat)).toEqual(["t_final"]);
    expect(b.hp).toBe(hp - 10 - 6); // бонус «Финала» 10 и удар 6
  });
  it("зелье после «Финала» его не отменяет: зелья не звенья", () => {
    const { combat, uids, target } = setup(["t_final"]);
    combat.potions.push("block_potion");
    placeCard(combat, uids[0], 2, target);
    placePotion(combat, 0, 4);
    launch(combat);
    expect(bonusesFired(combat)).toEqual(["t_final"]);
  });
});

describe("связка", () => {
  it("«После атаки»: стоит встык после атаки", () => {
    const { combat, uids, target } = setup(["strike", "t_after_attack"]);
    placeCard(combat, uids[0], 1, target);
    placeCard(combat, uids[1], 2, target);
    launch(combat);
    expect(bonusesFired(combat)).toEqual(["t_after_attack"]);
  });
  it("пустая клетка рвёт связку", () => {
    const { combat, uids, target } = setup(["strike", "t_after_attack"]);
    placeCard(combat, uids[0], 1, target);
    placeCard(combat, uids[1], 3, target);
    launch(combat);
    expect(bonusesFired(combat)).toEqual([]);
  });
  it("зелье между картами связку не рвёт", () => {
    const { combat, uids, target } = setup(["strike", "t_after_attack"]);
    combat.potions.push("block_potion");
    placeCard(combat, uids[0], 1, target);
    placePotion(combat, 0, 2);
    placeCard(combat, uids[1], 3, target);
    launch(combat);
    expect(bonusesFired(combat)).toEqual(["t_after_attack"]);
  });
  it("«После навыка» после атаки не срабатывает", () => {
    const { combat, uids, target } = setup(["strike", "t_after_skill"]);
    placeCard(combat, uids[0], 1, target);
    placeCard(combat, uids[1], 2, target);
    launch(combat);
    expect(bonusesFired(combat)).toEqual([]);
  });
  it("карта весом 0 на стыке между ними — звено: связка идёт через неё", () => {
    const { combat, uids, target } = setup(["adrenal_rush", "t_after_skill"]); // Всплеск — навык весом 0
    placeCard(combat, uids[0], 1);
    placeCard(combat, uids[1], 2, target);
    launch(combat);
    expect(bonusesFired(combat)).toEqual(["t_after_skill"]);
  });
});

describe("символы-стыки", () => {
  it("правый символ предыдущей совпал с левым этой", () => {
    const { combat, uids, target } = setup(["t_joint", "t_joint"]);
    placeCard(combat, uids[0], 1, target);
    placeCard(combat, uids[1], 2, target);
    launch(combat);
    expect(bonusesFired(combat)).toEqual(["t_joint"]); // только вторая: у первой нет предыдущей
  });
  it("символы не совпали — стыка нет", () => {
    const { combat, uids, target } = setup(["t_joint_shield", "t_joint"]);
    placeCard(combat, uids[0], 1, target);
    placeCard(combat, uids[1], 2, target);
    launch(combat);
    expect(bonusesFired(combat)).toEqual([]);
  });
});

describe("«Цепь N»", () => {
  it("третья карта цепочки встык — бонус есть", () => {
    const { combat, uids, target } = setup(["strike", "strike", "t_chain3"]);
    placeCard(combat, uids[0], 1, target);
    placeCard(combat, uids[1], 2, target);
    placeCard(combat, uids[2], 3, target);
    launch(combat);
    expect(bonusesFired(combat)).toEqual(["t_chain3"]);
  });
  it("пустая клетка рвёт цепочку: счёт начинается заново", () => {
    const { combat, uids, target } = setup(["strike", "strike", "t_chain3"]);
    placeCard(combat, uids[0], 1, target);
    placeCard(combat, uids[1], 3, target);
    placeCard(combat, uids[2], 5, target);
    launch(combat);
    expect(bonusesFired(combat)).toEqual([]);
  });
  it("второй по счёту — ещё рано", () => {
    const { combat, uids, target } = setup(["strike", "t_chain3"]);
    placeCard(combat, uids[0], 1, target);
    placeCard(combat, uids[1], 2, target);
    launch(combat);
    expect(bonusesFired(combat)).toEqual([]);
  });
  it("сорванная Оглушением карта остаётся звеном", () => {
    const { combat, uids, target } = setup(["strike", "strike", "t_chain3"]);
    combat.hero.statuses.stun = 1;
    uids.forEach((uid, index) => placeCard(combat, uid, index + 1, target));
    launch(combat);
    expect(bonusesFired(combat)).toEqual(["t_chain3"]);
  });
});

describe("эффект бонуса", () => {
  it("эффекты бонуса добавляются к карте: 5 + 10 урона", () => {
    const { combat, uids, target } = setup(["t_first"]);
    const enemy = combat.enemies[0];
    const hp = enemy.hp;
    placeCard(combat, uids[0], 1, target);
    launch(combat);
    expect(enemy.hp).toBe(hp - 15);
  });
  it("предпросмотр уже учитывает бонус", () => {
    const { combat, uids, target } = setup(["t_first"]);
    placeCard(combat, uids[0], 1, target);
    expect(previewLaunch(combat).get(`lane:${combat.lane[0].id}`)?.damage).toBe(15);
  });
});

describe("два бонуса на карте", () => {
  beforeAll(() => {
    probe("t_first_final", { kind: "first", effects: bonusDamage });
    CARDS.t_first_final.chain2 = { kind: "final", effects: bonusDamage };
  });
  it("одиночная карта и начинает, и заканчивает цепочку: срабатывают оба бонуса — 5 + 10 + 10", () => {
    const { combat, uids, target } = setup(["t_first_final"]);
    const enemy = combat.enemies[0];
    const hp = enemy.hp;
    placeCard(combat, uids[0], 1, target);
    launch(combat);
    expect(bonusesFired(combat)).toEqual(["t_first_final", "t_first_final"]);
    expect(enemy.hp).toBe(hp - 25);
  });
  it("в начале цепочки срабатывает только «Первая»", () => {
    const { combat, uids, target } = setup(["t_first_final", "strike"]);
    placeCard(combat, uids[0], 1, target);
    placeCard(combat, uids[1], 2, target);
    launch(combat);
    expect(combat.events.filter((event) => event.type === "chainBonus").map((event) => event.kind)).toEqual(["first"]);
  });
  it("второй бонус цепочки — только у редких карт", () => {
    const realCards = Object.values(CARDS).filter((card) => !card.id.startsWith("t_"));
    for (const card of realCards.filter((entry) => entry.chain2)) expect(card.rarity).toBe("rare");
  });
});
