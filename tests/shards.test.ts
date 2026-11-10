// Автотесты Осколков мастерства: сколько выпадает за бои, сдача в казну, гибель и возрождение. Запуск: npm test
import { describe, expect, it } from "vitest";
import { bankLoot, applyRunToMeta, createMeta } from "../js/engine/meta.ts";
import { createNodeCombat, createRun, enterNode, finishCombat, getCurrentNode } from "../js/engine/run.ts";
import type { NodeType, Run } from "../js/types.ts";

// Забег, в котором герой стоит в комнате нужного вида и только что победил
function winIn(type: NodeType, seed: number): Run {
  const run = createRun({ heroId: "warrior", seed });
  enterNode(run, run.map.rows[0][0]);
  getCurrentNode(run).type = type;
  const combat = createNodeCombat(run);
  combat.status = "won";
  finishCombat(run, combat);
  return run;
}

describe("Осколки мастерства", () => {
  it("обычный бой: 1 Осколок примерно в 5% боёв", () => {
    const drops = Array.from({ length: 800 }, (_, seed) => winIn("battle", seed).pendingReward!.shards);
    expect(drops.every((amount) => amount === 0 || amount === 1)).toBe(true);
    const share = drops.filter((amount) => amount === 1).length / drops.length;
    expect(share).toBeGreaterThan(0.02);
    expect(share).toBeLessThan(0.09);
  });
  it("карта после обычного боя — примерно в 60% боёв, после элиты и босса — всегда; зелий после боёв нет", () => {
    const rewards = Array.from({ length: 400 }, (_, seed) => winIn("battle", seed).pendingReward!);
    const withCards = rewards.filter((reward) => reward.cardIds.length > 0).length / rewards.length;
    expect(withCards).toBeGreaterThan(0.5);
    expect(withCards).toBeLessThan(0.7);
    expect(rewards.every((reward) => reward.potionId === null)).toBe(true);
    for (let seed = 0; seed < 20; seed++) {
      const elite = winIn("elite", seed).pendingReward!;
      expect(elite.cardIds.length).toBeGreaterThan(0);
      expect(elite.potionId).toBeNull();
      expect(winIn("boss", seed).pendingReward!.cardIds.length).toBeGreaterThan(0);
    }
  });
  it("элита — 1 гарантированно (и ещё 1, если реликвия не выпала), босс — 3", () => {
    const elite = winIn("elite", 1).pendingReward!;
    expect(elite.shards).toBe(elite.relicId ? 1 : 2);
    expect(winIn("boss", 1).pendingReward!.shards).toBe(3);
  });
  it("в казну Осколки уходят вместе с добычей", () => {
    const run = winIn("boss", 2);
    const meta = createMeta();
    bankLoot(meta, run);
    expect(meta.shards).toBe(3);
    expect(run.shards).toBe(0);
  });
});

describe("Гибель и возрождение (решено 2026-11-10)", () => {
  // Герой погиб с добычей: 3 Осколка за босса, золото и эссенции, лишняя карта в колоде
  function fallen() {
    const run = winIn("boss", 3);
    run.gold = 40;
    run.deck.push({ uid: 999, cardId: "strike", level: 2 });
    run.status = "lost";
    const meta = createMeta();
    meta.gold = 500;
    applyRunToMeta(meta, run, 1);
    return { meta, run };
  }

  it("павший теряет только несданные золото и эссенции, остальное ждёт его", () => {
    const { meta, run } = fallen();
    const record = meta.heroes.warrior!;
    expect(record.dead).toBe(true);
    expect(meta.gold).toBe(500); // золото забега в казну не пришло
    expect(meta.shards).toBe(0); // Осколки ещё у павшего
    expect(record.fallenShards).toBe(3);
    expect(record.equipment!.deck.some((card) => card.uid === 999 && card.level === 2)).toBe(true);
    expect(record.equipment!.deck).toHaveLength(run.deck.length);
  });

  it("Храм возрождает за золото: снаряжение на месте, Осколки уходят в казну", async () => {
    const { getResurrectPrice, resurrectHero } = await import("../js/engine/town.ts");
    const { meta } = fallen();
    const price = getResurrectPrice(meta, "warrior");
    expect(resurrectHero(meta, "warrior")).toBe(true);
    expect(meta.gold).toBe(500 - price);
    expect(meta.shards).toBe(3);
    expect(meta.heroes.warrior!.dead).toBe(false);
    expect(meta.heroes.warrior!.equipment!.deck.some((card) => card.uid === 999)).toBe(true);
  });

  it("найм в таверне начинает с нуля, а рекорд класса в летописи остаётся", async () => {
    const { hireHero } = await import("../js/engine/town.ts");
    const { meta } = fallen();
    meta.heroes.warrior!.bestAct = 4;
    meta.bestActs = { warrior: 4 };
    expect(hireHero(meta, "warrior")).toBe(true);
    expect(meta.heroes.warrior).toBeUndefined();
    expect(meta.bestActs.warrior).toBe(4);
  });
});
