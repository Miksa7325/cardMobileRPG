// Шкала боя на экране: дорожка выбранного врага (или всех врагов, если шкалу развернули), дорожка героя
// и (у Мага) дорожка подготовки. Сыгранные карты и ходы остаются на шкале погасшими, пока не уедут за левый край.
// Шкала бесконечная, экран показывает окно из 7 клеток: прошедшую клетку слева от полосы времени и 6 впереди.
// В самом начале боя полоса стоит у левого края и за первую клетку доходит до своего места — 1 клетка от края;
// дальше полоса стоит, а плавно едет сама шкала. Номера клеток считаются с начала боя, черты отделяют такты.
// Сами правила — в engine/combat.ts
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

const CELLS = CONFIG.timeline.cells; // горизонт: на сколько клеток вперёд можно ставить карты
const TACT = CONFIG.timeline.tactCells;
const VISIBLE = CELLS + 1; // на экране 7 клеток: прошедшая слева от полосы и 6 впереди
const STRIP = VISIBLE + 1; // дорожка на клетку длиннее окна: пока шкала едет, справа не видно пустоты

const INTENT_ICONS: Record<string, string> = { attack: "damage", defend: "block", buff: "buff", debuff: "debuff" };

// На момент, когда шкалу нарисовали: clock — стык, до которого дошло время, origin — стык у левого края окна.
// Дорожка показывает клетки origin+1 … origin+8, из них в окно влезают 7
let clock = 0;
let origin = 0;

export interface TimelineHandlers {
  onHeroLaneTap: (cell: number, boundary: number) => void; // нажали на дорожку героя: клетка и ближайший стык (с начала боя)
  onPrepLaneTap: () => void;
  onItemTap: (id: number) => void; // нажали на карту, зелье или пропуск на шкале
  onItemMove: (id: number, target: DropTarget) => void; // перенесли карту на другое место шкалы
  onItemHover: (id: number, target: DropTarget) => void; // несут карту по шкале: показать, куда встанет
  onToggleLanes: () => void; // развернуть или свернуть дорожки всех врагов
}

// Где на дорожке точка экрана: номер клетки и ближайший стык, считая с начала боя.
// Дорожка может быть сдвинута (шкала едет): её прямоугольник на экране это уже учитывает
export function pointOnTrack(track: Element, clientX: number): { cell: number; boundary: number } {
  const rect = track.getBoundingClientRect();
  const share = Math.min(0.999, Math.max(0, (clientX - rect.left) / rect.width));
  return { cell: origin + Math.floor(share * STRIP) + 1, boundary: origin + Math.round(share * STRIP) };
}

// Положение и ширина плашки в процентах дорожки. start — клетка с начала боя (у веса 0 — стык).
// Начало, ушедшее за левый край окна, обрезается
function place(element: HTMLElement, start: number, weight: number): void {
  if (weight === 0) {
    element.style.left = `${((start - origin) / STRIP) * 100}%`;
    element.classList.add("lane-chip--zero");
    return;
  }
  const end = Math.min(start + weight - 1, origin + STRIP);
  const first = Math.max(start, origin + 1);
  element.style.left = `${((first - origin - 1) / STRIP) * 100}%`;
  element.style.width = `${(Math.max(0, end - first + 1) / STRIP) * 100}%`;
  if (start <= clock) element.classList.add("lane-chip--running");
}

// Видна ли плашка на дорожке: кончается после её начала и начинается до её конца
function visible(start: number, end: number): boolean {
  return end > origin && start <= origin + STRIP;
}

// Черты между тактами: на каждом стыке, кратном длине такта
function appendTactLines(track: HTMLElement): void {
  for (let boundary = origin + 1; boundary < origin + STRIP; boundary++) {
    if (boundary % TACT !== 0) continue;
    const line: HTMLElement = el("div", "timeline__tact");
    line.style.left = `${((boundary - origin) / STRIP) * 100}%`;
    track.append(line);
  }
}

function createTrack(lane: string): HTMLElement {
  const track = el("div", "timeline__track timeline__strip");
  track.dataset.lane = lane;
  appendTactLines(track);
  return track;
}

// Дорожка в окне: окно обрезает то, что уехало за края
function createRow(label: string, track: HTMLElement, modifier: string): HTMLElement {
  const row = el("div", `timeline__row timeline__row--${modifier}`);
  const clip = el("div", "timeline__clip");
  clip.append(track);
  row.append(el("div", "timeline__label", label), clip);
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
    if (!visible(entry.start, entry.end)) continue;
    const chip = el("div", `lane-chip lane-chip--enemy lane-chip--${entry.intent}`);
    place(chip, entry.start, entry.end - entry.start + 1);
    if (entry.resolved) chip.classList.add("lane-chip--played");
    if (entry.end > origin + STRIP) chip.classList.add("lane-chip--overflow");
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
    if (item.weight > 0 ? !visible(slot.start, slot.end) : slot.start < origin) continue;
    const card = item.card ? getCardData(item.card) : null;
    const name = card ? card.name : item.potionId ? POTIONS[item.potionId].icon : TEXTS.timeline.skipShort;
    const kind = card?.type ?? (item.kind === "skip" ? "skip" : "potion");
    const chip: HTMLElement = el("div", `lane-chip lane-chip--hero lane-chip--${kind}`);
    chip.dataset.laneId = String(item.id);
    place(chip, slot.start, item.weight === 0 ? 0 : slot.end - slot.start + 1);
    // Сыгранная карта остаётся погасшей, пока не уедет за левый край; трогать её нельзя
    if (item.resolved) {
      chip.classList.add("lane-chip--played");
      chip.append(el("span", "lane-chip__name", name));
      track.append(chip);
      continue;
    }
    if (item.locked) chip.classList.add("lane-chip--locked");
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
      onDrop: (target) => handlers.onItemMove(item.id, target),
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
    const later = slot.end > origin + STRIP;
    const start = Math.min(Math.max(slot.start, origin + 1), origin + STRIP);
    place(chip, start, Math.min(slot.end, origin + STRIP) - start + 1);
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

// enemies — чьи дорожки показать: выбранного врага или всех (шкала развёрнута), focused — выбранный враг.
// viewClock — до какого стыка шкала показана: пока едет клетка, которая уже сработала, — на клетку раньше времени боя
export function createTimeline(
  combat: Combat, enemies: EnemyUnit[], focused: EnemyUnit | null, expanded: boolean, preview: Map<string, ActionPreview>,
  handlers: TimelineHandlers, viewClock: number = combat.clock,
): HTMLElement {
  clock = viewClock;
  // Слева от полосы — одна прошедшая клетка; в самом начале боя прошедших нет и полоса стоит у края
  origin = Math.max(0, clock - 1);
  const timeline = el("div", "timeline");
  if (combat.status === "planning") timeline.classList.add("timeline--planning");
  timeline.style.setProperty("--shift", "0");
  timeline.style.setProperty("--visible", String(VISIBLE));
  timeline.style.setProperty("--strip", String(STRIP));

  // Номера клеток с начала боя; первая клетка каждого такта отмечена, прошедшие подсвечены
  const header = el("div", "timeline__row timeline__row--numbers");
  const numbers = el("div", "timeline__numbers timeline__strip");
  for (let cell = origin + 1; cell <= origin + STRIP; cell++) {
    const number = el("span", "timeline__number", String(cell));
    if ((cell - 1) % TACT === 0) number.classList.add("timeline__number--tact");
    if (cell <= clock) number.classList.add("timeline__number--past");
    numbers.append(number);
  }
  const numbersClip = el("div", "timeline__clip");
  numbersClip.append(numbers);
  // Кнопка в углу: развернуть шкалу на всех врагов (есть, только если врагов больше одного)
  const corner = el("div", "timeline__label");
  if (combat.enemies.filter((enemy) => enemy.hp > 0).length > 1) {
    const toggle = el("button", "timeline__toggle", expanded ? TEXTS.timeline.collapseLanes : TEXTS.timeline.expandLanes) as HTMLButtonElement;
    toggle.type = "button";
    toggle.addEventListener("click", handlers.onToggleLanes);
    corner.append(toggle);
  }
  header.append(corner, numbersClip);
  timeline.append(header);

  const tracks = el("div", "timeline__tracks");
  for (const enemy of enemies) {
    const row = createRow(ENEMIES[enemy.enemyId].name, createEnemyTrack(combat, enemy, preview), "enemy");
    if (expanded && enemy === focused) row.classList.add("timeline__row--focused");
    tracks.append(row);
  }
  tracks.append(createRow(TEXTS.timeline.heroLane, createHeroTrack(combat, preview, handlers), "hero"));
  if (HEROES[combat.hero.heroId].prepares) {
    tracks.append(createRow(TEXTS.timeline.prepLane, createPrepTrack(combat, preview, handlers), "prep"));
  }
  // Полоса времени: на стыке, до которого дошло время (в окне — на 1 клетку от левого края). До «Начать» её нет
  const pointer = el("div", "timeline__pointer");
  pointer.style.setProperty("--pos", String(clock - origin));
  tracks.append(pointer);
  timeline.append(tracks);
  return timeline;
}

// Сколько прошло от текущей клетки (0…1): в первой клетке боя едет полоса, дальше — сама шкала под полосой
export function setTimelineProgress(progress: number): void {
  const share = Math.max(0, Math.min(1, progress));
  if (clock === 0) {
    document.querySelector<HTMLElement>(".timeline__pointer")?.style.setProperty("--pos", String(share));
  } else {
    document.querySelector<HTMLElement>(".timeline")?.style.setProperty("--shift", String(share));
  }
}

// Время дошло до этого стыка (cell — с начала боя): во время розыгрыша клетки шкала доезжает до него
export function moveTimelinePointer(cell: number): void {
  setTimelineProgress(cell - clock);
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
