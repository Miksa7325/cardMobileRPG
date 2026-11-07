// Автотесты шкалы хода: расстановка, вместимость, розыгрыш по клеткам, ходы врагов, такты, новые статусы,
// подготовка Мага, варка Алхимика, пауза посреди розыгрыша. Запуск: npm test
import { describe, expect, it } from "vitest";
import { CONFIG } from "../js/config.ts";
import {
  chooseBrew, createCombat, getEnemyLane, launch, moveLaneItem, placeCard, placePotion, previewLaunch, removeFromLane, rerollCard,
  setKeep, totalCapacity,
} from "../js/engine/combat.ts";
import { deckOf, fight, quiet, setLane } from "./helpers.ts";

const uidAt = (combat: ReturnType<typeof fight>, index = 0) => combat.piles.hand[index].uid;
const firstEnemy = (combat: ReturnType<typeof fight>) => combat.enemies[0].instanceId;

describe("начало хода", () => {
  it("добор по классу: Воин 7, Убийца 8", () => {
    expect(fight().piles.hand).toHaveLength(7);
    expect(fight({ heroId: "assassin", deck: deckOf("a_strike") }).piles.hand).toHaveLength(8);
  });
  it("враг ставит ходы встык, пока влезают в 6 клеток", () => {
    const combat = fight();
    const lane = getEnemyLane(combat, combat.enemies[0]);
    expect(lane.map(({ move, start, end }) => ({ move, start, end }))).toEqual([
      { move: "hack", start: 1, end: 3 },
      { move: "guard", start: 4, end: 5 },
    ]);
  });
  it("ход, который не влез, встаёт первым в следующем ходу", () => {
    const combat = fight();
    quiet(combat);
    launch(combat);
    // У Скелета по кругу: рубка, защита, шквал. Шквал (вес 3) не влез в первый ход
    expect(combat.enemies[0].lane.map((action) => action.move)).toEqual(["flurry", "hack"]);
  });
});

describe("расстановка", () => {
  it("карта стоит на шкале, а срабатывает только после «Запуска»", () => {
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
  it("карты не накладываются и не вылезают за шкалу, пустые клетки между ними можно", () => {
    const combat = fight({ deck: deckOf("bash") });
    const target = firstEnemy(combat);
    expect(placeCard(combat, uidAt(combat), 1, target).ok).toBe(true);
    expect(placeCard(combat, uidAt(combat), 2, target)).toEqual({ ok: false, reason: "overlap" });
    expect(placeCard(combat, uidAt(combat), 6, target)).toEqual({ ok: false, reason: "outOfTimeline" });
    expect(placeCard(combat, uidAt(combat), 5, target).ok).toBe(true);
  });
  it("вместимость: у Мага 4, пятая карта не встанет", () => {
    const combat = fight({ heroId: "mage", deck: deckOf("m_spark") });
    const target = firstEnemy(combat);
    for (const cell of [1, 2, 3, 4]) expect(placeCard(combat, uidAt(combat), cell, target).ok).toBe(true);
    expect(placeCard(combat, uidAt(combat), 5, target)).toEqual({ ok: false, reason: "noCapacity" });
  });
  it("карты весом 0 — на стыке клеток, не больше 2 за ход, срабатывают на своём стыке", () => {
    const combat = fight({ deck: deckOf("parry") }); // вес 0, 3 блока
    quiet(combat);
    expect(placeCard(combat, uidAt(combat), 0).ok).toBe(true);
    expect(placeCard(combat, uidAt(combat), 3).ok).toBe(true);
    expect(placeCard(combat, uidAt(combat), 4)).toEqual({ ok: false, reason: "zeroLimit" });
    launch(combat);
    expect(combat.events.filter((event) => event.type === "block").map((event) => event.cell)).toEqual([0, 3]);
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
    const combat = fight({ deck: deckOf("rally", 12) }); // вес 1, взять 2 карты
    placeCard(combat, uidAt(combat), 1);
    expect(combat.piles.hand).toHaveLength(6 + 2);
    expect(removeFromLane(combat, combat.lane[0].id)).toEqual({ ok: false, reason: "locked" });
  });
  it("«+N вместимости» тоже сразу: Выброс адреналина даёт +1", () => {
    const combat = fight({ deck: deckOf("adrenaline") }); // вес 0
    placeCard(combat, uidAt(combat), 0);
    expect(totalCapacity(combat)).toBe(CONFIG.capacity.warrior + 1);
  });
  it("переброс: один раз за ход карта уходит в сброс, вместо неё новая", () => {
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
  it("блок держится 6 клеток: защита в клетке 6 прикрывает начало следующего хода", () => {
    const combat = fight({ deck: deckOf("defend") }); // 5 блока
    quiet(combat);
    placeCard(combat, uidAt(combat), 6);
    launch(combat);
    setLane(combat.enemies[0], ["hack"]); // клетка 3 следующего хода: блок ещё есть
    const hp = combat.hero.hp;
    launch(combat);
    expect(combat.hero.hp).toBe(hp - 2); // 7 урона − 5 блока
  });
  it("блок из клетки 1 к клетке 3 следующего хода уже исчез", () => {
    const combat = fight({ deck: deckOf("defend") });
    quiet(combat);
    placeCard(combat, uidAt(combat), 1);
    launch(combat);
    setLane(combat.enemies[0], ["hack"]);
    const hp = combat.hero.hp;
    launch(combat);
    expect(combat.hero.hp).toBe(hp - 7);
  });
});

describe("рука в конце хода", () => {
  it("отмеченные карты (до 2) остаются, остальные уходят в сброс", () => {
    const combat = fight();
    quiet(combat);
    const kept = [uidAt(combat, 0), uidAt(combat, 1)];
    expect(setKeep(combat, kept).ok).toBe(true);
    launch(combat);
    expect(combat.piles.hand).toHaveLength(7 + 2);
    for (const uid of kept) expect(combat.piles.hand.some((card) => card.uid === uid)).toBe(true);
  });
  it("если ничего не отметили, не остаётся ни одной", () => {
    const combat = fight();
    quiet(combat);
    launch(combat);
    expect(combat.piles.hand).toHaveLength(7);
  });
  it("больше 2 отметить нельзя", () => {
    const combat = fight();
    expect(setKeep(combat, [uidAt(combat, 0), uidAt(combat, 1), uidAt(combat, 2)])).toEqual({ ok: false, reason: "tooMany" });
  });
});

describe("новые статусы", () => {
  it("Замедление врага сдвигает его удар позже, стак тратится на этот удар", () => {
    const combat = fight();
    const enemy = combat.enemies[0];
    enemy.statuses.slow = 1;
    expect(getEnemyLane(combat, enemy).map((entry) => entry.end)).toEqual([4, 6]);
    launch(combat);
    expect(enemy.statuses.slow).toBeUndefined();
  });
  it("ход врага, вытолкнутый Замедлением за клетку 6, переносится на следующий ход", () => {
    const combat = fight();
    const enemy = combat.enemies[0];
    enemy.statuses.slow = 2; // рубка 1–4, защита 5–7: не влезла
    launch(combat);
    expect(enemy.lane[0].move).toBe("guard");
  });
  it("Замедление героя посреди розыгрыша сдвигает его карты, вылезшие возвращаются в руку", () => {
    const combat = fight({ enemyIds: ["spider"] });
    setLane(combat.enemies[0], ["web"]); // клетки 1–2: Слабость 2 и Замедление 2 герою
    const uids = [0, 1, 2, 3].map((index) => uidAt(combat, index));
    uids.forEach((uid, index) => placeCard(combat, uid, 3 + index, firstEnemy(combat)));
    launch(combat);
    // Удары в 3 и 4 стали весом 2: клетки 3–4 и 5–6. Два последних не влезли
    const played = combat.events.filter((event) => event.type === "cardPlayed");
    expect(played.map((event) => event.cell)).toEqual([4, 6]);
    expect(combat.piles.hand.some((card) => card.uid === uids[2])).toBe(true);
    expect(combat.piles.hand.some((card) => card.uid === uids[3])).toBe(true);
  });
  it("Ускорение героя: карта весит на 1 меньше", () => {
    const combat = fight({ deck: deckOf("bash") });
    combat.hero.statuses.haste = 1;
    placeCard(combat, uidAt(combat), 1, firstEnemy(combat)); // вес 1 вместо 2
    expect(placeCard(combat, uidAt(combat), 2, firstEnemy(combat)).ok).toBe(true);
  });
  it("Ловкость: каждые 2 стака — первая карта хода на 1 легче", () => {
    const combat = fight({ deck: deckOf("bash") });
    combat.hero.statuses.dexterity = 2;
    placeCard(combat, uidAt(combat), 1, firstEnemy(combat));
    expect(placeCard(combat, uidAt(combat), 2, firstEnemy(combat)).ok).toBe(true); // вторая — уже вес 2
    expect(placeCard(combat, uidAt(combat), 3, firstEnemy(combat))).toEqual({ ok: false, reason: "overlap" });
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
  it("Яд бьёт в начале каждого такта: начало хода и после клетки 3", () => {
    const combat = fight({ heroStatuses: { poison: 3 } });
    const max = combat.hero.maxHp;
    expect(combat.hero.hp).toBe(max - 3); // такт 1 — уже в начале хода
    quiet(combat);
    launch(combat); // такт 2 (−2), потом начало следующего хода (−1)
    expect(combat.hero.hp).toBe(max - 6);
    expect(combat.hero.statuses.poison).toBeUndefined();
  });
  it("сила «в начале такта» срабатывает 2 раза за ход", () => {
    const combat = fight({ deck: deckOf("rage") }); // +1 Сила в начале такта
    quiet(combat);
    placeCard(combat, uidAt(combat), 1);
    launch(combat); // такт 2 этого хода и такт 1 следующего
    expect(combat.hero.statuses.strength).toBe(2);
  });
});

describe("Маг: подготовка", () => {
  it("подготовленное заклинание срабатывает само через 2 × вес − Прилив клеток и на 50% сильнее", () => {
    const combat = fight({ heroId: "mage", deck: deckOf("m_spark") }); // 5 урона, вес 1; Прилив 1
    quiet(combat);
    const enemy = combat.enemies[0];
    const hp = enemy.hp;
    placeCard(combat, uidAt(combat), 0, enemy.instanceId, { prepare: true });
    expect(combat.prepared[0].due).toBe(1);
    launch(combat);
    expect(enemy.hp).toBe(hp - 7);
  });
  it("на подготовке не больше 4 веса", () => {
    const combat = fight({ heroId: "mage", deck: deckOf("m_spark") });
    for (let i = 0; i < 4; i++) expect(placeCard(combat, uidAt(combat), 0, firstEnemy(combat), { prepare: true }).ok).toBe(true);
    expect(placeCard(combat, uidAt(combat), 0, firstEnemy(combat), { prepare: true })).toEqual({ ok: false, reason: "noPrepCapacity" });
  });
  it("Оглушение Мага срывает ближайшее подготовленное заклинание, оно уходит в сброс", () => {
    const combat = fight({ heroId: "mage", deck: deckOf("m_spark") });
    quiet(combat);
    const enemy = combat.enemies[0];
    const hp = enemy.hp;
    placeCard(combat, uidAt(combat), 0, enemy.instanceId, { prepare: true });
    placeCard(combat, uidAt(combat), 2, enemy.instanceId);
    combat.hero.statuses.stun = 1;
    launch(combat);
    expect(enemy.hp).toBe(hp - 5); // сорвалось подготовленное, карта на дорожке сработала
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

describe("пауза посреди розыгрыша", () => {
  it("карта пришла во время розыгрыша — пауза, её можно доложить дальше по шкале", () => {
    const combat = createCombat({
      heroId: "warrior", enemyIds: ["skeleton", "skeleton"], seed: 1, deck: deckOf("strike"), relics: ["memorial_candle"],
    }); // когда враг умирает — взять карту
    quiet(combat);
    combat.enemies[0].hp = 1;
    placeCard(combat, uidAt(combat), 1, firstEnemy(combat));
    launch(combat);
    expect(combat.status).toBe("planning");
    expect(combat.clock).toBe(1);
    expect(placeCard(combat, uidAt(combat), 1, combat.enemies[1].instanceId)).toEqual({ ok: false, reason: "pastCell" });
    expect(placeCard(combat, uidAt(combat), 2, combat.enemies[1].instanceId).ok).toBe(true);
    const turn = combat.turn;
    launch(combat);
    expect(combat.turn).toBe(turn + 1);
  });
});
