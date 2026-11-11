// Жесты руки в бою.
// - Тап (короткое нажатие без движения) — карта сразу встаёт на шкалу.
// - Удержание — карта чуть поднимается, над рукой появляется её описание. Палец ведут вбок — поднимаются
//   и описываются соседние карты. Палец ушёл вверх за пределы руки — описание пропадает и карту несут на шкалу.
// - Быстрый рывок вверх без удержания — сразу перенос.
import { type DropHandlers, type DragSession, dragState, startDrag } from "./timelineDrag.ts";

const HOLD_MS = 300; // столько держат палец, чтобы карта показала описание
const MOVE_THRESHOLD_PX = 8; // меньшее движение — ещё нажатие

export interface HandEntry extends DropHandlers {
  element: HTMLElement;
  canDrag: () => boolean;
  onBlocked: (element: HTMLElement) => void;
  onTap: () => void;
  describe: () => HTMLElement; // описание над рукой
}

export interface HandGestureOptions {
  showInfo: (content: HTMLElement | null) => void;
}

type Mode = "press" | "inspect" | "drag" | "done";

export function enableHandGestures(hand: HTMLElement, entries: HandEntry[], options: HandGestureOptions): void {
  let mode: Mode = "done";
  let start = { x: 0, y: 0 };
  let current: HandEntry | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let session: DragSession | null = null;

  const entryOf = (node: EventTarget | null) => entries.find((entry) => entry.element.contains(node as Node)) ?? null;

  // Карта под пальцем по горизонтали: карты в руке наезжают друг на друга, поэтому берём верхнюю (последнюю)
  const entryAtX = (x: number) => [...entries].reverse().find((entry) => {
    const rect = entry.element.getBoundingClientRect();
    return x >= rect.left && x <= rect.right;
  }) ?? null;

  const inspect = (entry: HandEntry | null) => {
    if (!entry || entry === current && mode === "inspect") return;
    current?.element.classList.remove("card--inspected");
    current = entry;
    mode = "inspect";
    dragState.active = true;
    entry.element.classList.add("card--inspected");
    options.showInfo(entry.describe());
  };

  const stopInspect = () => {
    current?.element.classList.remove("card--inspected");
    options.showInfo(null);
  };

  const finish = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (mode === "inspect") {
      stopInspect();
      dragState.active = false;
    }
    mode = "done";
    session = null;
  };

  const beginDrag = (event: PointerEvent) => {
    if (!current) return;
    stopInspect();
    if (!current.canDrag()) {
      current.onBlocked(current.element);
      dragState.active = false;
      mode = "done";
      return;
    }
    mode = "drag";
    session = startDrag(current.element, event, start, current);
  };

  hand.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || mode !== "done") return;
    const entry = entryOf(event.target);
    if (!entry) return;
    current = entry;
    mode = "press";
    start = { x: event.clientX, y: event.clientY };
    hand.setPointerCapture(event.pointerId);
    timer = setTimeout(() => {
      if (mode === "press") inspect(entry);
    }, HOLD_MS);
  });

  hand.addEventListener("pointermove", (event) => {
    if (mode === "drag") {
      session?.move(event);
      return;
    }
    if (mode === "press") {
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.hypot(dx, dy) < MOVE_THRESHOLD_PX) return;
      if (timer) clearTimeout(timer);
      // Рывок вверх — перенос сразу, движение вбок — рассматриваем карты
      if (dy < 0 && Math.abs(dy) > Math.abs(dx)) beginDrag(event);
      else inspect(entryAtX(event.clientX) ?? current);
      return;
    }
    if (mode !== "inspect") return;
    // Палец ушёл вверх из руки — несём выделенную карту на шкалу
    if (event.clientY < hand.getBoundingClientRect().top) {
      beginDrag(event);
      return;
    }
    inspect(entryAtX(event.clientX));
  });

  hand.addEventListener("pointerup", (event) => {
    if (mode === "press") {
      const entry = current;
      finish();
      entry?.onTap();
      return;
    }
    if (mode === "drag") session?.drop(event);
    finish();
  });

  hand.addEventListener("pointercancel", () => {
    if (mode === "drag") session?.cancel();
    finish();
  });

  // Браузер на телефоне не должен открывать своё меню при удержании
  hand.addEventListener("contextmenu", (event) => event.preventDefault());
}
