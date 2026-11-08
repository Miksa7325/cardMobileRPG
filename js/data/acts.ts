// Акты подземелья. Каждый следующий опаснее, у каждого своя особенность, а награды в нём ценнее.
// encounters, elites, boss — группы врагов из data/enemies.js. enemyHpMultiplier — во сколько раз враги акта крепче,
//   bossHpMultiplier — то же для босса (если не задан, берётся enemyHpMultiplier).
// mechanic — особенность акта: name и text видит игрок, остальное — её числа:
//   deadEnds — сколько боковых туннелей с тупиком (вместо CONFIG.map.deadEnds)
//   coldWater — сколько HP стоит шаг в неизведанную комнату
//   enemyBlock — с каким блоком враги начинают бой
//   heroPoison — сколько Яда у героя в начале боя
//   noRest — в акте нет отдыха; enemyStrength — Сила всех врагов
//   noMap — кромешная тьма: карта подземелья и светлячки бесполезны
//   heroPassives — триггеры, которые акт навешивает на героя (жар: потеря HP в конце хода)
//   wounds — сколько Ран замешано в колоду каждого боя; extraEnemy — в обычных боях на одного врага больше
//   enemyRamp — сколько Силы враг набирает после каждого своего хода
// enemyStrength акта — Сила всех его врагов: поздние акты собраны из знакомых врагов, и без неё они били бы слабо
// rewards: essences — множитель эссенций за бои, rarityWeights — шансы редкости карт в наградах,
//   relics — какой редкости реликвии у элит и в сундуках, potionChance — шанс зелья после боя.
import type { ActData } from "../types.ts";
export const ACTS: ActData[] = [
  {
    name: "Катакомбы",
    mechanic: { name: "Лабиринт", text: "Боковых туннелей с тупиками здесь больше обычного.", deadEnds: 6 },
    encounters: [
      ["cultist"],
      ["skeleton"],
      ["spider", "spider"],
      ["skeleton", "spider"],
      ["spider", "spider", "spider"],
    ],
    elites: [["fallen_knight"], ["grave_hound"]],
    boss: ["crypt_warden"],
    // В 1 акте общий множитель CONFIG.enemyHpMultiplier (×1,25) снят: враги и босс на 20% слабее (ручная проверка этапа 5)
    enemyHpMultiplier: 0.8,
    bossHpMultiplier: 0.92,
    enemyStrength: 0,
    rewards: { essences: 1, rarityWeights: { common: 60, uncommon: 30, rare: 10 }, relics: ["common", "uncommon"], potionChance: 0.4 },
  },
  {
    name: "Затопленный склеп",
    mechanic: { name: "Ледяная вода", text: "Каждый шаг в неизведанную комнату стоит 2 HP.", coldWater: 2 },
    encounters: [
      ["ghoul"],
      ["gargoyle"],
      ["bandit", "banshee"],
      ["warlock", "rat_swarm"],
      ["rat_swarm", "rat_swarm", "rat_swarm"],
      ["banshee", "rat_swarm"],
    ],
    elites: [["bone_colossus"], ["witch_queen"]],
    boss: ["vampire_lord"],
    enemyHpMultiplier: 1,
    bossHpMultiplier: 1.15,
    enemyStrength: 2,
    rewards: { essences: 1.4, rarityWeights: { common: 50, uncommon: 35, rare: 15 }, relics: ["common", "uncommon"], potionChance: 0.45 },
  },
  {
    name: "Логово нежити",
    mechanic: { name: "Костяные доспехи", text: "Враги начинают каждый бой с 8 блока.", enemyBlock: 8 },
    encounters: [
      ["golem"],
      ["wraith", "acolyte"],
      ["blood_priest", "assassin"],
      ["hellhound", "wraith"],
      ["assassin", "acolyte", "acolyte"],
      ["hellhound", "blood_priest"],
    ],
    elites: [["death_knight"], ["demon"]],
    boss: ["lich_king"],
    enemyHpMultiplier: 1,
    bossHpMultiplier: 1.1,
    enemyStrength: 2,
    rewards: { essences: 1.8, rarityWeights: { common: 40, uncommon: 40, rare: 20 }, relics: ["uncommon"], potionChance: 0.5 },
  },
  {
    name: "Ядовитые топи",
    // Вторая особенность — Трясина (этап 6): шестая клетка героя закрыта каждый ход
    mechanic: {
      name: "Ядовитые испарения и трясина",
      text: "Герой начинает каждый бой с 2 Яда. Последняя клетка шкалы каждый ход затянута тиной: в неё ничего не поставить.",
      heroPoison: 2,
      blockedCells: [6],
    },
    encounters: [
      ["toad"],
      ["drowned"],
      ["bog_leech", "bog_leech", "toad"],
      ["myconid", "bog_leech"],
      ["bog_hag", "toad"],
      ["drowned", "bog_leech"],
    ],
    elites: [["hydra"], ["mire_golem"]],
    boss: ["bog_mother"],
    enemyHpMultiplier: 1.3,
    // У Матери топей своё здоровье: множитель босса не нужен
    bossHpMultiplier: 1,
    enemyStrength: 2,
    rewards: { essences: 2.3, rarityWeights: { common: 30, uncommon: 42, rare: 28 }, relics: ["uncommon"], potionChance: 0.55 },
  },
  {
    name: "Цитадель тьмы",
    // Вторая особенность — Железная дисциплина (этап 6): карты весом 0 весят 1
    mechanic: {
      name: "Без передышки и железная дисциплина",
      text: "Отдыха в этом акте нет, а все враги получают +2 Силы. Карты весом 0 весят 1.",
      noRest: true,
      enemyStrength: 2,
      minCardWeight: 1,
    },
    encounters: [
      ["citadel_guard"],
      ["crossbowman", "dark_mage"],
      ["shadow_hound", "shadow_hound", "inquisitor"],
      ["citadel_guard", "crossbowman"],
      ["inquisitor", "dark_mage"],
      ["shadow_hound", "shadow_hound", "shadow_hound"],
    ],
    elites: [["black_knight"], ["dark_cardinal"]],
    boss: ["citadel_lord"],
    enemyHpMultiplier: 1.45,
    // У Владыки цитадели своё здоровье: множитель босса не нужен
    bossHpMultiplier: 1,
    enemyStrength: 2,
    rewards: { essences: 2.8, rarityWeights: { common: 20, uncommon: 45, rare: 35 }, relics: ["uncommon", "boss"], potionChance: 0.6 },
  },
  {
    name: "Безлунные пещеры",
    mechanic: { name: "Кромешная тьма", text: "Карта подземелья и светлячки здесь бесполезны, а тупиков больше обычного.", noMap: true, deadEnds: 6 },
    encounters: [
      ["spider", "spider", "grave_hound"],
      ["wraith", "banshee"],
      ["gargoyle", "gargoyle"],
      ["ghoul", "ghoul"],
      ["assassin", "bandit"],
      ["rat_swarm", "rat_swarm", "wraith"],
    ],
    elites: [["fallen_knight", "grave_hound"], ["witch_queen", "banshee"], ["bone_colossus"]],
    boss: ["crypt_warden", "grave_hound"],
    enemyHpMultiplier: 1.5,
    bossHpMultiplier: 1.95,
    enemyStrength: 2,
    rewards: { essences: 3.3, rarityWeights: { common: 20, uncommon: 45, rare: 35 }, relics: ["uncommon", "boss"], potionChance: 0.6 },
  },
  {
    name: "Кузня демонов",
    mechanic: {
      name: "Жар",
      text: "В конце каждого такта герой теряет 2 HP.",
      heroPassives: [{ trigger: "onTactEnd", effects: [{ type: "loseHp", amount: 2 }] }],
    },
    encounters: [
      ["hellhound", "hellhound"],
      ["golem", "acolyte"],
      ["blood_priest", "hellhound"],
      ["warlock", "warlock"],
      ["golem", "golem"],
      ["cultist", "cultist", "blood_priest"],
    ],
    elites: [["demon"], ["death_knight", "acolyte"], ["golem", "blood_priest", "acolyte"]],
    boss: ["demon", "hellhound"],
    enemyHpMultiplier: 1.55,
    bossHpMultiplier: 1.5,
    enemyStrength: 4,
    rewards: { essences: 3.8, rarityWeights: { common: 18, uncommon: 45, rare: 37 }, relics: ["uncommon", "boss"], potionChance: 0.62 },
  },
  {
    name: "Чумной некрополь",
    mechanic: { name: "Зараза", text: "В колоду каждого боя замешаны 3 Раны.", wounds: 3 },
    encounters: [
      ["ghoul", "ghoul", "rat_swarm"],
      ["skeleton", "skeleton", "acolyte"],
      ["blood_priest", "ghoul"],
      ["warlock", "wraith", "rat_swarm"],
      ["cultist", "banshee", "ghoul"],
      ["witch_queen"],
    ],
    elites: [["witch_queen", "ghoul"], ["bone_colossus", "acolyte"], ["vampire_lord"]],
    boss: ["witch_queen", "vampire_lord"],
    enemyHpMultiplier: 1.6,
    bossHpMultiplier: 0.9,
    enemyStrength: 4,
    rewards: { essences: 4.4, rarityWeights: { common: 15, uncommon: 45, rare: 40 }, relics: ["uncommon", "boss"], potionChance: 0.65 },
  },
  {
    name: "Легион мёртвых",
    mechanic: { name: "Орды", text: "В каждом обычном бою на одного врага больше.", extraEnemy: true },
    encounters: [
      ["skeleton", "fallen_knight"],
      ["death_knight"],
      ["wraith", "wraith"],
      ["bone_colossus"],
      ["assassin", "assassin"],
      ["gargoyle", "golem"],
    ],
    elites: [["death_knight", "acolyte"], ["bone_colossus", "fallen_knight"], ["fallen_knight", "grave_hound"], ["golem", "golem"]],
    boss: ["death_knight", "fallen_knight"],
    enemyHpMultiplier: 1.6,
    bossHpMultiplier: 1.65,
    enemyStrength: 4,
    rewards: { essences: 5, rarityWeights: { common: 12, uncommon: 43, rare: 45 }, relics: ["uncommon", "boss"], potionChance: 0.68 },
  },
  {
    name: "Сердце бездны",
    mechanic: { name: "Безумие", text: "После каждого своего хода враги набирают +2 Силы.", enemyRamp: 2 },
    encounters: [
      ["demon", "acolyte"],
      ["death_knight", "blood_priest"],
      ["witch_queen", "wraith"],
      ["bone_colossus", "golem"],
      ["vampire_lord"],
      ["hellhound", "hellhound", "hellhound"],
    ],
    elites: [["demon"], ["death_knight", "rat_swarm"], ["witch_queen", "ghoul"], ["bone_colossus", "blood_priest"]],
    boss: ["lich_king"],
    enemyHpMultiplier: 1.65,
    bossHpMultiplier: 1.25,
    enemyStrength: 4,
    rewards: { essences: 5.8, rarityWeights: { common: 10, uncommon: 40, rare: 50 }, relics: ["uncommon", "boss"], potionChance: 0.7 },
  },
];
