// Перенос карты на шкалу. Карту можно отпустить на клетке дорожки героя, на дорожке подготовки (Маг)
// или на враге — тогда она встанет в первую свободную клетку и ударит этого врага
import { hideTooltip } from "./components/tooltip.js";
import { pointOnTrack } from "./components/timeline.ts";

const DRAG_THRESHOLD_PX = 8; // меньшее движение пальца — обычное нажатие
const GESTURE_END_DELAY_MS = 30; // за это время браузер успевает закончить жест

// Палец сейчас несёт карту: бой идёт вдвое медленнее, а экран не перерисовывается, чтобы перенос не сорвался
export const dragState = { active: false };

export type DropTarget =
  | { kind: "lane"; cell: number; boundary: number }
  | { kind: "prep" }
  | { kind: "enemy"; id: string }
  | null;

export interface DragOptions {
  canDrag: () => boolean;
  onBlocked: (element: HTMLElement) => void;
  onHover: (target: DropTarget) => void; // палец над новой целью: экран подсвечивает место
  onDrop: (target: DropTarget, ghost: HTMLElement) => void;
}

// Что под пальцем. Копия карты пропускает нажатия насквозь, поэтому не мешает
export function findDropTarget(clientX: number, clientY: number): DropTarget {
  const under = document.elementFromPoint(clientX, clientY);
  const track = under?.closest<HTMLElement>(".timeline__track");
  if (track?.dataset.lane === "hero") return { kind: "lane", ...pointOnTrack(track, clientX) };
  if (track?.dataset.lane === "prep") return { kind: "prep" };
  const unit = under?.closest<HTMLElement>(".combat__enemies [data-unit-id]");
  if (unit?.dataset.unitId) return { kind: "enemy", id: unit.dataset.unitId };
  return null;
}

const sameTarget = (a: DropTarget, b: DropTarget) => JSON.stringify(a) === JSON.stringify(b);

export function enableTimelineDrag(element: HTMLElement, options: DragOptions): void {
  let start: { x: number; y: number } | null = null;
  let ghost: HTMLElement | null = null;
  let blocked = false;
  let hovered: DropTarget = null;
  let offset = { x: 0, y: 0 };

  element.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary) return;
    start = { x: event.clientX, y: event.clientY };
    blocked = false;
    element.setPointerCapture(event.pointerId);
  });

  element.addEventListener("pointermove", (event) => {
    if (!start) return;
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (!ghost && !blocked && distance >= DRAG_THRESHOLD_PX) {
      if (options.canDrag()) beginDrag(event);
      else {
        blocked = true;
        options.onBlocked(element);
      }
    }
    if (ghost) moveGhost(event);
  });

  element.addEventListener("pointerup", (event) => {
    if (!ghost) {
      start = null;
      return;
    }
    const target = findDropTarget(event.clientX, event.clientY);
    const dropped = ghost;
    ghost = null;
    endDrag();
    if (!target) {
      returnGhost(dropped);
      return;
    }
    // Постановка перерисует экран. Ждём конца жеста: иначе браузер может потерять следующее нажатие
    setTimeout(() => options.onDrop(target, dropped), GESTURE_END_DELAY_MS);
  });

  element.addEventListener("pointercancel", () => {
    if (ghost) {
      const dropped = ghost;
      ghost = null;
      endDrag();
      returnGhost(dropped);
    }
    start = null;
  });

  // После переноса браузер может прислать обычное нажатие: оно уже не нужно
  element.addEventListener("click", (event) => {
    if (element.dataset.justDragged) {
      delete element.dataset.justDragged;
      event.stopImmediatePropagation();
    }
  }, true);

  function beginDrag(event: PointerEvent): void {
    hideTooltip();
    const rect = element.getBoundingClientRect();
    offset = { x: rect.width / 2, y: rect.height * 0.7 };
    ghost = element.cloneNode(true) as HTMLElement;
    ghost.classList.remove("tutorial-target", "card--drawn", "card--selected");
    ghost.classList.add("card--ghost");
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    document.body.append(ghost);
    dragState.active = true;
    element.classList.add("card--lifted");
    element.dataset.justDragged = "1";
    document.querySelector(".timeline")?.classList.add("timeline--dropping");
    moveGhost(event);
  }

  function moveGhost(event: PointerEvent): void {
    if (!ghost || !start) return;
    ghost.style.transform = `translate(${event.clientX - offset.x}px, ${event.clientY - offset.y}px) rotate(${(event.clientX - start.x) / 40}deg) scale(0.9)`;
    const target = findDropTarget(event.clientX, event.clientY);
    ghost.classList.toggle("card--ghost-ready", target !== null);
    if (!sameTarget(target, hovered)) {
      hovered = target;
      options.onHover(target);
    }
  }

  function endDrag(): void {
    dragState.active = false;
    hovered = null;
    options.onHover(null);
    document.querySelector(".timeline")?.classList.remove("timeline--dropping");
    element.classList.remove("card--lifted");
    start = null;
  }

  // Отпустили мимо: карта возвращается в руку
  function returnGhost(dropped: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    dropped.style.transition = "transform calc(180ms * var(--anim-speed))";
    dropped.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
    dropped.addEventListener("transitionend", () => dropped.remove(), { once: true });
    setTimeout(() => dropped.remove(), 400);
  }
}
