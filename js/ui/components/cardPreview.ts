// Большая карта поверх экрана: полное описание, термины и что даст улучшение.
import { TEXTS } from "../../data/texts.ru.ts";
import { canUpgradeCard, getCardData, getCardRarity, getCardStars } from "../../engine/deck.ts";
import type { CardInstance } from "../../types.ts";

type Hero = { statuses: Record<string, number | undefined> };
import { el } from "../dom.js";
import { fillCardFace, formatDescription } from "./card.ts";
import { hideTooltip } from "./tooltip.js";

// Числа и термины в тексте выделяются. Текст собираем из узлов, поэтому разметка в него не попадёт
const HIGHLIGHT = /(\d+|Сжечь|Сжечь Раны|Яд[а-я]*|Уязвимост[а-я]*|Слабост[а-я]*|Сил[а-я]*|Ловкост[а-я]*|Горени[а-я]*|Сокрушени[а-я]*|Починк[а-я]*|Ран[а-я]*|блок[а-я]*)/g;

export function createRichText(className: string, text: string): HTMLElement {
  const paragraph: HTMLElement = el("p", className);
  let last = 0;
  for (const match of text.matchAll(HIGHLIGHT)) {
    paragraph.append(text.slice(last, match.index));
    const isNumber = /^\d/.test(match[0]);
    paragraph.append(el("b", isNumber ? "preview__number" : "preview__keyword", match[0]));
    last = (match.index ?? 0) + match[0].length;
  }
  paragraph.append(text.slice(last));
  return paragraph;
}

// Какие термины встречаются в описании
export function createGlossary(text: string): HTMLElement | null {
  const entries = Object.entries(TEXTS.glossary).filter(([word]) => text.includes(word));
  if (entries.length === 0) return null;
  const list: HTMLElement = el("div", "preview__glossary");
  for (const [, explanation] of entries) list.append(el("p", "preview__term", explanation));
  return list;
}

// Что изменится после улучшения. Карте со сниженной ценой хватит строки о цене
function createUpgradeNote(instance: CardInstance, hero: Hero): HTMLElement | null {
  if (instance.level > 0 || !canUpgradeCard(instance.cardId)) return null;
  const normal = getCardData(instance);
  const upgraded = getCardData({ ...instance, level: instance.level + 1 });
  const parts: string[] = [];
  const text = formatDescription(upgraded, hero);
  if (text !== formatDescription(normal, hero)) parts.push(text);
  if (upgraded.cost !== normal.cost && upgraded.cost !== null) parts.push(TEXTS.preview.upgradeCost(upgraded.cost));
  return parts.length > 0 ? createRichText("preview__upgrade", `${TEXTS.preview.upgrade} ${parts.join(" ")}`) : null;
}

export function openCardPreview(instance: CardInstance, hero: Hero): void {
  hideTooltip();
  const card = getCardData(instance);
  const overlay: HTMLElement = el("div", "card-preview");

  const big: HTMLElement = el("div", `card card--large card--${card.type} card--${card.rarity} card--playable`);
  fillCardFace(big, instance, hero);

  const text = formatDescription(card, hero);
  const details: HTMLElement = el("div", "preview__details");
  // Редкость — с учётом улучшений, после легендарной — звёзды
  const stars = getCardStars(instance);
  const rarity = `${TEXTS.preview.rarities[getCardRarity(instance)]}${stars > 0 ? ` ${"★".repeat(stars)}` : ""}`;
  details.append(
    el("p", "preview__kind", `${TEXTS.preview.types[card.type]} · ${rarity}`),
    createRichText("preview__text", text),
  );
  const glossary = createGlossary(text);
  if (glossary) details.append(glossary);
  const upgrade = createUpgradeNote(instance, hero);
  if (upgrade) details.append(upgrade);
  details.append(el("p", "preview__close", TEXTS.preview.close));

  overlay.append(big, details);
  closeOnTap(overlay);
  document.getElementById("app")?.append(overlay);
}

// Закрываем только касанием, которое началось уже на окне.
// Иначе карта, открытая удержанием, закрылась бы сразу, как только игрок отпустит палец
export function closeOnTap(overlay: HTMLElement): void {
  let pressedHere = false;
  overlay.addEventListener("pointerdown", () => {
    pressedHere = true;
  });
  overlay.addEventListener("click", () => {
    if (pressedHere) overlay.remove();
  });
}
