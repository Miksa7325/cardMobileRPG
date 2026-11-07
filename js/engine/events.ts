// Логика событий: выбор события на узле и исполнение варианта. Этот файл не трогает HTML.
import { EVENTS, TRAVEL_EVENTS } from "../data/events.ts";
import { pickRandom } from "./rng.ts";
import { applyRunEffects, nodeRng } from "./run.ts";
import type { ActiveEvent, EventData, Run } from "../types.ts";

// Данные текущего события: из комнаты или встреча в пути. null — такого события больше нет (старое сохранение)
export function getEventData(active: ActiveEvent): EventData | null {
  return (active.travel ? TRAVEL_EVENTS : EVENTS)[active.eventId] ?? null;
}

// Выбирает событие, которого ещё не было в этом забеге; если были все, берём из всех
export function startEvent(run: Run): void {
  const allIds = Object.keys(EVENTS).filter((id) => !run.lockedEventIds.includes(id));
  const unseen = allIds.filter((id) => !run.seenEventIds.includes(id));
  const eventId = pickRandom(nodeRng(run, "event"), unseen.length > 0 ? unseen : allIds);
  run.seenEventIds.push(eventId);
  run.activeEvent = { eventId, chosenIndex: null, gains: [] };
}

// Встреча при быстром переходе по карте: свой набор событий, тоже без повторов, пока не встретятся все.
// Случайность привязана к номеру перехода: в одну и ту же комнату можно прийти с разными встречами
export function startTravelEvent(run: Run): void {
  const allIds = Object.keys(TRAVEL_EVENTS);
  const seen = (run.seenTravelEventIds ??= []);
  const unseen = allIds.filter((id) => !seen.includes(id));
  const eventId = pickRandom(nodeRng(run, `travelEvent:${run.teleports ?? 0}`), unseen.length > 0 ? unseen : allIds);
  seen.push(eventId);
  run.activeEvent = { eventId, travel: true, chosenIndex: null, gains: [] };
}

// Исполняет вариант события. Возвращает false, если он недоступен или выбор уже сделан
export function chooseEventOption(run: Run, index: number): boolean {
  const active = run.activeEvent;
  if (!active) return false;
  const choice = getEventData(active)?.choices[index];
  if (!choice || active.chosenIndex !== null) return false;

  active.chosenIndex = index;
  active.gains = applyRunEffects(run, choice.effects, nodeRng(run, active.travel ? `travelResult:${run.teleports ?? 0}` : "eventResult"));
  return true;
}

export function finishEvent(run: Run): void {
  run.activeEvent = null;
}
