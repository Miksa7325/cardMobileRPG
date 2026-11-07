// Тестовый режим: список карт, реликвий и зелий поверх боя. Нажатие сразу выдаёт выбранное.
import { CARDS } from "../../data/cards.ts";
import { POTIONS } from "../../data/potions.ts";
import { RELICS } from "../../data/relics.ts";
import { TEXTS } from "../../data/texts.ru.ts";
import { addCardToHand, addPotionToCombat, addRelicToCombat } from "../../engine/combat.ts";
import { canUpgradeCard } from "../../engine/deck.ts";
import { state } from "../../state.ts";
import { el } from "../dom.js";
import { showScreen } from "../router.js";
import { showTooltip } from "./tooltip.js";

function createButton(text, onTap) {
  const button = el("button", "button", text);
  button.type = "button";
  button.addEventListener("click", onTap);
  return button;
}

function createRow(text, onTap) {
  const row = el("button", "picker__row", text);
  row.type = "button";
  row.addEventListener("click", onTap);
  return row;
}

export function createCardPicker() {
  const picker = el("div", "picker");
  const { test } = state;

  const toggle = createButton(test.addUpgraded ? TEXTS.test.upgradedOn : TEXTS.test.upgradedOff, () => {
    test.addUpgraded = !test.addUpgraded;
    showScreen("combat");
  });
  const close = createButton(TEXTS.test.close, () => {
    test.pickerOpen = false;
    showScreen("combat");
  });
  const leave = createButton(TEXTS.test.leave, () => {
    test.pickerOpen = false;
    showScreen("testSetup");
  });

  const controls = el("div", "picker__controls");
  controls.append(toggle, close, leave);
  picker.append(el("p", "picker__title", TEXTS.test.pickerTitle), controls);

  picker.append(el("p", "picker__title", TEXTS.test.cards));
  for (const card of Object.values(CARDS)) {
    const upgraded = test.addUpgraded && canUpgradeCard(card.id);
    picker.append(createRow(`${card.name}${upgraded ? "+" : ""}`, () => {
      if (addCardToHand(state.combat, card.id, upgraded ? 1 : 0)) showScreen("combat");
    }));
  }

  picker.append(el("p", "picker__title", TEXTS.test.relics));
  for (const relic of Object.values(RELICS)) {
    picker.append(createRow(`${relic.icon} ${relic.name}`, () => {
      addRelicToCombat(state.combat, relic.id);
      showScreen("combat");
      showTooltip(TEXTS.itemDescription(relic.name, relic.description));
    }));
  }

  picker.append(el("p", "picker__title", TEXTS.test.potions));
  for (const potion of Object.values(POTIONS)) {
    picker.append(createRow(`${potion.icon} ${potion.name}`, () => {
      if (addPotionToCombat(state.combat, potion.id)) showScreen("combat");
    }));
  }
  return picker;
}
