// Автотесты Бесконечной бездны и выбора после босса (этап 6). Запуск: npm test
import { describe, expect, it } from "vitest";
import { ACTS } from "../js/data/acts.ts";
import { getActData } from "../js/engine/abyss.ts";
import { applyRunToMeta, bankLoot, canStartAct, createMeta, getStartableActs } from "../js/engine/meta.ts";
import {
  canReturnToCity, completeReward, createRun, enterNode, goToNextAct, hasConqueredDungeon, isInDefeatedBossRoom,
} from "../js/engine/run.ts";
import type { Run } from "../js/types.ts";

// Герой стоит в комнате босса своего акта; won — побеждён ли босс
function inBossRoom(act: number, won = true): Run {
  const run = createRun({ heroId: "warrior", seed: 7, startAct: act });
  const boss = Object.values(run.map.nodes).find((node) => node.type === "boss")!;
  run.currentNodeId = boss.id;
  run.visitedNodeIds.push(boss.id);
  run.stats.combats.push({ act, floor: boss.floor, type: "boss", enemyIds: [], turns: 1, hpBefore: run.hp, hpAfter: run.hp, won });
  return run;
}

describe("Акты бездны", () => {
  it("собираются одинаково для одного забега и по-разному для разных", () => {
    expect(getActData(1, 11)).toEqual(getActData(1, 11));
    const names = new Set(Array.from({ length: 20 }, (_, seed) => getActData(seed, 11).mechanic.name));
    expect(names.size).toBeGreaterThan(1);
  });

  it("враги и боссы — из актов 1–10, 6 групп боёв, 2 элиты, 2 особенности без двух закрытых клеток", () => {
    const encounters = ACTS.flatMap((act) => act.encounters);
    const bosses = ACTS.map((act) => act.boss);
    for (let seed = 0; seed < 50; seed++) {
      const act = getActData(seed, 11);
      expect(act.encounters).toHaveLength(6);
      expect(act.elites).toHaveLength(2);
      for (const group of act.encounters) expect(encounters).toContainEqual(group);
      expect(bosses).toContainEqual(act.boss);
      expect(act.mechanic.name!.split(" · ")).toHaveLength(2);
      expect((act.mechanic.blockedCells ?? []).length).toBeLessThanOrEqual(1);
    }
  });

  it("с каждым кругом враги крепче и сильнее, чем в 10 акте", () => {
    const last = ACTS[ACTS.length - 1];
    const first = getActData(3, 11);
    const deeper = getActData(3, 15);
    expect(first.enemyHpMultiplier).toBeGreaterThan(last.enemyHpMultiplier);
    expect(deeper.enemyHpMultiplier).toBeGreaterThan(first.enemyHpMultiplier);
    expect(deeper.enemyStrength).toBeGreaterThan(first.enemyStrength);
    expect(deeper.rewards.essences).toBeGreaterThan(first.rewards.essences);
  });
});

describe("Выбор после босса", () => {
  it("после награды за босса акт не кончается: герой в логове, оттуда город и следующий акт", () => {
    const run = inBossRoom(2);
    completeReward(run, null);
    expect(run.act).toBe(2);
    expect(isInDefeatedBossRoom(run)).toBe(true);
    expect(canReturnToCity(run)).toBe(true);
    expect(goToNextAct(run)).toBe(true);
    expect(run.act).toBe(3);
    expect(run.currentNodeId).toBeNull();
  });

  it("пока босс не побеждён, в следующий акт не уйти", () => {
    const run = inBossRoom(2, false);
    expect(goToNextAct(run)).toBe(false);
    expect(canReturnToCity(run)).toBe(false);
  });

  it("можно уйти из логова и вернуться: выбор остаётся", () => {
    const run = inBossRoom(1);
    const bossId = run.currentNodeId;
    const lower = Object.values(run.map.nodes).find((node) => node.next.includes(bossId!))!;
    run.visitedNodeIds.push(lower.id);
    expect(enterNode(run, lower.id)).toBe(true);
    expect(isInDefeatedBossRoom(run)).toBe(false);
    expect(enterNode(run, bossId)).toBe(true);
    expect(isInDefeatedBossRoom(run)).toBe(true);
  });

  it("после 10 акта — бездна, забег не кончается", () => {
    const run = inBossRoom(10);
    expect(goToNextAct(run)).toBe(true);
    expect(run.act).toBe(11);
    expect(run.status).toBe("active");
  });
});

describe("Победа и рекорд глубины", () => {
  it("победа за босса 10 акта засчитывается один раз — в городе", () => {
    const meta = createMeta();
    const run = inBossRoom(10);
    expect(hasConqueredDungeon(run)).toBe(true);
    bankLoot(meta, run);
    bankLoot(meta, run);
    expect(meta.wins).toBe(1);
    expect(meta.heroStats.warrior?.wins).toBe(1);
  });

  it("гибель в бездне победу не отменяет", () => {
    const meta = createMeta();
    const run = inBossRoom(10);
    goToNextAct(run);
    run.status = "lost";
    applyRunToMeta(meta, run, 0);
    expect(meta.wins).toBe(1);
  });

  it("рекорд глубины растёт в бездне, а начать можно не глубже 11 акта", () => {
    const meta = createMeta();
    const run = inBossRoom(10);
    goToNextAct(run);
    run.act = 14;
    bankLoot(meta, run);
    expect(meta.heroes.warrior?.bestAct).toBe(14);
    expect(getStartableActs(meta, "warrior")).toHaveLength(11);
    expect(canStartAct(meta, "warrior", 11)).toBe(true);
    expect(canStartAct(meta, "warrior", 12)).toBe(false);
  });
});
