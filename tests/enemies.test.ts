// Автотесты приёмов врагов: Сокрушение и Починка, фазы боссов, призыв, вампиризм, скрытые ходы, замороженная клетка.
// Запуск: npm test
import { describe, expect, it } from "vitest";
import { advance, cardWeight, createCombat, getEnemyLane, launch, placeCard, rerollCard } from "../js/engine/combat.ts";
import { ENEMIES } from "../js/data/enemies.ts";
import { executeEffects } from "../js/engine/effects.ts";
import { deckOf, fight, quiet, setLane } from "./helpers.ts";

const fightWith = (enemyId: string) => createCombat({ heroId: "mage", enemyIds: [enemyId], seed: 3, deck: deckOf("m_barrier") });

describe("Сокрушение и Починка у врагов", () => {
  it("удар Падшего рыцаря ломает броню героя до урона: 13 × 1.2 = 15", () => {
    const combat = fightWith("fallen_knight");
    setLane(combat.enemies[0], ["slam"]);
    const hp = combat.hero.hp;
    launch(combat);
    expect(combat.hero.statuses.vulnerable).toBe(2);
    expect(combat.hero.hp).toBe(hp - 15);
  });
  it("защита Скелета чинит его доспех", () => {
    const combat = fightWith("skeleton");
    const skeleton = combat.enemies[0];
    skeleton.statuses.vulnerable = 3;
    setLane(skeleton, ["guard"]);
    launch(combat);
    expect(skeleton.statuses.vulnerable).toBe(2);
  });
});

describe("фазы боссов", () => {
  it("Хранитель склепа на половине HP зовёт Скелета и меняет ходы", () => {
    const combat = fightWith("crypt_warden");
    quiet(combat);
    const warden = combat.enemies[0];
    executeEffects(combat, [{ type: "damage", amount: 80, fixed: true }], { source: combat.hero, targets: [warden], fromCard: true });
    launch(combat); // фаза проверяется во время розыгрыша
    expect(warden.phase).toBe(1);
    expect(combat.enemies.map((enemy) => enemy.enemyId)).toContain("skeleton");
    expect(warden.lane.every((action) => ["flurry", "scythe", "call"].includes(action.move))).toBe(true);
  });
  it("второй Скелет не призывается, пока первый жив", () => {
    const combat = fightWith("crypt_warden");
    const warden = combat.enemies[0];
    warden.phase = 1;
    executeEffects(combat, [{ type: "summon", enemyId: "skeleton" }], { source: warden, targets: [], fromCard: false });
    executeEffects(combat, [{ type: "summon", enemyId: "skeleton" }], { source: warden, targets: [], fromCard: false });
    expect(combat.enemies.filter((enemy) => enemy.enemyId === "skeleton")).toHaveLength(1);
  });
});

describe("Лорд вампиров", () => {
  it("скрытый ход виден как «?», пока до него больше 2 клеток", () => {
    const combat = fightWith("vampire_lord");
    setLane(combat.enemies[0], ["drain", "bite"]); // иссушение 1–2, укус 3–5
    const lane = getEnemyLane(combat, combat.enemies[0]);
    expect(lane.map((entry) => entry.hidden)).toEqual([false, true]);
  });
  it("во второй фазе укус лечит его на половину урона по HP", () => {
    const combat = fightWith("vampire_lord");
    const lord = combat.enemies[0];
    lord.phase = 1;
    lord.hp = 100;
    setLane(lord, ["thirstBite"]);
    combat.hero.block = 0;
    combat.hero.blocks = [];
    launch(combat);
    expect(lord.hp).toBe(108); // 16 урона по HP → +8
  });
});

describe("Король-лич", () => {
  it("замораживает по клетке раз в два такта, заранее — на такты, куда ещё нельзя ставить", () => {
    const combat = fightWith("lich_king");
    // Такты 1–3 решены в начале боя: мёрзнут такты 1 и 3, такт 2 свободен
    expect(combat.frozenCells.map((cell) => Math.ceil(cell / 3)).sort()).toEqual([1, 3]);
    const cell = combat.frozenCells.find((frozen) => frozen <= 6)!;
    expect(placeCard(combat, combat.piles.hand[0].uid, cell)).toEqual({ ok: false, reason: "frozen" });
  });
});

describe("Особенности шкалы актов 4–10", () => {
  it("Трясина: последняя клетка каждого второго такта закрыта", () => {
    const combat = fight({ blockedCells: [3] });
    expect(combat.frozenCells.filter((cell) => cell <= 9)).toEqual([3, 9]);
    expect(placeCard(combat, combat.piles.hand[0].uid, 3, combat.enemies[0].instanceId)).toEqual({ ok: false, reason: "frozen" });
    expect(placeCard(combat, combat.piles.hand[0].uid, 6, combat.enemies[0].instanceId).ok).toBe(true);
  });
  it("Жар: −2 HP в конце каждого второго такта", () => {
    const combat = fight({ extraPassives: [{ trigger: "onTactEnd", everyTacts: 2, effects: [{ type: "loseHp", amount: 2 }] }] });
    quiet(combat);
    const hp = combat.hero.hp;
    advance(combat, 3);
    expect(combat.hero.hp).toBe(hp);
    advance(combat, 3);
    expect(combat.hero.hp).toBe(hp - 2);
  });
  it("переброс обновляется раз в два такта", () => {
    const combat = fight();
    quiet(combat);
    expect(rerollCard(combat, combat.piles.hand[0].uid).ok).toBe(true);
    advance(combat, 3); // начался такт 2: переброса нет
    expect(combat.rerollsLeft).toBe(0);
    advance(combat, 3); // такт 3: переброс снова есть
    expect(combat.rerollsLeft).toBe(1);
  });
  it("Железная дисциплина: карта весом 0 весит 1", () => {
    const combat = fight({ deck: deckOf("adrenal_rush"), minCardWeight: 1 });
    expect(cardWeight(combat.piles.hand[0], combat)).toBe(1);
    expect(cardWeight(combat.piles.hand[0])).toBe(0);
  });
  it("Натиск: враги начинают бой с Ускорением", () => {
    expect(fight({ enemyHaste: 1 }).enemies[0].statuses.haste).toBe(1);
  });
});

describe("Акт 4", () => {
  it("Грибник и Матерь топей зовут пиявок: Матерь — до двух", () => {
    const mother = createCombat({ heroId: "warrior", enemyIds: ["bog_mother"], seed: 1 });
    const call = ENEMIES.bog_mother.moves.call.effects[0];
    expect(call).toMatchObject({ type: "summon", enemyId: "bog_leech", max: 2 });
    expect(mother.enemies).toHaveLength(1);
  });
});
