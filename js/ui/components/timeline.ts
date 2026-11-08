// Шкала боя на экране: дорожка выбранного врага, дорожка героя и (у Мага) дорожка подготовки.
// Шкала бесконечная, экран показывает окно из 6 клеток вперёд от указателя времени: номера клеток считаются
// с начала боя, черта отделяет такты. Сами правила — в engine/combat.ts
import { CONFIG } from "../../config.ts";
import { ENEMIES } from "../../data/enemies.ts";
import { HEROES } from "../../data/heroes.ts";
import { POTIONS } from "../../data/potions.ts";
import { TEXTS } from "../../data/texts.ru.ts";
import { type ActionPreview, getEnemyLane, heroSchedule } from "../../engine/combat.ts";
import { getCardData } from "../../engine/deck.ts";
import type { Combat, EnemyUnit } from "../../types.ts";
import { el } from "../dom.js";
import { createIcon } from "../icons.js";
import { type DropTarget, enableTimelineDrag } from "../timelineDrag.ts";

const CELLS = CONFIG.timeline.cells;
const TACT = CONFIG.timeline.tactCells;

const INTENT_ICONS: Record<string, string> = { attack: "damage", defend: "block", buff: "buff", debuff: "debuff" };

// Начало окна: последняя пройденная граница на момент, когда шкалу нарисовали. Окно — клетки base+1 … base+6
let base = 0;

export interface TimelineHandlers {
  onHeroLaneTap: (cell: number, boundary: number) => void; // нажали на дорожку героя: клетка и ближайший стык (с начала боя)
  onPrepLaneTap: () => void;
  onItemTap: (id: number) => void; // нажали на карту или зелье на шкале
  onItemMove: (id: number, target: DropTarget) => void; // перенесли карту на другое место шкалы
  onItemHover: (id: number, target: DropTarget) => void; // несут карту по шкале: показать, куда встанет
}

// Где на дорожке точка экрана: номер клетки и ближайший стык, считая с начала боя
export function pointOnTrack(track: Element, clientX: number): { cell: number; boundary: number } {
  const rect = track.getBoundingClientRect();
  const share = Math.min(0.999, Math.max(0, (clientX - rect.left) / rect.width));
  return { cell: base + Math.floor(share * CELLS) + 1, boundary: base + Math.round(share * CELLS) };
}

// Положение и ширина плашки в процентах дорожки. start — клетка с начала боя (у веса 0 — стык).
// Начало, ушедшее за левый край окна (карта уже срабатывает), обрезается
function place(element: HTMLElement, start: number, weight: number): void {
  if (weight === 0) {
    element.style.left = `${((start - base) / CELLS) * 100}%`;
    element.classList.add("lane-chip--zero");
    return;
  }
  const end = Math.min(start + weight - 1, base + CELLS);
  const first = Math.max(start, base + 1);
  element.style.left = `${((first - base - 1) / CELLS) * 100}%`;
  element.style.width = `${(Math.max(0, end - first + 1) / CELLS) * 100}%`;
  if (start <= base) element.classList.add("lane-chip--running");
}

// Видна ли плашка в окне: кончается после начала окна и начинается до его конца
function visible(start: number, end: number): boolean {
  return end > base && start <= base + CELLS;
}

function createTrack(lane: string): HTMLElement {
  const track = el("div", "timeline__track");
  track.dataset.lane = lane;
  return track;
}

function createRow(label: string, track: HTMLElement, modifier: string): HTMLElement {
  const row = el("div", `timeline__row timeline__row--${modifier}`);
  row.append(el("div", "timeline__label", label), track);
  return row;
}

// Число на плашке: урон или блок по предпросмотру, со значком
function previewValue(preview: ActionPreview | undefined): HTMLElement {
  const value: HTMLElement = el("span", "lane-chip__value");
  if (!preview) return value;
  if (preview.damage > 0) value.append(createIcon("damage"), String(preview.damage));
  else if (preview.block > 0) value.append(createIcon("block"), String(preview.block));
  return value;
}

function createEnemyTrack(combat: Combat, enemy: EnemyUnit, preview: Map<string, ActionPreview>): HTMLElement {
  const track = createTrack("enemy");
  for (const entry of getEnemyLane(combat, enemy)) {
    if (entry.resolved || !visible(entry.start, entry.end)) continue;
    const chip = el("div", `lane-chip lane-chip--enemy lane-chip--${entry.intent}`);
    place(chip, entry.start, entry.end - entry.start + 1);
    if (entry.end > base + CELLS) chip.classList.add("lane-chip--overflow");
    // Скрытый ход: «?», пока до него больше 2 клеток
    if (entry.hidden) {
      chip.className = "lane-chip lane-chip--enemy lane-chip--hidden";
      place(chip, entry.start, entry.end - entry.start + 1);
      chip.append(el("span", "lane-chip__value", "?"));
      track.append(chip);
      continue;
    }
    const predicted = preview.get(`enemy:${enemy.instanceId}:${entry.id}`);
    let value = "";
    if (entry.intent === "attack") value = `${predicted?.damage ?? entry.damage}${entry.hits > 1 ? ` (${entry.hits})` : ""}`;
    else if (entry.intent === "defend") value = String(entry.block);
    chip.append(createIcon(INTENT_ICONS[entry.intent]), el("span", "lane-chip__value", value));
    track.append(chip);
  }
  return track;
}

function createHeroTrack(combat: Combat, preview: Map<string, ActionPreview>, handlers: TimelineHandlers): HTMLElement {
  const track = createTrack("hero");
  // Замороженные клетки (ледяная печать, Трясина, Иней): в них нельзя ставить
  for (const cell of combat.frozenCells) {
    if (!visible(cell, cell)) continue;
    const ice: HTMLElement = el("div", "lane-frozen", "❄");
    place(ice, cell, 1);
    track.append(ice);
  }
  const slots = heroSchedule(combat).lane;
  for (const item of combat.lane) {
    const slot = slots.get(item.id)!;
    if (item.resolved) continue;
    if (item.weight > 0 && !visible(slot.start, slot.end)) continue;
    const card = item.card ? getCardData(item.card) : null;
    const name = card ? card.name : POTIONS[item.potionId!].icon;
    const chip: HTMLElement = el("div", `lane-chip lane-chip--hero lane-chip--${card?.type ?? "potion"}`);
    chip.dataset.laneId = String(item.id);
    if (item.locked) chip.classList.add("lane-chip--locked");
    place(chip, slot.start, item.weight === 0 ? 0 : slot.end - slot.start + 1);
    const predicted = preview.get(`lane:${item.id}`);
    if (predicted?.chain) chip.classList.add("lane-chip--bonus");
    chip.append(el("span", "lane-chip__name", name), previewValue(predicted));
    chip.addEventListener("click", (event) => {
      event.stopPropagation();
      handlers.onItemTap(item.id);
    });
    // Поставленную карту можно перенести пальцем на другое место, пока она не начала срабатывать
    const started = item.weight === 0 ? slot.start < combat.clock : slot.start <= combat.clock;
    enableTimelineDrag(chip, {
      canDrag: () => !item.locked && !started,
      onBlocked: () => {},
      onHover: (target) => handlers.onItemHover(item.id, target),
      onDrop: (target, ghost) => {
        ghost.remove();
        handlers.onItemMove(item.id, target);
      },
    });
    track.append(chip);
  }
  track.addEventListener("click", (event) => {
    const { cell, boundary } = pointOnTrack(track, event.clientX);
    handlers.onHeroLaneTap(cell, boundary);
  });
  return track;
}

// Подготовка Мага: заклинание занимает клетки, пока готовится, и срабатывает в последней. Если сработает дальше окна —
// тянется до правого края, а стрелка показывает номер клетки, где сработает
function createPrepTrack(combat: Combat, preview: Map<string, ActionPreview>, handlers: TimelineHandlers): HTMLElement {
  const track = createTrack("prep");
  const slots = heroSchedule(combat).prepared;
  for (const spell of combat.prepared) {
    const slot = slots.get(spell.id)!;
    const card = getCardData(spell.card);
    const chip: HTMLElement = el("div", `lane-chip lane-chip--hero lane-chip--prep lane-chip--${card.type}`);
    chip.dataset.laneId = String(spell.id);
    const later = slot.end > base + CELLS;
    const start = Math.min(Math.max(slot.start, base + 1), base + CELLS);
    place(chip, start, Math.min(slot.end, base + CELLS) - start + 1);
    const value = later ? el("span", "lane-chip__value", TEXTS.timeline.nextTurn(slot.end)) : previewValue(preview.get(`prep:${spell.id}`));
    chip.append(el("span", "lane-chip__name", card.name), value);
    chip.addEventListener("click", (event) => {
      event.stopPropagation();
      handlers.onItemTap(spell.id);
    });
    track.append(chip);
  }
  track.addEventListener("click", () => handlers.onPrepLaneTap());
  return track;
}

export function createTimeline(
  combat: Combat, selectedEnemy: EnemyUnit | null, preview: Map<string, ActionPreview>, handlers: TimelineHandlers,
): HTMLElement {
  base = combat.clock;
  const timeline = el("div", "timeline");
  // Черты между тактами: первая — через столько клеток от левого края окна, вторая — ещё через 3
  timeline.style.setProperty("--tact", `${(((TACT - (base % TACT)) % TACT) / CELLS) * 100}%`);

  // Номера клеток с начала боя; первая клетка каждого такта отмечена чертой слева
  const header = el("div", "timeline__row timeline__row--numbers");
  const numbers = el("div", "timeline__numbers");
  for (let cell = base + 1; cell <= base + CELLS; cell++) {
    const number = el("span", "timeline__number", String(cell));
    if ((cell - 1) % TACT === 0) number.classList.add("timeline__number--tact");
    numbers.append(number);
  }
  header.append(el("div", "timeline__label", ""), numbers);
  timeline.append(header);

  const tracks = el("div", "timeline__tracks");
  if (selectedEnemy) tracks.append(createRow(ENEMIES[selectedEnemy.enemyId].name, createEnemyTrack(combat, selectedEnemy, preview), "enemy"));
  tracks.append(createRow(TEXTS.timeline.heroLane, createHeroTrack(combat, preview, handlers), "hero"));
  if (HEROES[combat.hero.heroId].prepares) {
    tracks.append(createRow(TEXTS.timeline.prepLane, createPrepTrack(combat, preview, handlers), "prep"));
  }
  // Указатель времени: стоит на левом краю окна — на границе, до которой дошло время
  const pointer = el("div", "timeline__pointer");
  pointer.style.setProperty("--clock", "0");
  tracks.append(pointer);
  timeline.append(tracks);
  return timeline;
}

// Двигает указатель времени внутри окна (cell — клетка с начала боя)
export function moveTimelinePointer(cell: number): void {
  const pointer = document.querySelector<HTMLElement>(".timeline__pointer");
  pointer?.style.setProperty("--clock", String(Math.max(0, Math.min(CELLS, cell - base))));
}

// Подсветка места, куда встанет карта: при переносе и после выбора карты (start — клетка с начала боя)
export function showLaneSlot(start: number | null, weight: number, valid: boolean): void {
  const track = document.querySelector<HTMLElement>('.timeline__track[data-lane="hero"]');
  track?.querySelector(".lane-slot")?.remove();
  if (!track || start === null) return;
  const slot = el("div", `lane-slot ${valid ? "lane-slot--ok" : "lane-slot--bad"}`);
  place(slot, start, weight);
  track.append(slot);
}
