// Экран события: текст ситуации, варианты выбора и результат.
import { CARDS } from "../../data/cards.ts";
import { POTIONS } from "../../data/potions.ts";
import { RELICS } from "../../data/relics.ts";
import { TEXTS } from "../../data/texts.ru.ts";
import { chooseEventOption, finishEvent, getEventData } from "../../engine/events.ts";
import { scaledGold, scaledShards } from "../../engine/run.ts";
import { saveRun } from "../../save.ts";
import { state } from "../../state.ts";
import { createRunBar } from "../components/runBar.js";
import { el } from "../dom.js";
import { showScreen } from "../router.js";

export function renderEventScreen(root) {
  const run = state.run;
  const active = run.activeEvent;
  const event = getEventData(active);

  const screen = el("main", "center-screen center-screen--with-bar");
  screen.append(createRunBar(run));
  if (active.travel) screen.append(el("p", "event__tag", TEXTS.event.travelTag));
  screen.append(el("h1", "event__title", event.title));

  if (active.chosenIndex === null) {
    screen.append(el("p", "reward__line", event.text));
    event.choices.forEach((choice, index) => screen.append(createChoiceButton(run, choice, index)));
  } else {
    screen.append(el("p", "reward__line", event.choices[active.chosenIndex].result));
    for (const gain of active.gains) screen.append(el("p", "reward__line", formatGain(gain)));
    screen.append(createNextButton(run));
  }
  root.append(screen);
}

// Кнопка варианта: действие и в скобках — чем оно обернётся, по эффектам события
function createChoiceButton(run, choice, index) {
  const outcome = describeEffects(choice.effects, run);
  const button = el("button", "button event__choice", outcome ? `${choice.text} (${outcome})` : choice.text);
  button.type = "button";
  button.addEventListener("click", () => {
    chooseEventOption(run, index);
    // Выбор сохраняется сразу: закрыв игру, неприятный исход не переиграть
    saveRun(run);
    showScreen("event");
  });
  return button;
}

export function describeEffects(effects, run) {
  const texts = TEXTS.event.effects;
  return effects.map((effect) => {
    switch (effect.type) {
      case "loseHp": case "heal": case "loseGold": case "gainMaxHp": case "loseMaxHp":
        return texts[effect.type](effect.amount);
      case "gainGold":
        return texts.gainGold(scaledGold(run, effect.amount));
      case "addCard":
        return effect.cardId === "wound" ? texts.wound : texts.card[effect.rarity];
      case "removeRandomCard":
        return texts.removeStarter;
      case "losePotion":
        return texts.losePotion(effect.fallbackHp);
      case "upgradeRandomCards":
        return effect.cardType ? texts.upgradeType[effect.cardType] : texts.upgrade(effect.count);
      case "gainRelic":
        return effect.relicId ? texts.relicNamed(RELICS[effect.relicId].icon, RELICS[effect.relicId].name) : texts.gainRelic;
      case "gainPotion":
        return effect.potionId ? texts.potionNamed(POTIONS[effect.potionId].icon, POTIONS[effect.potionId].name) : texts.gainPotion;
      case "gainShards":
        return texts.gainShards(scaledShards(run, effect.amount));
      default:
        return texts[effect.type];
    }
  }).join(", ");
}

function createNextButton(run) {
  const button = el("button", "button button--large", TEXTS.event.next);
  button.type = "button";
  button.addEventListener("click", () => {
    finishEvent(run);
    saveRun(run);
    showScreen("dungeon");
  });
  return button;
}

// Что именно игрок получил: случайные карты, реликвии и зелья
function formatGain(gain) {
  switch (gain.kind) {
    case "card":
      return TEXTS.event.gainCard(CARDS[gain.id].name);
    case "cardRemoved":
      return TEXTS.event.cardRemoved(CARDS[gain.id].name);
    case "cardUpgraded":
      return TEXTS.event.cardUpgraded(CARDS[gain.id].name);
    case "relic":
      return TEXTS.event.gainRelic(RELICS[gain.id].name, RELICS[gain.id].icon);
    case "potion":
      return TEXTS.event.gainPotion(POTIONS[gain.id].name, POTIONS[gain.id].icon);
    case "gold":
      return TEXTS.event.gainGold(gain.amount);
    case "shards":
      return TEXTS.event.gainShards(gain.amount);
    case "goldLost":
      return TEXTS.event.goldLost(gain.amount);
    case "potionLost":
      return TEXTS.event.potionLost(POTIONS[gain.id].name, POTIONS[gain.id].icon);
    case "hpLost":
      return TEXTS.event.hpLost(gain.amount);
    default:
      return TEXTS.event.potionsFull;
  }
}
