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
      expect(boss.floor).toBeGreaterThan(CONFIG.map.bossMinFloor);
    }
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
