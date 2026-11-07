// Случайные числа с seed: одинаковый seed всегда даёт одинаковую последовательность.
// Состояние хранится обычным числом в объекте, поэтому его легко будет сохранить.
import type { Rng } from "../types.ts";

export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

// Делает из seed забега отдельный seed для конкретной цели. Так награда на узле
// не зависит от того, сколько случайных чисел потратил предыдущий бой.
export function deriveSeed(seed: number, purpose: string): number {
  let hash = seed >>> 0;
  for (const char of purpose) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  return hash;
}

// Случайное дробное число от 0 до 1 (алгоритм mulberry32)
export function nextFloat(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Случайное целое число от min до max включительно
export function nextInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(nextFloat(rng) * (max - min + 1));
}

// Случайный элемент массива
export function pickRandom<T>(rng: Rng, items: readonly T[]): T {
  return items[nextInt(rng, 0, items.length - 1)];
}

// Случайный ключ объекта с учётом весов: { battle: 45, rest: 12 }
export function pickWeighted<K extends string>(rng: Rng, weights: Partial<Record<K, number>>): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = nextFloat(rng) * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll < 0) return key;
  }
  return entries[entries.length - 1][0];
}

// Перемешивает массив на месте (алгоритм Фишера — Йетса)
export function shuffle<T>(rng: Rng, items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextInt(rng, 0, i);
    [items[i], items[j]] = [items[j], items[i]];
  }
}
