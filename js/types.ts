// Общие типы игры: как выглядят карта, эффект, враг, бой, забег, сохранение.
// Тип — это описание формы данных. Если в карте опечатка ("vulnarable" вместо "vulnerable")
// или забыто нужное поле, `npm run typecheck` и редактор покажут ошибку ещё до запуска игры.

// ---------- Простые списки значений ----------

// Статусы бойцов. Ресурсы классов (Ярость, Комбо, Тьма, Реагенты, Прилив) тоже хранятся как статусы
export type StatusId =
  | "vulnerable" // Уязвимость
  | "weak" // Слабость
  | "strength" // Сила
  | "dexterity" // Ловкость
  | "poison" // Яд
  | "burning" // Горение
  | "leech" // Печать крови Чернокнижника
  | "rage" // Ярость Воина
  | "combo" // Комбо Убийцы
  | "darkness" // Тьма Чернокнижника
  | "reagents" // Реагенты Алхимика
  | "surge" // Прилив Мага
  | "slow" // Замедление: следующие N действий весят на 1 больше
  | "haste" // Ускорение: следующие N действий весят на 1 меньше (не меньше 1)
  | "stun" // Оглушение: следующее действие срывается
  | "bleed"; // Кровотечение: при действии теряет стаки × вес действия HP мимо блока

export type Statuses = Partial<Record<StatusId, number>>;

// Когда срабатывают силы, реликвии и особенности классов
export type Trigger =
  | "onCombatStart"
  | "onCombatEnd"
  | "onTurnStart" // раз в начале хода: только особенности классов
  | "onTurnEnd"
  | "onTactStart" // в начале каждого такта (2 раза за ход)
  | "onTactEnd" // в конце каждого такта
  | "onCardPlayed"
  | "onDamageTaken"
  | "onEnemyDeath"
  | "onExhaust"
  | "onWoundBurned"
  | "onHpPaid"
  | "onPotionUsed"
  | "onPotionBrewed"
  | "onPickup"; // реликвия: в момент получения, вне боя

export type HeroId = "warrior" | "assassin" | "warlock" | "alchemist" | "mage";
export type CardType = "attack" | "skill" | "power" | "status";
export type CardRarity = "starter" | "common" | "uncommon" | "rare";
export type RelicRarity = "starter" | "common" | "uncommon" | "rare" | "boss";
// На кого играется карта или зелье
export type CardTarget = "enemy" | "allEnemies" | "self" | "none";
// target внутри эффекта главнее цели карты
export type EffectTarget = "self" | "allEnemies";
export type Intent = "attack" | "defend" | "buff" | "debuff";
export type PileName = "draw" | "hand" | "discard" | "exhaust";

// ---------- Эффекты ----------

// Прибавка к числу эффекта за ресурс: { status: "rage", per: 2 } — +2 за каждую Ярость
export interface Bonus {
  status: StatusId;
  per: number;
}

// Каждый эффект — отдельный вид со своими полями. type говорит, какой это эффект
export type Effect =
  // Бой
  | { type: "damage"; amount: number; fixed?: boolean; target?: EffectTarget; bonus?: Bonus }
  | { type: "block"; amount: number; target?: EffectTarget; bonus?: Bonus }
  | { type: "applyStatus"; status: StatusId; amount: number; target?: EffectTarget; bonus?: Bonus }
  | { type: "spend"; status: StatusId; amount: number; effects: Effect[] }
  // Сокрушение N: N Уязвимости на цель до урона этой же карты. Починка N: снять N Уязвимости с себя
  | { type: "sunder"; amount: number; target?: EffectTarget }
  | { type: "repair"; amount: number }
  | { type: "brewPotion"; amount: number }
  | { type: "heal"; amount: number }
  | { type: "loseHp"; amount: number }
  | { type: "draw"; amount: number }
  | { type: "gainEnergy"; amount: number; bonus?: Bonus }
  | { type: "exhaust" }
  | { type: "multiplyStatus"; status: StatusId; factor: number; target?: EffectTarget }
  | { type: "exhaustWounds" }
  // addCard в бою кладёт карту в стопку (pile), в событии — в колоду: конкретную (cardId) или случайную (rarity)
  | { type: "addCard"; cardId?: string; pile?: PileName; rarity?: CardRarity }
  // Вне боя: события и реликвии
  | { type: "gainGold"; amount: number }
  | { type: "loseGold"; amount: number }
  | { type: "losePotion"; fallbackHp?: number }
  | { type: "gainMaxHp"; amount: number }
  | { type: "loseMaxHp"; amount: number }
  | { type: "removeRandomCard"; rarity: CardRarity }
  | { type: "upgradeRandomCards"; count: number }
  | { type: "gainRelic" }
  | { type: "gainPotion" };

export type EffectType = Effect["type"];
// Эффект нужного вида: EffectOf<"damage"> — только урон
export type EffectOf<T extends EffectType> = Extract<Effect, { type: T }>;

// Постоянный эффект: карта-сила, особенность класса или акта. cardType — только для карт этого типа
export interface Power {
  trigger: Trigger;
  cardType?: CardType;
  effects: Effect[];
}

// ---------- Данные игры ----------

export interface CardData {
  id: string;
  name: string;
  type: CardType;
  rarity: CardRarity;
  cost: number | null; // null — карту нельзя разыграть (Рана)
  target: CardTarget;
  description: string;
  effects: Effect[];
  // Поля, которые заменяются у улучшенной карты
  upgraded?: Partial<Omit<CardData, "id" | "upgraded">>;
  power?: Power;
  hero?: HeroId; // чья это карта; у Раны героя нет
}

export interface EnemyMove {
  intent: Intent;
  effects: Effect[];
  weight: number; // сколько клеток шкалы занимает ход
}

export interface EnemyData {
  id: string;
  name: string;
  hp: [number, number]; // от и до
  moves: Record<string, EnemyMove>;
  pattern: string[]; // порядок ходов по кругу: имена из moves
}

export interface HeroData {
  id: HeroId;
  name: string;
  description: string;
  maxHp: number;
  maxPotions?: number;
  capacity: number; // вместимость шкалы: сколько клеток веса карт за ход
  drawPerTurn: number; // сколько карт добирается в начале хода
  potionWeight: number; // вес зелья на шкале: у Алхимика 0
  prepCapacity?: number; // Маг: вместимость дорожки подготовки
  mechanic: {
    name: string;
    resource: StatusId;
    text: string;
    passives: Power[];
    damageReduction?: number; // защита класса: на сколько процентов меньше урона от ударов
  };
  deck: string[];
  relics: string[];
}

export interface RelicData {
  id: string;
  name: string;
  icon: string;
  rarity: RelicRarity;
  description: string;
  trigger: Trigger;
  effects: Effect[];
  cardType?: CardType; // только для карт этого типа
  everyN?: number; // срабатывает каждый N-й раз
}

export interface PotionData {
  id: string;
  name: string;
  icon: string;
  target: CardTarget;
  description: string;
  effects: Effect[];
}

// Особенность акта: name и text видит игрок, остальное — её числа (подробно — в data/acts.ts)
export interface ActMechanic {
  name?: string;
  text?: string;
  deadEnds?: number;
  coldWater?: number;
  enemyBlock?: number;
  heroPoison?: number;
  noRest?: boolean;
  enemyStrength?: number;
  noMap?: boolean;
  heroPassives?: Power[];
  wounds?: number;
  extraEnemy?: boolean;
  enemyRamp?: number;
}

export type RarityWeights = Record<"common" | "uncommon" | "rare", number>;

export interface ActData {
  name: string;
  mechanic: ActMechanic;
  encounters: string[][];
  elites: string[][];
  boss: string[];
  enemyHpMultiplier: number;
  bossHpMultiplier?: number;
  enemyStrength: number;
  rewards: { essences: number; rarityWeights: RarityWeights; relics: RelicRarity[]; potionChance: number };
  startPrice: number;
}

export interface EventChoice {
  text: string;
  result: string;
  effects: Effect[];
}

export interface EventData {
  id: string;
  title: string;
  text: string;
  choices: EventChoice[];
}

export type BuildingService =
  | "home" | "hire" | "potions" | "study" | "forge" | "temple" | "training" | "arena" | "cosmetics" | "fortune";

export interface BuildingData {
  id: string;
  district: "center" | "east" | "west";
  x: number;
  y: number;
  name: string;
  description: string;
  price: number;
  service: BuildingService;
  unlocks: { events?: string[]; potions?: string[]; relics?: string[] };
}

export interface QuestData {
  id: string;
  title: string;
  description: string;
  stat: string;
  goal: number;
  reward: number;
}

// Товар у торговца или в лавке алхимика
export interface TraderGood {
  id: string;
  kind: "map" | "fireflies" | "potion";
  icon: string;
  name: string;
  description: string;
  price: number;
  potionId?: string;
}

export interface CosmeticData {
  id: string;
  name: string;
  filter: string; // CSS filter
  price: number;
}

export interface ArenaFight {
  id: string;
  name: string;
  enemyIds: string[];
  reward: { gold: number; essences: number };
}

// ---------- Бой ----------

export interface Rng {
  state: number;
}

// Карта в колоде или в бою. uid различает одинаковые карты
export interface CardInstance {
  uid: number;
  cardId: string;
  upgraded: boolean;
}

export interface Piles {
  draw: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  exhaust: CardInstance[];
  nextUid: number;
}

// Порция блока: держится 6 клеток с появления. expires — абсолютное время (клетки с начала боя), после которого её нет
export interface BlockPortion {
  amount: number;
  expires: number;
}

// Общее у героя и врагов. block — сумма всех порций, для показа
export interface Unit {
  hp: number;
  maxHp: number;
  block: number;
  blocks: BlockPortion[];
  statuses: Statuses;
}

export interface HeroUnit extends Unit {
  heroId: HeroId;
  powers: (Power & { cardId: string })[]; // разыгранные карты-силы
  passives: Power[]; // особенность класса и то, что навешивает акт
  damageReduction: number; // защита класса в процентах: Воин получает меньше урона от ударов
}

// Ход врага на его дорожке. Ходы стоят встык с клетки 1, где кончается — считает движок по весам и статусам
export interface EnemyAction {
  move: string; // имя хода из moves
  weight: number; // вес хода без статусов
  resolved: boolean;
  end?: number; // клетка, в которой ход сработал
}

export interface EnemyUnit extends Unit {
  instanceId: string;
  enemyId: string;
  patternIndex: number; // какой ход из pattern встанет на дорожку следующим
  lane: EnemyAction[]; // ходы этого хода
  carry: string[]; // ходы, которые не влезли в прошлый ход: встают первыми
}

// Карта или зелье на дорожке героя
export interface LaneItem {
  id: number; // номер постановки: при равенстве раньше срабатывает то, что поставили раньше
  kind: "card" | "potion";
  card?: CardInstance; // карта: пока она на шкале, её нет ни в руке, ни в стопках
  potionId?: string; // зелье: пока оно на шкале, его нет в сумке
  start: number; // вес ≥ 1: первая клетка (1–6); вес 0: стык (0 — перед клеткой 1, 6 — после клетки 6)
  weight: number; // вес без статусов
  targetId: string | null;
  locked: boolean; // уже сработали добор или вместимость: вернуть в руку нельзя
  resolved: boolean;
  end?: number; // клетка, в которой сработало
}

// Заклинание Мага на дорожке подготовки: сработает само в абсолютное время due, на 50% сильнее
export interface PreparedSpell {
  id: number;
  card: CardInstance;
  turn: number; // в каком ходу поставлено: вернуть в руку можно только в этом же ходу
  locked: boolean;
  weight: number;
  targetId: string | null;
  due: number; // абсолютное время срабатывания без статусов
}

// Выбор Алхимика: из двух зелий одно попадёт в сумку
export interface BrewChoice {
  options: string[];
}

// Событие для анимации: удар, блок, статус... Интерфейс проигрывает их по очереди
export interface CombatEvent {
  type: string;
  [field: string]: unknown;
}

// planning — игрок расставляет карты (в том числе на паузе посреди розыгрыша), resolving — идёт розыгрыш
export type CombatStatus = "planning" | "resolving" | "won" | "lost";

export interface Combat {
  rng: Rng;
  status: CombatStatus;
  turn: number;
  clock: number; // последняя разыгранная граница клеток этого хода: 0 — розыгрыш ещё не начался
  capacity: number; // вместимость шкалы героя
  capacityBonus: number; // «+N вместимости в этом ходу»
  lane: LaneItem[];
  prepared: PreparedSpell[]; // дорожка подготовки Мага, живёт между ходами
  nextLaneId: number;
  zeroUsed: number; // сколько карт весом 0 поставлено за ход
  rerollsLeft: number;
  keep: number[]; // карты, которые игрок оставит в руке
  carried: number[]; // карты, вытолкнутые со шкалы: остаются в руке
  brewChoices: BrewChoice[];
  launchGains: boolean; // во время розыгрыша пришли карты или вместимость: может быть пауза
  hero: HeroUnit;
  enemies: EnemyUnit[];
  piles: Piles;
  relics: string[];
  relicCounters: Record<string, number>;
  potions: string[];
  maxPotions: number;
  potionPool: string[];
  enemyRamp: number;
  events: CombatEvent[];
  tally?: Record<string, number>; // счётчики для заданий
}

// С чем работает эффект: кто действует, на кого, и от карты ли он
export interface EffectContext {
  source: HeroUnit | EnemyUnit;
  targets: (HeroUnit | EnemyUnit)[];
  fromCard: boolean;
  exhausted?: boolean; // карту надо сжечь после розыгрыша
  boost?: number; // во сколько раз сильнее урон, блок и статусы: подготовленное заклинание Мага — 1.5
}

// Ответ действий игрока
export type ActionResult = { ok: true } | { ok: false; reason: string };

// ---------- Забег ----------

export type NodeType = "battle" | "elite" | "boss" | "event" | "rest" | "shop" | "chest" | "save" | "deadEnd";

export interface MapNode {
  id: string;
  floor: number;
  column: number;
  type: NodeType | null; // null — пока генерация не назначила тип
  next: string[];
}

export interface DungeonMap {
  nodes: Record<string, MapNode>;
  rows: string[][];
}

// Что игрок получил вне боя: интерфейс показывает это списком
export interface Gain {
  kind: string;
  id?: string;
  amount?: number;
}

export interface Reward {
  essences: number;
  relicId: string | null;
  relicFallbackGold: number;
  potionId: string | null;
  potionsFull: boolean;
  cardIds: string[];
}

export interface ActiveEvent {
  eventId: string;
  travel?: boolean;
  chosenIndex: number | null;
  gains: Gain[];
}

export interface SeenLists {
  cards: string[];
  enemies: string[];
  relics: string[];
  potions: string[];
}

export interface CombatRecord {
  act: number;
  floor: number;
  type: NodeType | null;
  enemyIds: string[];
  turns: number;
  hpBefore: number;
  hpAfter: number;
  won: boolean;
}

export interface RunCard {
  uid: number;
  cardId: string;
  upgraded: boolean;
}

export interface Run {
  seed: number;
  heroId: HeroId;
  startAct: number;
  lockedCardIds: string[];
  lockedRelicIds: string[];
  lockedEventIds: string[];
  lockedPotionIds: string[];
  status: "active" | "won" | "lost";
  act: number;
  hp: number;
  maxHp: number;
  gold: number;
  essences: number;
  hasMap: boolean;
  fireflies: { charged: boolean } | null;
  revealedNodeIds: string[];
  deck: RunCard[];
  nextCardUid: number;
  relics: string[];
  potions: string[];
  map: DungeonMap;
  stats: { combats: CombatRecord[]; playMs: number; totals: Record<string, number> };
  seen: SeenLists;
  tutorialFight: boolean;
  savedCombat: Combat | null;
  currentNodeId: string | null;
  visitedNodeIds: string[];
  trail: string[];
  shopRemovals: string[];
  pendingReward: Reward | null;
  activeEvent: ActiveEvent | null;
  seenEventIds: string[];
  seenTravelEventIds?: string[];
  teleports?: number;
  blessings?: number;
}

// Снаряжение героя между забегами. У забега те же поля, поэтому службы города работают с обоими
export interface Equipment {
  deck: RunCard[];
  nextCardUid: number;
  relics: string[];
  potions: string[];
  maxHp: number;
  blessings?: number;
  fireflies: boolean;
  hp?: number; // есть только у забега
}

// ---------- Город и сохранения ----------

export interface Supplies {
  potions: string[];
  hasMap: boolean;
  fireflies: boolean;
  blessing: boolean;
}

export interface HeroRecord {
  dead: boolean;
  equipment?: Equipment;
}

export interface Meta {
  gold: number;
  essences: number;
  selectedHero: HeroId;
  heroes: Partial<Record<HeroId, HeroRecord>>;
  supplies: Supplies;
  buildings: string[];
  totals: Record<string, number>;
  claimedQuests: string[];
  runsPlayed: number;
  wins: number;
  bestFloor: number;
  bestAct: number;
  heroStats: Partial<Record<HeroId, { runs: number; wins: number }>>;
  seen: SeenLists;
  tutorialDone: boolean;
  library?: Partial<Record<HeroId, string[]>>; // выбор карт в библиотеке
  cosmetics?: { owned: string[]; worn: Partial<Record<HeroId, string | null>> };
}

export interface Settings {
  music: number;
  effects: number;
  fastAnimations: boolean;
  vibration: boolean;
  graphics: string;
}
