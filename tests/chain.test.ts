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
  it("«Первая»: карта первая на дорожке, пустые клетки перед ней не мешают", () => {
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
  it("«Финал»: после карты на дорожке больше нет карт", () => {
    const { combat, uids, target } = setup(["t_final", "strike"]);
    placeCard(combat, uids[0], 5, target);
    placeCard(combat, uids[1], 1, target);
    launch(combat);
    expect(bonusesFired(combat)).toEqual(["t_final"]);
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
    const { combat, uids, target } = setup(["tourniquet", "t_after_skill"]); // Жгут — навык весом 0
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
  it("карта третья или дальше; пустые клетки счёт не сбивают", () => {
    const { combat, uids, target } = setup(["strike", "strike", "t_chain3"]);
    placeCard(combat, uids[0], 1, target);
    placeCard(combat, uids[1], 3, target);
    placeCard(combat, uids[2], 5, target);
    launch(combat);
    expect(bonusesFired(combat)).toEqual(["t_chain3"]);
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
