// Перенос карты на шкалу. Карту можно отпустить на клетке дорожки героя (на занятой клетке она встанет на место
// той карты и сдвинет её), на дорожке подготовки (Маг) или на кнопке стопок внизу — тогда карта перебросится.
// Время во время переноса идёт как обычно
import { hideTooltip } from "./components/tooltip.js";
import { pointOnTrack } from "./components/timeline.ts";

const DRAG_THRESHOLD_PX = 8; // меньшее движение пальца — обычное нажатие
const GESTURE_END_DELAY_MS = 30; // за это время браузер успевает закончить жест

// Палец держит карту (несёт её или рассматривает в руке): экран не перерисовывается, чтобы жест не сорвался
export const dragState = { active: false };

export type DropTarget =
  | { kind: "lane"; cell: number; boundary: number }
  | { kind: "prep" }
  | { kind: "reroll" }
  | null;

export interface DropHandlers {
  onHover: (target: DropTarget) => void; // палец над новой целью: экран подсвечивает место
  onDrop: (target: DropTarget) => void;
}

export interface DragOptions extends DropHandlers {
  canDrag: () => boolean;
  onBlocked: (element: HTMLElement) => void;
}

// Что под пальцем. Копия карты пропускает нажатия насквозь, поэтому не мешает
export function findDropTarget(clientX: number, clientY: number): DropTarget {
  const under = document.elementFromPoint(clientX, clientY);
  const track = under?.closest<HTMLElement>(".timeline__track");
  if (track?.dataset.lane === "hero") return { kind: "lane", ...pointOnTrack(track, clientX) };
  if (track?.dataset.lane === "prep") return { kind: "prep" };
  if (under?.closest(".combat__piles")) return { kind: "reroll" };
  return null;
}

const sameTarget = (a: DropTarget, b: DropTarget) => JSON.stringify(a) === JSON.stringify(b);

// Идущий перенос: над пальцем летит копия элемента, а сам элемент бледнеет
export interface DragSession {
  move: (event: PointerEvent) => void;
  drop: (event: PointerEvent) => void;
  cancel: () => void;
}

// Начинает перенос элемента. from — где палец коснулся элемента: от этой точки копия наклоняется при движении
export function startDrag(element: HTMLElement, event: PointerEvent, from: { x: number; y: number }, handlers: DropHandlers): DragSession {
  hideTooltip();
  const rect = element.getBoundingClientRect();
  const offset = { x: rect.width / 2, y: rect.height * 0.7 };
  const ghost = element.cloneNode(true) as HTMLElement;
  ghost.classList.remove("tutorial-target", "card--drawn", "card--selected", "card--inspected");
  ghost.classList.add("card--ghost");
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  document.body.append(ghost);
  dragState.active = true;
  element.classList.add("card--lifted");
  element.dataset.justDragged = "1";
  document.querySelector(".timeline")?.classList.add("timeline--dropping");
  let hovered: DropTarget = null;

  const move = (moveEvent: PointerEvent) => {
    ghost.style.transform = `translate(${moveEvent.clientX - offset.x}px, ${moveEvent.clientY - offset.y}px) rotate(${(moveEvent.clientX - from.x) / 40}deg) scale(0.9)`;
    const target = findDropTarget(moveEvent.clientX, moveEvent.clientY);
    ghost.classList.toggle("card--ghost-ready", target !== null);
    if (!sameTarget(target, hovered)) {
      hovered = target;
      handlers.onHover(target);
    }
  };

  const end = () => {
    dragState.active = false;
    handlers.onHover(null);
    document.querySelector(".timeline")?.classList.remove("timeline--dropping");
    element.classList.remove("card--lifted");
  };

  // Отпустили мимо: копия улетает обратно
  const returnGhost = () => {
    // Плашку уже перерисовали — возвращаться некуда
    if (!element.isConnected) {
      ghost.remove();
      return;
    }
    const back = element.getBoundingClientRect();
    ghost.style.transition = "transform calc(180ms * var(--anim-speed))";
    ghost.style.transform = `translate(${back.left}px, ${back.top}px)`;
    ghost.addEventListener("transitionend", () => ghost.remove(), { once: true });
    setTimeout(() => ghost.remove(), 400);
  };

  move(event);
  return {
    move,
    drop: (upEvent) => {
      const target = findDropTarget(upEvent.clientX, upEvent.clientY);
      end();
      if (!target) {
        returnGhost();
        return;
      }
      ghost.remove();
      // Постановка перерисует экран. Ждём конца жеста: иначе браузер может потерять следующее нажатие
      setTimeout(() => handlers.onDrop(target), GESTURE_END_DELAY_MS);
    },
    cancel: () => {
      end();
      returnGhost();
    },
  };
}

// Перенос пальцем для карт на шкале: нажатие без движения остаётся обычным нажатием.
// Идущий перенос слушает всё окно: пока палец несёт карту, шкала перерисовывается, и сама плашка может пропасть
export function enableTimelineDrag(element: HTMLElement, options: DragOptions): void {
  let start: { x: number; y: number } | null = null;
  let session: DragSession | null = null;
  let blocked = false;

  const onMove = (event: PointerEvent) => {
    if (!start) return;
    if (session) {
      session.move(event);
      return;
    }
    if (blocked || Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG_THRESHOLD_PX) return;
    if (options.canDrag()) session = startDrag(element, event, start, options);
    else {
      blocked = true;
      options.onBlocked(element);
    }
  };
  const stop = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    session = null;
    start = null;
  };
  const onUp = (event: PointerEvent) => {
    session?.drop(event);
    stop();
  };
  const onCancel = () => {
    session?.cancel();
    stop();
  };

  element.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary) return;
    start = { x: event.clientX, y: event.clientY };
    blocked = false;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  });

  // После переноса браузер может прислать обычное нажатие: оно уже не нужно
  element.addEventListener("click", (event) => {
    if (element.dataset.justDragged) {
      delete element.dataset.justDragged;
      event.stopImmediatePropagation();
    }
  }, true);
}
