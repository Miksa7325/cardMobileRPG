// Все карты игры: карты героев лежат в своих файлах (cardsWarrior.ts, cardsAssassin.ts…), здесь — сборка и Рана.
// В описании {damage}, {block}, {draw}, {energy}, {heal}, {sunder}, {repair} и {имя статуса} заменяются на итоговые числа.
// upgraded — поля, которые заменяются у улучшенной карты (уровень 1); levels — уровни выше (если не заданы, работает формула).
// power — постоянный эффект карты-силы: при каком триггере и какие эффекты срабатывают. chain — бонус цепочки.
import { ALCHEMIST_CARDS } from "./cardsAlchemist.ts";
import { ASSASSIN_CARDS } from "./cardsAssassin.ts";
import { MAGE_CARDS } from "./cardsMage.ts";
import { WARLOCK_CARDS } from "./cardsWarlock.ts";
import { WARRIOR_CARDS } from "./cardsWarrior.ts";
import type { CardData, HeroId } from "../types.ts";

export const CARDS: Record<string, CardData> = {
  // Рана: мусор в колоде, её нельзя разыграть. Своего героя у неё нет
  wound: {
    id: "wound",
    name: "Рана",
    type: "status",
    rarity: "common",
    cost: null, // null — карту нельзя разыграть
    target: "none",
    effects: [],
    description: "Нельзя разыграть.",
  },
};

// У каждой карты свой герой: только его карты выпадают ему в наградах и магазине
const BY_HERO: [HeroId, CardData[]][] = [
  ["warrior", WARRIOR_CARDS], ["assassin", ASSASSIN_CARDS], ["warlock", WARLOCK_CARDS], ["alchemist", ALCHEMIST_CARDS], ["mage", MAGE_CARDS],
];
for (const [hero, cards] of BY_HERO) {
  for (const card of cards) CARDS[card.id] = { ...card, hero };
}
