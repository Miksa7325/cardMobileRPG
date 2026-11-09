// Логово побеждённого босса: акт после босса не кончается. Герой выбирает — остаться и пройти оставшиеся комнаты,
// подняться в город или спуститься в следующий акт (после 10 акта — в бездну). Вернувшись сюда, он видит выбор снова.
import { ACTS } from "../../data/acts.ts";
import { TEXTS } from "../../data/texts.ru.ts";
import { getAbyssCircle, isAbyssAct } from "../../engine/abyss.ts";
import { goToNextAct } from "../../engine/run.ts";
import { saveRun } from "../../save.ts";
import { state } from "../../state.ts";
import { createRunBar } from "../components/runBar.js";
import { showTooltip } from "../components/tooltip.js";
import { el } from "../dom.js";
import { trackPlayTime } from "../playTime.js";
import { showScreen } from "../router.js";
import { openCity } from "./city.js";

function createButton(text, modifier, onTap) {
  const button = el("button", `button ${modifier}`, text);
  button.type = "button";
  button.addEventListener("click", onTap);
  return button;
}

export function renderBossRoomScreen(root) {
  const run = state.run;
  // Комнату записываем сразу: если закрыть игру здесь, забег продолжится из неё и выбор останется
  trackPlayTime(run);
  if (!saveRun(run)) showTooltip(TEXTS.saveFailed);

  const next = run.act + 1;
  const screen = el("main", "center-screen center-screen--with-bar");
  screen.append(createRunBar(run, { allSaved: true }), el("h1", "center-screen__title", TEXTS.bossRoom.title), el("p", "reward__line", TEXTS.bossRoom.text));
  // За босса 10 акта — победа; дальше вниз — круги бездны
  if (run.act === ACTS.length) screen.append(el("p", "reward__line", TEXTS.bossRoom.conquered));
  else if (isAbyssAct(next)) screen.append(el("p", "reward__line", TEXTS.bossRoom.abyss(getAbyssCircle(next))));
  screen.append(
    createButton(TEXTS.bossRoom.nextAct(next), "button--large", () => {
      if (!goToNextAct(run)) return;
      saveRun(run);
      showScreen("dungeon");
    }),
    createButton(TEXTS.bossRoom.toCity, "button--secondary", () => openCity("gate")),
    createButton(TEXTS.bossRoom.stay, "button--secondary", () => showScreen("dungeon")),
  );
  root.append(screen);
}
