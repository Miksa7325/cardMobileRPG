// Карты Чернокнижника: «сила за кровь». 54 карты (этап 7): 4 стартовых вида, 16 обычных, 14 необычных, 10 редких,
// 7 эпических, 3 легендарных. Три темы: Кровь (плата HP, Печать крови, лечение), Пепел («Сжечь», Раны, карты от Тьмы),
// Проклятия (Слабость, Уязвимость, Замедление без удара). Таблица колоды с ценами — в docs/cards/warlock.md.
// Тьма: +1 за каждую плату своим HP и за каждую сожжённую карту, потолок 10. Печать крови в начале такта
// отнимает HP у врага и лечит героя. Отдельных улучшенных версий нет: ступень улучшения — +20% к числам.
import {
  allStatus, block, burn, card, chained, damage, draw, energy, exhaustWounds, fixedDamageToAll, gainResource, grow, heal, loseHp, repair, selfStatus,
  spend, status, sunder, wound,
} from "./cardHelpers.ts";
import type { CardData, Effect, HeroRules, Power } from "../types.ts";

const seal = (amount: number) => status("leech", amount);
const weak = (amount: number) => status("weak", amount);
const vulnerable = (amount: number) => status("vulnerable", amount);
const slow = (amount: number) => status("slow", amount);
const darkness = (amount: number) => gainResource("darkness", amount);
const tactStart = (effects: Effect[]): Power => ({ trigger: "onTactStart", effects });

// Сила: эффекты при розыгрыше, постоянный эффект (power) и правило боя (rules) — что есть
function power(
  id: string, name: string, rarity: CardData["rarity"], cost: number, description: string, effects: Effect[], extra: { power?: Power; rules?: HeroRules } = {},
): CardData {
  return { ...card(id, name, "power", rarity, cost, "self", description, effects), ...extra };
}

export const WARLOCK_CARDS: CardData[] = [
  // ---------- Стартовые: колода 4 + 4 + 1 + 1 ----------
  card("w_bolt", "Тёмный разряд", "attack", "starter", 1, "enemy", "Нанести {damage} урона.", [damage(6)]),
  card("w_shield", "Теневой щит", "skill", "starter", 1, "self", "Получить {block} блока.", [block(5)]),
  card("w_bone_patch", "Костяные заплаты", "skill", "starter", 1, "self", "Получить {block} блока. Починка {repair}.", [block(3), repair(2)]),
  card("w_sacrifice", "Жертва", "skill", "starter", 1, "enemy", "Потерять {loseHp} HP. Наложить {leech} Печати крови.", [loseHp(2), seal(2)]),

  // ---------- Обычные ----------
  // Кровь
  card("w_blood_bolt", "Кровавая стрела", "attack", "common", 1, "enemy", "Потерять {loseHp} HP. Нанести {damage} урона.", [loseHp(2), damage(11)]),
  card("w_drain", "Пиявка", "attack", "common", 1, "enemy", "Нанести {damage} урона. Наложить {leech} Печать крови.", [damage(4), seal(1)]),
  card("w_blood_for_blood", "Кровь за кровь", "attack", "common", 2, "enemy", "Нанести {damage} урона. Наложить {leech} Печати крови.", [damage(9), seal(2)]),
  card("w_blood_shield", "Кровавый щит", "skill", "common", 1, "self", "Потерять {loseHp} HP. Получить {block} блока.", [loseHp(2), block(9)]),
  card("w_leech", "Глоток жизни", "skill", "common", 1, "self", "Вылечить {heal} HP.", [heal(4)]),
  // Пепел
  card("w_soul_burn", "Пепельный удар", "attack", "common", 1, "enemy", "Нанести {damage} урона. Сжечь.", [damage(10), burn]),
  card("w_cauterize", "Сожжение ран", "skill", "common", 1, "self", "Сжечь все Раны в руке. Получить {block} блока. Починка {repair}.", [exhaustWounds, block(5), repair(2)]),
  card("w_dark_bolt", "Тёмный сгусток", "attack", "common", 1, "enemy", "Нанести {damage} урона: +1 за каждую Тьму.", [grow(damage(5), "darkness", 1)]),
  card("w_dark_pact", "Сделка с тьмой", "skill", "common", 0, "self", "Рана в сброс. Получить {darkness} Тьмы. Взять {draw} карту. Сжечь.", [wound, darkness(3), draw(1), burn]),
  card("w_night_wall", "Ночная стена", "skill", "common", 1, "self", "Получить {block} блока: +1 за каждую Тьму.", [grow(block(4), "darkness", 1)]),
  // Проклятия
  card("w_gloom", "Порча", "skill", "common", 1, "enemy", "Наложить {weak} Слабости и {vulnerable} Уязвимости.", [weak(2), vulnerable(2)]),
  card("w_hex_bolt", "Стрела порчи", "attack", "common", 1, "enemy", "Нанести {damage} урона. Наложить {weak} Слабости.", [damage(5), weak(2)]),
  chained(card("w_shackles", "Оковы", "skill", "common", 1, "enemy", "Наложить {slow} Замедления. Первая: ещё {slow} Замедление.", [slow(2)]), "first", [slow(1)]),
  card("w_omen", "Сглаз", "skill", "common", 2, "allEnemies", "Наложить {vulnerable} Уязвимости и {weak} Слабости всем врагам. Получить {block} блока.", [vulnerable(2), weak(2), block(4)]),
  // Общие
  card("w_veil", "Теневая завеса", "skill", "common", 2, "self", "Получить {block} блока. Починка {repair}.", [block(12), repair(2)]),
  card("w_forbidden", "Тёмное знание", "skill", "common", 1, "self", "Взять {draw} карты. Получить {darkness} Тьму.", [draw(2), darkness(1)]),

  // ---------- Необычные ----------
  // Кровь
  card("w_blood_seal", "Кровавая печать", "skill", "uncommon", 1, "enemy", "Потерять {loseHp} HP. Наложить {leech} Печати крови.", [loseHp(2), seal(3)]),
  card("w_ritual_knife", "Кровавый удар", "attack", "uncommon", 2, "enemy", "Потерять {loseHp} HP. Нанести {damage} урона.", [loseHp(3), damage(25)]),
  card("w_life_drain", "Вампиризм", "attack", "uncommon", 2, "enemy", "Нанести {damage} урона. Вылечить {heal} HP.", [damage(12), heal(4)]),
  // Плата HP при розыгрыше — уже первая плата: сила срабатывает и на неё
  power("w_blood_rite", "Кровавый алтарь", "uncommon", 2, "Потерять {loseHp} HP. Каждая плата своим HP: {leech} Печать крови всем врагам и {block} блока.", [loseHp(2)],
    { power: { trigger: "onHpPaid", effects: [allStatus("leech", 1), block(2)] } }),
  // Пепел
  card("w_pyre", "Погребальный костёр", "attack", "uncommon", 2, "allEnemies", "Нанести {damage} урона всем врагам. Сжечь.", [damage(18), burn]),
  power("w_dark_embrace", "Объятия тьмы", "uncommon", 1, "Когда карта сгорает: {block} блока.", [], { power: { trigger: "onExhaust", effects: [block(3)] } }),
  card("w_black_flame", "Чёрное пламя", "attack", "uncommon", 1, "enemy", "Нанести {damage} урона. Тьма 3: ещё {damage} урона.", [damage(4), spend("darkness", 3, [damage(12)])]),
  card("w_wound_feast", "Жатва душ", "skill", "uncommon", 1, "self", "Сжечь все Раны в руке. Взять {draw} карты. Вылечить {heal} HP.", [exhaustWounds, draw(2), heal(2)]),
  // Проклятия
  card("w_curse_weak", "Проклятие немощи", "attack", "uncommon", 2, "enemy", "Сокрушение {sunder}. Нанести {damage} урона. Наложить {weak} Слабости.", [sunder(2), damage(11), weak(3)]),
  card("w_dread", "Ужас", "skill", "uncommon", 1, "allEnemies", "Наложить {weak} Слабости и {vulnerable} Уязвимости всем врагам. Сжечь.", [weak(2), vulnerable(2), burn]),
  card("w_grave_cold", "Могильный холод", "skill", "uncommon", 2, "allEnemies", "Наложить {slow} Замедления всем врагам. Получить {block} блока.", [slow(2), block(10)]),
  card("w_dark_mark", "Тёмная метка", "attack", "uncommon", 2, "enemy", "Нанести {damage} урона. Наложить {vulnerable} Уязвимости и {weak} Слабости.", [damage(10), vulnerable(3), weak(2)]),
  // Общие
  card("w_shadow_wall", "Стена тьмы", "skill", "uncommon", 2, "self", "Получить {block} блока. Починка {repair}.", [block(13), repair(5)]),
  card("w_last_pact", "Тёмный пакт", "skill", "uncommon", 0, "self", "Потерять {loseHp} HP. Получить {haste} Ускорение и {darkness} Тьму. Взять {draw} карту. Сжечь.",
    [loseHp(3), energy(1), darkness(1), draw(1), burn]),

  // ---------- Редкие ----------
  // Кровь
  card("w_ritual", "Кровавый ритуал", "skill", "rare", 2, "allEnemies", "Потерять {loseHp} HP. Наложить {leech} Печати крови всем врагам. Вылечить {heal} HP.", [loseHp(5), seal(4), heal(4)]),
  card("w_soul_feast", "Пир крови", "attack", "rare", 2, "allEnemies", "Нанести {damage} урона всем врагам. Вылечить {heal} HP.", [damage(10), heal(5)]),
  card("w_cursed_blade", "Кровавый клинок", "attack", "rare", 1, "enemy", "Потерять {loseHp} HP. Нанести {damage} урона. Наложить {leech} Печать крови.", [loseHp(3), damage(12), seal(1)]),
  // Пепел
  card("w_abyss", "Бездна", "attack", "rare", 3, "allEnemies", "Нанести {damage} урона всем врагам: +3 за каждую Тьму.", [grow(damage(16), "darkness", 3)]),
  power("w_ashes", "Пепел", "rare", 1, "Когда карта сгорает: {damage} урона всем врагам и {block} блок.", [], { power: { trigger: "onExhaust", effects: [fixedDamageToAll(2), block(1)] } }),
  card("w_dark_harvest", "Тёмный урожай", "attack", "rare", 2, "enemy", "Нанести {damage} урона. Тьма 4: ещё {damage} урона.", [damage(10), spend("darkness", 4, [damage(23)])]),
  // Проклятия
  chained(card("w_abyss_gaze", "Взгляд бездны", "skill", "rare", 1, "enemy", "Наложить {vulnerable} Уязвимости. Взять {draw} карту. Первая: ещё {weak} Слабости.",
    [vulnerable(3), draw(1)]), "first", [weak(2)]),
  card("w_curse_aura", "Проклятие слабости", "skill", "rare", 2, "allEnemies", "Наложить {weak} Слабости, {slow} Замедления и {vulnerable} Уязвимости всем врагам. Получить {block} блока.",
    [weak(3), slow(2), vulnerable(2), block(2)]),
  card("w_mind_rot", "Гниение разума", "skill", "rare", 2, "enemy", "Оглушение. Наложить {vulnerable} Уязвимости, {weak} Слабости и {slow} Замедление. Сжечь.",
    [status("stun", 1), vulnerable(4), weak(3), slow(1), burn]),
  // Общие
  card("w_necromancy", "Некромантия", "skill", "rare", 1, "self", "Взять {draw} карты. Получить {haste} Ускорение и {darkness} Тьму. Сжечь.", [draw(3), energy(1), darkness(1), burn]),

  // ---------- Эпические ----------
  // Кровь
  power("w_blood_moon", "Кровавая луна", "epic", 2, "В начале такта: {leech} Печать крови всем врагам.", [], { power: tactStart([allStatus("leech", 1)]) }),
  card("w_offering", "Жертвоприношение", "attack", "epic", 3, "enemy", "Потерять {loseHp} HP. Нанести {damage} урона. Наложить {leech} Печати крови.", [loseHp(6), damage(40), seal(4)]),
  // Пепел
  power("w_eclipse", "Затмение", "epic", 2, "Получить {darkness} Тьмы. В начале такта: +{darkness} Тьма и {block} блока.", [darkness(2)], { power: tactStart([darkness(1), block(3)]) }),
  card("w_dark_verdict", "Приговор тьмы", "attack", "epic", 2, "enemy", "Нанести {damage} урона. Тьма 5: ещё {damage} урона.", [damage(10), spend("darkness", 5, [damage(30)])]),
  // Проклятия
  card("w_doom_seal", "Печать рока", "skill", "epic", 2, "enemy", "Наложить {vulnerable} Уязвимости, {weak} Слабости и {slow} Замедления.", [vulnerable(6), weak(3), slow(3)]),
  power("w_soul_plague", "Чума душ", "epic", 2, "В начале такта: {vulnerable} Уязвимость и {weak} Слабость всем врагам.", [],
    { power: tactStart([allStatus("vulnerable", 1), allStatus("weak", 1)]) }),
  // Общие
  power("w_lich_form", "Форма лича", "epic", 3, "Получить {strength} Силы, {dexterity} Ловкости и {darkness} Тьмы.",
    [selfStatus("strength", 5), selfStatus("dexterity", 4), darkness(3)]),

  // ---------- Легендарные: у каждой — эффект-правило, в колоде не больше одной копии ----------
  // Кровь: Печать крови на врагах перестаёт убывать
  power("w_blood_god", "Бог крови", "legendary", 2, "Печать крови на врагах больше не убывает. Наложить {leech} Печать крови всем врагам.", [allStatus("leech", 1)],
    { rules: { leechStays: true } }),
  // Пепел: сожжённые карты уходят в сброс и возвращаются в колоду; Тьму и силы «когда карта сгорает» дают как обычно
  power("w_phoenix", "Феникс", "legendary", 2, "Сожжённые карты уходят в сброс, а не пропадают. Получить {darkness} Тьмы.", [darkness(2)],
    { rules: { exhaustToDiscard: true } }),
  // Проклятия: Слабость на врагах перестаёт убывать
  power("w_curse_lord", "Владыка проклятий", "legendary", 2, "Слабость на врагах больше не убывает. Наложить {weak} Слабости всем врагам.", [allStatus("weak", 3)],
    { rules: { weakStays: true } }),
];
