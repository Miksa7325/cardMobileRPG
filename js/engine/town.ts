// Службы городских зданий: что они делают с героем и казной. Этот файл не трогает HTML и хранилище:
// сохраняет данные save.js, а показывает их ui/screens/cityServices.js.
// Все службы работают со снаряжением героя (getGear): если он сейчас в забеге — с тем, что при нём в забеге,
// иначе — с тем, что лежит в доме героев. У забега и у снаряжения одинаковые поля: deck, relics, potions, maxHp.
import { CONFIG } from "../config.ts";
import { CARDS } from "../data/cards.ts";
import { COSMETICS } from "../data/cosmetics.ts";
import { HEROES } from "../data/heroes.ts";
import { RELICS } from "../data/relics.ts";
import { canUpgradeFirstStep, upgradeCard } from "./deck.ts";
import { getLockedContent, isHeroDead } from "./meta.ts";
import { pickRandom, pickWeighted } from "./rng.ts";
import type { ArenaFight, Equipment, HeroId, Meta, Rng, Run } from "../types.ts";

// С чем работают службы: снаряжение в доме героев или забег, если герой сейчас в подземелье
export type Gear = Equipment | Run;

export function isBuilt(meta: Meta, buildingId: string): boolean {
  return meta.buildings.includes(buildingId);
}

// Снаряжение героя, которого ещё не было в подземелье: стартовая колода и реликвия
function createStarterEquipment(heroId: HeroId): Equipment {
  const hero = HEROES[heroId];
  return {
    deck: hero.deck.map((cardId, uid) => ({ uid, cardId, level: 0 })),
    nextCardUid: hero.deck.length,
    relics: [...hero.relics],
    potions: [],
    maxHp: hero.maxHp,
    fireflies: false,
  };
}

// Снаряжение, с которым работают службы. Если героя ещё не было в подземелье, у него появляется стартовое
export function getGear(meta: Meta, run: Run | null, heroId: HeroId): Gear {
  if (run && run.heroId === heroId) return run;
  const record = (meta.heroes[heroId] ??= { dead: false });
  return (record.equipment ??= createStarterEquipment(heroId));
}

// Платит из казны. Возвращает false, если золота не хватает
function pay(meta: Meta, price: number): boolean {
  if (meta.gold < price) return false;
  meta.gold -= price;
  return true;
}

// Тренировочная арена: какие карты можно улучшить. Пока только первая ступень за золото, дальше — на этапе 8
export function getTrainableCards(gear: Gear) {
  return gear.deck.filter(canUpgradeFirstStep);
}

export function trainCard(meta: Meta, gear: Gear, uid: number): boolean {
  const card = gear.deck.find((item) => item.uid === uid);
  if (!card || !canUpgradeFirstStep(card) || !pay(meta, CONFIG.city.prices.training)) return false;
  upgradeCard(card);
  return true;
}

// Храм: очищение — карта уходит из колоды навсегда
export function cleanseCard(meta: Meta, gear: Gear, uid: number): boolean {
  if (!gear.deck.some((card) => card.uid === uid) || !pay(meta, CONFIG.city.prices.cleanse)) return false;
  gear.deck = gear.deck.filter((card) => card.uid !== uid);
  return true;
}

// Храм: благословение прибавляет к запасу здоровья. Каждое следующее дороже: иначе золото без конца превращалось бы в HP.
// Герой в забеге сразу получает и сами HP
export function getBlessingPrice(gear: Gear): number {
  return CONFIG.city.prices.blessing + (gear.blessings ?? 0) * CONFIG.city.prices.blessingStep;
}

export function blessHero(meta: Meta, gear: Gear): boolean {
  if (!pay(meta, getBlessingPrice(gear))) return false;
  gear.blessings = (gear.blessings ?? 0) + 1;
  gear.maxHp += CONFIG.city.blessingHp;
  if (gear.hp !== undefined) gear.hp += CONFIG.city.blessingHp;
  return true;
}

// Кузница: реликвии, которые можно выковать. Без тех, что срабатывают при получении: им не на чем сработать в городе
function getForgePool(meta: Meta, gear: Gear) {
  const { lockedRelicIds } = getLockedContent(meta);
  return Object.values(RELICS).filter((relic) => (
    ["common", "uncommon"].includes(relic.rarity) && relic.trigger !== "onPickup"
    && !gear.relics.includes(relic.id) && !lockedRelicIds.includes(relic.id)
  ));
}

// Выковывает случайную реликвию. Возвращает её id или null, если ковать нечего или нечем платить
export function forgeRelic(meta: Meta, gear: Gear, rng: Rng): string | null {
  const pool = getForgePool(meta, gear);
  if (pool.length === 0 || !pay(meta, CONFIG.city.prices.forge)) return null;
  const relic = pickRandom(rng, pool);
  gear.relics.push(relic.id);
  if (!meta.seen.relics.includes(relic.id)) meta.seen.relics.push(relic.id);
  return relic.id;
}

// Библиотека: три карты героя на выбор. Пока одну не выучат, выбор тот же: перебирать его бесплатно нельзя
export function getLibraryOffers(meta: Meta, heroId: HeroId, rng: Rng): string[] {
  const library = (meta.library ??= {});
  if (!library[heroId]) {
    const pool = Object.values(CARDS).filter((card) => card.hero === heroId && !["starter", "status"].includes(card.rarity));
    const offers: string[] = [];
    while (offers.length < CONFIG.rewards.cardChoices && offers.length < pool.length) {
      const rarity = pickWeighted(rng, CONFIG.city.studyRarityWeights);
      const free = pool.filter((card) => !offers.includes(card.id));
      const sameRarity = free.filter((card) => card.rarity === rarity);
      offers.push(pickRandom(rng, sameRarity.length > 0 ? sameRarity : free).id);
    }
    library[heroId] = offers;
  }
  return library[heroId];
}

export function getStudyPrice(cardId: string): number {
  const prices: Record<string, number> = CONFIG.city.prices.study;
  return prices[CARDS[cardId].rarity] ?? prices.common;
}

// Учит карту из выбора библиотеки: она ложится в колоду, а выбор обновится при следующем визите
export function studyCard(meta: Meta, gear: Gear, heroId: HeroId, cardId: string): boolean {
  if (!meta.library?.[heroId]?.includes(cardId) || !pay(meta, getStudyPrice(cardId))) return false;
  gear.deck.push({ uid: gear.nextCardUid, cardId, level: 0 });
  gear.nextCardUid += 1;
  delete meta.library?.[heroId];
  if (!meta.seen.cards.includes(cardId)) meta.seen.cards.push(cardId);
  return true;
}

// Таверна: вместо погибшего героя можно нанять нового того же класса — со стартовым снаряжением
export function hireHero(meta: Meta, heroId: HeroId): boolean {
  if (!isHeroDead(meta, heroId) || !pay(meta, CONFIG.city.prices.hire)) return false;
  delete meta.heroes[heroId];
  return true;
}

// Гадалка: следующий спуск начнётся со случайной реликвией
export function buyFortune(meta: Meta): boolean {
  if (meta.supplies.blessing || !pay(meta, CONFIG.city.prices.fortune)) return false;
  meta.supplies.blessing = true;
  return true;
}

// Лавка красок: окраски покупаются один раз и подходят любому герою
export function isCosmeticOwned(meta: Meta, cosmeticId: string): boolean {
  return (meta.cosmetics?.owned ?? []).includes(cosmeticId);
}

export function buyCosmetic(meta: Meta, cosmeticId: string): boolean {
  const cosmetic = COSMETICS[cosmeticId];
  if (!cosmetic || isCosmeticOwned(meta, cosmeticId) || !pay(meta, cosmetic.price)) return false;
  (meta.cosmetics ??= { owned: [], worn: {} }).owned.push(cosmeticId);
  return true;
}

// Надевает окраску на героя; null — обычный вид
export function wearCosmetic(meta: Meta, heroId: HeroId, cosmeticId: string | null): boolean {
  if (cosmeticId !== null && !isCosmeticOwned(meta, cosmeticId)) return false;
  (meta.cosmetics ??= { owned: [], worn: {} }).worn[heroId] = cosmeticId;
  return true;
}

// Как перекрасить рисунок героя: фильтр его окраски или пусто
export function getHeroFilter(meta: Meta, heroId: HeroId): string {
  const worn = meta.cosmetics?.worn?.[heroId];
  return (worn && COSMETICS[worn]?.filter) || "";
}

// Боевая арена: бои без смерти. Победа приносит золото и эссенции в казну
export function getArenaFights(): ArenaFight[] {
  return CONFIG.city.arena;
}

export function awardArenaWin(meta: Meta, fightId: string): ArenaFight["reward"] | null {
  const fight = CONFIG.city.arena.find((item) => item.id === fightId);
  if (!fight) return null;
  meta.gold += fight.reward.gold;
  meta.essences += fight.reward.essences;
  return fight.reward;
}
