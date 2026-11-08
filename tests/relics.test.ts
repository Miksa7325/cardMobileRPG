// Автотесты реликвий и зелий этапа 5: правила-реликвии, классовые реликвии, новые зелья. Запуск: npm test
import { beforeAll, describe, expect, it } from "vitest";
import { CARDS } from "../js/data/cards.ts";
import { RELICS } from "../js/data/relics.ts";
import {
  createCombat, getUpcomingDraws, launch, placeCard, placePotion,
} from "../js/engine/combat.ts";
import { addBlock } from "../js/engine/effects.ts";
import { createMeta } from "../js/engine/meta.ts";
import { createRun, getRelicPool } from "../js/engine/run.ts";
import { canPrepare, prepEmptyGain } from "../js/engine/rules.ts";
import { forgeRelic, getGear } from "../js/engine/town.ts";
import { createRng } from "../js/engine/rng.ts";
import type { Combat, HeroId } from "../js/types.ts";
import { deckOf, fight, quiet } from "./helpers.ts";

beforeAll(() => {
  // Пробная атака с «Финалом»: 5 урона, финал — ещё 10
  CARDS.t_relic_final = {
    id: "t_relic_final", name: "t", type: "attack", rarity: "common", cost: 1, target: "enemy", description: "",
    effects: [{ type: "damage", amount: 5 }], chain: { kind: "final", effects: [{ type: "damage", amount: 10 }] },
  };
});

describe("Правила-реликвии", () => {
  it("Корона углей: сработавшая карта приводит две новые", () => {
    const combat = fight({ deck: deckOf("strike", 20), relics: ["crown_of_embers"] });
    quiet(combat);
    placeCard(combat, combat.piles.hand[0].uid, 1, combat.enemies[0].instanceId);
    launch(combat);
    expect(combat.piles.hand).toHaveLength(6 + 2);
  });

  it("Карманные часы: +1 переброс за ход", () => {
    expect(fight({ relics: ["pocket_watch"] }).rerollsLeft).toBe(fight().rerollsLeft + 1);
  });

  it("Подзорная труба: видны 3 карты добора", () => {
    const deck = deckOf("strike", 20);
    expect(getUpcomingDraws(fight({ deck })).length).toBe(2);
    expect(getUpcomingDraws(fight({ deck, relics: ["spyglass"] })).length).toBe(3);
  });

  it("Песочные часы: блок держится 8 клеток вместо 6", () => {
    const expires = (combat: Combat) => {
      addBlock(combat, combat.hero, 5);
      return combat.hero.blocks.at(-1)!.expires;
    };
    expect(expires(fight({ relics: ["hourglass"] })) - expires(fight())).toBe(2);
  });

  it("Кости теней: третья карта весом 0 за такт", () => {
    const place = (relics: string[]) => {
      const combat = fight({ deck: deckOf("tourniquet"), relics });
      placeCard(combat, combat.piles.hand[0].uid, 0);
      placeCard(combat, combat.piles.hand[0].uid, 1);
      return placeCard(combat, combat.piles.hand[0].uid, 2);
    };
    expect(place([])).toEqual({ ok: false, reason: "zeroLimit" });
    expect(place(["shadow_dice"]).ok).toBe(true);
  });

  it("Аламбик: при варке 3 зелья на выбор", () => {
    const brew = (relics: string[]) => {
      const combat = createCombat({ heroId: "alchemist", enemyIds: ["skeleton"], seed: 1, deck: deckOf("al_brew"), relics });
      expect(placeCard(combat, combat.piles.hand[0].uid, 1).ok).toBe(true);
      return combat.brewChoices[0].options.length;
    };
    expect(brew([])).toBe(2);
    expect(brew(["alembic"])).toBe(3);
  });

  it("Астролябия: пустая клетка ускоряет подготовку на 2 вместо 1; другим героям подготовку не даёт", () => {
    const mage = (relics: string[]) => createCombat({ heroId: "mage", enemyIds: ["skeleton"], seed: 1, relics });
    expect(prepEmptyGain(mage([]))).toBe(1);
    expect(prepEmptyGain(mage(["astrolabe"]))).toBe(2);
    expect(canPrepare(fight({ relics: ["astrolabe"] }))).toBe(false);
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

describe("Реликвии по событиям", () => {
  it("Осколок льда: Замедление всем врагам в начале боя", () => {
    const combat = createCombat({ heroId: "warrior", enemyIds: ["skeleton", "skeleton"], seed: 1, relics: ["frost_shard"] });
    expect(combat.enemies.every((enemy) => enemy.statuses.slow === 1)).toBe(true);
  });

  it("Сапоги-скороходы: Ускорение 1 в начале хода", () => {
    expect(fight({ relics: ["quick_step"] }).hero.statuses.haste).toBe(1);
  });

  it("Наковальня: навык чинит доспех", () => {
    const combat = fight({ deck: deckOf("defend"), relics: ["anvil"] });
    quiet(combat);
    combat.hero.statuses.vulnerable = 3;
    placeCard(combat, combat.piles.hand[0].uid, 1);
    launch(combat);
    expect(combat.hero.statuses.vulnerable).toBe(2);
  });
});

describe("Классовые реликвии выпадают только своему герою", () => {
  const classRelics = Object.values(RELICS).filter((relic) => relic.hero);

  it("у каждого класса по одной", () => {
    expect(classRelics.map((relic) => relic.hero).sort()).toEqual(["alchemist", "assassin", "mage", "warlock", "warrior"]);
  });

  it("в наградах забега — только своя", () => {
    for (const heroId of ["warrior", "mage"] as HeroId[]) {
      const pool = getRelicPool(createRun({ heroId, seed: 1 }), ["common", "uncommon"]);
      const own = pool.filter((relic) => relic.hero).map((relic) => relic.hero);
      expect(own).toEqual([heroId]);
    }
  });

  it("в Кузнице — только своя", () => {
    const meta = createMeta();
    meta.buildings.push("forge");
    meta.gold = 100000;
    const gear = getGear(meta, null, "assassin");
    const rng = createRng(7);
    let relicId: string | null;
    while ((relicId = forgeRelic(meta, gear, "assassin", rng))) {
      const hero = RELICS[relicId].hero;
      expect(hero === undefined || hero === "assassin").toBe(true);
    }
    expect(gear.relics).toContain("shadow_dice");
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
