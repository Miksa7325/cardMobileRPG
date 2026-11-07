// Карты Убийцы: длинные цепочки лёгких карт и карт весом 0, добивание в конце. Стихии — Ускорение, Кровотечение, Яд.
// Комбо — сколько карт Убийцы уже сработало за этот ход до этой (счёт цепочки): добивания растут от него.
// Таблица «было → стало» и причины изменений — в docs/cards/assassin.md
import {
  allStatus, block, burn, card, chained, damage, draw, fixedDamageToAll, gainResource, grow, heal, hits, multiplyStatus, repair, selfStatus,
  status, sunder, triggerPower,
} from "./cardHelpers.ts";
import type { CardData } from "../types.ts";

const haste = (amount: number) => selfStatus("haste", amount);
const bleed = (amount: number) => status("bleed", amount);

// Приговор: «Цепь 5», а после улучшения — «Цепь 4»
const verdict = chained(card("a_execute", "Приговор", "attack", "rare", 1, "enemy", "Нанести {damage} урона. Цепь 5: ещё {damage} урона.",
  [damage(5)], { effects: [damage(6)], description: "Нанести {damage} урона. Цепь 4: ещё {damage} урона." }), "chain", [damage(30)], [damage(34)], 5);
verdict.upgraded!.chain = { kind: "chain", n: 4, effects: [damage(34)] };

export const ASSASSIN_CARDS: CardData[] = [
  // ---------- Стартовые ----------
  card("a_strike", "Удар кинжалом", "attack", "starter", 1, "enemy", "Нанести {damage} урона.", [damage(6)], { effects: [damage(9)] }),
  card("a_dodge", "Уклонение", "skill", "starter", 1, "self", "Получить {block} блока.", [block(5)],
    { effects: [block(8), repair(1)], description: "Получить {block} блока. Починка {repair}." }),
  card("a_dart", "Отравленный дротик", "attack", "starter", 1, "enemy", "Нанести {damage} урона. Наложить {poison} Яда.", [damage(6), status("poison", 2)], { effects: [damage(7), status("poison", 3)] }),
  card("a_finisher", "Добивание", "attack", "starter", 1, "enemy", "Добивание: {damage} урона, +3 за каждое Комбо.", [grow(damage(3), "combo", 3)], { effects: [grow(damage(5), "combo", 4)] }),
  card("a_tighten", "Подтянуть ремни", "skill", "starter", 1, "self", "Получить {block} блока. Починка {repair}.", [block(4), repair(2)], { effects: [block(6), repair(3)] }),

  // ---------- Обычные: атаки ----------
  card("a_eviscerate", "Потрошение", "attack", "common", 1, "enemy", "Добивание: наложить {poison} Яда, +1 за каждое Комбо.", [grow(status("poison", 1), "combo", 1)], { effects: [grow(status("poison", 2), "combo", 1)] }),
  card("a_stab", "Укол", "attack", "common", 1, "enemy", "Нанести {damage} урона.", [damage(7)], { effects: [damage(9)] }),
  card("a_twin_daggers", "Парные кинжалы", "attack", "common", 1, "enemy", "Нанести {damage} урона дважды.", hits(4, 2), { effects: hits(6, 2) }),
  card("a_venom_nick", "Ядовитый надрез", "attack", "common", 1, "enemy", "Нанести {damage} урона. Наложить {poison} Яда.", [damage(2), status("poison", 3)], { effects: [damage(3), status("poison", 4)] }),
  card("a_lunge", "Резкий выпад", "attack", "common", 1, "enemy", "Нанести {damage} урона.", [damage(8)], { effects: [damage(11)] }),
  chained(card("a_backstab", "Удар в спину", "attack", "common", 1, "enemy", "Нанести {damage} урона. Первая: ещё {damage} урона.",
    [damage(8)], { effects: [damage(10)] }), "first", [damage(8)], [damage(10)]),
  card("a_throwing_knives", "Метательные ножи", "attack", "common", 1, "allEnemies", "Нанести {damage} урона всем врагам.", [damage(5)], { effects: [damage(7)] }),
  card("a_bleed", "Удар под дых", "attack", "common", 1, "enemy", "Нанести {damage} урона. Наложить {bleed} Кровотечения.", [damage(5), bleed(2)], { effects: [damage(7), bleed(3)] }),
  card("a_trip", "Подсечка", "attack", "common", 1, "enemy", "Сокрушение {sunder}. Нанести {damage} урона.", [sunder(1), damage(5)], { effects: [sunder(2), damage(7)] }),
  card("a_fan_knives", "Веер ножей", "attack", "common", 2, "allEnemies", "Нанести {damage} урона всем врагам трижды.", hits(3, 3), { effects: hits(4, 3) }),
  card("a_garrote", "Удавка", "attack", "common", 1, "enemy", "Нанести {damage} урона. Наложить {bleed} Кровотечения.", [damage(4), bleed(2)], { effects: [damage(5), bleed(3)] }),
  card("a_flurry", "Град ударов", "attack", "common", 1, "enemy", "Нанести {damage} урона 4 раза.", hits(3, 4), { effects: hits(4, 4) }),
  card("a_feint", "Обманный выпад", "attack", "common", 1, "enemy", "Нанести {damage} урона. Получить {block} блока.", [damage(6), block(3)], { effects: [damage(8), block(4)] }),
  card("a_toxic_throw", "Токсичный бросок", "attack", "common", 1, "allEnemies", "Нанести {damage} урона всем. Наложить {poison} Яда всем.", [damage(2), status("poison", 1)], { effects: [damage(3), status("poison", 2)] }),
  card("poison_blade", "Отравленный клинок", "attack", "common", 1, "enemy", "Нанести {damage} урона. Наложить {poison} Яда.", [damage(3), status("poison", 2)], { effects: [damage(4), status("poison", 3)] }),
  chained(card("a_blood_flourish", "Кровавый росчерк", "attack", "common", 1, "enemy", "Нанести {damage} урона. Наложить {bleed} Кровотечения. Цепь 3: ещё {bleed} Кровотечения.",
    [damage(3), bleed(1)], { effects: [damage(4), bleed(1)] }), "chain", [bleed(2)], [bleed(3)], 3),

  // ---------- Обычные: навыки ----------
  card("a_flourish", "Росчерк", "skill", "common", 0, "self", "Получить {combo} Комбо. Сжечь.", [gainResource("combo", 2), burn], { effects: [gainResource("combo", 3), burn] }),
  chained(card("a_tempo", "Темп", "skill", "common", 1, "self", "Взять {draw} карту. Цепь 3: получить {haste} Ускорения. Сжечь.",
    [draw(1), burn], { effects: [draw(2), burn], description: "Взять {draw} карты. Цепь 3: получить {haste} Ускорения. Сжечь." }), "chain", [haste(2)], [haste(2)], 3),
  card("a_smoke", "Дымовая завеса", "skill", "common", 1, "self", "Получить {block} блока.", [block(7)], { effects: [block(10)] }),
  card("a_roll", "Перекат", "skill", "common", 1, "self", "Получить {block} блока.", [block(6)], { effects: [block(8)] }),
  card("a_prep", "Подготовка", "skill", "common", 0, "self", "Получить {haste} Ускорения: следующая карта на 1 легче. Сжечь.", [haste(1), burn],
    { effects: [haste(2), burn], description: "Получить {haste} Ускорения: следующие 2 карты на 1 легче. Сжечь." }),
  card("a_sharpen", "Заточка", "skill", "common", 1, "self", "Взять {draw} карты.", [draw(2)], { effects: [draw(3)] }),
  card("a_vial", "Склянка яда", "skill", "common", 0, "enemy", "Наложить {poison} Яда. Сжечь.", [status("poison", 2), burn], { effects: [status("poison", 3), burn] }),
  card("a_distract", "Отвлечение", "skill", "common", 0, "enemy", "Наложить {weak} Слабости. Сжечь.", [status("weak", 1), burn], { effects: [status("weak", 2), burn] }),
  card("a_toxic_fumes", "Ядовитые пары", "skill", "common", 1, "allEnemies", "Наложить {poison} Яда всем врагам.", [status("poison", 2)], { effects: [status("poison", 3)] }),
  card("a_shadow_step", "Шаг в тень", "skill", "common", 1, "self", "Получить {block} блока. Взять {draw} карту.", [block(5), draw(1)], { effects: [block(7), draw(1)] }),
  card("a_mark", "Метка", "skill", "common", 1, "enemy", "Наложить {vulnerable} Уязвимости. Взять {draw} карту.", [status("vulnerable", 2), draw(1)], { effects: [status("vulnerable", 3), draw(1)] }),
  card("a_focus", "Концентрация", "skill", "common", 1, "self", "Получить {strength} Силы. Сжечь.", [selfStatus("strength", 2), burn], { effects: [selfStatus("strength", 4), burn] }),
  card("a_balm", "Бальзам", "skill", "common", 0, "self", "Починка {repair}. Вылечить {heal} HP. Сжечь.", [repair(1), heal(2), burn], { effects: [repair(2), heal(4), burn] }),
  card("a_camouflage", "Маскировка", "skill", "common", 1, "self", "Получить {dexterity} Ловкость. Сжечь.", [selfStatus("dexterity", 1), burn], { effects: [selfStatus("dexterity", 2), burn] }),
  card("a_caltrops", "Рассыпать шипы", "skill", "common", 0, "allEnemies", "Наложить {weak} Слабости и {poison} Яда всем. Сжечь.",
    [allStatus("weak", 1), allStatus("poison", 1), burn], { effects: [allStatus("weak", 2), allStatus("poison", 1), burn] }),

  // ---------- Необычные ----------
  chained(card("a_whirl", "Вихрь клинков", "attack", "uncommon", 1, "enemy", "Нанести {damage} урона дважды. Цепь 3: ещё 3 удара по {damage}.",
    hits(3, 2), { effects: hits(4, 2) }), "chain", hits(6, 3), hits(8, 3), 3),
  triggerPower("a_chain", "Цепь ударов", "uncommon", 2, "Каждая карта считается за два звена: +{combo} Комбо.", "onCardPlayed",
    [gainResource("combo", 1)], [gainResource("combo", 2)]),
  card("a_assassinate", "Устранение", "attack", "uncommon", 2, "enemy", "Нанести {damage} урона.", [damage(18)], { effects: [damage(24)] }),
  card("a_blade_dance", "Танец клинков", "attack", "uncommon", 2, "allEnemies", "Нанести {damage} урона всем врагам дважды.", hits(5, 2), { effects: hits(7, 2) }),
  card("a_ambush", "Засада", "attack", "uncommon", 1, "enemy", "Нанести {damage} урона. Получить {haste} Ускорение.", [damage(7), haste(1)],
    { effects: [damage(10), haste(2)], description: "Нанести {damage} урона. Получить {haste} Ускорения." }),
  card("a_cheap_shot", "Подлый удар", "attack", "uncommon", 0, "enemy", "Сокрушение {sunder}. Нанести {damage} урона. Сжечь.", [sunder(1), damage(5), burn], { effects: [sunder(2), damage(7), burn] }),
  card("a_crippling", "Калечащий удар", "attack", "uncommon", 2, "enemy", "Сокрушение {sunder}. Нанести {damage} урона. Наложить {weak} Слабости.",
    [sunder(2), damage(9), status("weak", 2)], { effects: [sunder(3), damage(12), status("weak", 3)] }),
  card("a_scorpion", "Жало скорпиона", "attack", "uncommon", 2, "enemy", "Нанести {damage} урона. Наложить {poison} Яда.", [damage(6), status("poison", 5)], { effects: [damage(8), status("poison", 6)] }),
  card("a_choke", "Удушение", "attack", "uncommon", 2, "enemy", "Нанести {damage} урона. Наложить {poison} Яда и {weak} Слабости.",
    [damage(8), status("poison", 3), status("weak", 1)], { effects: [damage(10), status("poison", 4), status("weak", 2)] }),
  card("a_envenom", "Смазать ядом", "skill", "uncommon", 1, "enemy", "Наложить {poison} Яда.", [status("poison", 4)], { effects: [status("poison", 6)] }),
  card("a_double_dose", "Двойная доза", "skill", "uncommon", 1, "enemy", "Удвоить Яд врага. Сжечь.", [multiplyStatus("poison", 2), burn], { cost: 0 }),
  card("a_adrenaline", "Адреналин", "skill", "uncommon", 0, "self", "Получить {haste} Ускорения. Сжечь.", [haste(2), burn], { effects: [haste(3), burn] }),
  card("a_evade", "Уворот", "skill", "uncommon", 2, "self", "Получить {block} блока. Починка {repair}.", [block(13), repair(1)], { effects: [block(17), repair(2)] }),
  card("a_lethal_mix", "Смертельная смесь", "skill", "uncommon", 2, "enemy", "Наложить {poison} Яда, {weak} Слабости и {vulnerable} Уязвимости.",
    [status("poison", 3), status("weak", 2), status("vulnerable", 1)], { effects: [status("poison", 4), status("weak", 2), status("vulnerable", 2)] }),
  card("a_siphon", "Кража силы", "skill", "uncommon", 1, "enemy", "Наложить {weak} Слабости. Получить {strength} Силу. Сжечь.",
    [status("weak", 2), selfStatus("strength", 2), burn], { effects: [status("weak", 3), selfStatus("strength", 4), burn], description: "Наложить {weak} Слабости. Получить {strength} Силы. Сжечь." }),
  triggerPower("a_toxic_blades", "Отравленные клинки", "uncommon", 2, "Каждая атака: {poison} Яда всем врагам.", "onCardPlayed",
    [allStatus("poison", 1)], [allStatus("poison", 2)], "attack"),
  card("a_light_feet", "Лёгкая поступь", "power", "uncommon", 1, "self", "Получить {dexterity} Ловкости: каждые 2 — первая карта хода на 1 легче.",
    [selfStatus("dexterity", 2)], { effects: [selfStatus("dexterity", 3)] }),
  triggerPower("a_venom_aura", "Ядовитая аура", "uncommon", 1, "В конце такта {poison} Яда всем.", "onTactEnd", [allStatus("poison", 1)], [allStatus("poison", 2)]),
  triggerPower("a_killer_instinct", "Чутьё убийцы", "uncommon", 1, "Когда враг умирает, взять {draw} карты.", "onEnemyDeath", [draw(2)], [draw(3)]),
  triggerPower("a_shadow_cloak", "Плащ теней", "uncommon", 1, "В начале такта {block} блока.", "onTactStart", [block(2)], [block(3)]),
  card("a_agility", "Гибкость", "power", "uncommon", 1, "self", "Получить {strength} Силу и {dexterity} Ловкость.",
    [selfStatus("strength", 2), selfStatus("dexterity", 1)], { effects: [selfStatus("strength", 4), selfStatus("dexterity", 2)], description: "Получить {strength} Силы и {dexterity} Ловкости." }),
  chained(card("a_bloodletting", "Кровопускание", "skill", "uncommon", 1, "enemy", "Наложить {bleed} Кровотечения. Цепь 4: ещё {bleed} Кровотечения.",
    [bleed(3)], { effects: [bleed(4)] }), "chain", [bleed(3)], [bleed(4)], 4),

  // ---------- Редкие ----------
  card("a_coup", "Удар милосердия", "attack", "rare", 3, "enemy", "Добивание: {damage} урона, +5 за каждое Комбо.", [grow(damage(6), "combo", 5)], { effects: [grow(damage(10), "combo", 5)] }),
  verdict,
  card("a_perfect_kill", "Идеальное убийство", "attack", "rare", 3, "enemy", "Нанести {damage} урона.", [damage(40)], { effects: [damage(52)] }),
  card("a_death_mark", "Метка смерти", "skill", "rare", 2, "enemy", "Наложить {poison} Яда и {vulnerable} Уязвимости. Сжечь.",
    [status("poison", 6), status("vulnerable", 2), burn], { effects: [status("poison", 8), status("vulnerable", 3), burn] }),
  card("a_thousand_poisons", "Тысяча ядов", "skill", "rare", 1, "enemy", "Утроить Яд врага. Сжечь.", [multiplyStatus("poison", 3), burn], { cost: 0 }),
  card("a_vanish", "Исчезновение", "skill", "rare", 2, "self", "Получить {block} блока. Починка {repair}. Сжечь.", [block(28), repair(3), burn], { effects: [block(38), repair(3), burn] }),
  card("a_second_chance", "Второй шанс", "skill", "rare", 1, "self", "Получить {haste} Ускорения. Взять {draw} карты. Сжечь.", [haste(3), draw(2), burn], { effects: [haste(4), draw(3), burn] }),
  card("a_pandemic", "Пандемия", "skill", "rare", 2, "allEnemies", "Наложить {poison} Яда всем врагам. Сжечь.", [status("poison", 6), burn], { effects: [status("poison", 8), burn] }),
  card("a_master_poisoner", "Мастер ядов", "power", "rare", 2, "self", "В начале такта {poison} Яда всем врагам.", [], { cost: 1 },
    { trigger: "onTactStart", effects: [allStatus("poison", 2)] }),
  card("a_shadow_form", "Форма тени", "power", "rare", 3, "self", "Получить {strength} Силы и {dexterity} Ловкости. В начале такта взять {draw} карту.",
    [selfStatus("strength", 4), selfStatus("dexterity", 2)], { cost: 2 }, { trigger: "onTactStart", effects: [draw(1)] }),
  card("a_thousand_blades", "Тысяча клинков", "power", "rare", 1, "self", "Каждая карта: {damage} урона всем врагам.", [], { cost: 0 },
    { trigger: "onCardPlayed", effects: [fixedDamageToAll(2)] }),
];

