// Все враги игры. hp — диапазон, pattern — порядок ходов по кругу.
import type { Effect, EnemyData, EnemyMove, Statuses } from "../types.ts";

// Короткие записи для одинаковых ходов. Числа врагов меняй прямо в таблице ниже.
// options у каждого хода: w — вес (сколько клеток шкалы он занимает), sunder — Сокрушение N (Уязвимость герою до удара),
// repair — Починка N (враг снимает с себя Уязвимость), lifesteal — вампиризм (доля урона по HP, на которую враг лечится),
// hidden — скрытый ход: виден как «?», пока до срабатывания больше 2 клеток.
// Если w не указан: атака 3, защита, усиление и ослабление 2 (у врагов актов 1–3 веса указаны везде)
interface MoveOptions {
  w?: number;
  sunder?: number;
  repair?: number;
  lifesteal?: number;
  hidden?: boolean;
}

const extras = ({ sunder = 0, repair = 0 }: MoveOptions): Effect[] => [
  ...(sunder > 0 ? [{ type: "sunder", amount: sunder } as Effect] : []),
  ...(repair > 0 ? [{ type: "repair", amount: repair } as Effect] : []),
];

const attack = (damage: number, hits = 1, options: MoveOptions = {}): EnemyMove => ({
  intent: "attack",
  weight: options.w ?? 3,
  hidden: options.hidden,
  effects: [
    ...Array.from({ length: hits }, (): Effect => ({ type: "damage", amount: damage, ...(options.lifesteal ? { lifesteal: options.lifesteal } : {}) })),
    ...extras(options),
  ],
});
const guard = (block: number, options: MoveOptions = {}): EnemyMove => ({
  intent: "defend",
  weight: options.w ?? 2,
  hidden: options.hidden,
  effects: [{ type: "block", amount: block, target: "self" }, ...extras(options)],
});
const buff = (strength: number, block = 0, options: MoveOptions = {}): EnemyMove => ({
  intent: "buff",
  weight: options.w ?? 2,
  hidden: options.hidden,
  effects: [
    { type: "applyStatus", status: "strength", amount: strength, target: "self" },
    ...(block > 0 ? [{ type: "block", amount: block, target: "self" } as Effect] : []),
    ...extras(options),
  ],
});
// statuses: { weak: 2, poison: 1 }; wounds — сколько Ран добавить в сброс героя
const debuff = (statuses: Statuses, wounds = 0, options: MoveOptions = {}): EnemyMove => ({
  intent: "debuff",
  weight: options.w ?? 2,
  hidden: options.hidden,
  effects: [
    ...(Object.entries(statuses) as [keyof Statuses, number][]).map(([status, amount]): Effect => ({ type: "applyStatus", status, amount })),
    ...Array.from({ length: wounds }, (): Effect => ({ type: "addCard", cardId: "wound", pile: "discard" })),
  ],
});
// Призыв помощника, если живых помощников этого вида меньше max (по умолчанию 1)
const summon = (enemyId: string, options: MoveOptions = {}, max = 1): EnemyMove => ({
  intent: "buff",
  weight: options.w ?? 2,
  effects: [{ type: "summon", enemyId, ...(max > 1 ? { max } : {}) }],
});

export const ENEMIES: Record<string, EnemyData> = {
  // Акт 1: обычные
  cultist: {
    id: "cultist",
    name: "Культист",
    hp: [48, 54],
    // За ход успевает три действия: копит Силу и быстро режет
    moves: { ritual: buff(6, 0, { w: 2 }), slash: attack(6, 1, { w: 2 }) },
    pattern: ["ritual", "slash", "slash"],
  },
  skeleton: {
    id: "skeleton",
    name: "Скелет",
    hp: [36, 42],
    // Чинит доспех защитой: ломать броню стоит после его защиты
    moves: { hack: attack(9, 1, { w: 3 }), guard: guard(9, { w: 2, repair: 1 }), flurry: attack(4, 2, { w: 2 }) },
    pattern: ["hack", "guard", "flurry"],
  },
  spider: {
    id: "spider",
    name: "Паук",
    hp: [14, 18],
    // Быстрый: 3 хода за шкалу, против него нужен ранний блок. Ходы весом 1 давали тройке Пауков 15–18 действий за ход
    moves: { bite: attack(4, 1, { w: 2 }), venom: debuff({ poison: 2 }, 0, { w: 2 }), web: debuff({ weak: 1, slow: 1 }, 0, { w: 2 }) },
    pattern: ["bite", "venom", "web"],
  },

  // Акт 1: элита
  fallen_knight: {
    id: "fallen_knight",
    name: "Падший рыцарь",
    hp: [72, 78],
    // Ломает броню героя и чинит свою
    moves: {
      curse: debuff({ vulnerable: 2 }, 1, { w: 2 }),
      slam: attack(13, 1, { w: 3, sunder: 2 }),
      combo: attack(6, 2, { w: 3 }),
      fortify: buff(4, 8, { w: 2, repair: 2 }),
    },
    pattern: ["curse", "slam", "combo", "fortify"],
  },
  grave_hound: {
    id: "grave_hound",
    name: "Могильный пёс",
    hp: [62, 68],
    // Медленный тяжёлый рывок в конце шкалы: есть время закрыться
    moves: { maul: attack(4, 3, { w: 2 }), howl: buff(6, 0, { w: 1 }), rend: attack(15, 1, { w: 4, sunder: 2 }) },
    pattern: ["maul", "howl", "rend"],
  },

  // Акт 1: босс
  crypt_warden: {
    id: "crypt_warden",
    name: "Хранитель склепа",
    // Подобрано симулятором полного забега: HP 150 и коса с Сокрушением делали его стеной для всех классов
    hp: [120, 120],
    moves: {
      hex: debuff({ weak: 2, slow: 1 }, 1, { w: 2 }),
      scythe: attack(15, 1, { w: 3 }),
      fortify: buff(4, 12, { w: 2, repair: 2 }),
      flurry: attack(5, 3, { w: 2 }),
      call: summon("skeleton", { w: 2 }),
    },
    pattern: ["hex", "scythe", "fortify"],
    // На половине HP «Склеп пробуждается»: зовёт Скелета и ходит быстрее
    phases: [{ below: 0.5, pattern: ["flurry", "scythe", "call"], onEnter: [{ type: "summon", enemyId: "skeleton" }] }],
  },

  // Акт 2: обычные
  ghoul: {
    id: "ghoul",
    name: "Упырь",
    hp: [48, 54],
    // Быстрый: три хода за шкалу
    moves: { claw: attack(8, 1, { w: 2 }), infect: debuff({ poison: 3 }, 0, { w: 2 }), frenzy: attack(5, 2, { w: 2 }) },
    pattern: ["claw", "infect", "frenzy"],
  },
  bandit: {
    id: "bandit",
    name: "Разбойник",
    hp: [35, 40],
    // Скрытный: не видно, когда ударит
    moves: { stab: attack(9, 1, { w: 2, hidden: true }), dodge: guard(12, { w: 2 }), trip: debuff({ vulnerable: 2 }, 0, { w: 1 }) },
    pattern: ["trip", "stab", "dodge"],
  },
  banshee: {
    id: "banshee",
    name: "Банши",
    hp: [30, 35],
    // Замедляющая: отодвигает карты героя
    moves: { wail: debuff({ weak: 1, slow: 2 }, 0, { w: 2 }), scream: attack(7, 2, { w: 3 }) },
    pattern: ["wail", "scream"],
  },
  gargoyle: {
    id: "gargoyle",
    name: "Горгулья",
    hp: [56, 62],
    // Медленная: долгий тяжёлый удар, пока она в камне
    moves: { harden: guard(16, { w: 2, repair: 1 }), dive: attack(18, 1, { w: 4, sunder: 1 }) },
    pattern: ["harden", "dive"],
  },
  warlock: {
    id: "warlock",
    name: "Чернокнижник",
    hp: [42, 46],
    moves: { ritual: buff(6, 0, { w: 2 }), bolt: attack(8, 1, { w: 2 }), wither: debuff({ vulnerable: 2 }, 1, { w: 2 }) },
    pattern: ["ritual", "bolt", "wither"],
  },
  rat_swarm: {
    id: "rat_swarm",
    name: "Стая крыс",
    hp: [21, 24],
    // Самый быстрый враг: 6 ходов за шкалу. Кровотечение по ней бьёт при каждом ходе
    moves: { gnaw: attack(2, 2, { w: 1 }), plague: debuff({ poison: 2 }, 0, { w: 1 }) },
    pattern: ["gnaw", "gnaw", "plague"],
  },

  // Акт 2: элита
  bone_colossus: {
    id: "bone_colossus",
    name: "Костяной колосс",
    hp: [100, 108],
    // Медленный: один огромный удар на почти всю шкалу
    moves: { smash: attack(26, 1, { w: 5, sunder: 2 }), brace: buff(4, 18, { w: 2, repair: 2 }), sweep: attack(6, 3, { w: 3 }) },
    pattern: ["sweep", "brace", "smash"],
  },
  witch_queen: {
    id: "witch_queen",
    name: "Королева ведьм",
    hp: [80, 88],
    // Прерыватель: оцепенение срывает ход героя (у Мага — подготовку)
    moves: {
      hex: debuff({ vulnerable: 2, weak: 2 }, 1, { w: 2 }),
      curse: debuff({ poison: 4 }, 0, { w: 2 }),
      lash: attack(8, 2, { w: 2 }),
      stupor: debuff({ stun: 1 }, 0, { w: 2 }),
    },
    pattern: ["hex", "lash", "stupor", "curse"],
  },

  // Акт 2: босс
  vampire_lord: {
    id: "vampire_lord",
    name: "Лорд вампиров",
    hp: [204, 204],
    // Приём — скрытые ходы: видны как «?» и раскрываются за 2 клетки до срабатывания
    moves: {
      drain: debuff({ weak: 2, vulnerable: 2 }, 1, { w: 2 }),
      bite: attack(16, 1, { w: 3, hidden: true }),
      swarm: attack(5, 4, { w: 3, hidden: true }),
      feast: buff(6, 18, { w: 2 }),
      thirstBite: attack(16, 1, { w: 3, hidden: true, lifesteal: 0.5 }),
      thirstSwarm: attack(5, 4, { w: 3, hidden: true, lifesteal: 0.5 }),
    },
    pattern: ["drain", "bite", "swarm", "feast"],
    // На половине HP «Жажда»: укусы лечат его на половину урона по HP
    phases: [{ below: 0.5, pattern: ["thirstBite", "thirstSwarm", "feast"] }],
  },

  // Акт 3: обычные
  wraith: {
    id: "wraith",
    name: "Призрак",
    hp: [44, 50],
    // Замедляющий и скрытный
    moves: { touch: attack(10, 1, { w: 2, hidden: true }), fade: guard(16, { w: 2 }), chill: debuff({ weak: 1, slow: 2 }, 0, { w: 2 }) },
    pattern: ["chill", "touch", "fade"],
  },
  golem: {
    id: "golem",
    name: "Голем",
    hp: [79, 86],
    // Медленный: один удар на почти всю шкалу
    moves: { slam: attack(28, 1, { w: 5, sunder: 2 }), rebuild: guard(20, { w: 2, repair: 2 }), stomp: attack(6, 2, { w: 3 }) },
    pattern: ["stomp", "rebuild", "slam"],
  },
  blood_priest: {
    id: "blood_priest",
    name: "Жрец крови",
    hp: [54, 60],
    // Лечится ударами: Кровотечение и Яд по нему особенно хороши
    moves: { offering: buff(8, 0, { w: 2 }), sacrifice: attack(9, 1, { w: 2, lifesteal: 0.5 }), curse: debuff({ vulnerable: 2 }, 2, { w: 2 }) },
    pattern: ["offering", "sacrifice", "curse"],
  },
  assassin: {
    id: "assassin",
    name: "Убийца",
    hp: [38, 42],
    // Скрытный: метит и бьёт из тени
    moves: { mark: debuff({ vulnerable: 3 }, 0, { w: 1 }), strike: attack(17, 1, { w: 3, hidden: true, sunder: 1 }), vanish: guard(18, { w: 2 }) },
    pattern: ["mark", "strike", "vanish"],
  },
  hellhound: {
    id: "hellhound",
    name: "Адская гончая",
    hp: [50, 54],
    // Быстрая
    moves: { bite: attack(4, 3, { w: 2 }), burn: debuff({ burning: 7 }, 0, { w: 1 }), lunge: attack(13, 1, { w: 3 }) },
    pattern: ["bite", "burn", "lunge"],
  },
  acolyte: {
    id: "acolyte",
    name: "Послушник лича",
    hp: [35, 39],
    // Прерыватель: как его хозяин Король-лич
    moves: { bolt: attack(11, 1, { w: 2 }), ward: guard(14, { w: 2, repair: 1 }), stupor: debuff({ stun: 1 }, 1, { w: 2 }) },
    pattern: ["bolt", "stupor", "ward"],
  },

  // Акт 3: элита
  death_knight: {
    id: "death_knight",
    name: "Рыцарь смерти",
    hp: [128, 139],
    // Медленный и тяжёлый, чинится
    moves: {
      cleave: attack(19, 1, { w: 4, sunder: 2 }),
      dread: debuff({ vulnerable: 2, slow: 1 }, 1, { w: 2 }),
      combo: attack(8, 3, { w: 3 }),
      oath: buff(6, 22, { w: 2, repair: 3 }),
    },
    pattern: ["dread", "cleave", "combo", "oath"],
  },
  demon: {
    id: "demon",
    name: "Демон бездны",
    hp: [113, 124],
    // Тяжёлый: быстро копит Силу перед ударом
    moves: { rend: attack(6, 4, { w: 3 }), flames: debuff({ burning: 10 }, 0, { w: 2 }), roar: buff(8, 0, { w: 1 }), crush: attack(21, 1, { w: 4, sunder: 2 }) },
    pattern: ["rend", "flames", "roar", "crush"],
  },

  // Акт 3: босс
  lich_king: {
    id: "lich_king",
    name: "Король-лич",
    hp: [272, 272],
    // Приём — ледяная печать: раз в два такта замораживает клетку дорожки героя
    freezeCell: true,
    moves: {
      doom: debuff({ vulnerable: 2, weak: 2, slow: 1 }, 2, { w: 2 }),
      soulfire: attack(20, 1, { w: 3, sunder: 2 }),
      barrage: attack(6, 4, { w: 3 }),
      phylactery: buff(8, 26, { w: 2, repair: 3 }),
      plague: debuff({ poison: 6 }, 0, { w: 2 }),
      howl: debuff({ stun: 1 }, 0, { w: 2 }),
    },
    pattern: ["doom", "soulfire", "barrage", "plague", "phylactery"],
    // На половине HP «Вечная зима»: добавляет оглушающий вой
    phases: [{ below: 0.5, pattern: ["howl", "soulfire", "barrage", "phylactery"] }],
  },

  // Акт 4 «Ядовитые топи»: обычные
  bog_leech: {
    id: "bog_leech",
    name: "Болотная пиявка",
    hp: [20, 24],
    // Быстрая: 6 ходов за шкалу, лечится укусами. Кровотечение бьёт её на каждом ходу
    moves: { latch: attack(3, 2, { w: 1, lifesteal: 0.5 }), inject: debuff({ poison: 1 }, 0, { w: 1 }) },
    pattern: ["latch", "latch", "inject"],
  },
  toad: {
    id: "toad",
    name: "Ядовитая жаба",
    hp: [40, 46],
    // Травит и прячется
    moves: { spit: debuff({ poison: 3 }, 0, { w: 2 }), tongue: attack(7, 1, { w: 2 }), puff: guard(8, { w: 2, repair: 1 }) },
    pattern: ["spit", "tongue", "puff"],
  },
  drowned: {
    id: "drowned",
    name: "Утопленник",
    hp: [58, 64],
    // Медленный: тянет за собой, пока ты вязнешь
    moves: { mire: debuff({ slow: 1 }, 0, { w: 1 }), drag: attack(24, 1, { w: 5, sunder: 2 }) },
    pattern: ["mire", "drag"],
  },
  myconid: {
    id: "myconid",
    name: "Грибник",
    hp: [44, 50],
    // Призыватель: убей его первым, пока не размножился
    moves: {
      spores: debuff({ poison: 2, weak: 1 }, 0, { w: 2 }),
      club: attack(9, 1, { w: 2 }),
      sprout: summon("bog_leech", { w: 2 }),
    },
    pattern: ["spores", "club", "sprout"],
  },
  bog_hag: {
    id: "bog_hag",
    name: "Болотная ведьма",
    hp: [36, 42],
    // Прерыватель и скрытная
    moves: {
      hex: debuff({ stun: 1 }, 0, { w: 2 }),
      brew: debuff({ poison: 4 }, 0, { w: 2 }),
      staff: attack(10, 1, { w: 2, hidden: true }),
    },
    pattern: ["brew", "staff", "hex"],
  },

  // Акт 4: элита
  hydra: {
    id: "hydra",
    name: "Гидра",
    hp: [120, 130],
    // Становится опаснее к концу боя: на половине HP отращивает головы
    moves: {
      bites: attack(6, 3, { w: 3 }),
      breath: debuff({ poison: 4 }, 0, { w: 2 }),
      regrow: guard(15, { w: 2, repair: 2 }),
      heads: attack(6, 4, { w: 3 }),
    },
    pattern: ["bites", "breath", "regrow"],
    phases: [{ below: 0.5, pattern: ["heads", "breath", "regrow"] }],
  },
  mire_golem: {
    id: "mire_golem",
    name: "Трясинный голем",
    hp: [135, 145],
    // Медленный: замедлит и раздавит
    moves: {
      bog: debuff({ slow: 2 }, 0, { w: 2 }),
      crush: attack(30, 1, { w: 5, sunder: 2 }),
      overgrow: guard(20, { w: 2, repair: 2 }),
    },
    pattern: ["bog", "crush", "overgrow"],
  },

  // Акт 4: босс
  bog_mother: {
    id: "bog_mother",
    name: "Матерь топей",
    hp: [300, 300],
    // Приём — зовёт пиявок; на половине HP «Разлив»: хлёст лечит её на половину урона по HP
    moves: {
      fog: debuff({ poison: 5 }, 0, { w: 2 }),
      lash: attack(8, 2, { w: 3 }),
      call: summon("bog_leech", { w: 2 }, 2),
      absorb: guard(20, { w: 2, repair: 2 }),
      thirstLash: attack(8, 2, { w: 3, lifesteal: 0.5 }),
    },
    pattern: ["fog", "lash", "call", "absorb"],
    phases: [{ below: 0.5, pattern: ["fog", "thirstLash", "call", "thirstLash"] }],
  },

  // Акт 5 «Цитадель тьмы»: обычные
  citadel_guard: {
    id: "citadel_guard",
    name: "Страж цитадели",
    hp: [50, 56],
    // Медленный и бронированный
    moves: { shield: guard(14, { w: 2, repair: 1 }), halberd: attack(16, 1, { w: 4, sunder: 1 }) },
    pattern: ["shield", "halberd"],
  },
  crossbowman: {
    id: "crossbowman",
    name: "Тёмный арбалетчик",
    hp: [34, 38],
    // Скрытный: не видно, когда выстрелит
    moves: { aim: debuff({ vulnerable: 1 }, 0, { w: 1 }), bolt: attack(12, 1, { w: 3, hidden: true }) },
    pattern: ["aim", "bolt"],
  },
  inquisitor: {
    id: "inquisitor",
    name: "Инквизитор",
    hp: [46, 52],
    // Прерыватель
    moves: {
      interrogate: debuff({ stun: 1 }, 0, { w: 2 }),
      brand: debuff({ burning: 5 }, 0, { w: 2 }),
      whip: attack(6, 2, { w: 2 }),
    },
    pattern: ["brand", "whip", "interrogate"],
  },
  shadow_hound: {
    id: "shadow_hound",
    name: "Теневой пёс",
    hp: [30, 34],
    // Быстрый: 6 ходов за шкалу
    moves: { bite: attack(3, 2, { w: 1 }), howl: buff(2, 0, { w: 1 }) },
    pattern: ["bite", "bite", "howl"],
  },
  dark_mage: {
    id: "dark_mage",
    name: "Тёмный маг",
    hp: [36, 40],
    // Ослабляет и прячется
    moves: {
      curse: debuff({ weak: 2, vulnerable: 1 }, 0, { w: 2 }),
      bolt: attack(9, 1, { w: 2 }),
      ward: guard(10, { w: 2, repair: 1 }),
    },
    pattern: ["curse", "bolt", "ward"],
  },

  // Акт 5: элита
  black_knight: {
    id: "black_knight",
    name: "Чёрный рыцарь",
    hp: [140, 150],
    // Тяжёлый: ломает броню и чинит свою
    moves: {
      charge: attack(7, 3, { w: 3 }),
      smite: attack(22, 1, { w: 4, sunder: 2 }),
      oath: buff(4, 16, { w: 2, repair: 2 }),
    },
    pattern: ["charge", "oath", "smite"],
  },
  dark_cardinal: {
    id: "dark_cardinal",
    name: "Тёмный кардинал",
    hp: [110, 120],
    // Прерыватель и скрытный
    moves: {
      anathema: debuff({ stun: 1 }, 1, { w: 2 }),
      smite: attack(12, 2, { w: 3, hidden: true }),
      prayer: buff(4, 20, { w: 2 }),
    },
    pattern: ["anathema", "smite", "prayer"],
  },

  // Акт 5: босс
  citadel_lord: {
    id: "citadel_lord",
    name: "Владыка цитадели",
    hp: [340, 340],
    // Два приёма: зовёт Стражей (до двух), а на половине HP «Тёмный приказ» — удары скрытые
    moves: {
      command: summon("citadel_guard", { w: 2 }, 2),
      sword: attack(18, 1, { w: 3, sunder: 2 }),
      shadow: debuff({ weak: 2, vulnerable: 2 }, 0, { w: 2 }),
      bastion: guard(24, { w: 2, repair: 3 }),
      darkSword: attack(18, 1, { w: 3, sunder: 2, hidden: true }),
      whirl: attack(7, 3, { w: 3, hidden: true }),
    },
    pattern: ["command", "sword", "shadow", "bastion"],
    phases: [{ below: 0.5, pattern: ["darkSword", "whirl", "command", "bastion"] }],
  },

  // Акт 6 «Безлунные пещеры»: обычные
  cave_bat: {
    id: "cave_bat",
    name: "Пещерная мышь",
    hp: [22, 26],
    // Быстрая и скрытная
    moves: { swoop: attack(3, 2, { w: 1, hidden: true }), screech: debuff({ weak: 1 }, 0, { w: 1 }) },
    pattern: ["swoop", "swoop", "screech"],
  },
  blind_stalker: {
    id: "blind_stalker",
    name: "Слепой охотник",
    hp: [44, 50],
    // Скрытный: метит и бьёт из темноты
    moves: {
      track: debuff({ vulnerable: 2 }, 0, { w: 1 }),
      ambush: attack(15, 1, { w: 3, hidden: true, sunder: 1 }),
      lurk: guard(10, { w: 2 }),
    },
    pattern: ["track", "ambush", "lurk"],
  },
  frost_spirit: {
    id: "frost_spirit",
    name: "Ледяной дух",
    hp: [38, 42],
    // Замедляющий
    moves: { chill: debuff({ slow: 2 }, 0, { w: 2 }), touch: attack(8, 1, { w: 2 }), rime: guard(12, { w: 2, repair: 1 }) },
    pattern: ["chill", "touch", "rime"],
  },
  cave_troll: {
    id: "cave_troll",
    name: "Пещерный тролль",
    hp: [70, 78],
    // Медленный: один тяжёлый удар
    moves: { club: attack(26, 1, { w: 5, sunder: 2 }), regrow: guard(14, { w: 2, repair: 2 }) },
    pattern: ["regrow", "club"],
  },
  deep_worm: {
    id: "deep_worm",
    name: "Глубинный червь",
    hp: [50, 56],
    // Скрытный и бронированный
    moves: {
      burrow: guard(16, { w: 2 }),
      erupt: attack(11, 2, { w: 3, hidden: true }),
      acid: debuff({ vulnerable: 2 }, 0, { w: 2 }),
    },
    pattern: ["burrow", "erupt", "acid"],
  },

  // Акт 6: элита
  frost_giant: {
    id: "frost_giant",
    name: "Ледяной великан",
    hp: [150, 160],
    // Ледяная печать: раз в два такта замораживает клетку героя
    freezeCell: true,
    moves: {
      cold: debuff({ slow: 2, weak: 1 }, 0, { w: 2 }),
      avalanche: attack(28, 1, { w: 5, sunder: 2 }),
      ice: guard(20, { w: 2, repair: 2 }),
    },
    pattern: ["cold", "avalanche", "ice"],
  },
  broodmother: {
    id: "broodmother",
    name: "Матка теней",
    hp: [120, 130],
    // Призыватель и скрытная
    moves: {
      spawn: summon("cave_bat", { w: 2 }, 2),
      bite: attack(9, 2, { w: 3, hidden: true }),
      gloom: debuff({ weak: 2 }, 0, { w: 2 }),
    },
    pattern: ["spawn", "bite", "gloom"],
  },

  // Акт 6: босс
  light_devourer: {
    id: "light_devourer",
    name: "Пожиратель света",
    hp: [360, 360],
    // Во тьме все удары скрытые; на половине HP «Голод»: зовёт мышей и лечится ударами
    moves: {
      dark: debuff({ weak: 2, vulnerable: 2 }, 0, { w: 2 }),
      grasp: attack(20, 1, { w: 3, hidden: true, sunder: 2 }),
      tendrils: attack(6, 4, { w: 3, hidden: true }),
      condense: guard(24, { w: 2, repair: 3 }),
      call: summon("cave_bat", { w: 2 }, 2),
      hungryGrasp: attack(20, 1, { w: 3, hidden: true, sunder: 2, lifesteal: 0.5 }),
      hungryTendrils: attack(6, 4, { w: 3, hidden: true, lifesteal: 0.5 }),
    },
    pattern: ["dark", "grasp", "tendrils", "condense"],
    phases: [{ below: 0.5, pattern: ["call", "hungryGrasp", "hungryTendrils", "condense"] }],
  },

  // Акт 7 «Кузня демонов»: обычные
  imp: {
    id: "imp",
    name: "Бес",
    hp: [24, 28],
    // Быстрый: 6 ходов за шкалу
    moves: { spark: debuff({ burning: 2 }, 0, { w: 1 }), claws: attack(3, 2, { w: 1 }) },
    pattern: ["claws", "spark", "claws"],
  },
  demon_smith: {
    id: "demon_smith",
    name: "Демон-кузнец",
    hp: [60, 66],
    // Медленный: ломает броню
    moves: { hammer: attack(20, 1, { w: 4, sunder: 2 }), temper: buff(2, 14, { w: 2, repair: 1 }) },
    pattern: ["temper", "hammer"],
  },
  magma_elemental: {
    id: "magma_elemental",
    name: "Магмовый элементаль",
    hp: [54, 60],
    // Прячется и жжёт: тянет время, пока Жар работает на него
    moves: {
      erupt: debuff({ burning: 6 }, 0, { w: 2 }),
      slam: attack(10, 1, { w: 2 }),
      cool: guard(16, { w: 2, repair: 2 }),
    },
    pattern: ["erupt", "cool", "slam"],
  },
  ash_wraith: {
    id: "ash_wraith",
    name: "Пепельный дух",
    hp: [36, 40],
    // Замедляющий и скрытный
    moves: { ash: debuff({ weak: 1, slow: 1 }, 0, { w: 2 }), scorch: attack(7, 2, { w: 2, hidden: true }) },
    pattern: ["ash", "scorch"],
  },
  overseer: {
    id: "overseer",
    name: "Надсмотрщик",
    hp: [44, 50],
    // Призыватель
    moves: {
      whip: attack(8, 1, { w: 2 }),
      summonImp: summon("imp", { w: 2 }, 2),
      brand: debuff({ burning: 4, vulnerable: 1 }, 0, { w: 2 }),
    },
    pattern: ["summonImp", "whip", "brand"],
  },

  // Акт 7: элита
  forge_golem: {
    id: "forge_golem",
    name: "Литейный голем",
    hp: [160, 170],
    // Медленный и бронированный
    moves: {
      fist: attack(30, 1, { w: 5, sunder: 3 }),
      temper: guard(24, { w: 2, repair: 3 }),
      splash: debuff({ burning: 6 }, 0, { w: 2 }),
    },
    pattern: ["splash", "fist", "temper"],
  },
  flame_succubus: {
    id: "flame_succubus",
    name: "Огненная суккуба",
    hp: [120, 130],
    // Прерыватель, лечится ударами
    moves: {
      kiss: attack(12, 1, { w: 2, lifesteal: 0.5 }),
      charm: debuff({ stun: 1 }, 0, { w: 2 }),
      lash: attack(7, 3, { w: 3 }),
    },
    pattern: ["charm", "kiss", "lash"],
  },

  // Акт 7: босс
  forge_lord: {
    id: "forge_lord",
    name: "Повелитель горна",
    hp: [380, 380],
    // Приём — ускоряет сам себя: следующие ходы легче и при ничьей идут раньше героя.
    // На половине HP «Плавка»: литьё с Сокрушением
    moves: {
      bellows: { intent: "buff", weight: 1, effects: [{ type: "applyStatus", status: "haste", amount: 2, target: "self" }] },
      hammer: attack(24, 1, { w: 3, sunder: 2 }),
      heat: debuff({ burning: 8 }, 0, { w: 2 }),
      plate: guard(26, { w: 2, repair: 3 }),
      cast: attack(8, 3, { w: 3, sunder: 1 }),
    },
    pattern: ["bellows", "hammer", "heat", "plate"],
    phases: [{ below: 0.5, pattern: ["bellows", "hammer", "cast", "heat"] }],
  },

  // Акт 8 «Чумной некрополь»: обычные
  plague_zombie: {
    id: "plague_zombie",
    name: "Чумной зомби",
    hp: [44, 50],
    // Обычный темп: подкидывает Раны
    moves: { bite: attack(9, 1, { w: 2 }), infect: debuff({ poison: 2 }, 1, { w: 2 }), shamble: guard(8, { w: 2 }) },
    pattern: ["bite", "infect", "shamble"],
  },
  carrion_fly: {
    id: "carrion_fly",
    name: "Трупная муха",
    hp: [18, 22],
    // Быстрая и скрытная
    moves: { buzz: debuff({ weak: 1 }, 0, { w: 1 }), bite: attack(2, 2, { w: 1, hidden: true }) },
    pattern: ["bite", "buzz", "bite"],
  },
  plague_doctor: {
    id: "plague_doctor",
    name: "Чумной лекарь",
    hp: [40, 46],
    // Скрытный, чинится
    moves: {
      powder: debuff({ poison: 3, weak: 1 }, 0, { w: 2 }),
      lancet: attack(8, 1, { w: 2, hidden: true }),
      herbs: guard(12, { w: 2, repair: 2 }),
    },
    pattern: ["powder", "lancet", "herbs"],
  },
  corpse_eater: {
    id: "corpse_eater",
    name: "Трупоед",
    hp: [60, 68],
    // Лечится ударами
    moves: { devour: attack(14, 1, { w: 3, lifesteal: 0.5 }), retch: debuff({ poison: 3 }, 1, { w: 2 }) },
    pattern: ["retch", "devour"],
  },
  necromancer: {
    id: "necromancer",
    name: "Некромант",
    hp: [38, 42],
    // Призыватель
    moves: {
      raise: summon("plague_zombie", { w: 2 }),
      bolt: attack(10, 1, { w: 2 }),
      rot: debuff({ vulnerable: 2 }, 1, { w: 2 }),
    },
    pattern: ["raise", "bolt", "rot"],
  },

  // Акт 8: элита
  rot_giant: {
    id: "rot_giant",
    name: "Гниющий великан",
    hp: [160, 170],
    // Медленный: забивает колоду
    moves: {
      smash: attack(28, 1, { w: 5, sunder: 2 }),
      cloud: debuff({ poison: 5 }, 2, { w: 2 }),
      flesh: guard(20, { w: 2, repair: 2 }),
    },
    pattern: ["cloud", "smash", "flesh"],
  },
  plague_reaper: {
    id: "plague_reaper",
    name: "Чумной жнец",
    hp: [120, 130],
    // Прерыватель и скрытный
    moves: {
      scythe: attack(10, 2, { w: 3, hidden: true }),
      harvest: debuff({ stun: 1 }, 1, { w: 2 }),
      pestilence: debuff({ poison: 6 }, 0, { w: 2 }),
    },
    pattern: ["harvest", "scythe", "pestilence"],
  },

  // Акт 8: босс
  plague_lord: {
    id: "plague_lord",
    name: "Чумной владыка",
    hp: [400, 400],
    // Приём — чумной дар: Раны сразу в руку героя. На половине HP «Эпидемия»: поднимает зомби
    moves: {
      gift: {
        intent: "debuff",
        weight: 2,
        effects: [{ type: "addCard", cardId: "wound", pile: "hand" }, { type: "addCard", cardId: "wound", pile: "hand" }],
      },
      strike: attack(22, 1, { w: 3, sunder: 2 }),
      miasma: debuff({ poison: 5, weak: 2 }, 0, { w: 2 }),
      shroud: guard(26, { w: 2, repair: 3 }),
      raise: summon("plague_zombie", { w: 2 }, 2),
    },
    pattern: ["gift", "strike", "miasma", "shroud"],
    phases: [{ below: 0.5, pattern: ["gift", "raise", "strike", "miasma"] }],
  },

  // Акт 9 «Легион мёртвых»: обычные
  legionnaire: {
    id: "legionnaire",
    name: "Скелет-легионер",
    hp: [46, 52],
    // Обычный темп: строй щитов
    moves: { gladius: attack(9, 1, { w: 2 }), shieldWall: guard(12, { w: 2, repair: 1 }) },
    pattern: ["gladius", "shieldWall"],
  },
  bone_archer: {
    id: "bone_archer",
    name: "Костяной лучник",
    hp: [30, 34],
    // Скрытный
    moves: { aim: debuff({ vulnerable: 1 }, 0, { w: 1 }), volley: attack(5, 2, { w: 2, hidden: true }) },
    pattern: ["aim", "volley"],
  },
  war_hound: {
    id: "war_hound",
    name: "Боевая гончая",
    hp: [28, 32],
    // Быстрая
    moves: { bite: attack(4, 2, { w: 1 }), growl: debuff({ weak: 1 }, 0, { w: 1 }) },
    pattern: ["bite", "growl", "bite"],
  },
  banner_bearer: {
    id: "banner_bearer",
    name: "Мёртвый знаменосец",
    hp: [42, 48],
    // Призыватель
    moves: {
      horn: summon("legionnaire", { w: 2 }),
      pole: attack(8, 1, { w: 2 }),
      stand: guard(14, { w: 2, repair: 1 }),
    },
    pattern: ["horn", "pole", "stand"],
  },
  bone_ram: {
    id: "bone_ram",
    name: "Костяной таран",
    hp: [64, 72],
    // Медленный
    moves: { brace: guard(10, { w: 1 }), ram: attack(25, 1, { w: 4, sunder: 2 }) },
    pattern: ["brace", "ram"],
  },

  // Акт 9: элита
  dead_general: {
    id: "dead_general",
    name: "Мёртвый генерал",
    hp: [150, 160],
    // Призыватель
    moves: {
      order: summon("legionnaire", { w: 2 }, 2),
      blade: attack(9, 2, { w: 3 }),
      cleave: attack(22, 1, { w: 4, sunder: 2 }),
    },
    pattern: ["order", "blade", "cleave"],
  },
  death_rider: {
    id: "death_rider",
    name: "Всадник смерти",
    hp: [130, 140],
    // Сам себя ускоряет, бьёт скрыто
    moves: {
      spurs: { intent: "buff", weight: 1, effects: [{ type: "applyStatus", status: "haste", amount: 2, target: "self" }] },
      lance: attack(18, 1, { w: 3, hidden: true, sunder: 1 }),
      trample: attack(6, 3, { w: 3 }),
    },
    pattern: ["spurs", "lance", "trample"],
  },

  // Акт 9: босс
  legion_king: {
    id: "legion_king",
    name: "Король легиона",
    hp: [420, 420],
    // Приём — перекличка: зовёт двух легионеров за один ход. На половине HP «Последний бой»: все ходы весом 1
    moves: {
      rollcall: {
        intent: "buff",
        weight: 3,
        effects: [{ type: "summon", enemyId: "legionnaire", max: 2 }, { type: "summon", enemyId: "legionnaire", max: 2 }],
      },
      sword: attack(22, 1, { w: 3, sunder: 2 }),
      shield: guard(26, { w: 2, repair: 3 }),
      warcry: debuff({ weak: 2, vulnerable: 2 }, 0, { w: 2 }),
      quick: attack(7, 1, { w: 1 }),
      slash: attack(4, 2, { w: 1 }),
      shout: debuff({ weak: 1 }, 0, { w: 1 }),
    },
    pattern: ["rollcall", "sword", "shield", "warcry"],
    phases: [{ below: 0.5, pattern: ["quick", "quick", "slash", "shout", "quick", "rollcall"] }],
  },

  // Акт 10 «Сердце бездны»: обычные
  faceless: {
    id: "faceless",
    name: "Безликий",
    hp: [40, 46],
    // Скрытный
    moves: { whisper: debuff({ weak: 1, vulnerable: 1 }, 0, { w: 2 }), touch: attack(10, 1, { w: 2, hidden: true }) },
    pattern: ["whisper", "touch"],
  },
  abyss_spawn: {
    id: "abyss_spawn",
    name: "Отродье бездны",
    hp: [22, 26],
    // Быстрое: с Безумием разгоняется за один ход
    moves: { bite: attack(3, 2, { w: 1 }), rend: attack(5, 1, { w: 1 }) },
    pattern: ["bite", "bite", "rend"],
  },
  mind_flayer: {
    id: "mind_flayer",
    name: "Пожиратель разума",
    hp: [44, 50],
    // Прерыватель
    moves: {
      psychic: debuff({ stun: 1 }, 0, { w: 2 }),
      tentacles: attack(6, 2, { w: 2 }),
      absorb: guard(12, { w: 2, repair: 1 }),
    },
    pattern: ["tentacles", "psychic", "absorb"],
  },
  void_colossus: {
    id: "void_colossus",
    name: "Колосс пустоты",
    hp: [80, 88],
    // Медленный: от Безумия растёт мало, но бьёт страшно
    moves: { decay: attack(32, 1, { w: 5, sunder: 3 }), void: guard(18, { w: 2, repair: 2 }) },
    pattern: ["void", "decay"],
  },
  abyss_eye: {
    id: "abyss_eye",
    name: "Глаз бездны",
    hp: [36, 40],
    // Замедляющий
    moves: { gaze: debuff({ slow: 2 }, 0, { w: 2 }), beam: attack(12, 1, { w: 3 }), blink: guard(10, { w: 1 }) },
    pattern: ["gaze", "beam", "blink"],
  },

  // Акт 10: элита
  herald_of_madness: {
    id: "herald_of_madness",
    name: "Вестник безумия",
    hp: [160, 170],
    // Призыватель: его отродья разгоняются от Безумия
    moves: {
      spawn: summon("abyss_spawn", { w: 2 }, 2),
      scream: debuff({ weak: 2, vulnerable: 2 }, 1, { w: 2 }),
      strikes: attack(12, 2, { w: 3, hidden: true }),
    },
    pattern: ["spawn", "scream", "strikes"],
  },
  abyss_warden: {
    id: "abyss_warden",
    name: "Страж бездны",
    hp: [170, 180],
    // Медленный, отнимает клетку: ледяная печать раз в два такта
    freezeCell: true,
    moves: {
      judgment: attack(30, 1, { w: 5, sunder: 3 }),
      bastion: guard(26, { w: 2, repair: 3 }),
      seal: debuff({ weak: 1 }, 0, { w: 1 }),
    },
    pattern: ["seal", "judgment", "bastion"],
  },

  // Акт 10: финальный босс
  abyss_core: {
    id: "abyss_core",
    name: "Сердце бездны",
    hp: [480, 480],
    // Три фазы: весь бой ледяная печать и скрытые удары; на ⅔ HP «Рой» — зовёт отродий;
    // на ⅓ HP «Агония» — ускоряет сам себя и лечится ударами
    freezeCell: true,
    moves: {
      dark: debuff({ weak: 2, vulnerable: 2 }, 0, { w: 2 }),
      pulse: attack(20, 1, { w: 3, hidden: true, sunder: 2 }),
      shield: guard(28, { w: 2, repair: 3 }),
      swarm: summon("abyss_spawn", { w: 2 }, 2),
      frenzy: { intent: "buff", weight: 1, effects: [{ type: "applyStatus", status: "haste", amount: 2, target: "self" }] },
      hungryPulse: attack(20, 1, { w: 3, hidden: true, sunder: 2, lifesteal: 0.5 }),
      tentacles: attack(6, 4, { w: 3, lifesteal: 0.5 }),
    },
    pattern: ["dark", "pulse", "shield"],
    phases: [
      { below: 0.66, pattern: ["swarm", "pulse", "dark", "shield"] },
      { below: 0.33, pattern: ["frenzy", "hungryPulse", "tentacles", "shield"] },
    ],
  },
};
