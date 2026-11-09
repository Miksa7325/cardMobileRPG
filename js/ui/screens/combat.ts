// Экран боя на бесконечной шкале: враги, шкала, герой, рука. Показывает состояние боя и передаёт действия игрока в логику.
// Как играть: сначала карты расставляют на первые 6 клеток и жмут «Начать». Время идёт по такту (3 клетки) и в конце
// каждого такта встаёт: чтобы прошёл следующий, игрок снова жмёт кнопку. Карты можно ставить, убирать и переставлять
// и на остановке, и пока идёт такт (не дальше 6 клеток вперёд). Карту перетаскивают на клетку шкалы (или на врага),
// либо нажимают карту, потом клетку или врага. Нажатие на карту на шкале возвращает её в руку.
// Пока палец тащит карту, время идёт вдвое медленнее.
import { CARDS } from "../../data/cards.ts";
import { ENEMIES } from "../../data/enemies.ts";
import { HEROES } from "../../data/heroes.ts";
import { POTIONS } from "../../data/potions.ts";
import { TEXTS } from "../../data/texts.ru.ts";
import { CONFIG } from "../../config.ts";
import {
  cardWeight, chooseBrew, createCombat, findFreeStart, getEnemyIntent, getUpcomingDraws, moveLaneItem, placeCard, placePotion,
  previewLaunch, removeFromLane, rerollCard, startCombat, tick,
} from "../../engine/combat.ts";
import { getCardData } from "../../engine/deck.ts";
import { createNodeCombat, finishCombat } from "../../engine/run.ts";
import { saveRun } from "../../save.ts";
import { state } from "../../state.ts";
import type { ActionResult, CardData, CardInstance, Combat, EnemyUnit, Equipment, HeroId, Run, Unit } from "../../types.ts";
import { captureCombatView, playTick, showDrawnCards } from "../animations.js";
import { enemySprite, heroSprite, IDLE_STYLES, setHeroLookVariable } from "../art.js";
import { playSound } from "../audio.js";
import { createCardElement, shakeCard } from "../components/card.ts";
import { openCardList } from "../components/cardList.ts";
import { createCardPicker } from "../components/cardPicker.ts";
import { openCardPreview } from "../components/cardPreview.ts";
import { createHpBar } from "../components/hpBar.js";
import { createCombatItems, createMenuButton, createRunBar } from "../components/runBar.js";
import { createStatusIcons } from "../components/statusIcons.js";
import { createTimeline, setTimelineProgress, showLaneSlot } from "../components/timeline.ts";
import { showTooltip } from "../components/tooltip.js";
import { el } from "../dom.js";
import { createIcon } from "../icons.js";
import { showScreen } from "../router.js";
import { animationMs, getCellMs } from "../settings.js";
import { type DropTarget, dragState, enableTimelineDrag } from "../timelineDrag.ts";
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

// Что игрок выбрал нажатием: карту из руки или зелье. Следующее нажатие на клетку или врага поставит его
type Selection = { kind: "card"; uid: number } | { kind: "potion"; index: number } | null;
let selection: Selection = null;
// Чья дорожка видна целиком. Остальные враги показывают над головой только ближайший ход
let selectedEnemyId: string | null = null;

function combat(): Combat {
  return state.combat as Combat;
}

function resetView(): void {
  selection = null;
  selectedEnemyId = null;
  waiting = false;
  progress = 0;
}

// ---------- Время ----------
//
// «Сердцебиение» раз в 100 мс копит долю клетки (во время перетаскивания — вдвое медленнее). Набралась клетка —
// логика делает шаг (tick), экран коротко показывает её события и рисуется заново. Пока клетка идёт, шкала плавно
// едет под полосой времени (в первой клетке боя — сама полоса).
// Время стоит: до «Начать», в конце каждого такта (ждёт кнопку), пока не выбрано зелье варки, пока открыта панель
// тестового режима и когда игрок ушёл с экрана боя или свернул игру (тогда тоже ждёт кнопку)

const HEARTBEAT_MS = 100;
const TACT = CONFIG.timeline.tactCells;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let waiting = false; // время стоит, пока игрок не нажмёт кнопку: конец такта или игру сворачивали
let progress = 0; // доля текущей клетки, которая уже прошла
let ticking = false; // идёт шаг и его анимация
let pendingRender = false; // экран надо перерисовать, как только палец отпустит карту

function onCombatScreen(): boolean {
  return Boolean(document.querySelector("main.combat"));
}

function timeStands(current: Combat): boolean {
  return current.status !== "running" || waiting || current.brewChoices.length > 0 || state.test.pickerOpen;
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
  progress += HEARTBEAT_MS / (getCellMs() * (dragState.active ? CONFIG.timeline.dragSlowdown : 1));
  if (progress < 1) {
    setTimelineProgress(progress);
    return;
  }
  progress = 0;
  void doTick(current);
}

// Один шаг времени: логика проходит клетку, экран показывает её события и рисуется заново
async function doTick(current: Combat): Promise<void> {
  ticking = true;
  const before = captureCombatView(current);
  const result = tick(current);
  if (!result.ok) {
    ticking = false;
    return;
  }
  // Такт кончился — время встаёт до кнопки
  if (current.clock % TACT === 0) waiting = true;
  if (state.test.enabled) state.test.damageLog = buildDamageLog(current);
  await ui.playTick(before, current, {
    maxMs: getCellMs() * 0.7,
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

function selectedEnemy(): EnemyUnit | null {
  const alive = aliveEnemies();
  return alive.find((enemy) => enemy.instanceId === selectedEnemyId) ?? alive[0] ?? null;
}

export function renderCombatScreen(root: HTMLElement): void {
  const current = combat();
  const screen = el("main", "combat");
  const preview = previewLaunch(current);
  screen.append(
    createTopBar(current),
    createEnemies(current),
    createCombatItems(state.test.enabled ? current.relics : (state.run as Run).relics, current.potions, {
      onPotionTap,
      selectedPotionIndex: selection?.kind === "potion" ? selection.index : null,
    }),
    createTimeline(current, selectedEnemy(), preview, {
      onHeroLaneTap: (cell, boundary) => placeSelected({ kind: "lane", cell, boundary }),
      onPrepLaneTap: () => placeSelected({ kind: "prep" }),
      onItemTap: returnToHand,
      onItemMove: moveItem,
      onItemHover: previewMove,
    }),
    createHero(current),
    el("p", "combat__hint", getHint(current)),
    createSelectionBar(current),
    createHand(current),
    createBottomBar(current),
  );
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
  if (selection?.kind === "card") return TEXTS.timeline.hintSelected;
  if (selection?.kind === "potion") return TEXTS.timeline.hintPotion;
  if (current.status === "planning") return TEXTS.timeline.hintPlan;
  if (!waiting) return TEXTS.timeline.hintRunning;
  return isTactEnd(current) ? TEXTS.timeline.hintTactEnd : TEXTS.timeline.hintStopped;
}

// Время стоит ровно на конце такта (а не посреди него — после того как игру сворачивали)
function isTactEnd(current: Combat): boolean {
  return current.clock % TACT === 0 && progress === 0;
}

// ---------- Рука и выбранная карта ----------

function selectedCard(): CardInstance | null {
  if (selection?.kind !== "card") return null;
  const uid = selection.uid;
  return combat().piles.hand.find((card) => card.uid === uid) ?? null;
}

function canPrepare(current: Combat): boolean {
  return Boolean(HEROES[current.hero.heroId].prepares);
}

// Можно ли поставить карту хоть куда-нибудь
function isPlayable(current: Combat, instance: CardInstance): boolean {
  const weight = cardWeight(instance, current);
  if (weight === null || (current.status !== "planning" && current.status !== "running")) return false;
  return findFreeStart(current, weight) !== null || canPrepare(current);
}

function createHand(current: Combat): HTMLElement {
  const hand = el("div", "hand");
  const count = current.piles.hand.length;
  const middle = (count - 1) / 2;
  // Чем больше карт в руке, тем меньше наклон, иначе крайние уйдут за экран
  const spread = Math.min(1, 5 / count);
  hand.style.setProperty("--card-count", String(count));

  current.piles.hand.forEach((instance, index) => {
    const isSelected = selection?.kind === "card" && selection.uid === instance.uid;
    const element = createCardElement(instance, current.hero, {
      playable: isPlayable(current, instance),
      selected: isSelected,
      onTap: () => onCardTap(instance),
      onHold: () => openCardPreview(instance, current.hero),
    });
    enableTimelineDrag(element, {
      canDrag: () => isPlayable(current, instance),
      onBlocked: shakeCard,
      onHover: (target) => previewSlot(instance, target),
      onDrop: (target, ghost) => {
        ghost.remove();
        placeCardAt(instance, target);
      },
    });
    const offset = (index - middle) * spread;
    element.style.setProperty("--fan-angle", `${offset * 3}deg`);
    element.style.setProperty("--fan-drop", `${offset * offset * 2}px`);
    hand.append(element);
  });
  return hand;
}

// Пока палец несёт карту, на дорожке героя видно, куда она встанет и можно ли туда
function previewSlot(instance: CardInstance, target: DropTarget): void {
  const weight = cardWeight(instance, combat()) ?? 1;
  if (target?.kind !== "lane") {
    showLaneSlot(null, weight, false);
    return;
  }
  const start = weight === 0 ? target.boundary : target.cell;
  const probe = structuredClone(combat());
  const ok = placeCard(probe, instance.uid, start, targetFor(getCardData(instance).target, null)).ok;
  showLaneSlot(start, weight, ok);
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
  showLaneSlot(start, item.weight, moveLaneItem(probe, id, start).ok);
}

// Карту перенесли по шкале: на враге — та же клетка, но новая цель
function moveItem(id: number, target: DropTarget): void {
  const current = combat();
  const item = current.lane.find((entry) => entry.id === id);
  if (!item || !target) return;
  const result = target.kind === "enemy"
    ? moveLaneItem(current, id, item.start, target.id)
    : target.kind === "lane" ? moveLaneItem(current, id, moveStart(id, target)!) : { ok: false as const, reason: "noRoom" };
  if (!result.ok) return showError(result);
  playSound("cardPick");
  afterChange();
}

// Под выбранной картой — что ещё с ней можно сделать: перебросить (раз в два такта), подготовить
function createSelectionBar(current: Combat): HTMLElement {
  const bar = el("div", "combat__selection");
  const instance = selectedCard();
  if (!instance) return bar;
  bar.append(actionButton(`${TEXTS.timeline.rerollCard} (${current.rerollsLeft})`, () => reroll(instance.uid), current.rerollsLeft <= 0));
  if (canPrepare(current)) bar.append(actionButton(TEXTS.timeline.prepare, () => placeSelected({ kind: "prep" })));
  bar.append(actionButton(TEXTS.timeline.details, () => openCardPreview(instance, current.hero)));
  return bar;
}

function actionButton(text: string, onTap: () => void, disabled = false): HTMLElement {
  const button = el("button", "button button--secondary combat__action", text) as HTMLButtonElement;
  button.type = "button";
  button.disabled = disabled;
  button.addEventListener("click", onTap);
  return button;
}

function createBottomBar(current: Combat): HTMLElement {
  const bar = el("div", "combat__bottom-bar");
  const clock = el("div", "combat__capacity", TEXTS.timeline.clock(current.turn, current.clock));

  const piles = el("button", "combat__piles") as HTMLButtonElement;
  piles.type = "button";
  const upcoming = getUpcomingDraws(current).map((card) => getCardData(card).name).join(", ");
  piles.append(
    el("div", "", `${TEXTS.drawPile}: ${current.piles.draw.length} · ${TEXTS.discardPile}: ${current.piles.discard.length}`),
    el("div", "combat__upcoming", upcoming ? `${TEXTS.timeline.upcoming} ${upcoming}` : ""),
  );
  piles.addEventListener("click", () => openPiles(current));

  // До начала боя — «Начать», на остановке — следующий такт, пока такт идёт — кнопка ждёт его конца
  let label = TEXTS.timeline.tactRunning;
  if (current.status === "planning") label = TEXTS.timeline.launch;
  else if (waiting) label = isTactEnd(current) ? TEXTS.timeline.nextTact : TEXTS.timeline.resume;
  const launchButton = el("button", "button combat__launch", label) as HTMLButtonElement;
  launchButton.type = "button";
  launchButton.disabled = current.status === "running" && !waiting;
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

// Карте «на врага» нужна цель: тот, на кого её бросили, иначе выбранный враг
function targetFor(target: CardData["target"], enemyId: string | null): string | null {
  if (target !== "enemy") return null;
  return enemyId ?? selectedEnemy()?.instanceId ?? null;
}

function wantsEnemyTarget(): boolean {
  if (selection?.kind === "card") {
    const instance = selectedCard();
    return instance ? getCardData(instance).target === "enemy" : false;
  }
  if (selection?.kind === "potion") return POTIONS[combat().potions[selection.index]]?.target === "enemy";
  return false;
}

function onCardTap(instance: CardInstance): void {
  const same = selection?.kind === "card" && selection.uid === instance.uid;
  selection = same ? null : { kind: "card", uid: instance.uid };
  showScreen("combat");
}

function onPotionTap(index: number): void {
  const same = selection?.kind === "potion" && selection.index === index;
  selection = same ? null : { kind: "potion", index };
  showScreen("combat");
}

// Нажатие на врага: с выбранной картой «на врага» — поставить её в первую свободную клетку против него,
// иначе — показать его дорожку, а на показанном враге — описание
function onEnemyTap(current: Combat, enemy: EnemyUnit): void {
  if (selection && wantsEnemyTarget()) {
    placeSelected({ kind: "enemy", id: enemy.instanceId });
    return;
  }
  if (selectedEnemy() !== enemy) {
    selectedEnemyId = enemy.instanceId;
    showScreen("combat");
    return;
  }
  showTooltip(describeEnemy(current, enemy));
}

function placeSelected(target: DropTarget): void {
  if (selection?.kind === "card") {
    const instance = selectedCard();
    if (instance) placeCardAt(instance, target);
    return;
  }
  if (selection?.kind === "potion" && target) {
    const current = combat();
    const potion = POTIONS[current.potions[selection.index]];
    const weight = HEROES[current.hero.heroId].potionWeight;
    let start: number | null = null;
    if (target.kind === "lane") start = weight === 0 ? target.boundary : target.cell;
    if (target.kind === "enemy") start = findFreeStart(current, weight);
    if (start === null) return showError({ ok: false, reason: "noRoom" });
    const enemyId = target.kind === "enemy" ? target.id : null;
    const result = placePotion(current, selection.index, start, targetFor(potion.target, enemyId));
    if (!result.ok) return showError(result);
    selection = null;
    playSound("potion");
    afterChange();
  }
}

function placeCardAt(instance: CardInstance, target: DropTarget): void {
  if (!target) return;
  const current = combat();
  const card = getCardData(instance);
  const weight = cardWeight(instance, current);
  if (weight === null) return showError({ ok: false, reason: "cannotPlay" });

  let result: ActionResult;
  if (target.kind === "prep") {
    result = placeCard(current, instance.uid, 0, targetFor(card.target, null), { prepare: true });
  } else {
    const enemyId = target.kind === "enemy" ? target.id : null;
    const start = target.kind === "lane" ? (weight === 0 ? target.boundary : target.cell) : findFreeStart(current, weight);
    if (start === null) return showError({ ok: false, reason: "noRoom" });
    result = placeCard(current, instance.uid, start, targetFor(card.target, enemyId));
  }
  if (!result.ok) return showError(result);
  selection = null;
  const tutorialAction = tutorialActionForCard(instance);
  if (tutorialAction) notifyTutorial(tutorialAction);
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
  selection = null;
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

// «Начать» запускает время; на остановке в конце такта та же кнопка запускает следующий такт.
// Кнопки паузы нет: время и так встаёт в конце каждого такта
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

