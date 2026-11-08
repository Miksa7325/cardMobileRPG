// Тайник: комната без боя, где можно взять одно — зелье, Осколки мастерства или золото.
// Предложение создаёт engine/run.ts (openCache) и хранит в run.pendingCache, пока игрок не выберет
import { POTIONS } from "../../data/potions.ts";
import { TEXTS } from "../../data/texts.ru.ts";
import { takeFromCache } from "../../engine/run.ts";
import { saveRun } from "../../save.ts";
import { state } from "../../state.ts";
import { playSound } from "../audio.js";
import { createRunBar } from "../components/runBar.js";
import { showTooltip } from "../components/tooltip.js";
import { el } from "../dom.js";
import { showScreen } from "../router.js";

function createButton(text, onTap, disabled = false) {
  const button = el("button", "button button--large", text);
  button.type = "button";
  button.disabled = disabled;
  button.addEventListener("click", onTap);
  return button;
}

export function renderCacheScreen(root) {
  const run = state.run;
  const offer = run.pendingCache;
  if (!offer) {
    showScreen("dungeon");
    return;
  }
  const take = (choice) => {
    if (!takeFromCache(run, choice)) return;
    playSound("chest");
    if (!saveRun(run)) showTooltip(TEXTS.saveFailed);
    showScreen("dungeon");
  };
  const potion = offer.potionId ? POTIONS[offer.potionId] : null;
  const screen = el("main", "center-screen center-screen--with-bar");
  screen.append(
    createRunBar(run),
    el("h1", "center-screen__title", TEXTS.cache.title),
    el("p", "reward__line", TEXTS.cache.text),
    createButton(potion ? TEXTS.cache.potion(potion.icon, potion.name) : TEXTS.cache.noPotion, () => take("potion"), !potion),
    createButton(TEXTS.cache.shards(offer.shards), () => take("shards")),
    createButton(TEXTS.cache.gold(offer.gold), () => take("gold")),
  );
  root.append(screen);
}
