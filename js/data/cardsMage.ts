// Карты Мага: «подготовка заклинаний». 54 карты (этап 7): 4 стартовых вида, 16 обычных, 14 необычных, 10 редких,
// 7 эпических, 3 легендарных. Три темы: Огонь (урон, Горение, тяжёлые заклинания с «Финалом»), Лёд и время
// (Замедление, Оглушение, блок), Чары (карты от Прилива, молнии с Сокрушением). Таблица колоды — в docs/cards/mage.md.
// Любую карту можно поставить на подготовку: она срабатывает на 50% сильнее (свойство класса, в цену карт не входит).
// Прилив: +1 в начале такта, потолок 6. Отдельных улучшенных версий нет: ступень улучшения — +20% к числам.
import {
  allStatus, block, burn, card, chained, damage, draw, energy, gainResource, grow, hits, repair, selfStatus, status, sunder,
} from "./cardHelpers.ts";
import type { CardData, Effect, HeroRules, Power } from "../types.ts";

const burning = (amount: number) => status("burning", amount);
const slow = (amount: number) => status("slow", amount);
const stun = status("stun", 1);
const surge = (amount: number) => gainResource("surge", amount);
const sunderAll = (amount: number): Effect => ({ ...sunder(amount), target: "allEnemies" });
const tactStart = (effects: Effect[]): Power => ({ trigger: "onTactStart", effects });

// Сила: эффекты при розыгрыше, постоянный эффект (power) и правило боя (rules) — что есть
function power(
  id: string, name: string, rarity: CardData["rarity"], cost: number, description: string, effects: Effect[], extra: { power?: Power; rules?: HeroRules } = {},
): CardData {
  return { ...card(id, name, "power", rarity, cost, "self", description, effects), ...extra };
}

export const MAGE_CARDS: CardData[] = [
  // ---------- Стартовые: колода 4 + 4 + 1 + 1 ----------
  card("m_spark", "Искра", "attack", "starter", 1, "enemy", "Нанести {damage} урона.", [damage(6)]),
  card("m_barrier", "Барьер", "skill", "starter", 1, "self", "Получить {block} блока.", [block(5)]),
  card("m_rune_ward", "Руна защиты", "skill", "starter", 1, "self", "Получить {block} блока. Починка {repair}.", [block(3), repair(2)]),
  card("m_arcane_blast", "Чародейский залп", "attack", "starter", 2, "enemy", "Нанести {damage} урона: +2 за каждый Прилив.", [grow(damage(8), "surge", 2)]),

  // ---------- Обычные ----------
  // Огонь
  chained(card("m_fireball", "Огненный шар", "attack", "common", 2, "enemy", "Нанести {damage} урона. Финал: ещё {damage} урона.", [damage(13)]), "final", [damage(8)]),
  card("m_scorch", "Опаление", "attack", "common", 1, "enemy", "Нанести {damage} урона. Наложить {burning} Горения.", [damage(5), burning(2)]),
  card("m_ignite", "Поджог", "skill", "common", 1, "enemy", "Наложить {burning} Горения.", [burning(5)]),
  card("m_flame_wave", "Волна пламени", "attack", "common", 2, "allEnemies", "Нанести {damage} урона всем врагам. Наложить {burning} Горения всем.", [damage(7), burning(3)]),
  card("m_fire_pillar", "Огненный столб", "attack", "common", 3, "enemy", "Нанести {damage} урона.", [damage(26)]),
  // Лёд и время
  card("m_frostbolt", "Ледяная стрела", "attack", "common", 1, "enemy", "Нанести {damage} урона. Наложить {slow} Замедление.", [damage(5), slow(1)]),
  card("m_ice_armor", "Ледяная броня", "skill", "common", 2, "self", "Получить {block} блока. Починка {repair}.", [block(12), repair(2)]),
  card("m_frost_wall", "Морозный щит", "skill", "common", 1, "enemy", "Получить {block} блока. Наложить {slow} Замедление.", [block(4), slow(1)]),
  card("m_ice_shards", "Ледяные осколки", "attack", "common", 2, "allEnemies", "Нанести {damage} урона всем врагам. Наложить {slow} Замедление всем.", [damage(8), slow(1)]),
  chained(card("m_frost_ray", "Стужа", "skill", "common", 1, "enemy", "Наложить {slow} Замедления. Первая: ещё {weak} Слабости.", [slow(2)]), "first", [status("weak", 2)]),
  // Чары
  card("m_missiles", "Чародейская стрела", "attack", "common", 1, "enemy", "Нанести {damage} урона: +1 за каждый Прилив.", [grow(damage(5), "surge", 1)]),
  card("m_shock", "Разряд", "attack", "common", 1, "enemy", "Сокрушение {sunder}. Нанести {damage} урона.", [sunder(1), damage(5)]),
  card("m_focus", "Сосредоточение", "skill", "common", 1, "self", "Получить {surge} Прилива и {block} блока. Взять {draw} карту.", [surge(2), block(2), draw(1)]),
  card("m_mana_shield", "Чародейский щит", "skill", "common", 1, "self", "Получить {block} блока: +1 за каждый Прилив.", [grow(block(4), "surge", 1)]),
  // Общие
  card("m_blink", "Мерцание", "skill", "common", 0, "self", "Получить {haste} Ускорение. Сжечь.", [energy(1), burn]),
  card("m_insight", "Прозрение", "skill", "common", 1, "self", "Взять {draw} карты. Получить {surge} Прилив.", [draw(2), surge(1)]),

  // ---------- Необычные ----------
  // Огонь
  chained(card("m_meteor", "Метеор", "attack", "uncommon", 4, "enemy", "Нанести {damage} урона. Финал: ещё {damage} урона.", [damage(36)]), "final", [damage(20)]),
  card("m_wildfire", "Пожар", "skill", "uncommon", 2, "allEnemies", "Наложить {burning} Горения всем врагам.", [burning(9)]),
  chained(card("m_ember", "Огненная плеть", "attack", "uncommon", 1, "enemy", "Нанести {damage} урона. Наложить {burning} Горения. После атаки: ещё {burning} Горения.",
    [damage(6), burning(2)]), "afterAttack", [burning(2)]),
  power("m_heat", "Жар", "uncommon", 2, "Наложить {burning} Горения всем врагам. В начале такта: {burning} Горение всем.", [allStatus("burning", 4)],
    { power: tactStart([allStatus("burning", 1)]) }),
  // Лёд и время
  card("m_frost_nova", "Кольцо льда", "skill", "uncommon", 2, "allEnemies", "Наложить {slow} Замедления всем врагам. Получить {block} блока.", [slow(2), block(10)]),
  chained(card("m_frozen_spike", "Ледяной шип", "attack", "uncommon", 3, "enemy", "Нанести {damage} урона. Наложить {slow} Замедления. Финал: ещё {damage} урона.",
    [damage(18), slow(2)]), "final", [damage(18)]),
  card("m_frost_shell", "Ледяной панцирь", "skill", "uncommon", 2, "self", "Получить {block} блока. Починка {repair}.", [block(13), repair(5)]),
  card("m_freeze", "Заморозка", "skill", "uncommon", 2, "enemy", "Оглушение: следующее действие врага сорвётся. Получить {block} блока.", [stun, block(5)]),
  // Чары
  card("m_chain_lightning", "Цепная молния", "attack", "uncommon", 2, "allEnemies", "Сокрушение {sunder} всем. Нанести {damage} урона всем врагам.", [sunderAll(1), damage(11)]),
  card("m_arcane_bolt", "Чародейский взрыв", "attack", "uncommon", 2, "enemy", "Нанести {damage} урона: +4 за каждый Прилив.", [grow(damage(9), "surge", 4)]),
  card("m_overload", "Перегрузка", "skill", "uncommon", 0, "self", "Получить {surge} Прилива. Сжечь.", [surge(3), burn]),
  power("m_surge", "Приливная волна", "uncommon", 2, "Взять {draw} карты. Получить {block} блока. В начале такта: ещё +{surge} Прилив.", [draw(2), block(6)],
    { power: tactStart([surge(1)]) }),
  // Общие
  chained(card("m_mirror", "Зеркальный щит", "skill", "uncommon", 1, "self", "Получить {block} блока. Починка {repair}. После атаки: ещё {block} блока.",
    [block(5), repair(1)]), "afterAttack", [block(4)]),
  card("m_time_skip", "Скачок", "skill", "uncommon", 1, "self", "Получить {haste} Ускорения и {surge} Прилив.", [energy(2), surge(1)]),

  // ---------- Редкие ----------
  // Огонь. У Пиробласта два бонуса цепочки: поджечь в начале или закрыть цепочку взрывом
  chained(chained(card("m_pyroblast", "Пиробласт", "attack", "rare", 3, "enemy", "Нанести {damage} урона. Наложить {burning} Горения. Первая: ещё {burning} Горения. Финал: ещё {damage} урона.",
    [damage(24), burning(6)]), "first", [burning(3)]), "final", [damage(8)]),
  card("m_inferno", "Инферно", "attack", "rare", 4, "allEnemies", "Нанести {damage} урона всем врагам. Наложить {burning} Горения всем.", [damage(26), burning(7)]),
  card("m_incinerate", "Испепеление", "attack", "rare", 2, "enemy", "Нанести {damage} урона. Наложить {burning} Горения. Сжечь.", [damage(22), burning(7), burn]),
  // Лёд и время
  card("m_blizzard", "Снежная буря", "attack", "rare", 3, "allEnemies", "Нанести {damage} урона всем врагам. Наложить {slow} Замедления всем. Получить {block} блока.",
    [damage(12), slow(2), block(10)]),
  card("m_ice_prison", "Ледяная тюрьма", "skill", "rare", 2, "enemy", "Оглушение. Наложить {slow} Замедления. Получить {block} блока.", [stun, slow(2), block(4)]),
  card("m_absolute_zero", "Абсолютный ноль", "skill", "rare", 2, "allEnemies", "Наложить {slow} Замедления всем врагам. Получить {block} блока. Сжечь.", [slow(3), block(16), burn]),
  // Чары
  card("m_thunderclap", "Гроза", "attack", "rare", 3, "allEnemies", "Сокрушение {sunder} всем. Нанести {damage} урона всем врагам: +2 за каждый Прилив.",
    [sunderAll(2), grow(damage(14), "surge", 2)]),
  power("m_clear_mind", "Ясный разум", "rare", 2, "Получить {surge} Прилива и {block} блока. В начале такта: взять {draw} карту.", [surge(2), block(6)], { power: tactStart([draw(1)]) }),
  card("m_spark_chain", "Чародейский поток", "attack", "rare", 1, "enemy", "Нанести {damage} урона дважды: каждый удар +1 за Прилив.", hits(3, 2).map((hit) => grow(hit, "surge", 1))),
  // Общие
  card("m_time_loop", "Петля времени", "skill", "rare", 0, "self", "Получить {haste} Ускорение и {surge} Прилив. Сжечь.", [energy(1), surge(1), burn]),

  // ---------- Эпические ----------
  // Огонь
  chained(card("m_starfall", "Огненный шторм", "attack", "epic", 4, "allEnemies", "Нанести {damage} урона всем врагам четыре раза. Финал: {burning} Горения всем.", hits(9, 4)),
    "final", [burning(8)]),
  power("m_flame_heart", "Сердце пламени", "epic", 2, "Наложить {burning} Горения всем врагам. В начале такта: {burning} Горения всем.", [allStatus("burning", 3)],
    { power: tactStart([allStatus("burning", 2)]) }),
  // Лёд и время
  card("m_time_warp", "Остановка времени", "skill", "epic", 3, "allEnemies", "Оглушение всем врагам. Наложить {slow} Замедления всем. Получить {block} блока. Взять {draw} карты. Сжечь.",
    [stun, slow(2), block(20), draw(2), burn]),
  power("m_permafrost", "Вечная мерзлота", "epic", 2, "Получить {block} блока. В начале такта: {slow} Замедление всем врагам.", [block(6)], { power: tactStart([allStatus("slow", 1)]) }),
  // Чары
  card("m_mana_storm", "Буря маны", "attack", "epic", 4, "allEnemies", "Сокрушение {sunder} всем. Нанести {damage} урона всем врагам: +6 за каждый Прилив.",
    [sunderAll(2), grow(damage(20), "surge", 6)]),
  power("m_archmage", "Архимаг", "epic", 2, "Получить {strength} Силы и {surge} Прилива. Взять {draw} карту.", [selfStatus("strength", 4), surge(3), draw(1)]),
  // Общие
  card("m_quick_thought", "Ускорение мысли", "skill", "epic", 1, "self", "Взять {draw} карты. Получить {haste} Ускорения.", [draw(2), energy(2)]),

  // ---------- Легендарные: у каждой — эффект-правило, в колоде не больше одной копии ----------
  // Огонь: Горение на врагах перестаёт убывать
  power("m_eternal_flame", "Вечное пламя", "legendary", 2, "Горение на врагах больше не убывает. Наложить {burning} Горения всем врагам.", [allStatus("burning", 4)],
    { rules: { burningStays: true } }),
  // Лёд и время: Замедление на врагах не тратится — каждое их действие на клетку тяжелее до конца боя
  power("m_time_lord", "Властелин времени", "legendary", 2, "Замедление на врагах больше не тратится. Наложить {slow} Замедление всем врагам.", [allStatus("slow", 1)],
    { rules: { slowStays: true } }),
  // Чары: подготовка усиливает вдвое, а не в полтора раза; потолок Прилива 10 вместо 6
  power("m_archmagic", "Архимагия", "legendary", 2, "Подготовленное заклинание сильнее вдвое, а не в полтора раза. Потолок Прилива — 10. Получить {surge} Прилива.", [surge(2)],
    { rules: { preparedBoost: 2, caps: { surge: 10 } } }),
];
