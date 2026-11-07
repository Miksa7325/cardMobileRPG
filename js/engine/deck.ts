// Колода в бою: стопка добора → рука → стопка сброса. Сожжённые карты уходят в отдельную стопку.
import { CONFIG } from "../config.ts";
import { CARDS } from "../data/cards.ts";
import { shuffle } from "./rng.ts";
import type { CardData, CardInstance, Piles, Rng } from "../types.ts";

// У каждой карты свой uid: в колоде несколько одинаковых Ударов, а различать их нужно
export function createPiles(deck: { cardId: string; upgraded: boolean }[], rng: Rng): Piles {
  const draw: CardInstance[] = deck.map((card, index) => ({ uid: index, cardId: card.cardId, upgraded: card.upgraded }));
  shuffle(rng, draw);
  return { draw, hand: [], discard: [], exhaust: [], nextUid: deck.length };
}

// Создаёт новую карту посреди боя: например, Рану от врага
export function createCardInstance(piles: Piles, cardId: string, upgraded = false): CardInstance {
  const instance = { uid: piles.nextUid, cardId, upgraded };
  piles.nextUid += 1;
  return instance;
}

// Данные карты с учётом улучшения: поля из upgraded заменяют обычные
export function getCardData(instance: { cardId: string; upgraded: boolean }): CardData {
  const card = CARDS[instance.cardId];
  return instance.upgraded ? { ...card, ...card.upgraded } : card;
}

export function canUpgradeCard(cardId: string): boolean {
  return CARDS[cardId].upgraded !== undefined;
}

// Улучшает карту, если у неё есть улучшенная версия
export function upgradeCard(instance: { cardId: string; upgraded: boolean }): void {
  if (canUpgradeCard(instance.cardId)) instance.upgraded = true;
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
