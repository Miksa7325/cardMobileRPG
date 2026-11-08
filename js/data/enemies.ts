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
// Призыв помощника (если живых помощников этого вида нет)
const summon = (enemyId: string, options: MoveOptions = {}): EnemyMove => ({
  intent: "buff",
  weight: options.w ?? 2,
  effects: [{ type: "summon", enemyId }],
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
    // Приём — ледяная печать: в начале каждого хода замораживает клетку дорожки героя
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
};
