// Состояние игры: единственный источник правды. Интерфейс читает данные отсюда.
import type { Combat, HeroId, Run } from "./types.ts";

export interface GameState {
  run: Run | null;
  combat: Combat | null;
  selectedPotionIndex: number | null;
  tutorialStep: number | null;
  arena: { fightId: string; rewarded: boolean } | null;
  test: { enabled: boolean; heroId: HeroId; enemyIds: string[]; pickerOpen: boolean; addUpgraded: boolean };
}

export const state: GameState = {
  run: null, // текущий забег, его создаёт createRun из engine/run.js
  combat: null, // текущий бой, его создаёт createCombat из engine/combat.js
  selectedPotionIndex: null, // какое зелье игрок выбрал
  tutorialStep: null, // номер шага обучения; null — обучения сейчас нет
  arena: null, // бой на боевой арене города: { fightId, rewarded }; null — бой не на арене
  test: {
    enabled: false, // идёт ли сейчас бой в тестовом режиме
    heroId: "warrior", // каким героем идёт тестовый бой
    enemyIds: ["cultist"], // каких врагов выбрали для тестового боя
    pickerOpen: false, // открыт ли список карт поверх боя
    addUpgraded: false, // добавлять ли карты из списка улучшенными
  },
};
