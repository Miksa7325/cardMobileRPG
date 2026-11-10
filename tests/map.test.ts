// Автотесты устройства акта (этап 6): 12 этажей, случайные комнаты сохранения, Тайник вместо лавки. Запуск: npm test
import { describe, expect, it } from "vitest";
import { CONFIG } from "../js/config.ts";
import { getMaxPotions } from "../js/data/heroes.ts";
import { generateMap } from "../js/engine/map.ts";
import { createRun, enterNode, getCurrentNode, openCache, takeFromCache } from "../js/engine/run.ts";
import { createRng } from "../js/engine/rng.ts";
import type { MapNode } from "../js/types.ts";

const maps = Array.from({ length: 200 }, (_, seed) => generateMap(createRng(seed)));
const mainNodes = (map: ReturnType<typeof generateMap>): MapNode[] => map.rows.flat().map((id) => map.nodes[id]);

describe("Карта акта", () => {
  it("в акте 12 этажей, босс выше основных путей", () => {
    for (const map of maps) {
      expect(map.rows).toHaveLength(12);
      const boss = Object.values(map.nodes).find((node) => node.type === "boss")!;
      expect(boss.floor).toBeGreaterThan(CONFIG.map.bossMinFloor[0]);
    }
  });

  it("сундук — 1 комната на этажах 4–8, отдых перед боссом — 2 комнаты на 9–12 на разных путях, не весь этаж", () => {
    const inRange = (floor: number, [from, to]: number[]) => floor >= from && floor <= to;
    const chestFloors = new Set<number>();
    for (const map of maps) {
      const chests = mainNodes(map).filter((node) => node.type === "chest" && inRange(node.floor, CONFIG.map.chestFloor));
      expect(chests).toHaveLength(1);
      expect(mainNodes(map).filter((node) => node.floor === chests[0].floor).length).toBeGreaterThan(1);
      chestFloors.add(chests[0].floor);
      const rests = mainNodes(map).filter((node) => node.type === "rest" && inRange(node.floor, CONFIG.map.restFloor));
      expect(rests.length).toBeGreaterThanOrEqual(2);
      const firstElite = Math.min(...mainNodes(map).filter((node) => node.type === "elite").map((node) => node.floor));
      expect(firstElite).toBeGreaterThanOrEqual(CONFIG.map.eliteMinFloor[0]);
    }
    expect(chestFloors.size).toBeGreaterThan(1); // в разных актах сундук на разных этажах
  });

  it("2–3 комнаты сохранения: не ниже 3 этажа, не ближе 3 этажей друг к другу, каждая в своей колонке", () => {
    for (const map of maps) {
      const saves = mainNodes(map).filter((node) => node.type === "save");
      expect(saves.length).toBeGreaterThanOrEqual(2);
      expect(saves.length).toBeLessThanOrEqual(3);
      for (const save of saves) {
        expect(save.floor).toBeGreaterThanOrEqual(3);
        for (const other of saves) {
          if (other === save) continue;
          expect(Math.abs(other.floor - save.floor)).toBeGreaterThanOrEqual(3);
          expect(other.column).not.toBe(save.column);
        }
      }
    }
  });

  it("лавок нет, а Тайники встречаются", () => {
    const types = maps.flatMap((map) => Object.values(map.nodes).map((node) => node.type));
    expect(types).not.toContain("shop");
    expect(types).toContain("cache");
  });
});

describe("Тайник", () => {
  // Забег, в котором герой стоит в Тайнике
  function inCache(seed = 1) {
    const run = createRun({ heroId: "warrior", seed });
    enterNode(run, run.map.rows[0][0]);
    getCurrentNode(run).type = "cache";
    return run;
  }

  it("взять можно одно: золото, Осколки или зелье", () => {
    const run = inCache();
    const offer = openCache(run);
    expect(offer.gold).toBeGreaterThan(0);
    expect(offer.shards).toBeGreaterThan(0);
    expect(offer.potionId).not.toBeNull();
    expect(takeFromCache(run, "gold")).toBe(true);
    expect(run.gold).toBe(offer.gold);
    expect(takeFromCache(run, "shards")).toBe(false); // уже взято
    expect(run.pendingCache).toBeNull();
  });

  it("с полной сумкой зелья не предлагают", () => {
    const run = inCache();
    run.potions = Array.from({ length: getMaxPotions("warrior") }, () => "fire_potion");
    const offer = openCache(run);
    expect(offer.potionId).toBeNull();
    expect(takeFromCache(run, "potion")).toBe(false);
    expect(takeFromCache(run, "shards")).toBe(true);
    expect(run.shards).toBe(offer.shards);
  });
});

describe("Вход в подземелье и открытые акты", () => {
  it("акты открываются у каждого героя свои, вход бесплатный", async () => {
    const { applyRunToMeta, canStartAct, createMeta, getStartableActs } = await import("../js/engine/meta.ts");
    const meta = createMeta();
    const run = createRun({ heroId: "warrior", seed: 1 });
    run.act = 3;
    run.status = "won";
    applyRunToMeta(meta, run, 0);
    expect(getStartableActs(meta, "warrior")).toHaveLength(3);
    expect(getStartableActs(meta, "mage")).toHaveLength(1);
    expect(canStartAct(meta, "warrior", 3)).toBe(true);
    expect(canStartAct(meta, "mage", 2)).toBe(false);
  });
});

describe("События этапа 6", () => {
  async function play(eventId: string, choice: number, setup: (run: ReturnType<typeof createRun>) => void = () => {}) {
    const { chooseEventOption } = await import("../js/engine/events.ts");
    const run = createRun({ heroId: "warrior", seed: 3 });
    enterNode(run, run.map.rows[0][0]);
    setup(run);
    run.activeEvent = { eventId, chosenIndex: null, gains: [] };
    chooseEventOption(run, choice);
    return run;
  }

  it("Кузнец в подземелье даёт случайную реликвию", async () => {
    expect((await play("dungeon_smith", 0)).relics).toHaveLength(2); // стартовая и новая
  });

  it("Мастерская улучшает именно атаку, а Осколки растут с актом", async () => {
    const { CARDS } = await import("../js/data/cards.ts");
    const run = await play("workshop", 0);
    const upgraded = run.deck.filter((card) => card.level > 0);
    expect(upgraded).toHaveLength(2);
    expect(upgraded.every((card) => CARDS[card.cardId].type === "attack")).toBe(true);
    expect((await play("fallen_armor", 1)).shards).toBe(1);
    expect((await play("fallen_armor", 1, (run) => { run.act = 4; })).shards).toBeGreaterThan(1);
  });

  it("Карманник крадёт зелье, а не золото", async () => {
    const { chooseEventOption } = await import("../js/engine/events.ts");
    const run = createRun({ heroId: "warrior", seed: 3 });
    enterNode(run, run.map.rows[0][0]);
    run.gold = 50;
    run.potions = ["fire_potion"];
    run.activeEvent = { eventId: "pickpocket", travel: true, chosenIndex: null, gains: [] };
    chooseEventOption(run, 1);
    expect(run.gold).toBe(50);
    expect(run.potions).toHaveLength(0);
  });
});

describe("Глубина и светлячки (разбор механик)", () => {
  it("враги на верхних этажах не крепче, чем внизу: глубины нет", async () => {
    const { createNodeCombat } = await import("../js/engine/run.ts");
    const run = createRun({ heroId: "warrior", seed: 4 });
    const low = run.map.rows[1][0];
    const high = run.map.rows[10][0];
    const hpAt = (nodeId: string) => {
      run.currentNodeId = nodeId;
      run.map.nodes[nodeId].type = "battle";
      return createNodeCombat(run).enemyHpMultiplier;
    };
    expect(hpAt(high)).toBe(hpAt(low));
  });

  it("светлячки освещают комнату, проходы из неё и Тайники с сундуками в пределах 3 комнат", async () => {
    const { releaseFireflies, isNodeRevealed } = await import("../js/engine/run.ts");
    const run = createRun({ heroId: "warrior", seed: 5, fireflies: true });
    const target = run.map.rows[0][0];
    const node = run.map.nodes[target];
    // Тайник через две комнаты вверх от освещённой
    const second = run.map.nodes[node.next[0]];
    const third = run.map.nodes[second.next[0]];
    third.type = "cache";
    expect(releaseFireflies(run, target)).toBe(true);
    expect(isNodeRevealed(run, target)).toBe(true);
    for (const next of node.next) expect(isNodeRevealed(run, next)).toBe(true);
    expect(isNodeRevealed(run, third.id)).toBe(true);
    // Банка пуста до следующего отдыха
    expect(run.fireflies?.charged).toBe(false);
  });
});
