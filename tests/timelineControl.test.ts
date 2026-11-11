// Автотесты управления шкалой (раздел «Управление шкалой» в docs/PLAN.md): «Пропуск клетки», вставка карты со сдвигом,
// цель в момент срабатывания, остановка на пустой клетке, отдельный шаг такта. Запуск: npm test
import { describe, expect, it } from "vitest";
import {
  advance, heroSchedule, launch, moveLaneItem, nextCellFilled, placeCard, placeSkip, removeFromLane, setFocus, startCombat, tick,
} from "../js/engine/combat.ts";
import { deckOf, fight, quiet } from "./helpers.ts";

const uidAt = (combat: ReturnType<typeof fight>, index = 0) => combat.piles.hand[index].uid;
const starts = (combat: ReturnType<typeof fight>) => combat.lane.filter((item) => !item.resolved).map((item) => item.start).sort((a, b) => a - b);

describe("«Пропуск клетки»", () => {
  it("всегда доступен, не трогает руку и проходит как пустая клетка", () => {
    const combat = fight();
    quiet(combat);
    const hand = combat.piles.hand.length;
    expect(placeSkip(combat, 1).ok).toBe(true);
    expect(placeSkip(combat, 2).ok).toBe(true);
    expect(combat.piles.hand).toHaveLength(hand);
    launch(combat);
    expect(combat.events.some((event) => event.type === "cardPlayed")).toBe(false);
    expect(combat.piles.hand).toHaveLength(hand); // добора за пропуск нет
    expect(combat.lane.every((item) => item.resolved)).toBe(true);
  });
  it("убирается со шкалы, ничего не возвращая в руку", () => {
    const combat = fight();
    const hand = combat.piles.hand.length;
    placeSkip(combat, 3);
    expect(removeFromLane(combat, combat.lane[0].id).ok).toBe(true);
    expect(combat.lane).toHaveLength(0);
    expect(combat.piles.hand).toHaveLength(hand);
  });
  it("Ловкость его не облегчает и не считает первой картой такта", () => {
    const combat = fight({ deck: deckOf("bash") });
    combat.hero.statuses.dexterity = 2;
    placeSkip(combat, 1);
    placeCard(combat, uidAt(combat), 2);
    expect(heroSchedule(combat).lane.get(combat.lane[1].id)).toMatchObject({ start: 2, end: 2 }); // вес 2 − 1
  });
  it("рвёт цепочку и обнуляет Комбо, как пустая клетка", () => {
    const combat = fight();
    quiet(combat);
    combat.hero.statuses.combo = 3;
    placeSkip(combat, 1);
    advance(combat, 1);
    expect(combat.hero.statuses.combo).toBeUndefined();
  });
});

describe("карта на карту", () => {
  it("встаёт на место карты, та и все следующие сдвигаются, пустые клетки между ними сохраняются", () => {
    const combat = fight();
    placeCard(combat, uidAt(combat), 1);
    placeCard(combat, uidAt(combat), 3); // клетка 2 пустая
    expect(placeCard(combat, uidAt(combat), 1).ok).toBe(true);
    expect(starts(combat)).toEqual([1, 2, 4]);
  });
  it("сдвинутые карты могут уйти дальше 6 клеток вперёд", () => {
    const combat = fight({ deck: deckOf("bash") });
    placeCard(combat, uidAt(combat), 3);
    placeCard(combat, uidAt(combat), 5);
    expect(placeCard(combat, uidAt(combat), 3).ok).toBe(true);
    expect(starts(combat)).toEqual([3, 5, 7]);
  });
  it("сдвинутая карта, попавшая на замёрзшую клетку, уезжает за неё", () => {
    const combat = fight({ deck: deckOf("bash") });
    combat.frozenCells = [8];
    placeCard(combat, uidAt(combat), 5);
    expect(placeCard(combat, uidAt(combat), 5).ok).toBe(true);
    expect(starts(combat)).toEqual([5, 9]);
  });
  it("перенос карты со шкалы на другую карту тоже сдвигает её", () => {
    const combat = fight();
    placeCard(combat, uidAt(combat), 1);
    placeCard(combat, uidAt(combat), 2);
    placeSkip(combat, 4);
    const skip = combat.lane[2].id;
    expect(moveLaneItem(combat, skip, 1).ok).toBe(true);
    expect(combat.lane.find((item) => item.id === skip)!.start).toBe(1);
    expect(starts(combat)).toEqual([1, 2, 3]);
  });
  it("перенос карты на карту дальше по шкале не оставляет дыры на старом месте", () => {
    const combat = fight();
    placeCard(combat, uidAt(combat), 1);
    placeCard(combat, uidAt(combat), 2);
    placeCard(combat, uidAt(combat), 3);
    const first = combat.lane[0].id;
    expect(moveLaneItem(combat, first, 3).ok).toBe(true);
    expect(starts(combat)).toEqual([1, 2, 3]);
    expect(combat.lane.find((item) => item.id === first)!.start).toBe(2);
  });
  it("пустые клетки между сдвинутыми картами не прибавляются, даже если Замедление переходит на новую карту", () => {
    const combat = fight();
    combat.hero.statuses.slow = 1;
    placeCard(combat, uidAt(combat), 1); // с Замедлением: клетки 1–2
    placeCard(combat, uidAt(combat), 3);
    expect(placeCard(combat, uidAt(combat), 1).ok).toBe(true); // Замедление теперь у новой: 1–2, старые — 3 и 4
    expect(starts(combat)).toEqual([1, 3, 4]);
  });
  it("на карту, которая уже срабатывает, поставить нельзя", () => {
    const combat = fight({ deck: deckOf("bash") });
    quiet(combat);
    placeCard(combat, uidAt(combat), 1);
    advance(combat, 1); // указатель внутри карты (клетки 1–2)
    expect(placeCard(combat, uidAt(combat), 2).ok).toBe(false);
  });
});

describe("цель в момент срабатывания", () => {
  it("карта бьёт врага, выбранного, когда она срабатывает, а не когда её поставили", () => {
    const combat = fight({ enemyIds: ["skeleton", "skeleton"] });
    quiet(combat);
    const [first, second] = combat.enemies;
    setFocus(combat, first.instanceId);
    placeCard(combat, uidAt(combat), 1);
    setFocus(combat, second.instanceId);
    const hp = [first.hp, second.hp];
    advance(combat, 1);
    expect(first.hp).toBe(hp[0]);
    expect(second.hp).toBeLessThan(hp[1]);
    expect(combat.lane[0].targetId).toBe(second.instanceId);
  });
  it("выбранный враг умер — бьёт ближайшего живого", () => {
    const combat = fight({ enemyIds: ["skeleton", "skeleton"] });
    quiet(combat);
    const [first, second] = combat.enemies;
    setFocus(combat, first.instanceId);
    first.hp = 0;
    placeCard(combat, uidAt(combat), 1);
    const hp = second.hp;
    advance(combat, 1);
    expect(second.hp).toBeLessThan(hp);
  });
});

describe("ход времени", () => {
  it("следующая клетка пуста — время ждёт; занята картой, пропуском или замёрзла — идёт", () => {
    const combat = fight();
    expect(nextCellFilled(combat)).toBe(false);
    placeSkip(combat, 1);
    expect(nextCellFilled(combat)).toBe(true);
    removeFromLane(combat, combat.lane[0].id);
    combat.frozenCells.push(1);
    expect(nextCellFilled(combat)).toBe(true);
  });
  it("после последней клетки такта эффекты такта — отдельным шагом", () => {
    const combat = fight();
    quiet(combat);
    const enemy = combat.enemies[0];
    enemy.statuses.poison = 4;
    const hp = enemy.hp;
    startCombat(combat);
    for (let i = 0; i < 3; i++) tick(combat);
    expect(combat.clock).toBe(3);
    expect(combat.tactDue).toBe(true);
    expect(combat.turn).toBe(1);
    expect(enemy.hp).toBe(hp); // Яд ещё не сработал
    tick(combat);
    expect(combat.clock).toBe(3); // шаг такта клетку не двигает
    expect(combat.turn).toBe(2);
    expect(enemy.hp).toBeLessThan(hp);
  });
});
