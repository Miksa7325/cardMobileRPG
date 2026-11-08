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
  | "onHpLost" // герой потерял HP чем угодно: удар, Яд, Горение, Кровотечение, плата HP
  | "onPotionUsed"
  | "onPotionBrewed"
  | "onPickup"; // реликвия: в момент получения, вне боя

export type HeroId = "warrior" | "assassin" | "warlock" | "alchemist" | "mage";
export type CardType = "attack" | "skill" | "power" | "status";
export type CardRarity = "starter" | "common" | "uncommon" | "rare";
// Лестница редкости улучшений: каждое улучшение — ступень выше, после легендарной — звёзды
export type LadderRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
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
  // lifesteal — доля урона по HP, на которую лечится тот, кто бьёт (вампиризм)
  | { type: "damage"; amount: number; fixed?: boolean; target?: EffectTarget; bonus?: Bonus; lifesteal?: number }
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
  // Враг призывает помощника: он встаёт рядом со своей дорожкой (если живых помощников меньше max)
  | { type: "summon"; enemyId: string; max?: number }
  // addCard в бою кладёт карту в стопку (pile), в событии — в колоду: конкретную (cardId) или случайную (rarity)
  | { type: "addCard"; cardId?: string; pile?: PileName; rarity?: CardRarity }
  // Вне боя: события и реликвии
  | { type: "gainGold"; amount: number }
  | { type: "loseGold"; amount: number }
  | { type: "losePotion"; fallbackHp?: number }
  | { type: "gainMaxHp"; amount: number }
  | { type: "loseMaxHp"; amount: number }
  | { type: "removeRandomCard"; rarity: CardRarity }
  | { type: "upgradeRandomCards"; count: number; cardType?: CardType } // cardType — только карты этого типа
  | { type: "gainRelic"; relicId?: string } // relicId — эта реликвия; если она уже есть, то случайная
  | { type: "gainPotion"; potionId?: string } // potionId — это зелье, без него — случайное
  | { type: "gainShards"; amount: number }; // Осколки мастерства: × множитель наград акта

export type EffectType = Effect["type"];
// Эффект нужного вида: EffectOf<"damage"> — только урон
export type EffectOf<T extends EffectType> = Extract<Effect, { type: T }>;

// Бонус цепочки: когда срабатывает и что даёт сверх обычных эффектов карты.
// first — карта первая на дорожке, final — последняя, afterAttack / afterSkill — стоит встык после атаки / навыка,
// joint — правый символ предыдущей карты (встык) совпал с левым символом этой, chain — карта N-я или дальше
export type ChainKind = "first" | "final" | "afterAttack" | "afterSkill" | "joint" | "chain";

export interface ChainBonus {
  kind: ChainKind;
  n?: number; // для chain: с какой по счёту карты
  effects: Effect[];
}

// Символы-стыки по краям карты: клинок, щит, искра
export type JointSymbol = "blade" | "shield" | "spark";

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
  // Поля, которые заменяются у улучшенной карты (уровень 1)
  upgraded?: Partial<Omit<CardData, "id" | "upgraded" | "levels">>;
  // Уровни 2, 3… до легендарной: что меняется ещё (поверх предыдущих). Пропишем на этапе 5
  levels?: Partial<Omit<CardData, "id" | "upgraded" | "levels">>[];
  power?: Power;
  chain?: ChainBonus; // на одной карте не больше одного бонуса цепочки
  joints?: { left?: JointSymbol; right?: JointSymbol };
  hero?: HeroId; // чья это карта; у Раны героя нет
}

export interface EnemyMove {
  intent: Intent;
  effects: Effect[];
  weight: number; // сколько клеток шкалы занимает ход
  hidden?: boolean; // скрытый ход: виден как «?» и раскрывается за 2 клетки до срабатывания
}

// Фаза босса: когда HP падает до доли below, враг переходит на новый набор ходов; onEnter — что он делает сразу
export interface EnemyPhase {
  below: number;
  pattern: string[];
  onEnter?: Effect[];
}

export interface EnemyData {
  id: string;
  name: string;
  hp: [number, number]; // от и до
  moves: Record<string, EnemyMove>;
  pattern: string[]; // порядок ходов по кругу: имена из moves
  phases?: EnemyPhase[]; // фазы босса по порядку
  freezeCell?: boolean; // приём: в начале каждого хода замораживает клетку дорожки героя
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
  prepares?: boolean; // Маг: есть дорожка подготовки
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

// Правило-реликвия меняет само правило шкалы, а не срабатывает по событию. Числа прибавляются к обычным
export interface RelicRules {
  capacity?: number; // клетки вместимости
  rerolls?: number; // перебросы за ход
  openDraws?: number; // открытые карты добора
  blockCells?: number; // сколько клеток держится блок
  zeroWeight?: number; // карт весом 0 за ход
  brewOptions?: number; // зелий на выбор при варке
  prepEmptyBonus?: number; // пустая клетка ускоряет подготовку Мага ещё на столько
  finalTwice?: boolean; // бонус «Финал» срабатывает дважды
}

export interface RelicData {
  id: string;
  name: string;
  icon: string;
  rarity: RelicRarity;
  description: string;
  trigger?: Trigger; // у правил-реликвий нет
  effects: Effect[];
  cardType?: CardType; // только для карт этого типа
  everyN?: number; // срабатывает каждый N-й раз
  hero?: HeroId; // классовая: выпадает только этому герою
  rules?: RelicRules;
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
  blockedCells?: number[]; // клетки шкалы героя, закрытые каждый ход (Трясина — 6, Иней — 1)
  minCardWeight?: number; // карты легче этого весят столько (Железная дисциплина: вес 0 → 1)
  enemyHaste?: number; // враги начинают бой с Ускорением (Натиск)
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

// Карта в колоде или в бою. uid различает одинаковые карты, level — сколько раз улучшена (0 — ни разу)
export interface CardInstance {
  uid: number;
  cardId: string;
  level: number;
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
  laneStart: number; // с какого стыка начинается дорожка: у призванного посреди хода — с момента призыва
  phase: number; // фаза босса: 0 — начальная
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
  progress: number; // сколько клеток подготовки уже сделано: нужно 2 × вес, заклинания готовятся очередью
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
  frozenCells: number[]; // замороженные клетки дорожки героя в этом ходу: в них нельзя ставить
  blockedCells?: number[]; // клетки, закрытые особенностью акта каждый ход
  minCardWeight?: number; // особенность акта: карты легче этого весят столько
  acting?: string; // чьё действие сейчас идёт: «lane:3», «prep:5», «enemy:skeleton-0:1», «tact». Попадает в события как by
  hero: HeroUnit;
  enemies: EnemyUnit[];
  piles: Piles;
  relics: string[];
  relicCounters: Record<string, number>;
  potions: string[];
  maxPotions: number;
  potionPool: string[];
  enemyRamp: number;
  enemyHpMultiplier: number; // во сколько раз крепче враги этого боя: так же крепки и призванные помощники
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

// cache — Тайник: без боя, награда на выбор (зелье, Осколки или золото)
export type NodeType = "battle" | "elite" | "boss" | "event" | "rest" | "cache" | "chest" | "save" | "deadEnd";

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

// Что лежит в Тайнике: взять можно одно. potionId — null, если зелий нет или сумка полна
export interface CacheOffer {
  potionId: string | null;
  shards: number;
  gold: number;
}

export interface Reward {
  essences: number;
  shards: number;
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
  level: number;
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
  shards: number; // Осколки мастерства, которые герой несёт: сдаются в казну в комнате сохранения
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
  pendingReward: Reward | null;
  pendingCache?: CacheOffer | null; // Тайник, из которого герой ещё ничего не взял
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
  bestAct?: number; // самый дальний акт, куда доходил герой: с начала любого из них он может начать забег
}

export interface Meta {
  gold: number;
  essences: number;
  shards: number; // Осколки мастерства в казне города
  selectedHero: HeroId;
  heroes: Partial<Record<HeroId, HeroRecord>>;
  supplies: Supplies;
  buildings: string[];
  totals: Record<string, number>;
  claimedQuests: string[];
  runsPlayed: number;
  wins: number;
  bestFloor: number;
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
