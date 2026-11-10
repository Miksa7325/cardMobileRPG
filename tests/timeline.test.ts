// Автотесты бесконечной шкалы: расстановка, горизонт, розыгрыш по клеткам, ходы врагов, такты, рука, новые статусы,
// подготовка Мага, варка Алхимика, карты во время боя. Запуск: npm test
import { describe, expect, it } from "vitest";
import {
  addCardToHand, advance, chooseBrew, createCombat, getEnemyLane, heroSchedule, launch, moveLaneItem, placeCard, placePotion, previewLaunch,
  removeFromLane, rerollCard,
} from "../js/engine/combat.ts";
import { deckOf, fight, quiet, setLane } from "./helpers.ts";

const uidAt = (combat: ReturnType<typeof fight>, index = 0) => combat.piles.hand[index].uid;
const firstEnemy = (combat: ReturnType<typeof fight>) => combat.enemies[0].instanceId;

describe("начало боя", () => {
  it("рука по классу: Воин 7, Убийца 8", () => {
    expect(fight().piles.hand).toHaveLength(7);
    expect(fight({ heroId: "assassin", deck: deckOf("a_strike") }).piles.hand).toHaveLength(8);
  });
  it("враг ставит ходы встык, пока его дорожка не дотянется на 6 клеток вперёд", () => {
    const combat = fight();
    const lane = getEnemyLane(combat, combat.enemies[0]);
    // У Скелета по кругу: рубка (3), защита (2), шквал (2)
    expect(lane.map(({ move, start, end }) => ({ move, start, end }))).toEqual([
      { move: "hack", start: 1, end: 3 },
      { move: "guard", start: 4, end: 5 },
      { move: "flurry", start: 6, end: 7 },
    ]);
  });
  it("время идёт — враг добавляет ходы непрерывно", () => {
    const combat = fight();
    launch(combat); // клетки 1–6: дорожка должна дотянуться до клетки 12
    const lane = getEnemyLane(combat, combat.enemies[0]).filter((entry) => !entry.resolved);
    expect(lane.map(({ move, start, end }) => ({ move, start, end }))).toEqual([
      { move: "flurry", start: 6, end: 7 },
      { move: "hack", start: 8, end: 10 },
      { move: "guard", start: 11, end: 12 },
    ]);
  });
});

describe("расстановка", () => {
  it("карта стоит на шкале, а срабатывает только когда пошло время", () => {
    const combat = fight();
    quiet(combat);
    const enemy = combat.enemies[0];
    const hp = enemy.hp;
    const uid = uidAt(combat);
    expect(placeCard(combat, uid, 1, enemy.instanceId)).toEqual({ ok: true });
    expect(combat.piles.hand.some((card) => card.uid === uid)).toBe(false);
    expect(enemy.hp).toBe(hp);
    launch(combat);
    expect(enemy.hp).toBe(hp - 6);
  });
  it("карта срабатывает в своей последней клетке", () => {
    const combat = fight({ deck: deckOf("bash") }); // вес 2
    quiet(combat);
    placeCard(combat, uidAt(combat), 2, firstEnemy(combat));
    launch(combat);
    expect(combat.events.find((event) => event.type === "cardPlayed")?.cell).toBe(3);
  });
  it("карты не накладываются и не ставятся дальше 6 клеток, пустые клетки между ними можно", () => {
    const combat = fight({ deck: deckOf("bash") });
    const target = firstEnemy(combat);
    expect(placeCard(combat, uidAt(combat), 1, target).ok).toBe(true);
    expect(placeCard(combat, uidAt(combat), 2, target)).toEqual({ ok: false, reason: "overlap" });
    expect(placeCard(combat, uidAt(combat), 6, target)).toEqual({ ok: false, reason: "outOfTimeline" });
    expect(placeCard(combat, uidAt(combat), 5, target).ok).toBe(true);
  });
  it("вместимости нет: все 6 клеток можно занять, седьмую — только когда время дойдёт", () => {
    const combat = fight({ heroId: "mage", deck: deckOf("m_spark") });
    quiet(combat);
    const target = firstEnemy(combat);
    for (const cell of [1, 2, 3, 4, 5, 6]) expect(placeCard(combat, uidAt(combat), cell, target).ok).toBe(true);
    expect(placeCard(combat, uidAt(combat), 7, target)).toEqual({ ok: false, reason: "outOfTimeline" });
    advance(combat, 1);
    expect(placeCard(combat, uidAt(combat), 7, target).ok).toBe(true);
  });
  it("карты весом 0 — на стыке клеток, не больше 2 за такт, срабатывают на своём стыке", () => {
    const combat = fight({ deck: deckOf("adrenal_rush") }); // Всплеск: вес 0, Ускорение 1
    quiet(combat);
    combat.hero.hp = 50;
    expect(placeCard(combat, uidAt(combat), 0).ok).toBe(true);
    expect(placeCard(combat, uidAt(combat), 2).ok).toBe(true);
    expect(placeCard(combat, uidAt(combat), 1)).toEqual({ ok: false, reason: "zeroLimit" }); // такт 1: стыки 0–2
    expect(placeCard(combat, uidAt(combat), 3).ok).toBe(true); // стык 3 — уже такт 2
    launch(combat);
    expect(combat.events.filter((event) => event.type === "status" && event.status === "haste").map((event) => event.cell)).toEqual([0, 2, 3]);
  });
  it("карту можно вернуть в руку и переставить", () => {
    const combat = fight();
    placeCard(combat, uidAt(combat), 1, firstEnemy(combat));
    const id = combat.lane[0].id;
    expect(moveLaneItem(combat, id, 4).ok).toBe(true);
    expect(combat.lane[0].start).toBe(4);
    expect(removeFromLane(combat, id).ok).toBe(true);
    expect(combat.lane).toHaveLength(0);
    expect(combat.piles.hand).toHaveLength(7);
  });
  it("добор срабатывает сразу при постановке, и карту уже не вернуть", () => {
    const combat = fight({ deck: deckOf("second_wind", 12) }); // вес 1, взять 1 карту
    placeCard(combat, uidAt(combat), 1);
    expect(combat.piles.hand).toHaveLength(6 + 1);
    expect(removeFromLane(combat, combat.lane[0].id)).toEqual({ ok: false, reason: "locked" });
  });
  it("бывшее «+N вместимости» — Ускорение N: Всплеск даёт Ускорение 1", () => {
    const combat = fight({ deck: deckOf("adrenal_rush") }); // вес 0
    quiet(combat);
    placeCard(combat, uidAt(combat), 0);
    advance(combat, 1);
    expect(combat.hero.statuses.haste).toBe(1);
  });
  it("переброс: один раз за такт карта уходит в сброс, вместо неё новая", () => {
    const combat = fight();
    expect(rerollCard(combat, uidAt(combat)).ok).toBe(true);
    expect(combat.piles.hand).toHaveLength(7);
    expect(combat.piles.discard).toHaveLength(1);
    expect(rerollCard(combat, uidAt(combat))).toEqual({ ok: false, reason: "noRerolls" });
  });
});

describe("розыгрыш по клеткам", () => {
  it("ничья: первым действует герой — враг умирает раньше своего удара", () => {
    const combat = fight();
    setLane(combat.enemies[0], ["hack"]); // клетки 1–3
    combat.enemies[0].hp = 1;
    const hp = combat.hero.hp;
    placeCard(combat, uidAt(combat), 3, firstEnemy(combat)); // тоже клетка 3
    launch(combat);
    expect(combat.status).toBe("won");
    expect(combat.hero.hp).toBe(hp);
  });
  it("ничья: враг с Ускорением бьёт первым", () => {
    const combat = fight();
    const enemy = combat.enemies[0];
    setLane(enemy, ["hack"]);
    enemy.statuses.haste = 1; // рубка весит 2: клетки 1–2
    enemy.hp = 1;
    const hp = combat.hero.hp;
    placeCard(combat, uidAt(combat), 2, enemy.instanceId);
    launch(combat);
    expect(combat.hero.hp).toBe(hp - 7);
    expect(combat.status).toBe("won");
  });
  it("если цель умерла раньше, атака переходит на ближайшего живого врага", () => {
    const combat = fight({ enemyIds: ["skeleton", "skeleton"] });
    quiet(combat);
    const [a, b] = combat.enemies;
    a.hp = 1;
    const hp = b.hp;
    placeCard(combat, uidAt(combat), 1, a.instanceId);
    placeCard(combat, uidAt(combat), 2, a.instanceId);
    launch(combat);
    expect(a.hp).toBe(0);
    expect(b.hp).toBe(hp - 6);
  });
  it("блок держится 6 клеток: защита в клетке 6 прикрывает удар в клетке 9", () => {
    const combat = fight({ deck: deckOf("defend") }); // 5 блока
    quiet(combat);
    placeCard(combat, uidAt(combat), 6);
    launch(combat);
    setLane(combat.enemies[0], ["hack"], combat.clock); // клетки 7–9: блок ещё есть
    const hp = combat.hero.hp;
    launch(combat);
    expect(combat.hero.hp).toBe(hp - 2); // 7 урона − 5 блока
  });
  it("блок из клетки 1 к удару в клетке 9 уже исчез", () => {
    const combat = fight({ deck: deckOf("defend") });
    quiet(combat);
    placeCard(combat, uidAt(combat), 1);
    launch(combat);
    setLane(combat.enemies[0], ["hack"], combat.clock);
    const hp = combat.hero.hp;
    launch(combat);
    expect(combat.hero.hp).toBe(hp - 7);
  });
});

describe("рука", () => {
  it("рука не сбрасывается, а сработавшая карта приводит новую", () => {
    const combat = fight({ deck: deckOf("strike", 20) });
    quiet(combat);
    const rest = combat.piles.hand.slice(1).map((card) => card.uid);
    placeCard(combat, uidAt(combat), 1, firstEnemy(combat));
    expect(combat.piles.hand).toHaveLength(6);
    launch(combat);
    expect(combat.piles.hand).toHaveLength(7);
    for (const uid of rest) expect(combat.piles.hand.some((card) => card.uid === uid)).toBe(true);
  });
  it("в руке не больше 10 карт", () => {
    const combat = fight({ deck: deckOf("strike", 20) });
    quiet(combat);
    placeCard(combat, uidAt(combat), 1, firstEnemy(combat));
    while (addCardToHand(combat, "strike"));
    expect(combat.piles.hand).toHaveLength(10);
    launch(combat);
    expect(combat.piles.hand).toHaveLength(10);
  });
  it("Рану ставят на шкалу: вес 1, ничего не делает, уходит в сброс и приводит карту", () => {
    const combat = fight({ deck: [...deckOf("wound", 1), ...deckOf("strike", 20)] });
    quiet(combat);
    addCardToHand(combat, "wound");
    const wound = combat.piles.hand.find((card) => card.cardId === "wound")!;
    expect(placeCard(combat, wound.uid, 1).ok).toBe(true);
    launch(combat);
    expect(combat.piles.discard.some((card) => card.uid === wound.uid)).toBe(true);
  });
});

describe("новые статусы", () => {
  it("Замедление врага сдвигает его удар позже, стак тратится на этот удар", () => {
    const combat = fight();
    const enemy = combat.enemies[0];
    enemy.statuses.slow = 1;
    expect(getEnemyLane(combat, enemy).map((entry) => entry.end)).toEqual([4, 6, 8]);
    launch(combat);
    expect(enemy.statuses.slow).toBeUndefined();
  });
  it("Замедление сдвигает и все следующие ходы врага", () => {
    const combat = fight();
    const enemy = combat.enemies[0];
    enemy.statuses.slow = 2; // рубка 1–4, защита 5–7, шквал 8–9
    expect(getEnemyLane(combat, enemy).slice(0, 3).map((entry) => entry.end)).toEqual([4, 7, 9]);
  });
  it("Замедление героя посреди боя сдвигает его карты позже", () => {
    const combat = fight({ enemyIds: ["spider"] });
    setLane(combat.enemies[0], ["web"]); // клетки 1–2: Слабость 1 и Замедление 1 герою
    combat.enemies[0].hp = combat.enemies[0].maxHp = 500;
    const uids = [0, 1, 2, 3].map((index) => uidAt(combat, index));
    uids.forEach((uid, index) => placeCard(combat, uid, 3 + index, firstEnemy(combat)));
    advance(combat, 7);
    // Удар в клетке 3 стал весом 2 (клетки 3–4), остальные сдвинулись на клетку позже
    const played = combat.events.filter((event) => event.type === "cardPlayed");
    expect(played.map((event) => event.cell)).toEqual([4, 5, 6, 7]);
  });
  it("Ускорение героя: карта весит на 1 меньше", () => {
    const combat = fight({ deck: deckOf("bash") });
    combat.hero.statuses.haste = 1;
    placeCard(combat, uidAt(combat), 1, firstEnemy(combat)); // вес 1 вместо 2
    expect(placeCard(combat, uidAt(combat), 2, firstEnemy(combat)).ok).toBe(true);
  });
  it("Ловкость: каждые 2 стака — первая карта такта на 1 легче", () => {
    const combat = fight({ deck: deckOf("bash") });
    combat.hero.statuses.dexterity = 2;
    placeCard(combat, uidAt(combat), 1, firstEnemy(combat));
    expect(placeCard(combat, uidAt(combat), 2, firstEnemy(combat)).ok).toBe(true); // вторая в том же такте — уже вес 2
    expect(placeCard(combat, uidAt(combat), 3, firstEnemy(combat))).toEqual({ ok: false, reason: "overlap" });
  });
  it("Ловкость облегчает первую карту и следующего такта", () => {
    const combat = fight({ deck: deckOf("bash", 10) });
    combat.hero.statuses.dexterity = 2;
    placeCard(combat, uidAt(combat), 4, firstEnemy(combat)); // первая карта такта 2: вес 1, клетка 4
    expect(placeCard(combat, uidAt(combat), 5, firstEnemy(combat)).ok).toBe(true);
  });
  it("Оглушение срывает следующее действие врага", () => {
    const combat = fight();
    const enemy = combat.enemies[0];
    setLane(enemy, ["hack"]);
    enemy.statuses.stun = 1;
    const hp = combat.hero.hp;
    launch(combat);
    expect(combat.hero.hp).toBe(hp);
    expect(enemy.statuses.stun).toBeUndefined();
  });
  it("Кровотечение: стаки × вес действия мимо блока, потом −1", () => {
    const combat = fight();
    const enemy = combat.enemies[0];
    setLane(enemy, ["hack"]); // вес 3
    enemy.statuses.bleed = 2;
    const hp = enemy.hp;
    launch(combat);
    expect(enemy.hp).toBe(hp - 6);
    expect(enemy.statuses.bleed).toBe(1);
  });
});

describe("такты", () => {
  it("Яд бьёт в начале каждого такта: в начале боя и после клеток 3 и 6", () => {
    const combat = fight({ heroStatuses: { poison: 3 } });
    const max = combat.hero.maxHp;
    expect(combat.hero.hp).toBe(max - 3); // такт 1 — уже в начале боя
    quiet(combat);
    launch(combat); // такт 2 (−2), такт 3 (−1)
    expect(combat.hero.hp).toBe(max - 6);
    expect(combat.hero.statuses.poison).toBeUndefined();
  });
  it("сила «в начале такта» срабатывает каждые 3 клетки", () => {
    const combat = fight({ deck: deckOf("rage") }); // Нарастающий гнев: вес 2, +1 Сила в начале такта
    quiet(combat);
    placeCard(combat, uidAt(combat), 1);
    launch(combat); // сработала в клетке 2, потом начались такты 2 и 3
    expect(combat.hero.statuses.strength).toBe(2);
  });
});

describe("Маг: подготовка", () => {
  // Маг против Скелета без ходов; в руку — нужные карты. Возвращает uid по порядку
  function mage(cardIds: string[], relics: string[] = []) {
    const combat = fight({ heroId: "mage", deck: deckOf("m_spark"), relics });
    quiet(combat);
    combat.piles.hand = [];
    for (const id of cardIds) addCardToHand(combat, id);
    combat.enemies[0].hp = combat.enemies[0].maxHp = 500;
    return { combat, uids: combat.piles.hand.map((card) => card.uid), target: combat.enemies[0].instanceId };
  }
  const prepEnd = (combat: ReturnType<typeof fight>, index = 0) => heroSchedule(combat).prepared.get(combat.prepared[index].id)!.end;

  it("готовится 2 × вес клеток, срабатывает сразу, как готово, и на 50% сильнее", () => {
    const { combat, uids, target } = mage(["m_spark", "m_spark", "m_spark"]); // 6 урона, вес 1: готовится 2 клетки
    placeCard(combat, uids[0], 0, target, { prepare: true });
    placeCard(combat, uids[1], 1, target);
    placeCard(combat, uids[2], 2, target); // клетки 1 и 2 заняты — ускорения нет
    expect(prepEnd(combat)).toBe(2);
    launch(combat);
    const hits = combat.events.filter((event) => event.type === "hit").map((event) => event.hpLost);
    expect(hits).toEqual([6, 6, 9]); // две карты в клетках 1 и 2, затем заклинание после клетки 2
  });
  it("пустая клетка основной шкалы ускоряет подготовку на 1", () => {
    const { combat, uids, target } = mage(["m_pyroblast"]); // вес 3: готовится 6 клеток
    placeCard(combat, uids[0], 0, target, { prepare: true });
    expect(prepEnd(combat)).toBe(3); // шкала пустая: каждая клетка даёт 2
  });
  it("Астролябия: пустая клетка ускоряет на 2", () => {
    const { combat, uids, target } = mage(["m_pyroblast"], ["astrolabe"]);
    placeCard(combat, uids[0], 0, target, { prepare: true });
    expect(prepEnd(combat)).toBe(2); // каждая пустая клетка даёт 3
  });
  it("заклинания готовятся очередью, лишнее переходит на следующий ход", () => {
    const { combat, uids, target } = mage(["m_spark", "m_spark", "m_spark", "m_spark", "m_ice_armor", "m_ice_armor", "m_ice_armor"]);
    for (let i = 0; i < 4; i++) placeCard(combat, uids[i], i + 1, target); // клетки 1–4 заняты
    for (let i = 4; i < 7; i++) placeCard(combat, uids[i], 0, target, { prepare: true }); // вес 2: по 4 клетки
    // клетки 5 и 6 пустые — по 2; третье не успевает: клетки следующего хода считаются без ускорения
    expect([0, 1, 2].map((index) => prepEnd(combat, index))).toEqual([4, 6, 10]);
    launch(combat);
    expect(combat.prepared).toHaveLength(1);
    expect(combat.prepared[0].progress).toBe(0);
  });
  it("предела по весу нет, а вернуть в руку можно, пока не начало готовиться", () => {
    const { combat, uids, target } = mage(["m_spark", "m_spark", "m_spark", "m_spark", "m_spark"]);
    for (const uid of uids) expect(placeCard(combat, uid, 0, target, { prepare: true }).ok).toBe(true);
    combat.prepared[0].progress = 1;
    expect(removeFromLane(combat, combat.prepared[0].id)).toEqual({ ok: false, reason: "locked" });
    expect(removeFromLane(combat, combat.prepared[1].id).ok).toBe(true);
  });
  it("Оглушение Мага срывает ближайшее подготовленное заклинание, оно уходит в сброс", () => {
    const { combat, uids, target } = mage(["m_spark", "m_spark"]);
    const enemy = combat.enemies[0];
    placeCard(combat, uids[0], 0, target, { prepare: true });
    placeCard(combat, uids[1], 2, target);
    combat.hero.statuses.stun = 1;
    launch(combat);
    expect(enemy.hp).toBe(500 - 6); // сорвалось подготовленное, карта на дорожке сработала
  });
});

describe("Алхимик и зелья", () => {
  it("варка с выбором: из двух зелий игрок берёт одно, до выбора запуск не идёт", () => {
    const combat = fight({ heroId: "alchemist", deck: deckOf("al_brew") });
    placeCard(combat, uidAt(combat), 1);
    expect(combat.brewChoices[0].options).toHaveLength(2);
    expect(launch(combat)).toEqual({ ok: false, reason: "chooseBrew" });
    const chosen = combat.brewChoices[0].options[1];
    chooseBrew(combat, 0, chosen);
    expect(combat.potions).toEqual([chosen]);
  });
  it("варка посреди такта время не останавливает: выбор — на остановке в конце такта", () => {
    const combat = fight({ heroId: "alchemist", deck: deckOf("al_brew", 20) });
    quiet(combat);
    advance(combat, 1);
    placeCard(combat, uidAt(combat), 2);
    expect(combat.brewChoices).toHaveLength(1);
    advance(combat, 6);
    expect(combat.clock).toBe(3); // дошло до конца такта и встало
    expect(launch(combat)).toEqual({ ok: false, reason: "chooseBrew" });
    chooseBrew(combat, 0, combat.brewChoices[0].options[0]);
    advance(combat, 3);
    expect(combat.clock).toBe(6);
  });
  it("зелье Алхимика весит 0, у остальных героев — 1", () => {
    const alchemist = fight({ heroId: "alchemist", deck: deckOf("al_toss"), potions: ["block_potion"] });
    placePotion(alchemist, 0, 0);
    expect(alchemist.lane[0].weight).toBe(0);
    const warrior = fight({ potions: ["block_potion"] });
    placePotion(warrior, 0, 1);
    expect(warrior.lane[0].weight).toBe(1);
  });
  it("зелье срабатывает в своей клетке", () => {
    const combat = fight({ potions: ["block_potion"] });
    quiet(combat);
    placePotion(combat, 0, 4);
    launch(combat);
    expect(combat.events.find((event) => event.type === "block")?.cell).toBe(4);
  });
});

describe("предпросмотр", () => {
  it("числа учитывают то, что сработает раньше: Сокрушение в клетке 2 усиливает удар в клетке 3", () => {
    const combat = fight({ deck: [...deckOf("bash", 5), ...deckOf("strike", 5)] });
    quiet(combat);
    const target = firstEnemy(combat);
    const bash = combat.piles.hand.find((card) => card.cardId === "bash")!;
    const strike = combat.piles.hand.find((card) => card.cardId === "strike")!;
    placeCard(combat, bash.uid, 1, target); // клетки 1–2: 8 урона и 2 Уязвимости (до урона)
    placeCard(combat, strike.uid, 3, target);
    const preview = previewLaunch(combat);
    const [bashItem, strikeItem] = combat.lane;
    expect(preview.get(`lane:${bashItem.id}`)).toMatchObject({ damage: 9, cell: 2 });
    expect(preview.get(`lane:${strikeItem.id}`)).toMatchObject({ damage: 7, cell: 3 }); // 6 × 1.2
    // Предпросмотр не меняет сам бой
    expect(combat.lane.every((item) => !item.resolved)).toBe(true);
  });
  it("удар врага в предпросмотре — с защитой Воина и блоком", () => {
    const combat = fight({ deck: deckOf("defend") });
    setLane(combat.enemies[0], ["hack"]);
    placeCard(combat, uidAt(combat), 1);
    const preview = previewLaunch(combat);
    expect(preview.get(`enemy:${firstEnemy(combat)}:0`)).toMatchObject({ damage: 7, cell: 3 });
  });
});

describe("карты во время боя", () => {
  it("пока идёт время, карты ставятся не раньше следующей клетки и не дальше 6 клеток вперёд", () => {
    const combat = fight({ deck: deckOf("strike", 20) });
    quiet(combat);
    advance(combat, 2);
    expect(combat.status).toBe("running");
    const target = firstEnemy(combat);
    expect(placeCard(combat, uidAt(combat), 2, target)).toEqual({ ok: false, reason: "pastCell" });
    expect(placeCard(combat, uidAt(combat), 9, target)).toEqual({ ok: false, reason: "outOfTimeline" });
    expect(placeCard(combat, uidAt(combat), 8, target).ok).toBe(true);
    expect(placeCard(combat, uidAt(combat), 3, target).ok).toBe(true);
  });
  it("карту, которая уже срабатывает, нельзя ни убрать, ни передвинуть", () => {
    const combat = fight({ deck: deckOf("bash", 20) }); // вес 2
    quiet(combat);
    placeCard(combat, uidAt(combat), 1, firstEnemy(combat)); // клетки 1–2
    advance(combat, 1);
    const id = combat.lane[0].id;
    expect(removeFromLane(combat, id)).toEqual({ ok: false, reason: "locked" });
    expect(moveLaneItem(combat, id, 4)).toEqual({ ok: false, reason: "locked" });
  });
  it("такты идут один за другим: номер такта растёт каждые 3 клетки", () => {
    const combat = fight();
    quiet(combat);
    expect(combat.turn).toBe(1);
    advance(combat, 7);
    expect(combat.turn).toBe(3);
  });
});
