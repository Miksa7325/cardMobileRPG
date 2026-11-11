// Экран боя на бесконечной шкале: враги, шкала, герой, рука. Показывает состояние боя и передаёт действия игрока в логику.
// Как играть (раздел «Управление шкалой» в docs/PLAN.md): сначала карты расставляют и жмут «Начать». Дальше время
// идёт само, пока следующая клетка героя занята, и ждёт на пустой. После последней клетки такта шкала стоит одну клетку
// времени — срабатывают эффекты такта. Тап по карте ставит её в ближайшую клетку, удержание показывает описание,
// карту можно нести на клетку (на занятой — сдвинет ту карту), на подготовку Мага или на стопки (переброс).
// В руке всегда есть «Пропуск клетки». Нажатие на карту на шкале возвращает её в руку.
// Карты «на врага» бьют врага, выбранного в момент срабатывания: выбирают тапом по врагу.
import { CARDS } from "../../data/cards.ts";
import { ENEMIES } from "../../data/enemies.ts";
import { HEROES } from "../../data/heroes.ts";
import { POTIONS } from "../../data/potions.ts";
import { TEXTS } from "../../data/texts.ru.ts";
import {
  brewBlocksTime, cardWeight, chooseBrew, createCombat, findFreeStart, focusedEnemy, getEnemyIntent, getUpcomingDraws, moveLaneItem,
  nextCellFilled, placeCard, placePotion, placeSkip, previewLaunch, removeFromLane, rerollCard, setFocus, startCombat, tick,
} from "../../engine/combat.ts";
import { getCardData } from "../../engine/deck.ts";
import { createNodeCombat, finishCombat } from "../../engine/run.ts";
import { saveRun } from "../../save.ts";
import { state } from "../../state.ts";
import type { ActionResult, CardData, CardInstance, Combat, EnemyUnit, Equipment, HeroId, Run, Unit } from "../../types.ts";
import { captureCombatView, playTick, showDrawnCards } from "../animations.js";
import { enemySprite, heroSprite, IDLE_STYLES, setHeroLookVariable } from "../art.js";
import { playSound } from "../audio.js";
import { createCardElement, formatDescription, shakeCard } from "../components/card.ts";
import { openCardList } from "../components/cardList.ts";
import { createCardPicker } from "../components/cardPicker.ts";
import { createRichText } from "../components/cardPreview.ts";
import { createHpBar } from "../components/hpBar.js";
import { createCombatItems, createMenuButton, createRunBar } from "../components/runBar.js";
import { createStatusIcons } from "../components/statusIcons.js";
import { createTimeline, setTimelineProgress, showLaneSlot } from "../components/timeline.ts";
import { showTooltip } from "../components/tooltip.js";
import { el } from "../dom.js";
import { type HandEntry, enableHandGestures } from "../handGestures.ts";
import { createIcon } from "../icons.js";
import { showScreen } from "../router.js";
import { animationMs, getCellMs } from "../settings.js";
import { type DropTarget, dragState } from "../timelineDrag.ts";
import {
  applyTutorialHighlights, createTutorialBanner, finishTutorial, finishTutorialBattle, isTutorialBattle, notifyTutorial, tutorialActionForCard,
} from "../tutorial.ts";
import { playCardEffect } from "../vfxCards.js";

// Старые модули интерфейса ещё на JavaScript (переводим на этапе 9): TypeScript не знает их параметров
type Untyped = (...args: any[]) => any;
const ui = {
  createTutorialBanner: createTutorialBanner as Untyped,
  createRunBar: createRunBar as Untyped,
  playTick: playTick as Untyped,
};
const IDLE = IDLE_STYLES as Record<string, string>;

const INTENT_ICONS: Record<string, string> = { attack: "damage", defend: "block", buff: "buff", debuff: "debuff" };

// Зелье, выбранное нажатием: следующее нажатие на клетку или врага поставит его. Карты из руки ставятся сразу
type Selection = { kind: "potion"; index: number } | null;
let selection: Selection = null;
// Шкала развёрнута: видны дорожки всех врагов, а не только выбранного
let lanesExpanded = false;

function combat(): Combat {
  return state.combat as Combat;
}

function resetView(): void {
  selection = null;
  lanesExpanded = false;
  waiting = false;
  progress = 0;
}

// ---------- Время ----------
//
// «Сердцебиение» раз в 100 мс копит долю клетки. Набралась клетка — логика делает шаг (tick), экран коротко
// показывает её события и рисуется заново. Пока клетка идёт, шкала плавно едет под полосой времени (в первой клетке
// боя — сама полоса). После последней клетки такта шкала стоит одну клетку времени, потом шаг такта (Яд, силы…).
// Время стоит: до «Начать», пока следующая клетка героя пуста, пока не выбрано зелье варки, пока открыта панель
// тестового режима и когда игрок ушёл с экрана боя или свернул игру (тогда ждёт кнопку «Продолжить»)

const HEARTBEAT_MS = 100;
const TACT_EFFECT_MS = 500; // сколько длится каждый эффект такта (Яд, Горение, силы, реликвии)
let heartbeat: ReturnType<typeof setInterval> | null = null;
let waiting = false; // время стоит, пока игрок не нажмёт кнопку: игру сворачивали или уходили с экрана
let progress = 0; // доля текущей клетки, которая уже прошла
let ticking = false; // идёт шаг и его анимация
let pendingRender = false; // экран надо перерисовать, как только палец отпустит карту

function onCombatScreen(): boolean {
  return Boolean(document.querySelector("main.combat"));
}

function timeStands(current: Combat): boolean {
  return current.status !== "running" || waiting || brewBlocksTime(current) || state.test.pickerOpen;
}

function ensureClock(): void {
  if (!heartbeat) heartbeat = setInterval(onHeartbeat, HEARTBEAT_MS);
}

function stopClock(): void {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
}

function onHeartbeat(): void {
  const current = state.combat as Combat | null;
  if (!current || !onCombatScreen()) {
    // Ушли с экрана боя: время встаёт, а вернувшись, игрок продолжит кнопкой
    stopClock();
    waiting = true;
    return;
  }
  if (pendingRender && !dragState.active && !ticking) {
    pendingRender = false;
    showScreen("combat");
    return;
  }
  if (timeStands(current) || ticking) return;
  // Последняя клетка такта прошла: сразу эффекты такта, шкала стоит, пока они идут (по 0,5 с на каждый)
  if (current.tactDue) {
    progress = 0;
    void doTick(current);
    return;
  }
  // Следующая клетка пуста — шкала ждёт карту (освободили клетку посреди хода — шкала возвращается к началу клетки)
  if (!nextCellFilled(current)) {
    if (progress > 0) {
      progress = 0;
      setTimelineProgress(0);
    }
    return;
  }
  progress += HEARTBEAT_MS / getCellMs();
  if (progress < 1) {
    setTimelineProgress(progress);
    return;
  }
  progress = 0;
  void doTick(current);
}

// Один шаг времени: логика проходит клетку (или такт), экран показывает её события и рисуется заново
async function doTick(current: Combat): Promise<void> {
  ticking = true;
  const before = captureCombatView(current);
  const tactStep = Boolean(current.tactDue);
  const result = tick(current);
  if (!result.ok) {
    ticking = false;
    return;
  }
  if (state.test.enabled) state.test.damageLog = buildDamageLog(current);
  await ui.playTick(before, current, {
    // Эффекты такта идут по одному: на каждый — TACT_EFFECT_MS, шкала всё это время стоит
    maxMs: tactStep ? Infinity : getCellMs() * 0.7,
    stepMs: tactStep ? TACT_EFFECT_MS : 0,
    onCardPlayed: (event: { cardId: string; targetId: string | null }) => {
      const card = CARDS[event.cardId];
      playCardEffect(card, getVfxPositions(before, card, event.targetId));
    },
  });
  ticking = false;
  if (state.combat !== current) return;
  savePlanning();
  if (dragState.active) pendingRender = true;
  else {
    showScreen("combat");
    showDrawnCards(before.handUids, current);
  }
  finishCombatIfOver();
}

// Свернули игру — время встаёт до кнопки и бой сохраняется
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "hidden" || !state.combat || !onCombatScreen()) return;
  waiting = true;
  savePlanning();
});

// ---------- Начало боя ----------

// Запускает бой на текущем узле забега
export function startNodeCombat(): void {
  const run = state.run as Run;
  state.combat = createNodeCombat(run);
  state.test.enabled = false;
  state.arena = null;
  resetView();
  savePlanning();
  showScreen("combat");
}

// Продолжает бой из сохранения: со всей расстановкой на шкале. Начатый бой стоит, пока игрок не нажмёт кнопку
export function resumeCombat(): void {
  state.combat = (state.run as Run).savedCombat;
  state.test.enabled = false;
  state.arena = null;
  resetView();
  waiting = true;
  showScreen("combat");
}

// Запускает бой с врагами, выбранными в тестовом режиме
export function startTestCombat(): void {
  state.combat = createCombat({ heroId: state.test.heroId, enemyIds: state.test.enemyIds, seed: Date.now() });
  state.test.enabled = true;
  state.arena = null;
  resetView();
  showScreen("combat");
}

// Бой на боевой арене города: герой со своим снаряжением и полным здоровьем, но без риска.
// Как и тестовый, он не трогает забег и не сохраняется
export function startArenaCombat(heroId: HeroId, gear: Equipment, fight: { id: string; enemyIds: string[] }): void {
  state.combat = createCombat({
    heroId, enemyIds: fight.enemyIds, seed: Date.now(), hp: gear.maxHp, maxHp: gear.maxHp, deck: gear.deck, relics: gear.relics, potions: gear.potions,
  });
  state.test.enabled = true;
  state.arena = { fightId: fight.id, rewarded: false };
  resetView();
  showScreen("combat");
}

// Бой сохраняется после каждого действия и каждой клетки: закрытая игра продолжится со всей расстановкой
function savePlanning(): void {
  if (state.test.enabled || !state.run) return;
  state.run.savedCombat = state.combat;
  saveRun(state.run);
}

// ---------- Экран ----------

function aliveEnemies(): EnemyUnit[] {
  return combat().enemies.filter((enemy) => enemy.hp > 0);
}

// Выбранный враг: по нему бьют карты «на врага», его дорожка видна на шкале
function selectedEnemy(): EnemyUnit | null {
  return focusedEnemy(combat());
}

export function renderCombatScreen(root: HTMLElement): void {
  const current = combat();
  const screen = el("main", "combat");
  // Выбранный враг есть всегда: если его ещё нет или он умер — выбран ближайший живой
  const focus = focusedEnemy(current);
  if (focus && current.focusId !== focus.instanceId) current.focusId = focus.instanceId;
  const preview = previewLaunch(current);
  screen.append(
    createTopBar(current),
    createEnemies(current),
    createCombatItems(state.test.enabled ? current.relics : (state.run as Run).relics, current.potions, {
      onPotionTap,
      selectedPotionIndex: selection?.kind === "potion" ? selection.index : null,
    }),
    createTimeline(current, lanesExpanded ? aliveEnemies() : focus ? [focus] : [], focus, lanesExpanded, preview, {
      onHeroLaneTap: (cell, boundary) => placeSelected({ kind: "lane", cell, boundary }),
      onPrepLaneTap: () => placeSelected({ kind: "prep" }),
      onItemTap: returnToHand,
      onItemMove: moveItem,
      onItemHover: previewMove,
      onToggleLanes: () => {
        lanesExpanded = !lanesExpanded;
        showScreen("combat");
      },
    }),
    createHero(current),
    el("p", "combat__hint", getHint(current)),
    el("div", "hand-info hand-info--hidden"),
    createHand(current),
    createBottomBar(current),
  );
  // Сваренное зелье выбирают сразу: пока не выбрано, время стоит
  if (current.brewChoices.length > 0) screen.append(createBrewChoice(current));
  if (state.test.pickerOpen) screen.append(createCardPicker());
  const banner = state.test.enabled && !isTutorialBattle() ? null : ui.createTutorialBanner("combat", current);
  if (banner) screen.append(banner);
  applyTutorialHighlights(screen);
  root.append(screen);
  // Шкала продолжает ехать с того места клетки, где была до перерисовки
  setTimelineProgress(progress);
  if (current.status === "running") ensureClock();
}

function createTopBar(current: Combat): HTMLElement {
  if (!state.test.enabled) return ui.createRunBar(state.run, { combat: current });
  const bar = el("div", "combat__top-bar");
  bar.append(
    el("span", "bar-hp", `❤️ ${current.hero.hp}/${current.hero.maxHp}`),
    el("span", "", `${TEXTS.turn} ${current.turn}`),
  );
  // На арене и в учебном бою добавлять карты нельзя: это настоящий бой, просто без смерти
  if (state.arena || isTutorialBattle()) {
    bar.append(el("span", "run-bar__spacer"), createMenuButton({ needsConfirm: true, confirmText: TEXTS.menuConfirmCombat }));
    return bar;
  }
  const testButton = el("button", "button button--secondary", "🧪");
  testButton.type = "button";
  testButton.addEventListener("click", () => {
    state.test.pickerOpen = true;
    showScreen("combat");
  });
  bar.append(el("span", "run-bar__spacer"), testButton, createMenuButton());
  return bar;
}

// idle — как модель двигается в покое (классы анимаций — в css/theme.css). heroId есть только у героя: его окраска
function createPortrait(sprite: string, idle = "breathe", heroId: HeroId | null = null): HTMLElement {
  const portrait = el("div", `unit__portrait idle--${idle}`);
  const image = el("img", "") as HTMLImageElement;
  image.src = sprite;
  if (heroId) setHeroLookVariable(image, heroId);
  image.alt = "";
  image.decoding = "sync"; // экран рисуется заново после каждого действия: рисунок не должен мигать
  image.draggable = false;
  portrait.append(image);
  return portrait;
}

function createEnemies(current: Combat): HTMLElement {
  const list = el("div", "combat__enemies");
  const alive = aliveEnemies();
  const shown = selectedEnemy();
  for (const enemy of alive) list.append(createEnemy(current, enemy, alive.length > 1, enemy === shown));
  return list;
}

function createEnemy(current: Combat, enemy: EnemyUnit, compact: boolean, selected: boolean): HTMLElement {
  const element = el("div", "unit");
  element.dataset.unitId = enemy.instanceId;
  if (selected && compact) element.classList.add("unit--selected");
  if (wantsEnemyTarget()) element.classList.add("unit--targetable");
  element.append(
    createIntent(current, enemy),
    createPortrait(enemySprite(enemy.enemyId), IDLE[enemy.enemyId]),
    el("div", "unit__name", ENEMIES[enemy.enemyId].name),
    createHpBar(enemy),
    createStatusIcons(enemy, { compact }),
  );
  element.addEventListener("click", () => onEnemyTap(current, enemy));
  return element;
}

// Ближайший ход врага над головой: «[меч] 9», «[меч] 6×2», «[щит] 9»
function createIntent(current: Combat, enemy: EnemyUnit): HTMLElement {
  const { intent, damage, hits, block, hidden } = getEnemyIntent(current, enemy);
  const element = el("div", "unit__intent");
  // Скрытый ход Лорда вампиров: до раскрытия видно только «?»
  if (hidden) {
    element.append("?");
    return element;
  }
  element.append(createIcon(INTENT_ICONS[intent]));
  if (intent === "attack") element.append(` ${damage}${hits > 1 ? `×${hits}` : ""}`);
  if (intent === "defend") element.append(` ${block}`);
  return element;
}

function describeStatuses(unit: Unit): string {
  const lines = Object.entries(unit.statuses).map(([status, amount]) => (
    `${TEXTS.statuses[status as keyof typeof TEXTS.statuses]} ${amount}: ${TEXTS.statusDescriptions[status as keyof typeof TEXTS.statusDescriptions] ?? ""}.`
  ));
  return lines.length > 0 ? lines.join(" ") : TEXTS.inspect.noStatuses;
}

function describeEnemy(current: Combat, enemy: EnemyUnit): string {
  const { intent, damage, hits, block } = getEnemyIntent(current, enemy);
  const texts = TEXTS.inspect.intents;
  const intentText = { attack: texts.attack(damage, hits), defend: texts.defend(block), buff: texts.buff, debuff: texts.debuff }[intent];
  return `${ENEMIES[enemy.enemyId].name}. ${intentText} ${describeStatuses(enemy)}`;
}

function createHero(current: Combat): HTMLElement {
  const wrapper = el("div", "combat__hero");
  const unit = el("div", "unit unit--hero");
  unit.dataset.unitId = "hero";
  // Когда значков много, сокращаем их, чтобы герой не занял место шкалы
  const iconCount = Object.keys(current.hero.statuses).length + current.hero.powers.length;
  const details = el("div", "unit__details");
  details.append(
    el("div", "unit__name", HEROES[current.hero.heroId].name),
    createHpBar(current.hero),
    createStatusIcons(current.hero, { compact: iconCount > 2 }),
  );
  unit.append(createPortrait(heroSprite(current.hero.heroId), "breathe", current.hero.heroId), details);
  unit.addEventListener("click", () => showTooltip(describeStatuses(current.hero)));
  wrapper.append(unit);
  return wrapper;
}

function getHint(current: Combat): string {
  if (selection?.kind === "potion") return TEXTS.timeline.hintPotion;
  if (current.status === "planning") return TEXTS.timeline.hintPlan;
  if (waiting) return TEXTS.timeline.hintStopped;
  if (brewBlocksTime(current)) return TEXTS.timeline.hintBrew;
  return nextCellFilled(current) ? TEXTS.timeline.hintRunning : TEXTS.timeline.hintEmptyCell;
}

// ---------- Рука ----------

function canPrepare(current: Combat): boolean {
  return Boolean(HEROES[current.hero.heroId].prepares);
}

function canAct(current: Combat): boolean {
  return current.status === "planning" || current.status === "running";
}

// Можно ли поставить карту хоть куда-нибудь
function isPlayable(current: Combat, instance: CardInstance): boolean {
  const weight = cardWeight(instance, current);
  if (weight === null || !canAct(current)) return false;
  return findFreeStart(current, weight) !== null || canPrepare(current);
}

// Описание над рукой, пока палец держит карту
function showHandInfo(content: HTMLElement | null): void {
  const info = document.querySelector<HTMLElement>(".hand-info");
  if (!info) return;
  info.replaceChildren(...(content ? [content] : []));
  info.classList.toggle("hand-info--hidden", !content);
}

function describeCard(instance: CardInstance): HTMLElement {
  const card = getCardData(instance);
  const plus = instance.level > 1 ? `+${instance.level}` : instance.level === 1 ? "+" : "";
  const block = el("div", "hand-info__body");
  block.append(
    el("p", "hand-info__name", `${card.name}${plus} · ${TEXTS.preview.types[card.type]}`),
    createRichText("hand-info__text", formatDescription(card, combat().hero)),
  );
  return block;
}

function describeSkip(): HTMLElement {
  const block = el("div", "hand-info__body");
  block.append(el("p", "hand-info__name", TEXTS.timeline.skipName), el("p", "hand-info__text", TEXTS.timeline.skipDescription));
  return block;
}

// «Пропуск клетки» в руке: особая карта, всегда первая и всегда доступна
function createSkipCard(): HTMLElement {
  const element = el("div", "card card--skip card--playable");
  element.append(el("div", "card__cost", "1"), el("div", "card__name", TEXTS.timeline.skipName), el("div", "card__skip-icon", TEXTS.timeline.skipShort));
  return element;
}

function createHand(current: Combat): HTMLElement {
  const hand = el("div", "hand");
  const count = current.piles.hand.length + 1; // ещё «Пропуск клетки»
  // Чем больше карт в руке, тем меньше наклон, иначе крайние уйдут за экран
  const spread = Math.min(1, 5 / count);
  hand.style.setProperty("--card-count", String(count));
  const entries: HandEntry[] = [];

  const skip = createSkipCard();
  entries.push({
    element: skip,
    canDrag: () => canAct(current),
    onBlocked: shakeCard,
    onTap: () => (canAct(current) ? placeSkipAt(nearest(current, 1)) : shakeCard(skip)),
    describe: describeSkip,
    onHover: (target) => previewPlacement(target, 1, (probe, start) => placeSkip(probe, start)),
    onDrop: (target) => {
      if (target?.kind === "lane") placeSkipAt(target.cell);
      else if (target?.kind === "reroll") showError({ ok: false, reason: "cannotReroll" });
    },
  });

  for (const instance of current.piles.hand) {
    const element = createCardElement(instance, current.hero, { playable: isPlayable(current, instance), selected: false, onTap: () => {} });
    const weight = cardWeight(instance, current) ?? 1;
    entries.push({
      element,
      canDrag: () => isPlayable(current, instance),
      onBlocked: shakeCard,
      onTap: () => (isPlayable(current, instance) ? placeCardAt(instance, nearestTarget(current, weight)) : shakeCard(element)),
      describe: () => describeCard(instance),
      onHover: (target) => previewPlacement(target, weight, (probe, start) => placeCard(probe, instance.uid, start)),
      onDrop: (target) => dropCard(instance, target),
    });
  }

  entries.forEach((entry, index) => {
    const offset = (index - (count - 1) / 2) * spread;
    entry.element.style.setProperty("--fan-angle", `${offset * 3}deg`);
    entry.element.style.setProperty("--fan-drop", `${offset * offset * 2}px`);
    hand.append(entry.element);
  });
  enableHandGestures(hand, entries, { showInfo: showHandInfo });
  return hand;
}

// Ближайшая к полосе времени клетка, куда карта такого веса встанет, ничего не сдвигая (у веса 0 — стык)
function nearest(current: Combat, weight: number): number | null {
  return findFreeStart(current, weight);
}

function nearestTarget(current: Combat, weight: number): DropTarget {
  const start = nearest(current, weight);
  return start === null ? null : { kind: "lane", cell: start, boundary: start };
}

// Пока палец несёт карту, на дорожке героя видно, куда она встанет (с учётом сдвига других карт) и можно ли туда
function previewPlacement(target: DropTarget, weight: number, place: (probe: Combat, start: number) => ActionResult): void {
  if (target?.kind !== "lane") {
    showLaneSlot(null, weight, false);
    return;
  }
  const start = weight === 0 ? target.boundary : target.cell;
  const probe = structuredClone(combat());
  const ok = place(probe, start).ok;
  // Карта на карту встаёт на начало той карты: показываем, где она окажется на самом деле
  const placed = ok ? probe.lane.find((item) => item.id === probe.nextLaneId - 1) : undefined;
  showLaneSlot(placed?.start ?? start, weight, ok);
}

// Где окажется перенесённая по шкале карта: на клетке под пальцем (или на стыке, если вес 0)
function moveStart(id: number, target: DropTarget): number | null {
  const item = combat().lane.find((entry) => entry.id === id);
  if (!item || target?.kind !== "lane") return null;
  return item.weight === 0 ? target.boundary : target.cell;
}

function previewMove(id: number, target: DropTarget): void {
  const item = combat().lane.find((entry) => entry.id === id);
  const start = moveStart(id, target);
  if (!item || start === null) return showLaneSlot(null, 1, false);
  const probe = structuredClone(combat());
  const ok = moveLaneItem(probe, id, start).ok;
  const moved = ok ? probe.lane.find((entry) => entry.id === id) : undefined;
  showLaneSlot(moved?.start ?? start, item.weight, ok);
}

// Карту перенесли по шкале на другое место (на занятой клетке она сдвинет ту карту)
function moveItem(id: number, target: DropTarget): void {
  const start = moveStart(id, target);
  if (start === null) return;
  const result = moveLaneItem(combat(), id, start);
  if (!result.ok) return showError(result);
  playSound("cardPick");
  afterChange();
}

// Карту из руки отпустили: на шкалу, на подготовку Мага или на стопки — переброс
function dropCard(instance: CardInstance, target: DropTarget): void {
  if (target?.kind === "reroll") reroll(instance.uid);
  else placeCardAt(instance, target);
}

function createBottomBar(current: Combat): HTMLElement {
  const bar = el("div", "combat__bottom-bar");
  const clock = el("div", "combat__capacity", TEXTS.timeline.clock(current.turn, current.clock));

  // Стопки: открыть список карт; сюда же несут карту, чтобы перебросить её
  const piles = el("button", "combat__piles") as HTMLButtonElement;
  piles.type = "button";
  const upcoming = getUpcomingDraws(current).map((card) => getCardData(card).name).join(", ");
  piles.append(
    el("div", "", `${TEXTS.drawPile}: ${current.piles.draw.length} · ${TEXTS.discardPile}: ${current.piles.discard.length} · ${TEXTS.timeline.reroll(current.rerollsLeft)}`),
    el("div", "combat__upcoming", upcoming ? `${TEXTS.timeline.upcoming} ${upcoming}` : ""),
  );
  piles.addEventListener("click", () => openPiles(current));

  // До боя — «Начать», после сворачивания игры — «Продолжить». Остальное время кнопка только показывает, что с временем
  let label = TEXTS.timeline.tactRunning;
  if (current.status === "planning") label = TEXTS.timeline.launch;
  else if (waiting) label = TEXTS.timeline.resume;
  else if (brewBlocksTime(current)) label = TEXTS.timeline.brewWait;
  else if (!nextCellFilled(current)) label = TEXTS.timeline.waitingCard;
  const launchButton = el("button", "button combat__launch", label) as HTMLButtonElement;
  launchButton.type = "button";
  launchButton.disabled = current.status !== "planning" && !waiting;
  launchButton.addEventListener("click", onClockButtonTap);

  bar.append(clock, piles, launchButton);
  return bar;
}

// Добор показываем по порядку id, иначе игрок узнает порядок карт. Верхние открытые карты видны внизу экрана
function openPiles(current: Combat): void {
  const sortedDraw = [...current.piles.draw].sort((a, b) => a.cardId.localeCompare(b.cardId));
  openCardList([
    { title: TEXTS.drawPile, cards: sortedDraw },
    { title: TEXTS.discardPile, cards: current.piles.discard },
    { title: TEXTS.exhaustPile, cards: current.piles.exhaust },
  ]);
}

// Варка с выбором: из двух зелий в сумку попадёт одно
function createBrewChoice(current: Combat): HTMLElement {
  const overlay = el("div", "brew-choice");
  const panel = el("div", "brew-choice__panel");
  panel.append(el("p", "brew-choice__title", TEXTS.timeline.brewTitle));
  for (const potionId of current.brewChoices[0].options) {
    const potion = POTIONS[potionId];
    const button = el("button", "button brew-choice__option") as HTMLButtonElement;
    button.type = "button";
    button.append(el("span", "brew-choice__icon", potion.icon), el("span", "", `${potion.name}: ${potion.description}`));
    button.addEventListener("click", () => {
      chooseBrew(current, 0, potionId);
      playSound("potion");
      afterChange();
    });
    panel.append(button);
  }
  overlay.append(panel);
  return overlay;
}

// ---------- Действия игрока ----------

function afterChange(): void {
  savePlanning();
  showScreen("combat");
}

function showError(result: ActionResult): void {
  if (result.ok) return;
  showTooltip(TEXTS.timeline.errors[result.reason] ?? result.reason);
  playSound("error");
}

// Подсветка врагов, когда выбрано зелье «на врага»: нажатие на врага поставит зелье и выберет этого врага
function wantsEnemyTarget(): boolean {
  if (selection?.kind === "potion") return POTIONS[combat().potions[selection.index]]?.target === "enemy";
  return false;
}

function onPotionTap(index: number): void {
  const same = selection?.kind === "potion" && selection.index === index;
  selection = same ? null : { kind: "potion", index };
  showScreen("combat");
}

// Нажатие на врага: выбрать его (по нему ударят карты, которые сработают дальше), на выбранном — описание.
// С выбранным зельем «на врага» — ещё и поставить зелье в ближайшую клетку
function onEnemyTap(current: Combat, enemy: EnemyUnit): void {
  if (selection && wantsEnemyTarget()) {
    setFocus(current, enemy.instanceId);
    placeSelected({ kind: "lane", cell: -1, boundary: -1 });
    return;
  }
  if (selectedEnemy() !== enemy) {
    setFocus(current, enemy.instanceId);
    playSound("click");
    afterChange();
    return;
  }
  showTooltip(describeEnemy(current, enemy));
}

// Выбранное зелье ставится на нажатую клетку (cell −1 — в ближайшую)
function placeSelected(target: DropTarget): void {
  if (selection?.kind !== "potion" || target?.kind !== "lane") return;
  const current = combat();
  const weight = HEROES[current.hero.heroId].potionWeight;
  const start = target.cell < 0 ? nearest(current, weight) : weight === 0 ? target.boundary : target.cell;
  if (start === null) return showError({ ok: false, reason: "noRoom" });
  const result = placePotion(current, selection.index, start);
  if (!result.ok) return showError(result);
  selection = null;
  playSound("potion");
  afterChange();
}

function placeCardAt(instance: CardInstance, target: DropTarget): void {
  if (!target) return showError({ ok: false, reason: "noRoom" });
  if (target.kind === "reroll") return;
  const current = combat();
  const weight = cardWeight(instance, current);
  if (weight === null) return showError({ ok: false, reason: "cannotPlay" });

  const result = target.kind === "prep"
    ? placeCard(current, instance.uid, 0, null, { prepare: true })
    : placeCard(current, instance.uid, weight === 0 ? target.boundary : target.cell);
  if (!result.ok) return showError(result);
  const tutorialAction = tutorialActionForCard(instance);
  if (tutorialAction) notifyTutorial(tutorialAction);
  playSound("cardPick");
  afterChange();
}

function placeSkipAt(start: number | null): void {
  if (start === null) return showError({ ok: false, reason: "noRoom" });
  const result = placeSkip(combat(), start);
  if (!result.ok) return showError(result);
  playSound("cardPick");
  afterChange();
}

// Нажатие на карту на шкале возвращает её в руку (если добор ещё не сработал)
function returnToHand(id: number): void {
  const result = removeFromLane(combat(), id);
  if (!result.ok) return showError(result);
  playSound("draw");
  afterChange();
}

function reroll(uid: number): void {
  const result = rerollCard(combat(), uid);
  if (!result.ok) return showError(result);
  playSound("draw");
  afterChange();
}

// Откуда и куда летит эффект карты: от героя к цели или ко всем живым врагам
type ViewUnit = { hp: number; portraitRect: DOMRect | null };
function getVfxPositions(before: { units: Record<string, ViewUnit> }, card: CardData, targetId: string | null) {
  const center = (unit: ViewUnit | undefined) => unit?.portraitRect && {
    x: unit.portraitRect.left + unit.portraitRect.width / 2,
    y: unit.portraitRect.top + unit.portraitRect.height / 2,
  };
  const enemies = Object.entries(before.units).filter(([id, unit]) => id !== "hero" && unit.hp > 0).map(([, unit]) => unit);
  const targets = card.target === "enemy" && targetId ? [before.units[targetId]] : card.target === "allEnemies" ? enemies : [];
  return { from: center(before.units.hero), targets: targets.map(center).filter(Boolean), enemies: enemies.map(center).filter(Boolean) };
}

// Журнал расчёта урона для тестового режима: из чего сложился каждый удар
function unitName(current: Combat, id: string): string {
  if (id === "hero") return HEROES[current.hero.heroId].name;
  const enemy = current.enemies.find((unit) => unit.instanceId === id);
  return enemy ? ENEMIES[enemy.enemyId].name : id;
}

function buildDamageLog(current: Combat): string[] {
  const lines: string[] = [];
  for (const event of current.events) {
    if (event.type !== "hit") continue;
    const b = event.breakdown as { base: number; strength: number; weak: number; vulnerable: number; reduction: number; fixed: boolean } | undefined;
    const who = `${unitName(current, event.sourceId as string)} → ${unitName(current, event.targetId as string)}`;
    const formula = !b ? "" : b.fixed
      ? `${b.base} (фикс.)`
      : `${b.base} × (1+${b.strength * 10}%) × (1−${Math.min(b.weak, 3) * 10}%) × (1+${Math.min(b.vulnerable, 10) * 10}%) × (1−${b.reduction}%)`;
    lines.push(`Клетка ${event.cell}: ${who}: ${formula} = ${event.damage}; блок ${event.blocked}, HP −${event.hpLost}`);
  }
  return lines;
}

// «Начать» запускает время; «Продолжить» — после того как игру сворачивали или уходили с экрана боя.
// Остальное время кнопка не нужна: время само идёт, пока следующая клетка занята
function onClockButtonTap(): void {
  const current = combat();
  if (current.status === "planning") {
    playSound("click");
    const result = startCombat(current);
    if (!result.ok) return showError(result);
    waiting = false;
    progress = 0;
    selection = null;
    notifyTutorial("launched");
    afterChange();
    finishCombatIfOver();
    return;
  }
  if (!waiting) return;
  playSound("click");
  waiting = false;
  showScreen("combat");
}

function finishCombatIfOver(): void {
  const current = combat();
  if (current.status === "planning" || current.status === "running") return;
  stopClock();
  // Пока идёт пауза, нажатия не должны доходить до экрана
  document.getElementById("app")?.append(el("div", "input-blocker"));
  setTimeout(showCombatEnd, animationMs(2));
}

// Тестовый бой заканчивается результатом, а в забеге победа ведёт к награде и только поражение — к результату
function showCombatEnd(): void {
  // Учебный бой ведёт дальше сам: в забег или обратно в город
  if (isTutorialBattle()) {
    finishTutorialBattle();
    return;
  }
  if (state.tutorialStep !== null) finishTutorial();
  if (state.test.enabled) {
    showScreen("result");
    return;
  }
  const run = state.run as Run;
  finishCombat(run, combat());
  if (run.status === "lost") {
    showScreen("result");
    return;
  }
  // Награда сохраняется сразу: закрытая игра вернётся на этот же экран
  saveRun(run);
  showScreen("reward");
}
