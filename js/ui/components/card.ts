// Рисует карту. На самой карте — значки с числами, полный текст показывает большая карта (cardPreview.ts).
import { TEXTS } from "../../data/texts.ru.ts";
import { getCardData } from "../../engine/deck.ts";
import { calculateBlock, calculateDamage, getBonus } from "../../engine/effects.ts";
import { playSound } from "../audio.js";
import { el } from "../dom.js";
import { CARD_ART, CARD_THEME } from "../cardArt.js";
import { createIcon } from "../icons.js";
import { addLongPress } from "../longPress.js";
import type { CardData, CardInstance, Effect } from "../../types.ts";

// Для чисел на карте хватает статусов героя: вне боя они пустые
type Hero = { statuses: Record<string, number | undefined> };
type Suffix = string | Node | (string | Node)[];

const NAME_FIT_LETTERS = 8; // столько букв помещается в строку названия обычным шрифтом

// Эффекты карты вместе с теми, что спрятаны внутри «потратить ресурс»: числа в описании идут в этом порядке
function flattenEffects(effects: Effect[]): Effect[] {
  return effects.flatMap((effect) => (effect.type === "spend" ? [effect, ...flattenEffects(effect.effects)] : [effect]));
}

// Подставляет в полное описание итоговые числа: например, {damage} с учётом Силы, Слабости и ресурса героя
export function formatDescription(card: CardData, hero: Hero): string {
  let text = card.description;
  for (const effect of flattenEffects(card.effects)) {
    text = fillEffect(text, effect, hero, true);
  }
  // Бонус цепочки: его числа идут в описании после основных
  for (const effect of flattenEffects(card.chain?.effects ?? [])) {
    text = fillEffect(text, effect, hero, true);
  }
  // Эффекты силы идут не от разыгранной карты, поэтому Ловкость на них не влияет
  for (const effect of card.power?.effects ?? []) {
    text = fillEffect(text, effect, hero, false);
  }
  return text;
}

function fillEffect(text: string, effect: Effect, hero: Hero, fromCard: boolean): string {
  switch (effect.type) {
    case "damage": {
      const base = effect.amount + getBonus(effect, hero);
      return text.replace("{damage}", String(effect.fixed ? base : calculateDamage(base, hero, null)));
    }
    case "block":
      return text.replace("{block}", String(calculateBlock(effect.amount + getBonus(effect, hero), hero, fromCard)));
    case "applyStatus":
      return text.replace(`{${effect.status}}`, String(effect.amount + getBonus(effect, hero)));
    case "sunder":
      return text.replace("{sunder}", String(effect.amount));
    case "repair":
      return text.replace("{repair}", String(effect.amount));
    case "draw":
      return text.replace("{draw}", String(effect.amount));
    case "gainEnergy":
      return text.replace("{energy}", String(effect.amount));
    case "heal":
      return text.replace("{heal}", String(effect.amount));
    case "loseHp":
      return text.replace("{loseHp}", String(effect.amount));
    default:
      return text;
  }
}

// Число сравниваем с базовым: зелёное — усилено, красное — ослаблено
function createValue(text: string, current: number, base: number): HTMLElement {
  const value: HTMLElement = el("b", "card__value", text);
  if (current > base) value.classList.add("card__value--up");
  if (current < base) value.classList.add("card__value--down");
  return value;
}

// icon — имя значка из ui/icons.js; suffix — подпись, может быть со значком ресурса: ["+2/", значок]
function createLine(icon: string, valueElement: HTMLElement | null, suffix: Suffix = []): HTMLElement {
  const line: HTMLElement = el("div", "card__line");
  line.append(createIcon(icon, "card__icon"));
  if (valueElement) line.append(valueElement);
  const parts = [suffix].flat().filter(Boolean);
  if (parts.length > 0) {
    const tail: HTMLElement = el("span", "card__suffix");
    tail.append(...parts);
    line.append(tail);
  }
  return line;
}

// Превращает список эффектов в короткие строки со значками. Эффект с целью «все» подписывается,
// а эффект, который растёт от ресурса героя, — сколько он прибавляет: «+2/» и значок ресурса
function createEffectLines(effects: Effect[], card: CardData, hero: Hero, fromCard: boolean): HTMLElement[] {
  const { face } = TEXTS;
  const lines: HTMLElement[] = [];
  const allSuffix = (effect: Effect) => (card.target === "allEnemies" || ("target" in effect && effect.target === "allEnemies") ? face.all : "");
  const growSuffix = (effect: Effect): (string | Node)[] => ("bonus" in effect && effect.bonus ? [`+${effect.bonus.per}/`, createIcon(effect.bonus.status)] : []);
  const suffix = (effect: Effect): (string | Node)[] => [allSuffix(effect) && `${allSuffix(effect)} `, ...growSuffix(effect)].filter(Boolean);

  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    switch (effect.type) {
      case "damage": {
        // Несколько одинаковых ударов подряд — одна строка: «⚔️ 5×3»
        let hits = 1;
        while (effects[i + hits]?.type === "damage" && (effects[i + hits] as Effect & { amount: number }).amount === effect.amount) hits += 1;
        i += hits - 1;
        const base = effect.amount + getBonus(effect, hero);
        const amount = effect.fixed ? base : calculateDamage(base, hero, null);
        const text = hits > 1 ? `${amount}×${hits}` : String(amount);
        lines.push(createLine("damage", createValue(text, amount, effect.amount), suffix(effect)));
        break;
      }
      case "block": {
        const amount = calculateBlock(effect.amount + getBonus(effect, hero), hero, fromCard);
        lines.push(createLine("block", createValue(String(amount), amount, effect.amount), growSuffix(effect)));
        break;
      }
      case "applyStatus": {
        const amount = effect.amount + getBonus(effect, hero);
        lines.push(createLine(effect.status, createValue(String(amount), amount, effect.amount), suffix(effect)));
        break;
      }
      // «Ярость 3:» и под ней то, что случится, если ресурса хватит
      case "spend":
        lines.push(createLine(effect.status, createValue(`${effect.amount}:`, 0, 0), face.spend));
        lines.push(...createEffectLines(effect.effects, card, hero, fromCard));
        break;
      // Сокрушение и Починка: ломают броню врага и чинят свою
      case "sunder":
        lines.push(createLine("vulnerable", createValue(String(effect.amount), 0, 0), face.sunder));
        break;
      case "repair":
        lines.push(createLine("block", createValue(`−${effect.amount}`, 0, 0), face.repair));
        break;
      case "brewPotion":
        lines.push(createLine("brew", createValue(`+${effect.amount}`, 0, 0), face.brew));
        break;
      case "multiplyStatus":
        lines.push(createLine(effect.status, createValue(`×${effect.factor}`, 0, 0)));
        break;
      case "draw":
        lines.push(createLine("draw", createValue(`+${effect.amount}`, 0, 0)));
        break;
      case "gainEnergy":
        lines.push(createLine("energy", createValue(`+${effect.amount}`, 0, 0)));
        break;
      case "heal":
        lines.push(createLine("heal", createValue(`+${effect.amount}`, 0, 0)));
        break;
      case "loseHp":
        lines.push(createLine("hpLoss", createValue(`−${effect.amount}`, 0, 0)));
        break;
      case "addCard": {
        // Несколько Ран подряд — одна строка
        let count = 1;
        while (effects[i + count]?.type === "addCard") count += 1;
        i += count - 1;
        lines.push(createLine("wound", createValue(`+${count}`, 0, 0), face.wound));
        break;
      }
      case "exhaustWounds":
        lines.push(createLine("burn", null, face.burnWounds));
        break;
      default: // Сжигание показывается отдельной пометкой внизу карты
        break;
    }
  }
  return lines;
}

// Смысл карты в значках: эффекты, условие силы и пометка «Сжечь»
function createEffects(card: CardData, hero: Hero): HTMLElement {
  const block: HTMLElement = el("div", "card__effects");
  block.append(...createEffectLines(card.effects, card, hero, true));

  if (card.power) {
    const triggers = TEXTS.face.triggers as Record<string, string>;
    const label = card.power.cardType ? triggers[card.power.cardType] : triggers[card.power.trigger];
    block.append(el("div", "card__trigger", label), ...createEffectLines(card.power.effects, card, hero, false));
  }
  // Бонус цепочки: подпись и что он даёт
  if (card.chain) {
    const labels = TEXTS.face.chain;
    const label = card.chain.kind === "chain" ? labels.chain(card.chain.n ?? 3) : labels[card.chain.kind];
    block.append(el("div", "card__trigger card__trigger--chain", label), ...createEffectLines(card.chain.effects, card, hero, true));
  }
  if (card.cost === null) block.append(el("div", "card__trigger", TEXTS.face.unplayable));
  if (card.effects.some((effect) => effect.type === "exhaust")) block.append(el("div", "card__burn", TEXTS.face.burn));
  return block;
}

// Рисунок карты: контур с градиентом темы и тёмной обводкой; цвет и сцену за ним задаёт css/vivid.css
function artSvg(cardId: string): string {
  const art = CARD_ART as Record<string, string>;
  return `<svg viewBox="-16 -16 544 544" aria-hidden="true"><path class="card__art-path" d="${art[cardId]}"/></svg>`;
}

// Лицо карты. Его же использует большая карта в cardPreview.js
const THEMES = CARD_THEME as Record<string, string>;

export function fillCardFace(element: HTMLElement, instance: CardInstance, hero: Hero): void {
  const card = getCardData(instance);
  // Уровень улучшения: «+» за первый, «+2», «+3»… дальше
  const plus = instance.level > 1 ? `+${instance.level}` : instance.level === 1 ? "+" : "";
  const fullName = `${card.name}${plus}`;

  // Вес карты: сколько клеток шкалы она займёт
  if (card.cost !== null) element.append(el("div", "card__cost", String(card.cost)));

  const art: HTMLElement = el("div", `card__art card__art--${THEMES[instance.cardId] ?? "steel"}`);
  art.innerHTML = artSvg(instance.cardId);

  // Длинное слово в названии получает шрифт поменьше, иначе в руке оно разорвётся на части
  const longestWord = Math.max(...fullName.split(" ").map((word) => word.length));
  element.style.setProperty("--name-fit", String(Math.min(1, NAME_FIT_LETTERS / longestWord)));

  const name: HTMLElement = el("div", "card__name", fullName);
  if (instance.level > 0) name.classList.add("card__name--upgraded");
  element.append(name, art, createEffects(card, hero));
  // Символы-стыки по краям карты
  for (const side of ["left", "right"] as const) {
    const symbol = card.joints?.[side];
    if (symbol) element.append(el("div", `card__joint card__joint--${side} card__joint--${symbol}`, TEXTS.face.joints[symbol]));
  }
}

// Значок карты для коллекции: только рисунок на цвете её типа, рамка показывает редкость
export function createCardIcon(card: CardData): HTMLElement {
  const theme = THEMES[card.id] ?? "steel";
  const icon: HTMLElement = el("div", `collection-tile__icon collection-tile__icon--card card--${card.type} card--${card.rarity} card__art--${theme}`);
  icon.innerHTML = artSvg(card.id);
  return icon;
}

export interface CardElementOptions {
  playable: boolean;
  selected: boolean;
  onTap: (element: HTMLElement) => void;
  onHold?: (() => void) | null;
}

export function createCardElement(instance: CardInstance, hero: Hero, { playable, selected, onTap, onHold = null }: CardElementOptions): HTMLElement {
  const card = getCardData(instance);
  const element: HTMLElement = el("div", `card card--${card.type} card--${card.rarity}`);
  element.classList.add(playable ? "card--playable" : "card--unplayable");
  if (selected) element.classList.add("card--selected");
  fillCardFace(element, instance, hero);

  element.addEventListener("click", () => onTap(element));
  if (onHold) addLongPress(element, onHold);
  return element;
}

// Трясёт карту, когда её нельзя разыграть
export function shakeCard(element: HTMLElement): void {
  element.classList.add("card--shake");
  element.addEventListener("animationend", () => element.classList.remove("card--shake"), { once: true });
  playSound("error");
}
