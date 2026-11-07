// Шкала хода на экране: дорожка выбранного врага, дорожка героя и (у Мага) дорожка подготовки.
// 6 клеток с номерами, черта между тактами, указатель времени. Сами правила — в engine/combat.ts
import { CONFIG } from "../../config.ts";
import { ENEMIES } from "../../data/enemies.ts";
import { HEROES } from "../../data/heroes.ts";
import { POTIONS } from "../../data/potions.ts";
import { TEXTS } from "../../data/texts.ru.ts";
import { type ActionPreview, getEnemyLane, heroSchedule } from "../../engine/combat.ts";
import { absoluteTime } from "../../engine/effects.ts";
import { getCardData } from "../../engine/deck.ts";
import type { Combat, EnemyUnit } from "../../types.ts";
import { el } from "../dom.js";
import { createIcon } from "../icons.js";
import { type DropTarget, enableTimelineDrag } from "../timelineDrag.ts";

const CELLS = CONFIG.timeline.cells;

const INTENT_ICONS: Record<string, string> = { attack: "damage", defend: "block", buff: "buff", debuff: "debuff" };

export interface TimelineHandlers {
  onHeroLaneTap: (cell: number, boundary: number) => void; // нажали на дорожку героя: клетка и ближайший стык
  onPrepLaneTap: () => void;
  onItemTap: (id: number) => void; // нажали на карту или зелье на шкале
  onItemMove: (id: number, target: DropTarget) => void; // перенесли карту на другое место шкалы
  onItemHover: (id: number, target: DropTarget) => void; // несут карту по шкале: показать, куда встанет
}

// Где на дорожке точка экрана: номер клетки (1–6) и ближайший стык (0–6)
export function pointOnTrack(track: Element, clientX: number): { cell: number; boundary: number } {
  const rect = track.getBoundingClientRect();
  const share = Math.min(0.999, Math.max(0, (clientX - rect.left) / rect.width));
  return { cell: Math.floor(share * CELLS) + 1, boundary: Math.round(share * CELLS) };
}

// Положение и ширина плашки в процентах дорожки
function place(element: HTMLElement, start: number, weight: number): void {
  if (weight === 0) {
    element.style.left = `${(start / CELLS) * 100}%`;
    element.classList.add("lane-chip--zero");
  } else {
    element.style.left = `${((start - 1) / CELLS) * 100}%`;
    element.style.width = `${(weight / CELLS) * 100}%`;
  }
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
  getEnemyLane(combat, enemy).forEach((entry, index) => {
    const chip = el("div", `lane-chip lane-chip--enemy lane-chip--${entry.intent}`);
    if (entry.resolved) chip.classList.add("lane-chip--done");
    const end = Math.min(entry.end, CELLS);
    place(chip, entry.start, end - entry.start + 1);
    if (entry.end > CELLS) chip.classList.add("lane-chip--overflow");
    const predicted = preview.get(`enemy:${enemy.instanceId}:${index}`);
    let value = "";
    if (entry.intent === "attack") value = `${predicted?.damage ?? entry.damage}${entry.hits > 1 ? ` (${entry.hits})` : ""}`;
    else if (entry.intent === "defend") value = String(entry.block);
    chip.append(createIcon(INTENT_ICONS[entry.intent]), el("span", "lane-chip__value", value));
    track.append(chip);
  });
  return track;
}

function createHeroTrack(combat: Combat, preview: Map<string, ActionPreview>, handlers: TimelineHandlers): HTMLElement {
  const track = createTrack("hero");
  const slots = heroSchedule(combat).lane;
  for (const item of combat.lane) {
    const slot = slots.get(item.id)!;
    const card = item.card ? getCardData(item.card) : null;
    const name = card ? card.name : POTIONS[item.potionId!].icon;
    const chip: HTMLElement = el("div", `lane-chip lane-chip--hero lane-chip--${card?.type ?? "potion"}`);
    chip.dataset.laneId = String(item.id);
    if (item.resolved) chip.classList.add("lane-chip--done");
    if (item.locked) chip.classList.add("lane-chip--locked");
    place(chip, slot.start, item.weight === 0 ? 0 : Math.min(slot.end, CELLS) - slot.start + 1);
    const predicted = preview.get(`lane:${item.id}`);
    if (predicted?.chain) chip.classList.add("lane-chip--bonus");
    chip.append(el("span", "lane-chip__name", name), previewValue(predicted));
    chip.addEventListener("click", (event) => {
      event.stopPropagation();
      handlers.onItemTap(item.id);
    });
    // Поставленную карту можно перенести пальцем на другое место
    enableTimelineDrag(chip, {
      canDrag: () => !item.locked && !item.resolved,
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

// Подготовка Мага: заклинание стоит там, где сработает. Если позже этого хода — у правого края со стрелкой
function createPrepTrack(combat: Combat, preview: Map<string, ActionPreview>, handlers: TimelineHandlers): HTMLElement {
  const track = createTrack("prep");
  const slots = heroSchedule(combat).prepared;
  for (const spell of combat.prepared) {
    const cell = slots.get(spell.id)!.end;
    const card = getCardData(spell.card);
    const chip: HTMLElement = el("div", `lane-chip lane-chip--hero lane-chip--prep lane-chip--${card.type}`);
    chip.dataset.laneId = String(spell.id);
    const later = cell > CELLS;
    place(chip, Math.min(cell, CELLS), 1);
    const value = later ? el("span", "lane-chip__value", TEXTS.timeline.nextTurn(spell.due - absoluteTime(combat, CELLS))) : previewValue(preview.get(`prep:${spell.id}`));
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
  const timeline = el("div", "timeline");

  const header = el("div", "timeline__row timeline__row--numbers");
  const numbers = el("div", "timeline__numbers");
  for (let cell = 1; cell <= CELLS; cell++) {
    const number = el("span", "timeline__number", String(cell));
    if (cell <= combat.clock) number.classList.add("timeline__number--past");
    numbers.append(number);
  }
  header.append(el("div", "timeline__label", ""), numbers);
  timeline.append(header);

  const tracks = el("div", "timeline__tracks");
  if (selectedEnemy) tracks.append(createRow(ENEMIES[selectedEnemy.enemyId].name, createEnemyTrack(combat, selectedEnemy, preview), "enemy"));
  tracks.append(createRow(TEXTS.timeline.heroLane, createHeroTrack(combat, preview, handlers), "hero"));
  if (HEROES[combat.hero.heroId].prepCapacity) {
    tracks.append(createRow(TEXTS.timeline.prepLane, createPrepTrack(combat, preview, handlers), "prep"));
  }
  // Указатель времени: стоит на границе, до которой дошёл розыгрыш
  const pointer = el("div", "timeline__pointer");
  pointer.style.setProperty("--clock", String(combat.clock));
  tracks.append(pointer);
  timeline.append(tracks);
  return timeline;
}

// Двигает указатель времени во время анимации розыгрыша
export function moveTimelinePointer(cell: number): void {
  const pointer = document.querySelector<HTMLElement>(".timeline__pointer");
  pointer?.style.setProperty("--clock", String(cell));
  document.querySelectorAll(".timeline__number").forEach((number, index) => {
    number.classList.toggle("timeline__number--past", index + 1 <= cell);
  });
}

// Подсветка места, куда встанет карта: при переносе и после выбора карты
export function showLaneSlot(start: number | null, weight: number, valid: boolean): void {
  const track = document.querySelector<HTMLElement>('.timeline__track[data-lane="hero"]');
  track?.querySelector(".lane-slot")?.remove();
  if (!track || start === null) return;
  const slot = el("div", `lane-slot ${valid ? "lane-slot--ok" : "lane-slot--bad"}`);
  place(slot, start, weight);
  track.append(slot);
}
