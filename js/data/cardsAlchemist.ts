// Карты Алхимика: «зелья в бою». 54 карты (этап 7): 4 стартовых вида, 16 обычных, 14 необычных, 10 редких,
// 7 эпических, 3 легендарных. Три темы: Варка (варят зелья и усиливают выпитое), Катализ (растут от Реагентов
// или тратят их), Смеси (кислота — Сокрушение, огонь — Горение, яд). Таблица колоды — в docs/cards/alchemist.md.
// Реагенты: +1 за сваренное зелье, +2 за выпитое, потолок 10. Варка с карты — зелье на выбор из двух, выбор на остановке
// в конце такта, не больше одной карты варки за такт. Отдельных улучшенных версий нет: ступень — +20% к числам.
import {
  allStatus, block, brew, burn, card, chained, damage, draw, energy, fixedDamageToAll, gainResource, grow, heal, hits, repair, spend, status, sunder,
} from "./cardHelpers.ts";
import type { CardData, Effect, HeroRules, Power } from "../types.ts";

const burning = (amount: number) => status("burning", amount);
const poison = (amount: number) => status("poison", amount);
const reagents = (amount: number) => gainResource("reagents", amount);
const sunderAll = (amount: number): Effect => ({ ...sunder(amount), target: "allEnemies" });
const tactStart = (effects: Effect[]): Power => ({ trigger: "onTactStart", effects });

// Сила: эффекты при розыгрыше, постоянный эффект (power) и правило боя (rules) — что есть
function power(
  id: string, name: string, rarity: CardData["rarity"], cost: number, description: string, effects: Effect[], extra: { power?: Power; rules?: HeroRules } = {},
): CardData {
  return { ...card(id, name, "power", rarity, cost, "self", description, effects), ...extra };
}

export const ALCHEMIST_CARDS: CardData[] = [
  // ---------- Стартовые: колода 4 + 4 + 1 + 1 ----------
  card("al_toss", "Бросок склянки", "attack", "starter", 1, "enemy", "Нанести {damage} урона.", [damage(6)]),
  card("al_guard", "Дымовая завеса", "skill", "starter", 1, "self", "Получить {block} блока.", [block(5)]),
  card("al_resin", "Смола", "skill", "starter", 1, "self", "Получить {block} блока. Починка {repair}.", [block(3), repair(2)]),
  card("al_brew", "Варка зелья", "skill", "starter", 1, "self", "Сварить зелье: одно из двух на выбор. Сжечь.", [brew(1), burn]),

  // ---------- Обычные ----------
  // Варка
  card("al_cauldron", "Котелок", "skill", "common", 2, "self", "Сварить зелье: одно из двух на выбор. Получить {block} блока.", [brew(1), block(5)]),
  card("al_tincture", "Настойка", "skill", "common", 1, "self", "Вылечить {heal} HP. Получить {block} блока.", [heal(2), block(3)]),
  card("al_distill", "Перегонка", "skill", "common", 1, "self", "Взять {draw} карты. Получить {reagents} Реагент.", [draw(2), reagents(1)]),
  card("al_pouch", "Ингредиенты", "skill", "common", 0, "self", "Получить {reagents} Реагента. Сжечь.", [reagents(2), burn]),
  card("al_spare_flask", "Склянка про запас", "attack", "common", 1, "enemy", "Нанести {damage} урона. Получить {reagents} Реагента.", [damage(5), reagents(2)]),
  // Катализ
  card("al_catalyst", "Катализатор", "attack", "common", 1, "enemy", "Нанести {damage} урона: +1 за каждый Реагент.", [grow(damage(5), "reagents", 1)]),
  card("al_reactive_shield", "Реактивный щит", "skill", "common", 1, "self", "Получить {block} блока: +1 за каждый Реагент.", [grow(block(4), "reagents", 1)]),
  card("al_burst", "Выброс", "attack", "common", 1, "enemy", "Нанести {damage} урона. Реагенты 2: ещё {damage} урона.", [damage(4), spend("reagents", 2, [damage(8)])]),
  card("al_sediment", "Осадок", "attack", "common", 2, "enemy", "Нанести {damage} урона: +2 за каждый Реагент.", [grow(damage(10), "reagents", 2)]),
  chained(card("al_mortar", "Ступка", "attack", "common", 2, "enemy", "Нанести {damage} урона. Финал: ещё {damage} урона.", [damage(12)]), "final", [damage(9)]),
  // Смеси
  card("al_acid", "Кислота", "attack", "common", 1, "enemy", "Сокрушение {sunder}. Нанести {damage} урона.", [sunder(1), damage(5)]),
  card("al_firebomb", "Зажигательная смесь", "attack", "common", 1, "allEnemies", "Нанести {damage} урона всем врагам. Наложить {burning} Горения всем.", [damage(2), burning(2)]),
  card("al_caustic", "Едкая склянка", "attack", "common", 1, "enemy", "Нанести {damage} урона. Наложить {poison} Яда.", [damage(4), poison(2)]),
  card("al_bomb", "Бомба", "attack", "common", 2, "allEnemies", "Нанести {damage} урона всем врагам.", [damage(11)]),
  // Общие
  card("al_flash", "Вспышка", "skill", "common", 0, "enemy", "Наложить {weak} Слабости. Сжечь.", [status("weak", 2), burn]),
  card("al_flask_wall", "Стеклянная стена", "skill", "common", 2, "self", "Получить {block} блока. Починка {repair}.", [block(12), repair(2)]),

  // ---------- Необычные ----------
  // Варка
  card("al_brew_master", "Мастер варки", "skill", "uncommon", 2, "self", "Сварить зелье: одно из двух на выбор. Получить {reagents} Реагента и {block} блока.",
    [brew(1), reagents(2), block(6)]),
  card("al_double_brew", "Двойная варка", "skill", "uncommon", 2, "self", "Сварить 2 зелья: каждое из двух на выбор. Получить {block} блока. Сжечь.", [brew(2), block(5), burn]),
  power("al_distillery", "Перегонный куб", "uncommon", 2, "Когда сварено зелье: {block} блока и Починка {repair}.", [],
    { power: { trigger: "onPotionBrewed", effects: [block(5), repair(1)] } }),
  card("al_elixir", "Эликсир", "skill", "uncommon", 1, "self", "Вылечить {heal} HP. Получить {reagents} Реагента.", [heal(3), reagents(2)]),
  // Катализ
  card("al_chain_reaction", "Цепная реакция", "attack", "uncommon", 2, "enemy", "Нанести {damage} урона дважды: каждый удар +1 за Реагент.",
    hits(7, 2).map((hit) => grow(hit, "reagents", 1))),
  card("al_volatile", "Нестабильная смесь", "attack", "uncommon", 1, "enemy", "Нанести {damage} урона. Реагенты 3: ещё {damage} урона.", [damage(6), spend("reagents", 3, [damage(10)])]),
  power("al_fermentation", "Брожение", "uncommon", 2, "Получить {reagents} Реагента и {block} блока. В начале такта: +{reagents} Реагент.", [reagents(3), block(7)],
    { power: tactStart([reagents(1)]) }),
  card("al_reactive_armor", "Реактивная броня", "skill", "uncommon", 2, "self", "Получить {block} блока: +2 за каждый Реагент. Починка {repair}.",
    [grow(block(10), "reagents", 2), repair(2)]),
  // Смеси
  card("al_acid_bath", "Кислотная ванна", "attack", "uncommon", 2, "enemy", "Сокрушение {sunder}. Нанести {damage} урона.", [sunder(3), damage(13)]),
  card("al_hot_flask", "Горючая смесь", "attack", "uncommon", 2, "allEnemies", "Нанести {damage} урона всем врагам. Наложить {burning} Горения всем.", [damage(6), burning(5)]),
  card("al_fumes", "Едкий дым", "skill", "uncommon", 2, "allEnemies", "Наложить {poison} Яда и {weak} Слабости всем врагам.", [poison(5), status("weak", 2)]),
  chained(card("al_volatile_mix", "Летучая смесь", "attack", "uncommon", 1, "enemy", "Нанести {damage} урона. Наложить {burning} Горения. После навыка: ещё {burning} Горения.",
    [damage(6), burning(2)]), "afterSkill", [burning(2)]),
  // Общие
  card("al_haste_elixir", "Эликсир скорости", "skill", "uncommon", 0, "self", "Получить {haste} Ускорение. Сжечь.", [energy(1), burn]),
  card("al_smoke", "Дымовая шашка", "skill", "uncommon", 1, "allEnemies", "Получить {block} блока. Наложить {weak} Слабости всем врагам.", [block(4), status("weak", 2)]),

  // ---------- Редкие ----------
  // Варка
  card("al_grand_brew", "Великая варка", "skill", "rare", 3, "self", "Сварить 3 зелья: каждое из двух на выбор. Получить {block} блока и {reagents} Реагента. Сжечь.",
    [brew(3), block(12), reagents(3), burn]),
  // Сварить в начале каждого второго такта: случайное зелье, без выбора
  power("al_lab", "Лаборатория", "rare", 2, "В начале каждого второго такта: сварить случайное зелье.", [],
    { power: { trigger: "onTactStart", everyTacts: 2, effects: [brew(1)] } }),
  power("al_potion_expert", "Знаток зелий", "rare", 1, "Когда выпито зелье: взять {draw} карту и получить {block} блок.", [],
    { power: { trigger: "onPotionUsed", effects: [draw(1), block(1)] } }),
  // Катализ
  card("al_elixir_blast", "Взрыв эликсира", "attack", "rare", 3, "enemy", "Нанести {damage} урона: +6 за каждый Реагент.", [grow(damage(20), "reagents", 6)]),
  card("al_critical_mass", "Критическая масса", "attack", "rare", 2, "allEnemies", "Реагенты 5: нанести {damage} урона всем врагам.", [spend("reagents", 5, [damage(24)])]),
  card("al_transmute", "Трансмутация", "attack", "rare", 2, "enemy", "Нанести {damage} урона: +4 за каждый Реагент.", [grow(damage(13), "reagents", 4)]),
  // Смеси
  card("al_corrosion", "Царская водка", "attack", "rare", 2, "enemy", "Сокрушение {sunder}. Нанести {damage} урона.", [sunder(4), damage(15)]),
  card("al_napalm", "Напалм", "attack", "rare", 3, "allEnemies", "Нанести {damage} урона всем врагам. Наложить {burning} Горения всем.", [damage(12), burning(9)]),
  card("al_plague_bomb", "Чумная бомба", "attack", "rare", 2, "allEnemies", "Нанести {damage} урона всем врагам. Наложить {poison} Яда всем. Сжечь.", [damage(6), poison(8), burn]),
  // Общие
  chained(card("al_panacea", "Панацея", "skill", "rare", 2, "self", "Вылечить {heal} HP. Починка {repair}. Первая: ещё {block} блока. Сжечь.",
    [heal(10), repair(10), burn]), "first", [block(4)]),

  // ---------- Эпические ----------
  // Варка
  card("al_masterpiece", "Алхимический шедевр", "skill", "epic", 2, "self", "Сварить зелье: одно из двух на выбор. Получить {reagents} Реагента и {block} блока.",
    [brew(1), reagents(4), block(11)]),
  power("al_potion_brewer", "Зельевар", "epic", 2, "Когда выпито зелье: {damage} урона всем врагам и {block} блока.", [],
    { power: { trigger: "onPotionUsed", effects: [fixedDamageToAll(4), block(3)] } }),
  // Катализ
  power("al_grand_catalysis", "Великий катализ", "epic", 2, "Получить {block} блока. В начале такта: +{reagents} Реагента.", [block(12)], { power: tactStart([reagents(2)]) }),
  chained(card("al_chain_decay", "Цепной распад", "attack", "epic", 3, "enemy", "Нанести {damage} урона: +8 за каждый Реагент. Финал: ещё {damage} урона.",
    [grow(damage(16), "reagents", 8)]), "final", [damage(12)]),
  // Смеси
  card("al_acid_rain", "Кислотный дождь", "attack", "epic", 2, "allEnemies", "Сокрушение {sunder} всем. Нанести {damage} урона всем врагам.", [sunderAll(3), damage(12)]),
  power("al_hellbrew", "Адское зелье", "epic", 2, "Сокрушение {sunder} всем врагам. В начале такта: {burning} Горение и {poison} Яд всем.", [sunderAll(1)],
    { power: tactStart([allStatus("burning", 1), allStatus("poison", 1)]) }),
  // Общие
  card("al_vigor", "Прилив бодрости", "skill", "epic", 1, "self", "Взять {draw} карты. Получить {haste} Ускорения.", [draw(2), energy(2)]),

  // ---------- Легендарные: у каждой — эффект-правило, в колоде не больше одной копии ----------
  // Варка: варить можно любым числом карт за такт, в сумке на 2 места больше
  power("al_bottomless", "Бездонный котёл", "legendary", 2, "Варить можно любым числом карт за такт; сумка вмещает на 2 зелья больше. Сварить зелье: одно из двух на выбор.",
    [brew(1)], { rules: { brewUnlimited: true, extraPotions: 2 } }),
  // Катализ: «Реагенты N» больше не тратят Реагенты
  power("al_philosopher", "Философский камень", "legendary", 2, "Карты «Реагенты N» больше не тратят Реагенты. Получить {reagents} Реагента.", [reagents(3)],
    { rules: { freeReagents: true } }),
  // Смеси: каждое Сокрушение, Горение и Яд от героя сильнее на 1
  power("al_alkahest", "Алкагест", "legendary", 2, "Каждое твоё Сокрушение, Горение и Яд сильнее на 1. Наложить {burning} Горения и {poison} Яда всем врагам.",
    [allStatus("burning", 2), allStatus("poison", 2)], { rules: { mixBonus: 1 } }),
];
