// Карты Убийцы: «длинные цепочки». 54 карты (этап 7): 4 стартовых вида, 16 обычных, 14 необычных, 10 редких,
// 7 эпических, 3 легендарных. Три темы: Цепь (лёгкие карты, «Цепь N», добивания от Комбо), Яд, Тень (Кровотечение,
// Ускорение, уклонение). Таблица колоды с ценой каждой карты по таблице баланса — в docs/cards/assassin.md.
// Комбо — сколько карт уже сработало в текущей цепочке. Карты весом 0 всегда сжигаются; Убийца играет их до 3 за такт.
// Отдельных улучшенных версий нет: каждая ступень улучшения даёт +20% к числам (engine/deck.ts).
import {
  allStatus, block, burn, card, chained, damage, draw, energy, fixedDamageToAll, gainResource, grow, hits, repair, selfStatus, status, sunder,
} from "./cardHelpers.ts";
import type { CardData, Effect, HeroRules, Power } from "../types.ts";

const poison = (amount: number) => status("poison", amount);
const bleed = (amount: number) => status("bleed", amount);
const combo = (amount: number) => gainResource("combo", amount);
const tactStart = (effects: Effect[]): Power => ({ trigger: "onTactStart", effects });

// Сила: эффекты при розыгрыше, постоянный эффект (power) и правило боя (rules) — что есть
function power(
  id: string, name: string, rarity: CardData["rarity"], cost: number, description: string, effects: Effect[], extra: { power?: Power; rules?: HeroRules } = {},
): CardData {
  return { ...card(id, name, "power", rarity, cost, "self", description, effects), ...extra };
}

export const ASSASSIN_CARDS: CardData[] = [
  // ---------- Стартовые: колода 4 + 4 + 1 + 1 ----------
  card("a_strike", "Укол", "attack", "starter", 1, "enemy", "Нанести {damage} урона.", [damage(6)]),
  card("a_roll", "Перекат", "skill", "starter", 1, "self", "Получить {block} блока.", [block(5)]),
  card("a_tighten", "Подтянуть ремни", "skill", "starter", 1, "self", "Получить {block} блока. Починка {repair}.", [block(3), repair(2)]),
  card("a_finisher", "Добивание", "attack", "starter", 1, "enemy", "Нанести {damage} урона: +2 за каждое Комбо.", [grow(damage(3), "combo", 2)]),

  // ---------- Обычные ----------
  // Цепь
  chained(card("a_quick_cut", "Быстрый порез", "attack", "common", 1, "enemy", "Нанести {damage} урона. Цепь 3: ещё {damage} урона.", [damage(6)]), "chain", [damage(5)], undefined, 3),
  card("a_twin_daggers", "Двойной выпад", "attack", "common", 1, "enemy", "Нанести {damage} урона дважды.", hits(4, 2)),
  chained(card("a_link", "Связка", "attack", "common", 1, "enemy", "Нанести {damage} урона. Получить {combo} Комбо. После атаки: ещё {damage} урона.",
    [damage(5), combo(1)]), "afterAttack", [damage(3)]),
  card("a_feint", "Финт", "skill", "common", 1, "self", "Получить {block} блока и {combo} Комбо.", [block(4), combo(2)]),
  card("a_flourish", "Росчерк", "skill", "common", 0, "self", "Получить {combo} Комбо. Сжечь.", [combo(2), burn]),
  // Яд
  card("poison_blade", "Отравленный клинок", "attack", "common", 1, "enemy", "Нанести {damage} урона. Наложить {poison} Яда.", [damage(4), poison(2)]),
  card("a_dart", "Ядовитый дротик", "attack", "common", 1, "enemy", "Нанести {damage} урона. Наложить {poison} Яда.", [damage(2), poison(3)]),
  card("a_toxic_fumes", "Ядовитое облако", "skill", "common", 2, "allEnemies", "Наложить {poison} Яда и {weak} Слабость всем врагам.", [poison(5), status("weak", 1)]),
  card("a_festering", "Гнойная рана", "attack", "common", 2, "enemy", "Нанести {damage} урона. Наложить {poison} Яда.", [damage(9), poison(4)]),
  card("a_smoke", "Ядовитая завеса", "skill", "common", 1, "enemy", "Получить {block} блока. Наложить {poison} Яд.", [block(5), poison(1)]),
  // Тень
  card("a_bleed", "Удар под дых", "attack", "common", 1, "enemy", "Нанести {damage} урона. Наложить {bleed} Кровотечение.", [damage(5), bleed(1)]),
  card("a_dodge", "Уклонение", "skill", "common", 1, "self", "Получить {block} блока. Починка {repair}.", [block(4), repair(3)]),
  card("a_throwing_knives", "Метательный нож", "attack", "common", 0, "enemy", "Нанести {damage} урона. Сжечь.", [damage(4), burn]),
  card("a_shadow_dash", "Рывок тени", "skill", "common", 1, "self", "Получить {haste} Ускорение и {block} блока.", [energy(1), block(3)]),
  // Общие
  card("a_distract", "Отвлечение", "skill", "common", 0, "enemy", "Наложить {weak} Слабости. Сжечь.", [status("weak", 2), burn]),
  card("a_prep", "Подготовка", "skill", "common", 1, "self", "Взять {draw} карты. Получить {combo} Комбо.", [draw(2), combo(1)]),

  // ---------- Необычные ----------
  // Цепь
  chained(card("a_whirl", "Вихрь клинков", "attack", "uncommon", 1, "enemy", "Нанести {damage} урона дважды. Цепь 3: ещё три удара по {damage}.", hits(3, 2)), "chain", hits(3, 3), undefined, 3),
  card("a_eviscerate", "Потрошение", "attack", "uncommon", 1, "enemy", "Нанести {damage} урона: +2 за каждое Комбо.", [grow(damage(4), "combo", 2)]),
  chained(card("a_cascade", "Каскад", "attack", "uncommon", 2, "enemy", "Нанести {damage} урона трижды. Цепь 4: ещё {damage} урона.", hits(5, 3)), "chain", [damage(20)], undefined, 4),
  power("a_chain", "Цепь ударов", "uncommon", 2, "Получить {combo} Комбо и {haste} Ускорение. Каждая карта даёт на 1 Комбо больше.", [combo(3), energy(1)],
    { power: { trigger: "onCardPlayed", effects: [combo(1)] } }),
  // Яд
  chained(card("a_scorpion", "Змеиный укус", "attack", "uncommon", 1, "enemy", "Нанести {damage} урона. Наложить {poison} Яда. Первая: ещё {poison} Яда.",
    [damage(3), poison(3)]), "first", [poison(2)]),
  card("a_double_dose", "Катализатор яда", "skill", "uncommon", 1, "enemy", "Удвоить Яд цели. Сжечь.", [{ type: "multiplyStatus", status: "poison", factor: 2 }, burn]),
  card("a_plague_blade", "Чумной клинок", "attack", "uncommon", 2, "enemy", "Нанести {damage} урона. Наложить {poison} Яда.", [damage(10), poison(5)]),
  power("a_venom_aura", "Знаток ядов", "uncommon", 2, "Наложить {poison} Яда всем врагам. В начале такта: {poison} Яд всем.", [allStatus("poison", 2)],
    { power: tactStart([allStatus("poison", 1)]) }),
  // Тень
  card("a_garrote", "Удавка", "attack", "uncommon", 2, "enemy", "Нанести {damage} урона. Наложить {bleed} Кровотечения и {weak} Слабости.", [damage(8), bleed(3), status("weak", 2)]),
  card("a_shadow_step", "Теневой шаг", "skill", "uncommon", 0, "self", "Получить {haste} Ускорение. Сжечь.", [energy(1), burn]),
  chained(card("a_bloodletting", "Кровопускание", "skill", "uncommon", 1, "enemy", "Наложить {bleed} Кровотечения. Цепь 3: ещё {bleed} Кровотечение.", [bleed(3)]), "chain", [bleed(1)], undefined, 3),
  card("a_shadow_cloak", "Плащ теней", "skill", "uncommon", 2, "self", "Получить {block} блока и {haste} Ускорение. Починка {repair}.", [block(12), energy(1), repair(3)]),
  // Общие
  card("a_cheap_shot", "Подлый удар", "attack", "uncommon", 1, "enemy", "Сокрушение {sunder}. Нанести {damage} урона.", [sunder(2), damage(5)]),
  card("a_focus", "Расчёт", "skill", "uncommon", 1, "self", "Взять {draw} карты. Получить {haste} Ускорение.", [draw(2), energy(1)]),

  // ---------- Редкие ----------
  // Цепь. У Приговора два бонуса цепочки: длинная цепочка и её конец
  chained(chained(card("a_execute", "Приговор", "attack", "rare", 1, "enemy", "Нанести {damage} урона. Цепь 5: ещё {damage} урона. Финал: ещё {damage} урона.",
    [damage(5)]), "chain", [damage(18)], undefined, 5), "final", [damage(3)]),
  card("a_blade_dance", "Танец клинков", "attack", "rare", 2, "enemy", "Нанести {damage} урона четыре раза: каждый удар +1 за Комбо.", hits(3, 4).map((hit) => grow(hit, "combo", 1))),
  power("a_thousand_blades", "Тысяча порезов", "rare", 1, "Каждая сыгранная карта: {damage} урон всем врагам.", [], { power: { trigger: "onCardPlayed", effects: [fixedDamageToAll(1)] } }),
  // Яд
  card("a_lethal_mix", "Смертельная смесь", "skill", "rare", 2, "enemy", "Наложить {poison} Яда, {weak} Слабости и {vulnerable} Уязвимости.",
    [poison(6), status("weak", 2), status("vulnerable", 4)]),
  card("a_toxic_volley", "Ядовитый шквал", "attack", "rare", 2, "allEnemies", "Нанести {damage} урона всем врагам. Наложить {poison} Яда всем.", [damage(6), poison(5)]),
  card("a_plague_edge", "Клинок чумы", "attack", "rare", 3, "enemy", "Нанести {damage} урона. Наложить {poison} Яда.", [damage(15), poison(12)]),
  // Тень
  chained(card("a_backstab", "Удар из тени", "attack", "rare", 1, "enemy", "Нанести {damage} урона. Первая: ещё {damage} урона.", [damage(9)]), "first", [damage(6)]),
  card("a_vanish", "Исчезновение", "skill", "rare", 2, "self", "Получить {block} блока и {haste} Ускорение. Починка {repair}. Сжечь.", [block(22), energy(1), repair(3), burn]),
  card("a_blood_trail", "Кровавый след", "attack", "rare", 2, "enemy", "Нанести {damage} урона. Наложить {bleed} Кровотечения.", [damage(10), bleed(5)]),
  // Общие
  card("a_tempo", "Темп", "skill", "rare", 0, "self", "Получить {combo} Комбо. Взять {draw} карту. Сжечь.", [combo(2), draw(1), burn]),

  // ---------- Эпические ----------
  // Цепь
  chained(card("a_coup", "Удар милосердия", "attack", "epic", 2, "enemy", "Нанести {damage} урона: +5 за каждое Комбо. Финал: ещё {damage} урона.",
    [grow(damage(8), "combo", 5)]), "final", [damage(12)]),
  power("a_trance", "Боевой транс", "epic", 2, "Получить {haste} Ускорение. В начале такта: взять {draw} карту и получить {combo} Комбо.", [energy(1)],
    { power: tactStart([draw(1), combo(1)]) }),
  // Яд
  card("a_pandemic", "Пандемия", "skill", "epic", 2, "allEnemies", "Наложить {poison} Яда всем врагам. Сжечь.", [poison(12), burn]),
  power("a_master_poisoner", "Мастер ядов", "epic", 2, "В начале такта: {poison} Яда всем врагам.", [], { power: tactStart([allStatus("poison", 2)]) }),
  // Тень
  card("a_blood_rain", "Кровавый дождь", "attack", "epic", 2, "allEnemies", "Нанести {damage} урона всем врагам. Наложить {bleed} Кровотечения всем.", [damage(8), bleed(4)]),
  power("a_shadow_form", "Форма тени", "epic", 2, "Получить {dexterity} Ловкости, {strength} Силы и {haste} Ускорение.",
    [selfStatus("dexterity", 4), selfStatus("strength", 2), energy(1)]),
  // Общие
  card("a_second_chance", "Второй шанс", "skill", "epic", 0, "self", "Получить {haste} Ускорение. Взять {draw} карту. Сжечь.", [energy(1), draw(1), burn]),

  // ---------- Легендарные: у каждой — эффект-правило, в колоде не больше одной копии ----------
  // Цепь: пустая клетка больше не обнуляет Комбо, но у него появляется потолок
  power("a_endless_chain", "Бесконечная цепь", "legendary", 2, "Пустая клетка больше не обнуляет Комбо; потолок Комбо — 12. Получить {combo} Комбо.", [combo(3)],
    { rules: { keepCombo: true, caps: { combo: 12 } } }),
  // Яд: Яд на врагах перестаёт убывать
  power("a_poison_queen", "Королева ядов", "legendary", 2, "Яд на врагах больше не убывает. Наложить {poison} Яда всем врагам.", [allStatus("poison", 3)],
    { rules: { poisonStays: true } }),
  // Тень: нет лимита карт весом 0 за такт
  power("a_ghost", "Призрак", "legendary", 2, "Каждая карта весом 0 даёт Ускорение 1. В начале такта: {haste} Ускорение.", [],
    { rules: { zeroWeightHaste: 1 }, power: tactStart([energy(1)]) }),
];
