// Мета-прогресс: казна города, постройки, задания, выбранный герой и коллекция. Этот файл не трогает хранилище и HTML:
// сохраняет данные save.js, а показывает их интерфейс.
import { CONFIG } from "../config.ts";
import { ACTS } from "../data/acts.ts";
import { BUILDINGS } from "../data/buildings.ts";
import { HEROES, getMaxPotions } from "../data/heroes.ts";
import { POTIONS } from "../data/potions.ts";
import { QUESTS } from "../data/quests.ts";
import { POTION_PRICE, TRADER_GOODS } from "../data/trader.ts";
import { getEquipment, hasConqueredDungeon } from "./run.ts";
import type { ActMechanic, HeroId, Meta, QuestData, Run, SeenLists, Supplies, TraderGood } from "../types.ts";

export function createMeta(): Meta {
  return {
    gold: 0, // казна города: на золото строят дома и покупают у торговца
    essences: 0, // эссенции с монстров: в гильдии их меняют на золото
    shards: 0, // Осколки мастерства: на улучшения карт на Тренировочной арене
    selectedHero: "warrior", // кем герой спустится в подземелье: выбирают в доме героев
    // Герои этого сохранения: { warrior: { dead: false, equipment } }. Снаряжение у каждого своё и остаётся
    // между забегами, а погибший герой не возвращается вовсе. Героя без записи ещё не было в подземелье
    heroes: {},
    supplies: createSupplies(), // что куплено у торговца для следующего забега
    buildings: ["home"], // построенные здания: дом есть с самого начала
    totals: {}, // счётчики всех забегов для заданий
    claimedQuests: [], // задания, за которые уже получена награда
    runsPlayed: 0,
    wins: 0,
    bestFloor: 0, // самый дальний этаж за все забеги, считая этажи всех актов
    heroStats: {}, // { warrior: { runs: 3, wins: 1 } }
    seen: { cards: [], enemies: [], relics: [], potions: [] }, // коллекция: всё, что игрок встретил
    tutorialDone: false, // пройдено ли обучение в первом бою
  };
}

// Припасы на следующий забег: зелья в сумку, карта подземелья и банка светлячков
export function createSupplies(): Supplies {
  return { potions: [], hasMap: false, fireflies: false, blessing: false };
}

// Что пока закрыто: содержимое ещё не построенных зданий. Эти списки попадают в новый забег и не меняются до его конца
export function getLockedContent(meta: Meta) {
  const unbuilt = Object.values(BUILDINGS).filter((building) => !meta.buildings.includes(building.id));
  return {
    lockedCardIds: [] as string[],
    lockedRelicIds: unbuilt.flatMap((building) => building.unlocks.relics ?? []),
    lockedEventIds: unbuilt.flatMap((building) => building.unlocks.events ?? []),
    lockedPotionIds: unbuilt.flatMap((building) => building.unlocks.potions ?? []),
  };
}

// Покупка здания. Возвращает { ok: true } или { ok: false, reason: "..." }
export function buyBuilding(meta: Meta, buildingId: string): { ok: true } | { ok: false; reason: string } {
  const building = BUILDINGS[buildingId];
  if (meta.buildings.includes(buildingId)) return { ok: false, reason: "owned" };
  if (meta.gold < building.price) return { ok: false, reason: "notEnoughGold" };
  meta.gold -= building.price;
  meta.buildings.push(buildingId);
  return { ok: true };
}

// Колодец желаний: монетка из казны в колодец. roll — случайное число от 0 до 1, его даёт интерфейс.
// Чаще всего это просто загаданное желание, иногда колодец отвечает эссенциями или возвращает золото вдвое
export function throwWishCoin(meta: Meta, roll: number) {
  const price = CONFIG.city.wellPrice;
  if (meta.gold < price) return { ok: false, reason: "notEnoughGold" };
  meta.gold -= price;
  if (roll < 0.12) {
    meta.essences += 3;
    return { ok: true, outcome: "essences", amount: 3 };
  }
  if (roll < 0.37) {
    meta.gold += price * 2;
    return { ok: true, outcome: "gold", amount: price * 2 };
  }
  return { ok: true, outcome: "wish" };
}

export function selectHero(meta: Meta, heroId: HeroId): void {
  if (!isHeroDead(meta, heroId)) meta.selectedHero = heroId;
}

// Погиб ли герой в подземелье: тогда его больше нельзя выбрать
export function isHeroDead(meta: Meta, heroId: HeroId): boolean {
  return meta.heroes[heroId]?.dead === true;
}

// Снаряжение героя с прошлых забегов или null, если он ещё не спускался
export function getHeroEquipment(meta: Meta, heroId: HeroId) {
  return meta.heroes[heroId]?.equipment ?? null;
}

export function getAliveHeroIds(meta: Meta): HeroId[] {
  return (Object.keys(HEROES) as HeroId[]).filter((heroId) => !isHeroDead(meta, heroId));
}

// Герой вернулся из подземелья живым: всё, что при нём, остаётся у него до следующего забега
export function keepEquipment(meta: Meta, run: Run): void {
  meta.heroes[run.heroId] = { ...meta.heroes[run.heroId], dead: false, equipment: getEquipment(run) };
}

// Герой погиб: пропадают только несданные золото и эссенции. Снаряжение, всё набранное в забеге, открытые акты
// и несданные Осколки ждут его возрождения в Храме (решено 2026-11-10). Если он был выбран, выбираем первого живого
function buryHero(meta: Meta, run: Run): void {
  const record = meta.heroes[run.heroId];
  meta.heroes[run.heroId] = {
    ...record,
    dead: true,
    equipment: getEquipment(run),
    fallenShards: (record?.fallenShards ?? 0) + run.shards,
  };
  run.shards = 0;
  if (meta.selectedHero === run.heroId) meta.selectedHero = getAliveHeroIds(meta)[0] ?? run.heroId;
}

// Обмен в гильдии: все эссенции, которых хватает на целое золото, превращаются в золото.
// Остаток меньше курса остаётся. Возвращает, сколько золота получено
export function exchangeEssences(meta: Meta): number {
  const { essencesPerGold } = CONFIG.city;
  const gold = Math.floor(meta.essences / essencesPerGold);
  meta.essences -= gold * essencesPerGold;
  meta.gold += gold;
  return gold;
}

// Запоминает, что герой дошёл до этого акта (победил босса предыдущего). Открытые акты у каждого героя свои:
// нанятый вместо павшего начинает с 1 акта
function reachAct(meta: Meta, heroId: HeroId, act: number): void {
  const record = (meta.heroes[heroId] ??= { dead: false });
  record.bestAct = Math.max(record.bestAct ?? 1, act);
  // Летопись: рекорд класса остаётся навсегда, даже если героя потом заменят в таверне
  const chronicle = (meta.bestActs ??= {});
  chronicle[heroId] = Math.max(chronicle[heroId] ?? 1, act);
}

// Акт, с которого можно начать забег: номер, название и особенность для окна входа
export interface StartableAct {
  number: number;
  name: string;
  mechanic: ActMechanic;
}

// Вход в бездну в окне выбора акта: сами круги собираются случайно в каждом забеге, поэтому показываем общее описание
const ABYSS_ENTRY = {
  name: "Бесконечная бездна",
  mechanic: {
    name: "Случайные круги",
    text: "Каждый акт собран из врагов всех актов и двух случайных особенностей. С каждым кругом враги крепче, а награды богаче.",
  },
};

// С каких актов герой может начать забег: с первого и со всех, до которых он уже доходил, но не глубже входа
// в бездну (акт 11): дальше — только продолжая забег. Вход бесплатный
export function getStartableActs(meta: Meta, heroId: HeroId): StartableAct[] {
  const last = Math.min(meta.heroes[heroId]?.bestAct ?? 1, ACTS.length + 1);
  const acts: StartableAct[] = ACTS.slice(0, last).map((act, index) => ({ number: index + 1, name: act.name, mechanic: act.mechanic }));
  if (last > ACTS.length) acts.push({ number: ACTS.length + 1, ...ABYSS_ENTRY });
  return acts;
}

// Рекорд глубины героя: самый дальний акт, куда он доходил
export function getBestAct(meta: Meta, heroId: HeroId): number {
  return meta.heroes[heroId]?.bestAct ?? 1;
}

export function canStartAct(meta: Meta, heroId: HeroId, actNumber: number): boolean {
  return actNumber >= 1 && actNumber <= getStartableActs(meta, heroId).length;
}

// Сдаёт в казну добычу, которую герой несёт из подземелья. Возвращает, сколько сдано
export function bankLoot(meta: Meta, run: Run): { gold: number; essences: number; shards: number } {
  reachAct(meta, run.heroId, run.act);
  countVictory(meta, run);
  const loot = { gold: run.gold, essences: run.essences, shards: run.shards };
  meta.gold += run.gold;
  meta.essences += run.essences;
  meta.shards += run.shards;
  run.gold = 0;
  run.essences = 0;
  run.shards = 0;
  return loot;
}

// Что продаёт торговец: карту подземелья и банку светлячков
export function getTraderGoods(): TraderGood[] {
  return TRADER_GOODS;
}

// Что продаёт лавка алхимика: все открытые зелья
export function getPotionGoods(meta: Meta): TraderGood[] {
  const { lockedPotionIds } = getLockedContent(meta);
  return Object.values(POTIONS)
    .filter((potion) => !lockedPotionIds.includes(potion.id))
    .map((potion): TraderGood => ({
      id: potion.id, kind: "potion", potionId: potion.id, icon: potion.icon, name: potion.name, description: potion.description, price: POTION_PRICE,
    }));
}

// Куда уйдёт покупка у торговца: в текущий забег, если он идёт, иначе в припасы на следующий
function getHolder(meta: Meta, run: Run | null): Run | Supplies {
  return run ?? meta.supplies;
}

// Есть ли уже этот товар: карту и банку второй раз не купить
export function isTraderGoodOwned(meta: Meta, run: Run | null, good: TraderGood): boolean {
  const holder = getHolder(meta, run);
  if (good.kind === "map") return holder.hasMap;
  if (good.kind === "fireflies") return Boolean(holder.fireflies);
  return false;
}

// Покупка у торговца. Возвращает { ok: true } или { ok: false, reason: "..." }
export function buyFromTrader(meta: Meta, run: Run | null, good: TraderGood): { ok: true } | { ok: false; reason: string } {
  const holder = getHolder(meta, run);
  if (isTraderGoodOwned(meta, run, good)) return { ok: false, reason: "owned" };
  // Припасы пойдут герою, который спустится следующим: у Алхимика сумка больше
  const heroId = run?.heroId ?? meta.selectedHero;
  if (good.kind === "potion" && holder.potions.length >= getMaxPotions(heroId)) return { ok: false, reason: "potionsFull" };
  if (meta.gold < good.price) return { ok: false, reason: "notEnoughGold" };

  meta.gold -= good.price;
  if (good.kind === "potion" && good.potionId) {
    holder.potions.push(good.potionId);
    if (run && !run.seen.potions.includes(good.potionId)) run.seen.potions.push(good.potionId);
  }
  if (good.kind === "map") holder.hasMap = true;
  // В забеге банка сразу заряжена, в припасах это просто отметка, что она куплена
  if (good.kind === "fireflies") {
    if (run) run.fireflies = { charged: true };
    else meta.supplies.fireflies = true;
  }
  return { ok: true };
}

// Забирает припасы в новый забег: в казне их больше нет
export function takeSupplies(meta: Meta): Supplies {
  const supplies = meta.supplies;
  meta.supplies = createSupplies();
  return supplies;
}

export function getQuestProgress(meta: Meta, quest: QuestData): number {
  return Math.min(meta.totals[quest.stat] ?? 0, quest.goal);
}

export function isQuestClaimed(meta: Meta, quest: QuestData): boolean {
  return meta.claimedQuests.includes(quest.id);
}

export function isQuestReady(meta: Meta, quest: QuestData): boolean {
  return !isQuestClaimed(meta, quest) && getQuestProgress(meta, quest) >= quest.goal;
}

export function countReadyQuests(meta: Meta): number {
  return QUESTS.filter((quest) => isQuestReady(meta, quest)).length;
}

// Забирает награду за выполненное задание. Возвращает false, если забирать нечего
export function claimQuest(meta: Meta, questId: string): boolean {
  const quest = QUESTS.find((item) => item.id === questId);
  if (!quest || !isQuestReady(meta, quest)) return false;
  meta.claimedQuests.push(questId);
  meta.gold += quest.reward;
  return true;
}

// Этаж с учётом всех актов: босс не считается отдельным этажом
export function getTotalFloor(run: Run, currentFloor: number): number {
  const { floors } = CONFIG.map;
  return (run.act - 1) * floors + Math.min(currentFloor, floors);
}

// Переносит встреченное в забеге в коллекцию
export function mergeSeen(meta: Meta, run: Run): void {
  for (const kind of ["cards", "enemies", "relics", "potions"] as (keyof SeenLists)[]) {
    meta.seen[kind] = [...new Set([...meta.seen[kind], ...run.seen[kind]])];
  }
}

// Победа — босс 10 акта побеждён. Её засчитываем один раз: когда герой поднимается в город или погибает.
// Забег после победы не кончается, дальше бездна
function countVictory(meta: Meta, run: Run): void {
  if (run.victoryCounted || !hasConqueredDungeon(run)) return;
  run.victoryCounted = true;
  meta.wins += 1;
  meta.totals.wins = (meta.totals.wins ?? 0) + 1;
  const stats = meta.heroStats[run.heroId] ?? { runs: 0, wins: 0 };
  stats.wins += 1;
  meta.heroStats[run.heroId] = stats;
}

// Записывает итог законченного забега. Победивший герой сдаёт добычу в казну и оставляет снаряжение себе.
// Погибший пропадает навсегда вместе со снаряжением и всем, что нёс. Возвращает, что игрок получил
export function applyRunToMeta(meta: Meta, run: Run, currentFloor: number) {
  const readyBefore = QUESTS.filter((quest) => isQuestReady(meta, quest)).map((quest) => quest.id);
  const died = run.status === "lost";
  reachAct(meta, run.heroId, run.act);
  // Победа за босса 10 акта остаётся победой, даже если герой потом погиб в бездне
  countVictory(meta, run);
  // Погибший теряет всё несданное: и золото, и эссенции, и Осколки
  const loot = died ? { gold: 0, essences: 0, shards: 0 } : bankLoot(meta, run);
  if (died) buryHero(meta, run);
  else keepEquipment(meta, run);

  // Счётчики заданий: то, что набралось в забеге, плюс сам забег
  const add = (key: string, amount: number) => {
    meta.totals[key] = (meta.totals[key] ?? 0) + amount;
  };
  for (const [key, amount] of Object.entries(run.stats.totals ?? {})) add(key, amount);
  add("floors", getTotalFloor(run, currentFloor));
  add("runs", 1);
  add(`runs_${run.heroId}`, 1);
  meta.runsPlayed += 1;
  meta.bestFloor = Math.max(meta.bestFloor, getTotalFloor(run, currentFloor));

  const stats = meta.heroStats[run.heroId] ?? { runs: 0, wins: 0 };
  stats.runs += 1;
  meta.heroStats[run.heroId] = stats;

  mergeSeen(meta, run);

  return {
    died,
    goldGained: loot.gold,
    essencesGained: loot.essences,
    shardsGained: loot.shards,
    questsReady: QUESTS.filter((quest) => isQuestReady(meta, quest) && !readyBefore.includes(quest.id)).map((quest) => quest.title),
  };
}
