// Все герои игры: здоровье, описание, стартовая колода, реликвия и особенность класса.
// mechanic — то, что отличает класс: resource — статус-ресурс героя, passives — как он его копит
// (триггер и эффекты, как у карт-сил). Ресурс тратят и усиливают карты класса.
import { CONFIG } from "../config.ts";
import type { Effect, HeroData, HeroId, StatusId } from "../types.ts";

const gain = (status: StatusId, amount = 1): Effect[] => [{ type: "applyStatus", status, amount, target: "self" }];

export const HEROES: Record<HeroId, HeroData> = {
  warrior: {
    id: "warrior",
    name: "Воин",
    description: "Ярость: чем дольше бой, тем страшнее его удары.",
    maxHp: CONFIG.warriorMaxHp,
    drawPerTurn: CONFIG.drawPerTurn.warrior,
    potionWeight: CONFIG.potionWeight,
    mechanic: {
      name: "Ярость",
      resource: "rage",
      text: "Каждая разыгранная атака и каждый пропущенный удар дают 1 Ярость. Карты «Ярость N» тратят её на мощные приёмы, другие бьют сильнее за каждую Ярость. Доспехи: удары врагов наносят Воину на 20% меньше урона.",
      damageReduction: CONFIG.warriorDamageReduction,
      passives: [
        { trigger: "onCardPlayed", cardType: "attack", effects: gain("rage") },
        { trigger: "onDamageTaken", effects: gain("rage") },
      ],
    },
    deck: [
      // 4 атаки, 4 защиты, карта починки и карта темы класса (docs/classes.md)
      "strike", "strike", "strike", "strike",
      "defend", "defend", "defend", "defend",
      "patch", "bash",
    ],
    relics: ["burning_blood"],
  },
  assassin: {
    id: "assassin",
    name: "Убийца",
    description: "Комбо: много дешёвых карт за ход, а потом — добивание.",
    maxHp: CONFIG.assassinMaxHp,
    drawPerTurn: CONFIG.drawPerTurn.assassin,
    potionWeight: CONFIG.potionWeight,
    zeroWeightBonus: 1, // 3 карты весом 0 за такт вместо 2
    mechanic: {
      name: "Комбо",
      resource: "combo",
      text: "Комбо — длина цепочки: каждая сработавшая карта даёт 1 Комбо, а пустая клетка дорожки обнуляет его. Такт цепочку не рвёт. Добивания бьют сильнее за каждое Комбо, а приёмы «Комбо N» тратят его.",
      passives: [{ trigger: "onCardPlayed", effects: gain("combo") }],
    },
    deck: [
      // 4 атаки, 4 защиты, карта починки и карта темы класса (docs/classes.md)
      "a_strike", "a_strike", "a_strike", "a_strike",
      "a_roll", "a_roll", "a_roll", "a_roll",
      "a_tighten", "a_finisher",
    ],
    relics: ["venom_ring"],
  },
  warlock: {
    id: "warlock",
    name: "Чернокнижник",
    description: "Тьма: растёт от платы своим здоровьем и сожжённых карт.",
    maxHp: CONFIG.warlockMaxHp,
    drawPerTurn: CONFIG.drawPerTurn.warlock,
    potionWeight: CONFIG.potionWeight,
    mechanic: {
      name: "Тьма",
      resource: "darkness",
      text: "Каждая плата своим здоровьем и каждая сожжённая карта дают 1 Тьму. Удары врагов, Яд и прочий урон Тьму не дают. Тьма копится весь бой: тёмные карты растут от неё или тратят её.",
      passives: [
        // +1 Тьма за каждую плату своим HP и за каждую сожжённую карту (разбор механик: не за любой урон)
        { trigger: "onHpPaid", effects: gain("darkness") },
        { trigger: "onExhaust", effects: gain("darkness") },
      ],
    },
    deck: [
      // 4 атаки, 4 защиты, карта починки и карта темы класса (docs/classes.md)
      "w_bolt", "w_bolt", "w_bolt", "w_bolt",
      "w_shield", "w_shield", "w_shield", "w_shield",
      "w_bone_patch", "w_sacrifice",
    ],
    relics: ["soul_chalice"],
  },
  alchemist: {
    id: "alchemist",
    name: "Алхимик",
    description: "Варка: носит 4 зелья и варит их прямо в бою.",
    maxHp: CONFIG.alchemistMaxHp,
    drawPerTurn: CONFIG.drawPerTurn.alchemist,
    potionWeight: 0, // зелья Алхимика весят 0
    maxPotions: 4,
    mechanic: {
      name: "Варка",
      resource: "reagents",
      text: "Носит 4 зелья вместо 3 и варит их картами прямо в бою. Каждое сваренное зелье даёт 1 Реагент, каждое выпитое — 2. Смеси тратят Реагенты, катализаторы растут от них.",
      passives: [
        { trigger: "onPotionBrewed", effects: gain("reagents") },
        { trigger: "onPotionUsed", effects: gain("reagents", 2) },
      ],
    },
    deck: [
      // 4 атаки, 4 защиты, карта починки и карта темы класса (docs/classes.md)
      "al_toss", "al_toss", "al_toss", "al_toss",
      "al_guard", "al_guard", "al_guard", "al_guard",
      "al_resin", "al_brew",
    ],
    relics: ["field_cauldron"],
  },
  mage: {
    id: "mage",
    name: "Маг",
    description: "Подготовка: ставит сильные заклинания заранее, и они срабатывают сами.",
    maxHp: CONFIG.mageMaxHp,
    drawPerTurn: CONFIG.drawPerTurn.mage,
    potionWeight: CONFIG.potionWeight,
    prepares: true,
    mechanic: {
      name: "Прилив",
      resource: "surge",
      text: "Любое заклинание можно поставить на подготовку: оно готовится 2 × вес клеток и срабатывает само, на 50% сильнее. Заклинания готовятся по очереди, каждая пустая клетка шкалы ускоряет подготовку на 1. В начале каждого такта +1 Прилив: чародейские карты сильнее за каждый Прилив.",
      passives: [
        // Прилив растёт каждый ход: от него сильнее чародейские карты
        { trigger: "onTactStart", effects: gain("surge") },
      ],
    },
    deck: [
      // 4 атаки, 4 защиты, карта починки и карта темы класса (docs/classes.md)
      "m_spark", "m_spark", "m_spark", "m_spark",
      "m_barrier", "m_barrier", "m_barrier", "m_barrier",
      "m_rune_ward", "m_arcane_blast",
    ],
    relics: ["moon_bell"],
  },
};

// Сколько зелий носит герой: Алхимик больше остальных
export function getMaxPotions(heroId: HeroId): number {
  return HEROES[heroId]?.maxPotions ?? CONFIG.maxPotions;
}
