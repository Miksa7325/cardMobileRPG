// Значки статусов и сил бойца. Сами значки — в ui/icons.js: у статуса и значка одно имя (poison, rage…)
import { CONFIG } from "../../config.ts";
import { CARDS } from "../../data/cards.ts";
import { TEXTS } from "../../data/texts.ru.ts";
import { el } from "../dom.js";
import { createIcon } from "../icons.js";

// Значок с подписью: «[значок] Яд 5» или коротко «[значок]5», когда места мало (несколько врагов в ряд)
function createBadge(iconName, text) {
  const badge = el("span", "status-badge");
  badge.append(createIcon(iconName), el("span", "status-badge__text", text));
  return badge;
}

// Процентные статусы: рядом с числом стаков — итоговый процент («Уязвимость 5 · +50%»)
const PERCENT_STATUSES = {
  vulnerable: (stacks) => `+${Math.min(stacks, CONFIG.vulnerableMaxStacks) * CONFIG.vulnerablePercent}%`,
  weak: (stacks) => `−${Math.min(stacks, CONFIG.weakMaxStacks) * CONFIG.weakPercent}%`,
  strength: (stacks) => `+${stacks * CONFIG.strengthPercent}%`,
};

export function createStatusIcons(unit, { compact = false } = {}) {
  const list = el("div", "statuses");
  for (const [status, amount] of Object.entries(unit.statuses)) {
    const percent = PERCENT_STATUSES[status]?.(amount);
    const full = `${TEXTS.statuses[status]} ${amount}${percent ? ` · ${percent}` : ""}`;
    list.append(createBadge(status, compact ? String(amount) : full));
  }
  // Одинаковые силы показываем одним значком: «Ярость ×2»
  const powerCounts = {};
  for (const power of unit.powers ?? []) {
    powerCounts[power.cardId] = (powerCounts[power.cardId] ?? 0) + 1;
  }
  for (const [cardId, count] of Object.entries(powerCounts)) {
    const countText = count > 1 ? ` ×${count}` : "";
    list.append(createBadge("power", `${CARDS[cardId].name}${countText}`));
  }
  return list;
}
