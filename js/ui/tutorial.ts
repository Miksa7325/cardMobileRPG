// Обучение. Учебный бой на шкале — отдельный бой против Скелета: перед первым забегом и по желанию
// на Тренировочной арене. Подсказки ведут игрока за руку, но ничего не запрещают.
// Шаг двигается сам, когда игрок делает нужное действие, или по кнопке «Дальше».
// После учебного боя в первом забеге остаётся одна подсказка — про подземелье.
import { TEXTS } from "../data/texts.ru.ts";
import { createCombat } from "../engine/combat.ts";
import { getCardData } from "../engine/deck.ts";
import { loadMeta, saveMeta } from "../save.ts";
import { state } from "../state.ts";
import type { CardInstance, Combat, HeroId } from "../types.ts";
import { el } from "./dom.js";
import { showScreen } from "./router.js";

// highlight — CSS-селектор того, что подсвечивается; waitFor — действие, которое завершает шаг (без него — «Дальше»)
interface Step {
  id: keyof typeof TEXTS.tutorial;
  screen: "combat" | "dungeon";
  highlight?: string;
  waitFor?: string;
}

const BATTLE_STEPS: Step[] = [
  { id: "timeline", screen: "combat", highlight: ".timeline" },
  { id: "enemyLane", screen: "combat", highlight: ".timeline__row--enemy" },
  { id: "weight", screen: "combat", highlight: ".combat__capacity, .hand .card__cost" },
  { id: "block", screen: "combat", waitFor: "blockPlaced", highlight: ".hand .card--skill, .timeline__track[data-lane=hero]" },
  { id: "attack", screen: "combat", waitFor: "attackPlaced", highlight: ".hand .card--attack, .timeline__track[data-lane=hero]" },
  // Бонусы цепочки: шаг пропускается, пока в руке нет карт с бонусом (они появятся на этапе 5)
  { id: "chain", screen: "combat", highlight: ".card__trigger--chain, .lane-chip--bonus" },
  { id: "tacts", screen: "combat", highlight: ".timeline__tracks" },
  { id: "armor", screen: "combat" },
  { id: "launch", screen: "combat", waitFor: "launched", highlight: ".combat__launch" },
  { id: "finish", screen: "combat" },
];
const DUNGEON_STEPS: Step[] = [{ id: "dungeon", screen: "dungeon", waitFor: "nodeEntered" }];

let steps: Step[] = [];
// Что сделать, когда учебный бой кончится: начать забег или вернуться в город
let afterBattle: (() => void) | null = null;

function currentStep(): Step | null {
  return state.tutorialStep === null ? null : steps[state.tutorialStep] ?? null;
}

// Идёт ли сейчас учебный бой
export function isTutorialBattle(): boolean {
  return afterBattle !== null;
}

// Учебный бой: стартовая колода героя против Скелета, всегда с одной раскладкой
export function startTutorialBattle(heroId: HeroId, onDone: () => void): void {
  state.combat = createCombat({ heroId, enemyIds: ["skeleton"], seed: 20261107 });
  state.test.enabled = true;
  state.arena = null;
  afterBattle = onDone;
  steps = BATTLE_STEPS;
  state.tutorialStep = 0;
  showScreen("combat");
}

// Учебный бой кончился (победой или нет): обучение пройдено
export function finishTutorialBattle(): void {
  const done = afterBattle;
  afterBattle = null;
  state.tutorialStep = null;
  state.test.enabled = false;
  const meta = loadMeta();
  meta.tutorialDone = true;
  saveMeta(meta);
  done?.();
}

// Подсказка про подземелье в первом забеге
export function startTutorial(): void {
  steps = DUNGEON_STEPS;
  state.tutorialStep = 0;
}

export function finishTutorial(): void {
  state.tutorialStep = null;
  const meta = loadMeta();
  meta.tutorialDone = true;
  saveMeta(meta);
}

function goToNextStep(): void {
  if (state.tutorialStep === null) return;
  state.tutorialStep += 1;
  if (state.tutorialStep >= steps.length) state.tutorialStep = null;
}

// Сообщает обучению о действии игрока: blockPlaced, attackPlaced, launched, nodeEntered
export function notifyTutorial(action: string): void {
  const step = currentStep();
  if (!step) return;
  if (step.waitFor === action) {
    goToNextStep();
  } else if (action === "launched") {
    // Игрок запустил шкалу раньше подсказки: остаётся последний шаг
    state.tutorialStep = steps.findIndex((item) => item.id === "finish");
  }
}

// Какое действие обучения означает эта карта на шкале
export function tutorialActionForCard(instance: CardInstance): string | null {
  const card = getCardData(instance);
  if (card.target === "enemy") return "attackPlaced";
  if (card.effects.some((effect) => effect.type === "block")) return "blockPlaced";
  return null;
}

// Шаг нечем выполнить или не о чем рассказать: про блок — нет карты с блоком, про цепочки — нет карты с бонусом
function skipImpossibleSteps(combat: Combat): void {
  const id = currentStep()?.id;
  if (id === "block" && !combat.piles.hand.some((card) => tutorialActionForCard(card) === "blockPlaced")) goToNextStep();
  else if (id === "chain" && !combat.piles.hand.some((card) => getCardData(card).chain)) goToNextStep();
  else return;
  skipImpossibleSteps(combat);
}

// Подсвечивает то, о чём говорит шаг
export function applyTutorialHighlights(screen: HTMLElement): void {
  const selector = currentStep()?.highlight;
  if (!selector) return;
  for (const element of screen.querySelectorAll(selector)) element.classList.add("tutorial-target");
}

// Плашка с подсказкой на экране. Возвращает null, если обучения сейчас нет
export function createTutorialBanner(screenName: string, combat: Combat | null = null): HTMLElement | null {
  if (combat) skipImpossibleSteps(combat);
  const step = currentStep();
  if (!step || step.screen !== screenName) return null;

  const banner: HTMLElement = el("div", "tutorial");
  banner.append(el("p", "tutorial__text", TEXTS.tutorial[step.id] as string));
  const controls: HTMLElement = el("div", "tutorial__controls");
  const skip: HTMLButtonElement = el("button", "tutorial__button", TEXTS.tutorial.skip);
  skip.type = "button";
  skip.addEventListener("click", () => {
    if (isTutorialBattle()) {
      finishTutorialBattle();
      return;
    }
    finishTutorial();
    showScreen(screenName);
  });
  controls.append(skip);

  if (!step.waitFor) {
    const next: HTMLButtonElement = el("button", "tutorial__button tutorial__button--main", TEXTS.tutorial.next);
    next.type = "button";
    next.addEventListener("click", () => {
      goToNextStep();
      showScreen(screenName);
    });
    controls.append(next);
  }
  banner.append(controls);
  return banner;
}
