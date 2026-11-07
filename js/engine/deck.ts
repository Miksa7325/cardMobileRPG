// Колода в бою: стопка добора → рука → стопка сброса. Сожжённые карты уходят в отдельную стопку.
// Здесь же уровни улучшений: какой стала карта после N улучшений
import { CONFIG } from "../config.ts";
import { CARDS } from "../data/cards.ts";
import { shuffle } from "./rng.ts";
import type { CardData, CardInstance, Effect, LadderRarity, Piles, Rng } from "../types.ts";

type Leveled = { cardId: string; level: number };

// У каждой карты свой uid: в колоде несколько одинаковых Ударов, а различать их нужно
export function createPiles(deck: Leveled[], rng: Rng): Piles {
  const draw: CardInstance[] = deck.map((card, index) => ({ uid: index, cardId: card.cardId, level: card.level }));
  shuffle(rng, draw);
  return { draw, hand: [], discard: [], exhaust: [], nextUid: deck.length };
}

// Создаёт новую карту посреди боя: например, Рану от врага
export function createCardInstance(piles: Piles, cardId: string, level = 0): CardInstance {
  const instance = { uid: piles.nextUid, cardId, level };
  piles.nextUid += 1;
  return instance;
}

// ---------- Уровни улучшений ----------

const LADDER: LadderRarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

// Сколько улучшений до легендарной: стартовая и обычная — 4, необычная — 3, редкая — 2
export function stepsToLegendary(cardId: string): number {
  const rarity = CARDS[cardId].rarity;
  const index = rarity === "starter" ? 0 : LADDER.indexOf(rarity);
  return LADDER.length - 1 - index;
}

// Редкость карты после улучшений. Не улучшенная стартовая остаётся стартовой
export function getCardRarity(instance: Leveled): LadderRarity | "starter" {
  const rarity = CARDS[instance.cardId].rarity;
  if (rarity === "starter" && instance.level === 0) return "starter";
  const index = rarity === "starter" ? 0 : LADDER.indexOf(rarity);
  return LADDER[Math.min(index + instance.level, LADDER.length - 1)];
}

// Звёзды: улучшения сверх легендарной
export function getCardStars(instance: Leveled): number {
  return Math.max(0, instance.level - stepsToLegendary(instance.cardId));
}

// Числа карты × (1 + 10% за звезду), с округлением до целого
function starEffects(effects: Effect[], stars: number): Effect[] {
  const scale = (amount: number) => Math.round((amount * (100 + stars * CONFIG.starPercent)) / 100);
  return effects.map((effect) => {
    if (effect.type === "spend") return { ...effect, effects: starEffects(effect.effects, stars) };
    if ("amount" in effect && typeof effect.amount === "number" && effect.type !== "brewPotion") return { ...effect, amount: scale(effect.amount) };
    return effect;
  });
}

// Данные карты с учётом уровня: уровень 1 — поля из upgraded, дальше — из levels, после легендарной — звёзды
export function getCardData(instance: Leveled): CardData {
  const card = CARDS[instance.cardId];
  if (instance.level <= 0) return card;
  let data: CardData = { ...card, ...card.upgraded };
  const leveled = Math.min(instance.level, stepsToLegendary(instance.cardId));
  for (let level = 2; level <= leveled; level++) data = { ...data, ...card.levels?.[level - 2] };
  const stars = getCardStars(instance);
  if (stars > 0) {
    data = { ...data, effects: starEffects(data.effects, stars) };
    if (data.power) data.power = { ...data.power, effects: starEffects(data.power.effects, stars) };
  }
  return data;
}

// Улучшать можно карты, у которых есть улучшенная версия (Рану нельзя)
export function canUpgradeCard(cardId: string): boolean {
  return CARDS[cardId].upgraded !== undefined;
}

// Первая ступень (обычная → необычная): её дают отдых, тренировочная арена за золото и события
export function canUpgradeFirstStep(instance: Leveled): boolean {
  return instance.level === 0 && canUpgradeCard(instance.cardId);
}

// Улучшает карту на один уровень. Ограничения нет: после легендарной — звёзды
export function upgradeCard(instance: Leveled): void {
  if (canUpgradeCard(instance.cardId)) instance.level += 1;
}

// Добирает карты; если добор пуст, сброс перемешивается и становится добором
export function drawCards(piles: Piles, count: number, rng: Rng): void {
  for (let i = 0; i < count; i++) {
    if (piles.hand.length >= CONFIG.maxHandSize) return;
    if (piles.draw.length === 0) {
      if (piles.discard.length === 0) return;
      piles.draw = piles.discard;
      piles.discard = [];
      shuffle(rng, piles.draw);
    }
    piles.hand.push(piles.draw.pop()!);
  }
}

// Убирает карту из руки и возвращает её
export function takeFromHand(piles: Piles, uid: number): CardInstance {
  const index = piles.hand.findIndex((card) => card.uid === uid);
  return piles.hand.splice(index, 1)[0];
}

// Вся рука уходит в сброс
export function discardHand(piles: Piles): void {
  piles.discard.push(...piles.hand);
  piles.hand = [];
}
