// Автотесты Осколков мастерства: сколько выпадает за бои, сдача в казну и потеря при гибели. Запуск: npm test
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
  it("обычный бой: 1 Осколок примерно в 20% боёв", () => {
    const drops = Array.from({ length: 400 }, (_, seed) => winIn("battle", seed).pendingReward!.shards);
    expect(drops.every((amount) => amount === 0 || amount === 1)).toBe(true);
    const share = drops.filter((amount) => amount === 1).length / drops.length;
    expect(share).toBeGreaterThan(0.14);
    expect(share).toBeLessThan(0.26);
  });
  it("элита — 1 гарантированно, босс — 3", () => {
    expect(winIn("elite", 1).pendingReward!.shards).toBe(1);
    expect(winIn("boss", 1).pendingReward!.shards).toBe(3);
  });
  it("в казну Осколки уходят вместе с добычей", () => {
    const run = winIn("boss", 2);
    const meta = createMeta();
    bankLoot(meta, run);
    expect(meta.shards).toBe(3);
    expect(run.shards).toBe(0);
  });
  it("при гибели несданные Осколки пропадают", () => {
    const run = winIn("boss", 3);
    run.status = "lost";
    const meta = createMeta();
    applyRunToMeta(meta, run, 1);
    expect(meta.shards).toBe(0);
  });
});
