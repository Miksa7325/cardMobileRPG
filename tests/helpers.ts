// Общие помощники для тестов боя
import { ENEMIES } from "../js/data/enemies.ts";
import { createCombat, type CombatSetup } from "../js/engine/combat.ts";
import type { Combat, EnemyUnit, Unit } from "../js/types.ts";

// «Пустой» боец для формул: только статусы
export const unit = (statuses: Record<string, number> = {}) => ({ statuses });

// Колода из одинаковых карт: в руке точно окажутся именно они
export const deckOf = (cardId: string, count = 10) => Array.from({ length: count }, () => ({ cardId, upgraded: false }));

// Воин против Скелета со стартовой колодой из Ударов
export function fight(options: Partial<CombatSetup> = {}): Combat {
  return createCombat({ heroId: "warrior", enemyIds: ["skeleton"], seed: 1, deck: deckOf("strike"), ...options });
}

// Враги в этом ходу ничего не делают: так проверяем одного героя
export function quiet(combat: Combat): void {
  for (const enemy of combat.enemies) enemy.lane = [];
}

// Ставит врагу на дорожку эти ходы (встык с клетки 1)
export function setLane(enemy: EnemyUnit, moves: string[]): void {
  enemy.lane = moves.map((move) => ({ move, weight: ENEMIES[enemy.enemyId].moves[move].weight, resolved: false }));
}

// Блок, который не исчезнет до конца теста
export function giveBlock(target: Unit, amount: number): void {
  target.blocks = [{ amount, expires: 999 }];
  target.block = amount;
}
