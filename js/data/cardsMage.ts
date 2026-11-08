// Карты Мага: готовит сильные заклинания заранее (дорожка подготовки: +50%, готовятся очередью 2 × вес клеток, пустые клетки шкалы ускоряют). Лёд — Замедление, огонь — Горение, молния — Сокрушение, время — Оглушение.
// Чародейские карты растут от Прилива. Таблица «было → стало» — в docs/cards/mage.md.
// Как каждая карта выглядит на поле боя — в ui/vfx.js
import {
  allStatus, block, burn, card, chained, damage, draw, gainResource, grow, hits, multiplyStatus, repair, selfStatus, status, sunder, triggerPower,
} from "./cardHelpers.ts";
import type { CardData } from "../types.ts";

const slow = (amount: number) => status("slow", amount);
const slowAll = (amount: number) => allStatus("slow", amount);
const burning = (amount: number) => status("burning", amount);

export const MAGE_CARDS: CardData[] = [
  // ---------- Стартовые ----------
  card("m_spark", "Искра", "attack", "starter", 1, "enemy", "Нанести {damage} урона.", [damage(5)], { effects: [damage(8)] }),
  card("m_barrier", "Барьер", "skill", "starter", 1, "self", "Получить {block} блока.", [block(5)],
    { effects: [block(8), repair(1)], description: "Получить {block} блока. Починка {repair}." }),
  card("m_frostbolt", "Ледяная стрела", "attack", "starter", 2, "enemy", "Нанести {damage} урона. Наложить {slow} Замедления.", [damage(10), slow(1)], { effects: [damage(13), slow(2)] }),
  card("m_arcane_blast", "Чародейский взрыв", "attack", "starter", 1, "enemy", "Нанести {damage} урона: +2 за каждый Прилив.", [grow(damage(4), "surge", 2)],
    { effects: [grow(damage(6), "surge", 3)], description: "Нанести {damage} урона: +3 за каждый Прилив." }),
  card("m_rune_ward", "Руна защиты", "skill", "starter", 1, "self", "Получить {block} блока. Починка {repair}.", [block(4), repair(2)], { effects: [block(6), repair(3)] }),

  // ---------- Обычные ----------
  chained(card("m_fireball", "Огненный шар", "attack", "common", 2, "enemy", "Нанести {damage} урона. Финал: ещё {damage} урона.",
    [damage(14)], { effects: [damage(19)] }), "final", [damage(6)], [damage(8)]),
  card("m_flame_wave", "Огненная волна", "attack", "common", 1, "allEnemies", "Нанести {damage} урона всем врагам.", [damage(8)], { effects: [damage(11)] }),
  card("m_lightning", "Молния", "attack", "common", 1, "enemy", "Нанести {damage} урона.", [damage(8)], { effects: [damage(11)] }),
  card("m_ice_armor", "Ледяная броня", "skill", "common", 2, "self", "Получить {block} блока. Починка {repair}.", [block(12), repair(2)], { effects: [block(16), repair(3)] }),
  card("m_missiles", "Чародейские стрелы", "attack", "common", 1, "enemy", "Нанести {damage} урона трижды.", hits(4, 3), { effects: hits(5, 3) }),
  card("m_frost_nova", "Кольцо льда", "skill", "common", 2, "allEnemies", "Наложить {slow} Замедление всем врагам. Получить {block} блока.",
    [slowAll(1), block(6)], { effects: [slowAll(2), block(8)], description: "Наложить {slow} Замедления всем врагам. Получить {block} блока." }),
  card("m_static", "Статический разряд", "attack", "common", 1, "allEnemies", "Сокрушение {sunder} всем. Нанести {damage} урона всем врагам.",
    [{ ...sunder(1), target: "allEnemies" }, damage(4)], { effects: [{ ...sunder(2), target: "allEnemies" }, damage(6)] }),
  card("m_ignite", "Поджог", "skill", "common", 1, "enemy", "Наложить {burning} Горения.", [burning(6)], { effects: [burning(9)] }),
  card("m_ice_shards", "Ледяные осколки", "attack", "common", 1, "enemy", "Нанести {damage} урона дважды. Наложить {slow} Замедление.",
    [...hits(3, 2), slow(1)], { effects: [...hits(4, 2), slow(2)], description: "Нанести {damage} урона дважды. Наложить {slow} Замедления." }),
  card("m_scorch", "Опаление", "attack", "common", 1, "enemy", "Нанести {damage} урона. Наложить {burning} Горения.", [damage(5), burning(3)], { effects: [damage(7), burning(4)] }),
  card("m_arcane_veil", "Чародейский покров", "skill", "common", 1, "self", "Получить {block} блока. Взять {draw} карту.", [block(5), draw(1)], { effects: [block(8), draw(1)] }),
  card("m_spark_rain", "Дождь искр", "attack", "common", 2, "allEnemies", "Нанести {damage} урона всем врагам трижды.", hits(3, 3), { effects: hits(4, 3) }),
  card("m_mana_shield", "Щит маны", "skill", "common", 1, "self", "Получить {block} блока: +2 за каждый Прилив.", [grow(block(4), "surge", 2)],
    { effects: [grow(block(6), "surge", 3)], description: "Получить {block} блока: +3 за каждый Прилив." }),
  chained(card("m_frost_ray", "Луч холода", "attack", "common", 1, "enemy", "Нанести {damage} урона. Наложить {slow} Замедление. Первая: ещё {slow} Замедление.",
    [damage(4), slow(1)], { effects: [damage(6), slow(1)] }), "first", [slow(1)]),
  card("m_ember", "Уголёк", "attack", "common", 1, "enemy", "Нанести {damage} урона. Наложить {burning} Горения.", [damage(5), burning(2)], { effects: [damage(6), burning(3)] }),
  card("m_shock", "Удар током", "attack", "common", 1, "enemy", "Сокрушение {sunder}. Нанести {damage} урона.", [sunder(1), damage(6)], { effects: [sunder(1), damage(8)] }),
  card("m_frost_shell", "Ледяной панцирь", "skill", "common", 1, "self", "Получить {block} блока. Починка {repair}.", [block(6), repair(1)], { effects: [block(8), repair(2)] }),
  card("m_channel", "Сосредоточить поток", "skill", "common", 1, "self", "Получить {surge} Прилив. Взять {draw} карту.", [gainResource("surge", 1), draw(1)],
    { effects: [gainResource("surge", 1), draw(2)], description: "Получить {surge} Прилив. Взять {draw} карты." }),
  chained(card("m_arcane_bolt", "Чародейский снаряд", "attack", "common", 2, "enemy", "Нанести {damage} урона: +2 за каждый Прилив. Финал: ещё {damage} урона.",
    [grow(damage(6), "surge", 2)], { effects: [grow(damage(9), "surge", 2)] }), "final", [damage(6)], [damage(8)]),
  card("m_frost_wall", "Морозная стена", "skill", "common", 2, "self", "Получить {block} блока. Наложить {slow} Замедление всем врагам.", [block(10), slowAll(1)], { effects: [block(14), slowAll(1)] }),
  card("m_kindle", "Разжечь", "skill", "common", 1, "enemy", "Удвоить Горение врага. Сжечь.", [multiplyStatus("burning", 2), burn], { cost: 0 }),
  chained(card("m_spark_chain", "Искровая цепь", "attack", "common", 1, "enemy", "Нанести {damage} урона. После атаки: ещё {damage} урона.",
    [damage(3)], { effects: [damage(4)] }), "afterAttack", [damage(5)], [damage(6)]),
  chained(card("m_mirror", "Зеркальный щит", "skill", "common", 1, "self", "Получить {block} блока. После атаки: ещё {block} блока.",
    [block(4)], { effects: [block(6)] }), "afterAttack", [block(4)], [block(5)]),
  card("m_heat", "Жар", "skill", "common", 1, "allEnemies", "Наложить {burning} Горения всем врагам.", [allStatus("burning", 3)], { effects: [allStatus("burning", 4)] }),

  // ---------- Необычные ----------
  card("m_blizzard", "Снежная буря", "attack", "uncommon", 2, "allEnemies", "Нанести {damage} урона всем врагам дважды. Наложить {slow} Замедление всем.",
    [...hits(5, 2), slowAll(1)], { effects: [...hits(7, 2), slowAll(2)], description: "Нанести {damage} урона всем врагам дважды. Наложить {slow} Замедления всем." }),
  card("m_chain_lightning", "Цепная молния", "attack", "uncommon", 2, "allEnemies", "Нанести {damage} урона всем врагам.", [damage(12)], { effects: [damage(16)] }),
  chained(card("m_meteor", "Метеор", "attack", "uncommon", 4, "enemy", "Нанести {damage} урона. Финал: ещё {damage} урона.",
    [damage(30)], { effects: [damage(40)] }), "final", [damage(10)], [damage(12)]),
  card("m_surge", "Поток силы", "attack", "uncommon", 3, "enemy", "Нанести {damage} урона: +4 за каждый Прилив.", [grow(damage(6), "surge", 4)],
    { effects: [grow(damage(8), "surge", 5)], description: "Нанести {damage} урона: +5 за каждый Прилив." }),
  card("m_overload", "Перегрузка", "power", "uncommon", 2, "self", "В начале такта ещё +{surge} Прилив.", [], { cost: 1 },
    { trigger: "onTactStart", effects: [gainResource("surge", 1)] }),
  triggerPower("m_frost_aura", "Иней", "uncommon", 1, "В конце такта {block} блока.", "onTactEnd", [block(2)], [block(3)]),
  card("m_focus", "Медитация", "skill", "uncommon", 0, "self", "Взять {draw} карты. Сжечь.", [draw(2), burn], { effects: [draw(3), burn] }),
  card("m_thunderclap", "Раскат грома", "attack", "uncommon", 2, "allEnemies", "Сокрушение {sunder} всем. Нанести {damage} урона всем врагам.",
    [{ ...sunder(1), target: "allEnemies" }, damage(7)], { effects: [{ ...sunder(2), target: "allEnemies" }, damage(9)] }),
  card("m_mana_tap", "Исток маны", "skill", "uncommon", 1, "self", "Получить {surge} Прилив. Сжечь.", [gainResource("surge", 1), burn], { cost: 0 }),
  triggerPower("m_spell_echo", "Эхо заклинаний", "uncommon", 1, "Каждая атака: {block} блока.", "onCardPlayed", [block(2)], [block(3)], "attack"),
  chained(card("m_frozen_spike", "Ледяной шип", "attack", "uncommon", 3, "enemy", "Нанести {damage} урона. Наложить {slow} Замедления. Финал: ещё {damage} урона.",
    [damage(18), slow(2)], { effects: [damage(24), slow(2)] }), "final", [damage(8)], [damage(10)]),
  card("m_split", "Расщепление", "attack", "uncommon", 2, "enemy", "Сокрушение {sunder}. Нанести {damage} урона.", [sunder(2), damage(10)], { effects: [sunder(3), damage(13)] }),
  card("m_firewall", "Огненная стена", "skill", "uncommon", 2, "self", "Получить {block} блока. Наложить {burning} Горения всем врагам.",
    [block(8), allStatus("burning", 3)], { effects: [block(11), allStatus("burning", 4)] }),
  card("m_time_skip", "Скачок времени", "skill", "uncommon", 1, "self", "Получить {haste} Ускорения. Взять {draw} карту.", [selfStatus("haste", 2), draw(1)], { effects: [selfStatus("haste", 3), draw(1)] }),
  card("m_ice_prison", "Ледяная тюрьма", "skill", "uncommon", 2, "enemy", "Наложить {slow} Замедления. Сжечь.", [slow(3), burn], { effects: [slow(4), burn] }),

  // ---------- Редкие ----------
  card("m_pyroblast", "Пиробласт", "attack", "rare", 3, "enemy", "Нанести {damage} урона. Наложить {burning} Горения.", [damage(22), burning(5)], { effects: [damage(28), burning(7)] }),
  card("m_clear_mind", "Ясный разум", "power", "rare", 2, "self", "В начале такта взять {draw} карту.", [], { cost: 1 }, { trigger: "onTactStart", effects: [draw(1)] }),
  card("m_absolute_zero", "Абсолютный ноль", "skill", "rare", 2, "allEnemies", "Наложить {slow} Замедления всем врагам. Получить {block} блока. Сжечь.",
    [slowAll(2), block(14), burn], { effects: [slowAll(2), block(18), burn] }),
  card("m_inferno", "Инферно", "attack", "rare", 4, "allEnemies", "Нанести {damage} урона всем врагам.", [damage(22)], { effects: [damage(30)] }),
  card("m_starfall", "Звездопад", "attack", "rare", 4, "allEnemies", "Нанести {damage} урона всем врагам 4 раза.", hits(5, 4), { effects: hits(7, 4) }),
  card("m_archmage", "Архимаг", "power", "rare", 3, "self", "Получить {strength} Силы.", [selfStatus("strength", 6)], { cost: 2 }),
  card("m_mana_storm", "Буря маны", "attack", "rare", 4, "allEnemies", "Нанести {damage} урона всем врагам: +3 за каждый Прилив.", [grow(damage(4), "surge", 3)],
    { effects: [grow(damage(6), "surge", 4)], description: "Нанести {damage} урона всем врагам: +4 за каждый Прилив." }),
  card("m_time_warp", "Остановка времени", "skill", "rare", 3, "allEnemies", "Наложить Оглушение всем врагам: их следующее действие сорвётся. Сжечь.",
    [allStatus("stun", 1), burn], { cost: 2 }),
];
