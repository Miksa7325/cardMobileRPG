// Карты Воина: «танк в доспехах». 54 карты (этап 7): 4 стартовых вида, 16 обычных, 14 необычных, 10 редких,
// 7 эпических, 3 легендарных. Три темы: Молот (Сокрушение и тяжёлые удары), Щит (блок и Починка), Ярость.
// Таблица колоды с ценой каждой карты по таблице баланса — в docs/cards/warrior.md.
// Вес карты — число после редкости: сколько клеток шкалы она занимает.
// Отдельных улучшенных версий нет: каждая ступень улучшения даёт +20% к числам (engine/deck.ts).
import { block, burn, card, chained, damage, draw, energy, gainResource, grow, heal, hits, loseHp, repair, selfStatus, spend, status, sunder } from "./cardHelpers.ts";
import type { CardData, Effect, HeroRules, Power } from "../types.ts";

const sunderAll = (amount: number): Effect => ({ ...sunder(amount), target: "allEnemies" });
const rage = (amount: number) => gainResource("rage", amount);
const tactStart = (effects: Effect[]): Power => ({ trigger: "onTactStart", effects });

// Сила: эффекты при розыгрыше, постоянный эффект (power) и правило боя (rules) — что есть
function power(
  id: string, name: string, rarity: CardData["rarity"], cost: number, description: string, effects: Effect[], extra: { power?: Power; rules?: HeroRules } = {},
): CardData {
  return { ...card(id, name, "power", rarity, cost, "self", description, effects), ...extra };
}

export const WARRIOR_CARDS: CardData[] = [
  // ---------- Стартовые: колода 4 + 4 + 1 + 1 ----------
  card("strike", "Удар", "attack", "starter", 1, "enemy", "Нанести {damage} урона.", [damage(6)]),
  card("defend", "Защита", "skill", "starter", 1, "self", "Получить {block} блока.", [block(5)]),
  card("patch", "Залатать", "skill", "starter", 1, "self", "Получить {block} блока. Починка {repair}.", [block(3), repair(2)]),
  card("bash", "Пролом", "attack", "starter", 2, "enemy", "Сокрушение {sunder}. Нанести {damage} урона.", [sunder(2), damage(8)]),

  // ---------- Обычные ----------
  // Молот
  card("heavy_swing", "Тяжёлый замах", "attack", "common", 2, "enemy", "Нанести {damage} урона.", [damage(17)]),
  card("seam_strike", "Удар по шву", "attack", "common", 1, "enemy", "Сокрушение {sunder}. Нанести {damage} урона.", [sunder(1), damage(5)]),
  chained(card("crushing_blow", "Дробящий удар", "attack", "common", 2, "enemy", "Нанести {damage} урона. Финал: ещё {damage} урона.", [damage(12)]), "final", [damage(9)]),
  card("ram", "Таран", "attack", "common", 3, "enemy", "Сокрушение {sunder}. Нанести {damage} урона.", [sunder(2), damage(21)]),
  card("wide_swing", "Размах", "attack", "common", 2, "allEnemies", "Нанести {damage} урона всем врагам.", [damage(11)]),
  // Щит
  card("deaf_guard", "Глухая оборона", "skill", "common", 2, "self", "Получить {block} блока.", [block(14)]),
  card("rivets", "Подбить клёпки", "skill", "common", 1, "self", "Получить {block} блока. Починка {repair}.", [block(4), repair(3)]),
  card("shield_bash", "Удар щитом", "attack", "common", 1, "enemy", "Нанести {damage} урона. Получить {block} блока.", [damage(4), block(3)]),
  chained(card("stance", "Стойка", "skill", "common", 1, "self", "Получить {block} блока. После навыка: ещё {block} блока.", [block(5)]), "afterSkill", [block(3)]),
  card("rebuff", "Отпор", "attack", "common", 2, "enemy", "Нанести {damage} урона. Получить {block} блока.", [damage(8), block(7)]),
  // Ярость
  card("furious_lunge", "Яростный выпад", "attack", "common", 1, "enemy", "Нанести {damage} урона: +1 за каждую Ярость.", [grow(damage(5), "rage", 1)]),
  card("battle_cry", "Боевой клич", "skill", "common", 1, "self", "Получить {rage} Ярости и {block} блока.", [rage(3), block(3)]),
  card("twin_strike", "Двойной удар", "attack", "common", 1, "enemy", "Нанести {damage} урона дважды.", hits(4, 2)),
  card("through_pain", "Через боль", "attack", "common", 1, "enemy", "Потерять {loseHp} HP. Нанести {damage} урона. Получить {rage} Ярости.", [loseHp(2), damage(8), rage(2)]),
  // Общие
  card("dirty_trick", "Грязный приём", "skill", "common", 0, "enemy", "Наложить {weak} Слабости. Сжечь.", [status("weak", 2), burn]),
  card("second_wind", "Второе дыхание", "skill", "common", 1, "self", "Получить {block} блока. Взять {draw} карту.", [block(4), draw(1)]),

  // ---------- Необычные ----------
  // Молот
  card("armor_split", "Раскол брони", "attack", "uncommon", 2, "enemy", "Сокрушение {sunder}. Нанести {damage} урона.", [sunder(3), damage(13)]),
  card("earthquake", "Землетряс", "attack", "uncommon", 3, "allEnemies", "Сокрушение {sunder} всем. Нанести {damage} урона всем врагам.", [sunderAll(1), damage(19)]),
  chained(card("justice_hammer", "Молот правосудия", "attack", "uncommon", 2, "enemy", "Нанести {damage} урона. Финал: ещё {damage} урона.", [damage(14)]), "final", [damage(14)]),
  power("heavy_hand", "Тяжёлая рука", "uncommon", 1, "Получить {strength} Силы.", [selfStatus("strength", 2)]),
  // Щит
  card("iron_wall", "Железная стена", "skill", "uncommon", 2, "self", "Получить {block} блока. Починка {repair}.", [block(13), repair(5)]),
  chained(card("counterattack", "Контрудар", "attack", "uncommon", 2, "enemy", "Нанести {damage} урона. Получить {block} блока. После навыка: ещё {damage} урона.",
    [damage(9), block(6)]), "afterSkill", [damage(8)]),
  card("fortress", "Крепость", "skill", "uncommon", 3, "self", "Получить {block} блока. Починка {repair}.", [block(24), repair(4)]),
  power("forged_armor", "Кованый доспех", "uncommon", 2, "Починка {repair}. В конце такта: Починка {repair} и {block} блока.", [repair(2)],
    { power: { trigger: "onTactEnd", effects: [repair(1), block(2)] } }),
  // Ярость
  card("rage_flash", "Вспышка гнева", "attack", "uncommon", 1, "enemy", "Нанести {damage} урона. Ярость 3: ещё {damage} урона.", [damage(4), spend("rage", 3, [damage(12)])]),
  card("blood_rush", "Кровавый порыв", "attack", "uncommon", 1, "enemy", "Потерять {loseHp} HP. Нанести {damage} урона. Получить {rage} Ярости.", [loseHp(3), damage(10), rage(3)]),
  card("run_up", "Разгон", "skill", "uncommon", 1, "self", "Получить {rage} Ярости и {haste} Ускорение. Взять {draw} карту. Сжечь.", [rage(4), energy(1), draw(1), burn]),
  chained(card("frenzy", "Неистовство", "attack", "uncommon", 2, "enemy", "Нанести {damage} урона трижды. После атаки: ещё удар на {damage}.", hits(6, 3)), "afterAttack", [damage(6)]),
  // Общие
  card("intimidate", "Устрашение", "skill", "uncommon", 1, "allEnemies", "Наложить {weak} Слабости всем врагам. Получить {block} блока.", [status("weak", 2), block(4)]),
  card("dash", "Рывок", "skill", "uncommon", 1, "self", "Получить {haste} Ускорения и {block} блока.", [energy(2), block(2)]),

  // ---------- Редкие ----------
  // Молот. У Обезглавить два бонуса цепочки: в начале цепочки сильнее ломает броню, в конце — добивает
  chained(chained(card("decapitate", "Обезглавить", "attack", "rare", 2, "enemy", "Сокрушение {sunder}. Нанести {damage} урона. Первая: ещё Сокрушение {sunder}. Финал: ещё {damage} урона.",
    [sunder(2), damage(16)]), "first", [sunder(1)]), "final", [damage(6)]),
  card("crusher", "Сокрушитель", "attack", "rare", 3, "enemy", "Сокрушение {sunder}. Нанести {damage} урона.", [sunder(4), damage(30)]),
  card("thunder", "Гром", "attack", "rare", 2, "allEnemies", "Сокрушение {sunder} всем. Нанести {damage} урона всем врагам.", [sunderAll(2), damage(12)]),
  // Щит
  card("last_stand", "Последний рубеж", "skill", "rare", 2, "self", "Получить {block} блока. Починка {repair}. Сжечь.", [block(25), repair(3), burn]),
  chained(card("riposte", "Ответный удар", "attack", "rare", 1, "enemy", "Нанести {damage} урона. Получить {block} блока. После навыка: ещё {damage} урона.",
    [damage(6), block(4)]), "afterSkill", [damage(3)]),
  chained(card("shield_bearer", "Щитоносец", "attack", "rare", 2, "enemy", "Нанести {damage} урона. Получить {block} блока. После навыка: ещё {block} блока.",
    [damage(10), block(10)]), "afterSkill", [block(6)]),
  // Ярость
  card("execution", "Казнь", "attack", "rare", 3, "enemy", "Нанести {damage} урона: +3 за каждую Ярость.", [grow(damage(12), "rage", 3)]),
  card("berserk_roar", "Рёв берсерка", "attack", "rare", 1, "allEnemies", "Ярость 5: нанести {damage} урона всем врагам.", [spend("rage", 5, [damage(14)])]),
  power("rage", "Нарастающий гнев", "rare", 2, "В начале такта: +{strength} Сила.", [], { power: tactStart([selfStatus("strength", 1)]) }),
  // Общие
  card("adrenal_rush", "Всплеск", "skill", "rare", 0, "self", "Получить {haste} Ускорение и {rage} Ярость. Сжечь.", [energy(1), rage(1), burn]),

  // ---------- Эпические ----------
  // Молот
  power("armor_expert", "Знаток брони", "epic", 2, "Сокрушение {sunder} всем врагам. В начале такта: Сокрушение {sunder} всем.", [sunderAll(2)], { power: tactStart([sunderAll(1)]) }),
  chained(card("titan_hammer", "Молот титана", "attack", "epic", 4, "enemy", "Сокрушение {sunder}. Нанести {damage} урона. Финал: ещё {damage} урона.", [sunder(3), damage(48)]), "final", [damage(18)]),
  // Щит
  card("unbreakable", "Несокрушимый", "skill", "epic", 3, "self", "Получить {block} блока. Починка {repair}.", [block(30), repair(10)]),
  power("living_fortress", "Живая крепость", "epic", 2, "В начале такта: {block} блока и Починка {repair}.", [], { power: tactStart([block(4), repair(1)]) }),
  // Ярость
  power("berserker", "Берсерк", "epic", 1, "Потерять {loseHp} HP. Получить {strength} Силы.", [loseHp(4), selfStatus("strength", 4)]),
  card("blood_harvest", "Кровавая жатва", "attack", "epic", 2, "allEnemies", "Нанести {damage} урона всем врагам. Вылечить {heal} HP.", [damage(12), heal(6)]),
  // Общие
  power("war_experience", "Военный опыт", "epic", 1, "В начале такта: взять {draw} карту.", [], { power: tactStart([draw(1)]) }),

  // ---------- Легендарные: у каждой — эффект-правило, в колоде не больше одной копии ----------
  // Молот: Уязвимость удваивается до урона этой же карты
  card("destroyer", "Разрушитель", "attack", "legendary", 3, "enemy", "Сокрушение {sunder}. Удвоить Уязвимость цели. Нанести {damage} урона.",
    [sunder(2), { type: "multiplyStatus", status: "vulnerable", factor: 2 }, damage(36)]),
  // Щит: блок Воина больше не исчезает со временем
  power("bastion", "Бастион", "legendary", 2, "Блок больше не исчезает со временем. Получить {block} блока.", [block(8)], { rules: { eternalBlock: true } }),
  // Ярость: потолок 20 вместо 10 и вторая Ярость за каждую атаку
  power("war_avatar", "Аватар войны", "legendary", 2, "Потолок Ярости — 20, каждая атака даёт на 1 Ярость больше. Получить {strength} Силы.", [selfStatus("strength", 3)],
    { rules: { caps: { rage: 20 } }, power: { trigger: "onCardPlayed", cardType: "attack", effects: [rage(1)] } }),
];
