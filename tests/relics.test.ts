// Автотесты реликвий (этап 7: 5 стартовых и 10 общих) и зелий. Запуск: npm test
import { beforeAll, describe, expect, it } from "vitest";
import { CARDS } from "../js/data/cards.ts";
import { HEROES } from "../js/data/heroes.ts";
import { RELICS } from "../js/data/relics.ts";
import { advance, launch, placeCard, placePotion, rerollCard } from "../js/engine/combat.ts";
import { createNodeCombat, createRun, enterNode, finishCombat, getCurrentNode, openChest } from "../js/engine/run.ts";
import type { Combat, NodeType, Run } from "../js/types.ts";
import { deckOf, fight, quiet } from "./helpers.ts";

beforeAll(() => {
  // Пробная атака с «Финалом»: 5 урона, финал — ещё 10
  CARDS.t_relic_final = {
    id: "t_relic_final", name: "t", type: "attack", rarity: "common", cost: 1, target: "enemy", description: "",
    effects: [{ type: "damage", amount: 5 }], chain: { kind: "final", effects: [{ type: "damage", amount: 10 }] },
  };
});

describe("набор реликвий", () => {
  it("15 реликвий: 5 стартовых — по одной у класса — и 10 общих", () => {
    const relics = Object.values(RELICS);
    expect(relics).toHaveLength(15);
    expect(relics.filter((relic) => relic.rarity === "starter")).toHaveLength(5);
    expect(relics.filter((relic) => relic.rarity === "common")).toHaveLength(10);
    expect(Object.values(HEROES).map((hero) => hero.relics[0]).every((id) => RELICS[id]?.rarity === "starter")).toBe(true);
  });
});

describe("общие реликвии", () => {
  it("Карманные часы: переброс обновляется каждый такт", () => {
    const rerollAfterTact = (relics: string[]) => {
      const combat = fight({ relics });
      quiet(combat);
      rerollCard(combat, combat.piles.hand[0].uid);
      advance(combat, 3);
      return combat.rerollsLeft;
    };
    expect(rerollAfterTact([])).toBe(0);
    expect(rerollAfterTact(["pocket_watch"])).toBe(1);
  });

  it("Песочные часы: блок держится 9 клеток вместо 6", () => {
    const blockAfter = (relics: string[], cells: number) => {
      const combat = fight({ deck: deckOf("defend"), relics });
      quiet(combat);
      placeCard(combat, combat.piles.hand[0].uid, 1);
      advance(combat, cells);
      return combat.hero.block;
    };
    expect(blockAfter([], 8)).toBe(0);
    expect(blockAfter(["hourglass"], 8)).toBe(5);
  });

  it("Ремонтный набор: 6 блока в начале боя и Починка 1 в конце такта", () => {
    const combat = fight({ relics: ["mending_kit"] });
    quiet(combat);
    expect(combat.hero.block).toBe(6);
    combat.hero.statuses.vulnerable = 3;
    advance(combat, 3);
    expect(combat.hero.statuses.vulnerable).toBe(2);
  });

  it("Точильный камень: каждая 2-я атака — Сокрушение 1 всем врагам", () => {
    const combat = fight({ relics: ["whetstone"] });
    quiet(combat);
    const enemy = combat.enemies[0];
    placeCard(combat, combat.piles.hand[0].uid, 1, enemy.instanceId);
    placeCard(combat, combat.piles.hand[0].uid, 2, enemy.instanceId);
    advance(combat, 1);
    expect(enemy.statuses.vulnerable).toBeUndefined();
    advance(combat, 1);
    expect(enemy.statuses.vulnerable).toBe(1);
  });

  it("Лёгкие сапоги: 2 Ловкости и Ускорение 1 в начале боя", () => {
    expect(fight({ relics: ["light_boots"] }).hero.statuses).toMatchObject({ dexterity: 2, haste: 1 });
  });

  it("Сердце бездны: «Финал» срабатывает дважды", () => {
    const damage = (relics: string[]) => {
      const combat = fight({ deck: deckOf("t_relic_final"), relics });
      quiet(combat);
      const enemy = combat.enemies[0];
      enemy.hp = enemy.maxHp = 500;
      placeCard(combat, combat.piles.hand[0].uid, 1, enemy.instanceId);
      launch(combat);
      return 500 - enemy.hp;
    };
    expect(damage([])).toBe(15);
    expect(damage(["abyss_heart"])).toBe(25);
  });
});

describe("где выпадают реликвии (docs/relics.md)", () => {
  // Забег, в котором герой только что победил в комнате нужного вида
  function winIn(type: NodeType, seed: number, setup: (run: Run) => void = () => {}): Run {
    const run = createRun({ heroId: "warrior", seed });
    enterNode(run, run.map.rows[0][0]);
    getCurrentNode(run).type = type;
    setup(run);
    const combat = createNodeCombat(run);
    combat.status = "won";
    finishCombat(run, combat);
    return run;
  }
  const commonRelics = Object.values(RELICS).filter((relic) => relic.rarity === "common").map((relic) => relic.id);

  it("босс — реликвия всегда", () => {
    for (let seed = 0; seed < 20; seed++) expect(winIn("boss", seed).pendingReward!.relicId).not.toBeNull();
  });

  it("элита — реликвия примерно в четверти боёв, иначе Осколок сверх обычного", () => {
    const rewards = Array.from({ length: 400 }, (_, seed) => winIn("elite", seed).pendingReward!);
    const share = rewards.filter((reward) => reward.relicId).length / rewards.length;
    expect(share).toBeGreaterThan(0.17);
    expect(share).toBeLessThan(0.33);
    for (const reward of rewards) expect(reward.shards).toBe(reward.relicId ? 1 : 2);
  });

  it("сундук — зелье и Осколок, без реликвии", () => {
    const run = createRun({ heroId: "warrior", seed: 3 });
    enterNode(run, run.map.rows[0][0]);
    openChest(run);
    expect(run.pendingReward).toMatchObject({ relicId: null, shards: 1 });
    expect(run.pendingReward!.potionId).not.toBeNull();
  });

  it("реликвий не осталось — 2 Осколка вместо реликвии", () => {
    const run = winIn("boss", 4, (entry) => entry.relics.push(...commonRelics));
    expect(run.pendingReward).toMatchObject({ relicId: null, shards: 3 + 2 });
  });
});

describe("Новые зелья", () => {
  function drink(potionId: string): Combat {
    const combat = fight({ potions: [potionId] });
    quiet(combat);
    const target = combat.enemies[0].instanceId;
    expect(placePotion(combat, 0, 1, target).ok).toBe(true);
    launch(combat);
    return combat;
  }

  it("Оглушающее зелье: враг оглушён", () => {
    const combat = fight({ potions: ["stun_potion"] });
    quiet(combat);
    placePotion(combat, 0, 1, combat.enemies[0].instanceId);
    launch(combat);
    expect(combat.events.some((event) => event.type === "status" && event.status === "stun")).toBe(true);
  });

  it("Зелье починки: блок и Починка 5", () => {
    const combat = fight({ potions: ["repair_potion"] });
    quiet(combat);
    combat.hero.statuses.vulnerable = 7;
    placePotion(combat, 0, 1, null);
    launch(combat);
    expect(combat.hero.statuses.vulnerable).toBe(2);
  });

  it("Ледяное зелье: Замедление 2 всем врагам", () => {
    const combat = drink("frost_potion");
    expect(combat.events.some((event) => event.type === "status" && event.status === "slow" && event.amount === 2)).toBe(true);
  });
});
