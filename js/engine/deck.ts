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

// Какие числа растут от ступеней и звёзд: урон, блок, статусы, Сокрушение, Починка, лечение.
// Добор, вместимость, варка и плата HP не растут: иначе карта с каждой ступенью забирала бы больше HP
const SCALED: ReadonlySet<string> = new Set(["damage", "block", "applyStatus", "sunder", "repair", "heal"]);

function scaleEffects(effects: Effect[], percent: number, round: (value: number) => number): Effect[] {
  return effects.map((effect) => {
    if (effect.type === "spend") return { ...effect, effects: scaleEffects(effect.effects, percent, round) };
    if (SCALED.has(effect.type) && "amount" in effect) return { ...effect, amount: round((effect.amount * (100 + percent)) / 100 - 1e-9) };
    return effect;
  });
}

// Все списки эффектов карты сразу: основные, силы и бонуса цепочки
function scaleCard(data: CardData, percent: number, round: (value: number) => number): CardData {
  return {
    ...data,
    effects: scaleEffects(data.effects, percent, round),
    ...(data.power ? { power: { ...data.power, effects: scaleEffects(data.power.effects, percent, round) } } : {}),
    ...(data.chain ? { chain: { ...data.chain, effects: scaleEffects(data.chain.effects, percent, round) } } : {}),
  };
}

// Данные карты с учётом уровня: уровень 1 — поля из upgraded. Уровни 2… до легендарной — из levels, а где их нет —
// по формуле: +20% к числам за каждую такую ступень (округление вверх). После легендарной — звёзды (+10%, до целого)
export function getCardData(instance: Leveled): CardData {
  const card = CARDS[instance.cardId];
  if (instance.level <= 0) return card;
  let data: CardData = { ...card, ...card.upgraded };
  const leveled = Math.min(instance.level, stepsToLegendary(instance.cardId));
  let formulaSteps = 0;
  for (let level = 2; level <= leveled; level++) {
    const explicit = card.levels?.[level - 2];
    if (explicit) data = { ...data, ...explicit };
    else formulaSteps += 1;
  }
  if (formulaSteps > 0) data = scaleCard(data, formulaSteps * CONFIG.levelPercent, Math.ceil);
  const stars = getCardStars(instance);
  if (stars > 0) data = scaleCard(data, stars * CONFIG.starPercent, (value) => Math.round(value + 1e-9));
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
