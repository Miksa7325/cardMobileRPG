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
    capacity: CONFIG.capacity.warrior,
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
      "strike", "strike", "strike", "strike",
      "defend", "defend", "defend", "defend",
      "bash", "rage_burst",
    ],
    relics: ["burning_blood"],
  },
  assassin: {
    id: "assassin",
    name: "Убийца",
    description: "Комбо: много дешёвых карт за ход, а потом — добивание.",
    maxHp: CONFIG.assassinMaxHp,
    capacity: CONFIG.capacity.assassin,
    drawPerTurn: CONFIG.drawPerTurn.assassin,
    potionWeight: CONFIG.potionWeight,
    mechanic: {
      name: "Комбо",
      resource: "combo",
      text: "Каждая разыгранная карта даёт 1 Комбо, в конце хода Комбо сгорает. Добивания бьют сильнее за каждое Комбо, а приёмы «Комбо N» тратят его.",
      passives: [{ trigger: "onCardPlayed", effects: gain("combo") }],
    },
    deck: [
      "a_strike", "a_strike", "a_strike", "a_strike",
      "a_dodge", "a_dodge", "a_dodge", "a_dodge",
      "a_dart", "a_finisher",
    ],
    relics: ["venom_ring"],
  },
  warlock: {
    id: "warlock",
    name: "Чернокнижник",
    description: "Тьма: платит здоровьем и Ранами, а Тьма копится весь бой.",
    maxHp: CONFIG.warlockMaxHp,
    capacity: CONFIG.capacity.warlock,
    drawPerTurn: CONFIG.drawPerTurn.warlock,
    potionWeight: CONFIG.potionWeight,
    mechanic: {
      name: "Тьма",
      resource: "darkness",
      text: "Каждая плата своим здоровьем и каждая сожжённая Рана дают 1 Тьму. Тьма копится весь бой: тёмные карты растут от неё или тратят её.",
      passives: [
        { trigger: "onHpPaid", effects: gain("darkness") },
        { trigger: "onWoundBurned", effects: gain("darkness") },
      ],
    },
    deck: [
      "w_bolt", "w_bolt", "w_bolt", "w_bolt",
      "w_shield", "w_shield", "w_shield", "w_shield",
      "w_sacrifice", "w_dark_bolt",
    ],
    relics: ["soul_chalice"],
  },
  alchemist: {
    id: "alchemist",
    name: "Алхимик",
    description: "Варка: носит 4 зелья и варит их прямо в бою.",
    maxHp: CONFIG.alchemistMaxHp,
    capacity: CONFIG.capacity.alchemist,
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
      "al_toss", "al_toss", "al_toss", "al_toss",
      "al_guard", "al_guard", "al_guard", "al_guard",
      "al_brew", "al_catalyst",
    ],
    relics: ["field_cauldron"],
  },
  mage: {
    id: "mage",
    name: "Маг",
    description: "Подготовка: ставит сильные заклинания заранее, и они срабатывают сами.",
    maxHp: CONFIG.mageMaxHp,
    capacity: CONFIG.capacity.mage,
    drawPerTurn: CONFIG.drawPerTurn.mage,
    potionWeight: CONFIG.potionWeight,
    prepCapacity: CONFIG.magePrepCapacity,
    mechanic: {
      name: "Прилив",
      resource: "surge",
      text: "Любое заклинание можно поставить на подготовку: оно сработает само через 2 × вес клеток и на 50% сильнее. В начале каждого хода +1 Прилив, каждый Прилив сокращает подготовку на клетку. Чародейские карты сильнее за каждый Прилив.",
      passives: [
        // Прилив сокращает задержку подготовки заклинаний: каждый — на клетку
        { trigger: "onTurnStart", effects: gain("surge") },
      ],
    },
    deck: [
      "m_spark", "m_spark", "m_spark", "m_spark",
      "m_barrier", "m_barrier", "m_barrier", "m_barrier",
      "m_frostbolt", "m_arcane_blast",
    ],
    relics: ["moon_bell"],
  },
};

// Сколько зелий носит герой: Алхимик больше остальных
export function getMaxPotions(heroId: HeroId): number {
  return HEROES[heroId]?.maxPotions ?? CONFIG.maxPotions;
}
