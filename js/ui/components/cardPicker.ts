// Тестовый режим: список карт, реликвий и зелий поверх боя. Нажатие сразу выдаёт выбранное.
import { CARDS } from "../../data/cards.ts";
import { ENEMIES } from "../../data/enemies.ts";
import { POTIONS } from "../../data/potions.ts";
import { RELICS } from "../../data/relics.ts";
import { TEXTS } from "../../data/texts.ru.ts";
import { addCardToHand, addPotionToCombat, addRelicToCombat } from "../../engine/combat.ts";
import { canUpgradeCard } from "../../engine/deck.ts";
import { state } from "../../state.ts";
import { el } from "../dom.js";
import { showScreen } from "../router.js";
import { showTooltip } from "./tooltip.js";
import type { Combat, EnemyUnit, HeroUnit, StatusId } from "../../types.ts";

function createButton(text: string, onTap: () => void): HTMLButtonElement {
  const button: HTMLButtonElement = el("button", "button", text);
  button.type = "button";
  button.addEventListener("click", onTap);
  return button;
}

function createRow(text: string, onTap: () => void): HTMLButtonElement {
  const row: HTMLButtonElement = el("button", "picker__row", text);
  row.type = "button";
  row.addEventListener("click", onTap);
  return row;
}

// Все статусы, которые можно положить кнопкой
const STATUS_IDS = Object.keys(TEXTS.statuses) as StatusId[];

// Кому кладём статусы и ходы: герой или враг из боя
function selectedUnit(combat: Combat): HeroUnit | EnemyUnit {
  if (state.test.unitId === "hero") return combat.hero;
  return combat.enemies.find((enemy) => enemy.instanceId === state.test.unitId && enemy.hp > 0) ?? combat.hero;
}

function appendTestTools(picker: HTMLElement): void {
  const combat = state.combat as Combat;
  const { test } = state;

  picker.append(createButton(test.stepMode ? TEXTS.test.stepOn : TEXTS.test.stepOff, () => {
    test.stepMode = !test.stepMode;
    showScreen("combat");
  }));

  // Статусы на любого бойца
  picker.append(el("p", "picker__title", TEXTS.test.statuses));
  const units: HTMLElement = el("div", "picker__controls");
  const unitButton = (id: string, name: string) => {
    const button = createButton(name, () => {
      test.unitId = id;
      showScreen("combat");
    });
    if (test.unitId === id) button.classList.add("button--selected");
    return button;
  };
  units.append(unitButton("hero", TEXTS.test.heroUnit));
  for (const enemy of combat.enemies.filter((unit) => unit.hp > 0)) units.append(unitButton(enemy.instanceId, ENEMIES[enemy.enemyId].name));
  picker.append(units);
  const unit = selectedUnit(combat);
  const statuses: HTMLElement = el("div", "picker__grid");
  for (const status of STATUS_IDS) {
    statuses.append(createRow(TEXTS.test.addStatus(TEXTS.statuses[status]), () => {
      unit.statuses[status] = (unit.statuses[status] ?? 0) + 1;
      showScreen("combat");
    }));
  }
  statuses.append(createRow(TEXTS.test.clearStatuses, () => {
    unit.statuses = {};
    showScreen("combat");
  }));
  picker.append(statuses);

  // Любые ходы врага: добавляются в конец его дорожки
  if (unit !== combat.hero) {
    const enemy = unit as EnemyUnit;
    const data = ENEMIES[enemy.enemyId];
    picker.append(el("p", "picker__title", TEXTS.test.moves(data.name)));
    const moves: HTMLElement = el("div", "picker__grid");
    for (const [key, move] of Object.entries(data.moves)) {
      moves.append(createRow(`${key} (${TEXTS.test.intentNames[move.intent]}, вес ${move.weight})`, () => {
        enemy.lane.push({ move: key, weight: move.weight, resolved: false });
        showScreen("combat");
      }));
    }
    moves.append(createRow(TEXTS.test.clearLane, () => {
      enemy.lane = enemy.lane.filter((action) => action.resolved);
      showScreen("combat");
    }));
    picker.append(moves);
  }

  // Журнал расчёта урона
  picker.append(el("p", "picker__title", TEXTS.test.log));
  const log: HTMLElement = el("div", "picker__log");
  const lines = test.damageLog.length > 0 ? test.damageLog : [TEXTS.test.logEmpty];
  for (const line of lines) log.append(el("p", "picker__log-line", line));
  picker.append(log);
}

export function createCardPicker(): HTMLElement {
  const picker: HTMLElement = el("div", "picker");
  const combat = state.combat as Combat;
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

  appendTestTools(picker);

  picker.append(el("p", "picker__title", TEXTS.test.cards));
  for (const card of Object.values(CARDS)) {
    const upgraded = test.addUpgraded && canUpgradeCard(card.id);
    picker.append(createRow(`${card.name}${upgraded ? "+" : ""}`, () => {
      if (addCardToHand(combat, card.id, upgraded ? 1 : 0)) showScreen("combat");
    }));
  }

  picker.append(el("p", "picker__title", TEXTS.test.relics));
  for (const relic of Object.values(RELICS)) {
    picker.append(createRow(`${relic.icon} ${relic.name}`, () => {
      addRelicToCombat(combat, relic.id);
      showScreen("combat");
      showTooltip(TEXTS.itemDescription(relic.name, relic.description));
    }));
  }

  picker.append(el("p", "picker__title", TEXTS.test.potions));
  for (const potion of Object.values(POTIONS)) {
    picker.append(createRow(`${potion.icon} ${potion.name}`, () => {
      if (addPotionToCombat(combat, potion.id)) showScreen("combat");
    }));
  }
  return picker;
}
