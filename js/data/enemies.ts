// Все враги игры. hp — диапазон, pattern — порядок ходов по кругу.
import type { Effect, EnemyData, EnemyMove, Statuses } from "../types.ts";

// Короткие записи для одинаковых ходов. Числа врагов меняй прямо в таблице ниже.
// options у каждого хода: w — вес (сколько клеток шкалы он занимает), sunder — Сокрушение N (Уязвимость герою до удара),
// repair — Починка N (враг снимает с себя Уязвимость), lifesteal — вампиризм (доля урона по HP, на которую враг лечится),
// hidden — скрытый ход: виден как «?», пока до срабатывания больше 2 клеток.
// Если w не указан: атака 3, защита, усиление и ослабление 2 (так было на этапе 2; у врагов из актов 2–10 уточним на этапе 6)
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
    moves: { ritual: buff(3, 0, { w: 2 }), slash: attack(6, 1, { w: 2 }) },
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
    hp: [18, 24],
    // Быстрый: 4–6 лёгких ходов за шкалу. Против него нужен ранний блок
    moves: { bite: attack(4, 1, { w: 1 }), venom: debuff({ poison: 2 }, 0, { w: 1 }), web: debuff({ weak: 1, slow: 1 }, 0, { w: 1 }) },
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
      fortify: buff(2, 8, { w: 2, repair: 2 }),
    },
    pattern: ["curse", "slam", "combo", "fortify"],
  },
  grave_hound: {
    id: "grave_hound",
    name: "Могильный пёс",
    hp: [62, 68],
    // Медленный тяжёлый рывок в конце шкалы: есть время закрыться
    moves: { maul: attack(4, 3, { w: 2 }), howl: buff(3, 0, { w: 1 }), rend: attack(15, 1, { w: 4, sunder: 2 }) },
    pattern: ["maul", "howl", "rend"],
  },

  // Акт 1: босс
  crypt_warden: {
    id: "crypt_warden",
    name: "Хранитель склепа",
    hp: [150, 150],
    moves: {
      hex: debuff({ weak: 2, slow: 1 }, 1, { w: 2 }),
      scythe: attack(15, 1, { w: 3, sunder: 1 }),
      fortify: buff(2, 12, { w: 2, repair: 2 }),
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
    moves: { claw: attack(8), infect: debuff({ poison: 5 }), frenzy: attack(5, 2) },
    pattern: ["claw", "infect", "frenzy"],
  },
  bandit: {
    id: "bandit",
    name: "Разбойник",
    hp: [35, 40],
    moves: { stab: attack(9), dodge: guard(12), trip: debuff({ vulnerable: 2 }) },
    pattern: ["trip", "stab", "dodge"],
  },
  banshee: {
    id: "banshee",
    name: "Банши",
    hp: [30, 35],
    moves: { wail: debuff({ weak: 2, slow: 2 }), scream: attack(7, 2) },
    pattern: ["wail", "scream"],
  },
  gargoyle: {
    id: "gargoyle",
    name: "Горгулья",
    hp: [56, 62],
    moves: { harden: guard(16), dive: attack(12) },
    pattern: ["harden", "dive"],
  },
  warlock: {
    id: "warlock",
    name: "Чернокнижник",
    hp: [42, 46],
    moves: { ritual: buff(3), bolt: attack(8), wither: debuff({ vulnerable: 2 }, 1) },
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
    moves: { smash: attack(15), brace: buff(2, 18), sweep: attack(6, 3) },
    pattern: ["sweep", "brace", "smash"],
  },
  witch_queen: {
    id: "witch_queen",
    name: "Королева ведьм",
    hp: [80, 88],
    moves: { hex: debuff({ vulnerable: 2, weak: 2 }, 1), curse: debuff({ poison: 8 }), lash: attack(8, 2) },
    pattern: ["hex", "lash", "curse", "lash"],
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
      feast: buff(3, 18, { w: 2 }),
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
    moves: { touch: attack(10), fade: guard(16), chill: debuff({ weak: 2, slow: 2 }) },
    pattern: ["chill", "touch", "fade"],
  },
  golem: {
    id: "golem",
    name: "Голем",
    hp: [79, 86],
    moves: { slam: attack(15), rebuild: guard(20), stomp: attack(6, 2) },
    pattern: ["stomp", "rebuild", "slam"],
  },
  blood_priest: {
    id: "blood_priest",
    name: "Жрец крови",
    hp: [54, 60],
    moves: { offering: buff(4), sacrifice: attack(9), curse: debuff({ vulnerable: 2 }, 2) },
    pattern: ["offering", "sacrifice", "curse"],
  },
  assassin: {
    id: "assassin",
    name: "Убийца",
    hp: [38, 42],
    moves: { mark: debuff({ vulnerable: 3 }), strike: attack(17), vanish: guard(18) },
    pattern: ["mark", "strike", "vanish"],
  },
  hellhound: {
    id: "hellhound",
    name: "Адская гончая",
    hp: [50, 54],
    moves: { bite: attack(5, 3), burn: debuff({ burning: 7 }), lunge: attack(13) },
    pattern: ["bite", "burn", "lunge"],
  },
  acolyte: {
    id: "acolyte",
    name: "Послушник лича",
    hp: [35, 39],
    moves: { bolt: attack(11), ward: guard(14), drain: debuff({ weak: 2 }, 1) },
    pattern: ["bolt", "drain", "ward"],
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
      oath: buff(3, 22, { w: 2, repair: 3 }),
    },
    pattern: ["dread", "cleave", "combo", "oath"],
  },
  demon: {
    id: "demon",
    name: "Демон бездны",
    hp: [113, 124],
    moves: { rend: attack(6, 4), flames: debuff({ burning: 10 }), roar: buff(4), crush: attack(21) },
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
      phylactery: buff(4, 26, { w: 2, repair: 3 }),
      plague: debuff({ poison: 6 }, 0, { w: 2 }),
      howl: debuff({ stun: 1 }, 0, { w: 2 }),
    },
    pattern: ["doom", "soulfire", "barrage", "plague", "phylactery"],
    // На половине HP «Вечная зима»: добавляет оглушающий вой
    phases: [{ below: 0.5, pattern: ["howl", "soulfire", "barrage", "phylactery"] }],
  },
};
