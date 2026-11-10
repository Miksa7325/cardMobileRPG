// Экран отдыха: восстановить HP, улучшить карту или пропустить.
import { TEXTS } from "../../data/texts.ru.ts";
import { getRestHealAmount, getUpgradableCards, restHeal, restUpgrade } from "../../engine/run.ts";
import { state } from "../../state.ts";
import { createCardElement } from "../components/card.ts";
import { openCardPreview } from "../components/cardPreview.ts";
import { createRunBar } from "../components/runBar.js";
import { playSound } from "../audio.js";
import { el } from "../dom.js";
import { showScreen } from "../router.js";

// Вне боя статусов нет: числа на картах показываем без них
const HERO_OUTSIDE_COMBAT = { statuses: {} };

function createButton(text, onTap) {
  const button = el("button", "button button--large", text);
  button.type = "button";
  button.addEventListener("click", onTap);
  return button;
}

export function renderRestScreen(root) {
  const run = state.run;
  const healAmount = getRestHealAmount(run);

  const healButton = createButton(TEXTS.rest.heal(healAmount), () => {
    restHeal(run);
    playSound("heal");
    showScreen("dungeon");
  });
  healButton.disabled = healAmount === 0;

  const upgradeButton = createButton(TEXTS.rest.upgrade, () => showScreen("restUpgrade"));
  upgradeButton.disabled = getUpgradableCards(run).length === 0;

  // Можно уйти, ничего не взяв (разбор механик): отдых в этой комнате пропадает
  const skipButton = el("button", "button button--secondary", TEXTS.rest.skip);
  skipButton.type = "button";
  skipButton.addEventListener("click", () => showScreen("dungeon"));

  const screen = el("main", "center-screen center-screen--with-bar");
  screen.append(createRunBar(run), el("h1", "center-screen__title", TEXTS.rest.title), healButton, upgradeButton, skipButton);
  root.append(screen);
}

// Показываем карты уже улучшенными: так видно, что игрок получит
export function renderRestUpgradeScreen(root) {
  const run = state.run;
  const row = el("div", "card-row");
  for (const card of getUpgradableCards(run)) {
    const upgraded = { ...card, level: card.level + 1 };
    row.append(createCardElement(upgraded, HERO_OUTSIDE_COMBAT, {
      playable: true,
      selected: false,
      onTap: () => {
        restUpgrade(run, card.uid);
        showScreen("dungeon");
      },
      onHold: () => openCardPreview(upgraded, HERO_OUTSIDE_COMBAT),
    }));
  }

  const backButton = el("button", "button button--secondary", TEXTS.rest.back);
  backButton.type = "button";
  backButton.addEventListener("click", () => showScreen("rest"));

  const screen = el("main", "center-screen center-screen--with-bar");
  screen.append(createRunBar(run), el("p", "reward__line", TEXTS.rest.upgradeTitle), row, backButton);
  root.append(screen);
}
