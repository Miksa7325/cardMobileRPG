// Сохранение и загрузка. Есть несколько ячеек сохранения: в каждой свой забег и мета-прогресс,
// игра пишет в выбранную ячейку. Настройки общие для всех ячеек.
// Смерть стирает только забег. Браузер может запретить хранилище, поэтому всё обёрнуто в try.
import { CONFIG } from "./config.ts";
import { ACTS } from "./data/acts.ts";
import { BUILDINGS } from "./data/buildings.ts";
import { CARDS } from "./data/cards.ts";
import { ENEMIES } from "./data/enemies.ts";
import { POTIONS } from "./data/potions.ts";
import { RELICS } from "./data/relics.ts";
import { createMeta } from "./engine/meta.ts";
import type { Combat, Meta, Run, RunCard, Settings } from "./types.ts";

// Данные из хранилища или из текста сохранения: они могли быть испорчены или прийти из старой версии,
// поэтому до проверки (isValidRun, isValidMeta) их форма неизвестна
type Untrusted = any;

// Свои ключи у «Такта клинка»: старая игра хранит сохранения под cardRpg.* и на одном сайте
// (тот же адрес github.io) их не задевает
const SLOT_KEY = "bladeTempo.slot"; // номер выбранной ячейки
const SETTINGS_KEY = "bladeTempo.settings";
const DEFAULT_SETTINGS: Settings = { music: 0.5, effects: 0.8, fastAnimations: false, vibration: true, graphics: "auto" };

function runKey(slot: number): string {
  return `bladeTempo.run.${slot}`;
}

function metaKey(slot: number): string {
  return `bladeTempo.meta.${slot}`;
}

// Меняешь формат сохранения: увеличь версию и добавь сюда функцию перевода со старой версии.
// Например, MIGRATIONS[1] получает сохранение версии 1 и возвращает версию 2.
export const SAVE_VERSION = 9;
const MIGRATIONS: Record<number, (save: Untrusted) => Untrusted> = {
  // Версия 2: появились акты и статистика забега. Старый забег продолжается в акте 1
  1: (save: Untrusted) => (save.run ? { ...save, run: { ...save.run, act: 1, stats: { combats: [], playMs: 0 } } } : save),
  // Версия 3: появились герои, сложность и коллекция. Старый забег идёт на сложности 0 со всеми картами
  2: (save: Untrusted) => (save.run ? {
    ...save,
    run: {
      ...save.run,
      difficulty: 0,
      lockedCardIds: [],
      lockedRelicIds: [],
      seen: { cards: save.run.deck.map((card: RunCard) => card.cardId), enemies: [], relics: [...save.run.relics] },
    },
  } : save),
  // Версия 4: появились сохранение посреди боя и обучающий бой
  3: (save: Untrusted) => (save.run ? { ...save, run: { ...save.run, savedCombat: null, tutorialFight: false } } : save),
  // Версия 5: появились город и задания. Содержимое зданий в старый забег не попадает: город ещё пуст
  4: (save: Untrusted) => (save.run ? {
    ...save,
    run: {
      ...save.run,
      lockedEventIds: Object.values(BUILDINGS).flatMap((building) => building.unlocks.events ?? []),
      lockedPotionIds: Object.values(BUILDINGS).flatMap((building) => building.unlocks.potions ?? []),
      lockedRelicIds: [...save.run.lockedRelicIds, ...Object.values(BUILDINGS).flatMap((building) => building.unlocks.relics ?? [])],
      stats: { ...save.run.stats, totals: {} },
    },
  } : save),
  // Версия 6: зелья попали в коллекцию. Те, что уже в сумке, считаем встреченными
  5: (save: Untrusted) => (save.run ? { ...save, run: { ...save.run, seen: { ...save.run.seen, potions: [...save.run.potions] } } } : save),
  // Версия 7: появились возвраты назад. Раньше назад не ходили, поэтому путь — это все пройденные комнаты по порядку
  6: (save: Untrusted) => (save.run ? { ...save, run: { ...save.run, trail: [...save.run.visitedNodeIds], cityHeals: [] } } : save),
  // Версия 8: магазины ушли в город, с монстров падают эссенции, карту и светлячков покупают у торговца.
  // Старый забег начинался с картой, поэтому она у него остаётся
  7: (save: Untrusted) => (save.run ? {
    ...save,
    run: { ...save.run, shop: undefined, essences: 0, hasMap: true, fireflies: null, revealedNodeIds: [] },
  } : save),
  // Версия 9: в подземелье снова есть лавка, и в каждой от карты избавляют один раз
  8: (save: Untrusted) => (save.run ? { ...save, run: { ...save.run, shopRemovals: [] } } : save),
};

// Просит браузер не удалять данные сайта при нехватке места. Браузер может отказать, это не ошибка
export function requestPersistentStorage() {
  navigator.storage?.persist?.().catch(() => {});
}

function writeKey(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Хранилище недоступно: стирать нечего
  }
}

function parseJson(text: string | null): Untrusted {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 1 && slot <= CONFIG.saveSlots;
}

let activeSlot = Number(readKey(SLOT_KEY));
if (!isSlot(activeSlot)) activeSlot = 1;

export function getActiveSlot(): number {
  return activeSlot;
}

// Переключает игру на другую ячейку: дальше всё читается и пишется в неё
export function setActiveSlot(slot: number): boolean {
  if (!isSlot(slot)) return false;
  activeSlot = slot;
  return writeKey(SLOT_KEY, String(slot));
}

// Есть ли в ячейке хоть что-то: забег или мета-прогресс
export function hasSave(slot: number): boolean {
  return readKey(runKey(slot)) !== null || readKey(metaKey(slot)) !== null;
}

// Стирает ячейку целиком: и забег, и мета-прогресс
export function deleteSlot(slot: number): void {
  removeKey(runKey(slot));
  removeKey(metaKey(slot));
}

// Настройки. До появления ячеек они лежали в мета-прогрессе: если своих ещё нет, берём оттуда
export function loadSettings(): Settings {
  const saved = parseJson(readKey(SETTINGS_KEY)) ?? parseJson(readKey(metaKey(1)))?.settings;
  return { ...DEFAULT_SETTINGS, ...saved };
}

export function saveSettings(settings: Settings): boolean {
  return writeKey(SETTINGS_KEY, JSON.stringify(settings));
}

// Доводит сохранение до текущей версии. Если перевести нельзя, возвращает null
export function migrateSave(save: Untrusted, migrations = MIGRATIONS, currentVersion = SAVE_VERSION): Untrusted {
  if (!save || !Number.isInteger(save.version) || save.version > currentVersion) return null;

  let migrated = save;
  while (migrated.version < currentVersion) {
    const migrate = migrations[migrated.version];
    if (!migrate) return null;
    migrated = { ...migrate(migrated), version: migrated.version + 1 };
  }
  return migrated;
}

// Проверяет, что забег можно продолжить: иначе испорченные данные сломали бы игру
function isValidRun(run: Untrusted): run is Run {
  if (!run || run.status !== "active") return false;
  if (!Number.isFinite(run.hp) || !Number.isFinite(run.maxHp) || !Number.isFinite(run.gold) || run.hp <= 0) return false;
  if (!Array.isArray(run.deck) || !Array.isArray(run.relics) || !Array.isArray(run.potions)) return false;
  if (!run.map?.nodes || !Array.isArray(run.map.rows) || !Array.isArray(run.visitedNodeIds)) return false;
  if (!Number.isInteger(run.act) || run.act < 1 || run.act > ACTS.length || !Array.isArray(run.stats?.combats)) return false;
  if (!Array.isArray(run.lockedCardIds) || !Array.isArray(run.lockedRelicIds)) return false;
  if (!Array.isArray(run.lockedEventIds) || !Array.isArray(run.lockedPotionIds)) return false;
  if (!Array.isArray(run.seen?.cards) || !Array.isArray(run.seen?.enemies) || !Array.isArray(run.seen?.relics) || !Array.isArray(run.seen?.potions)) return false;
  if (run.currentNodeId !== null && !run.map.nodes[run.currentNodeId]) return false;
  if (!Array.isArray(run.trail) || !run.trail.every((id: string) => run.map.nodes[id])) return false;
  if (!Number.isFinite(run.essences) || !Array.isArray(run.revealedNodeIds) || !Array.isArray(run.shopRemovals)) return false;
  if (run.savedCombat && !isValidCombat(run.savedCombat)) return false;

  return run.deck.every((card: RunCard) => CARDS[card.cardId])
    && run.relics.every((relicId: string) => RELICS[relicId])
    && run.potions.every((potionId: string) => POTIONS[potionId]);
}

// Проверяет бой из сохранения: те же причины, что и у забега
function isValidCombat(combat: Untrusted): combat is Combat {
  if (combat.status !== "playerTurn" || !combat.rng || !combat.hero || !Array.isArray(combat.enemies)) return false;
  const { draw, hand, discard, exhaust } = combat.piles ?? {};
  if (![draw, hand, discard, exhaust].every(Array.isArray)) return false;
  return [...draw, ...hand, ...discard, ...exhaust].every((card: RunCard) => CARDS[card.cardId])
    && combat.enemies.every((enemy: { enemyId: string }) => ENEMIES[enemy.enemyId])
    && combat.relics.every((relicId: string) => RELICS[relicId])
    && combat.potions.every((potionId: string) => POTIONS[potionId]);
}

function isValidMeta(meta: Untrusted): meta is Meta {
  return meta && Number.isFinite(meta.runsPlayed) && meta.runsPlayed >= 0;
}

// Сохраняет забег в выбранную ячейку. Возвращает false, если браузер не дал записать
export function saveRun(run: Run): boolean {
  return writeKey(runKey(activeSlot), JSON.stringify({ version: SAVE_VERSION, run }));
}

// Возвращает забег или null, если сохранения нет или оно испорчено. Без номера — из выбранной ячейки
export function loadRun(slot = activeSlot): Run | null {
  const save = migrateSave(parseJson(readKey(runKey(slot))));
  return save && isValidRun(save.run) ? save.run : null;
}

export function clearRun(): void {
  removeKey(runKey(activeSlot));
}

// Возвращает мета-прогресс. Недостающие поля берутся из значений по умолчанию. Без номера — из выбранной ячейки
export function loadMeta(slot = activeSlot): Meta {
  // До золота валютой города были кроны, а героев открывал опыт: кроны становятся золотом, опыт больше не нужен
  const { crowns, xp, settings, ...save } = migrateSave(parseJson(readKey(metaKey(slot)))) ?? {};
  const defaults = createMeta();
  return {
    ...defaults,
    ...save,
    gold: save.gold ?? crowns ?? 0,
    seen: { ...defaults.seen, ...save?.seen },
    supplies: { ...defaults.supplies, ...save?.supplies },
    // Дом есть всегда, даже если сохранение испорчено
    buildings: [...new Set(["home", ...(save?.buildings ?? [])])],
    // Кто уже играл до появления обучения, тому оно не нужно
    tutorialDone: save?.tutorialDone ?? (save?.runsPlayed ?? 0) > 0,
  };
}

// Сброс прогресса выбранной ячейки: стирает забег, опыт и коллекцию. Настройки общие, их не трогаем
export function resetProgress(): void {
  clearRun();
  saveMeta(createMeta());
}

export function saveMeta(meta: Meta): boolean {
  return writeKey(metaKey(activeSlot), JSON.stringify({ ...meta, version: SAVE_VERSION }));
}

// Текст из любых символов → base64 и обратно. Такой текст не портится при пересылке в мессенджере
function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(code: string): string {
  const binary = atob(code.trim());
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Собирает выбранную ячейку в одну строку текста. Если сохранять нечего, возвращает null
export function exportSave(): string | null {
  const run = loadRun();
  const meta = loadMeta();
  if (!run && meta.runsPlayed === 0) return null;
  return encodeBase64(JSON.stringify({ game: GAME_ID, version: SAVE_VERSION, run, meta }));
}

// Метка в тексте сохранения: коды старой игры (в них метки нет) сюда не загружаются
const GAME_ID = "bladeTempo";

// Загружает сохранение из текста в выбранную ячейку. Возвращает { ok: true } или { ok: false, reason: "..." }
export function importSave(code: string): { ok: true } | { ok: false; reason: string } {
  let raw;
  try {
    raw = JSON.parse(decodeBase64(code));
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (raw?.game !== GAME_ID) return { ok: false, reason: raw?.version ? "otherGame" : "invalid" };
  if (Number.isInteger(raw?.version) && raw.version > SAVE_VERSION) return { ok: false, reason: "tooNew" };
  const save = migrateSave(raw);
  if (!save) return { ok: false, reason: "invalid" };

  // В тексте может не быть забега: тогда он содержит только мета-прогресс
  const hasRun = save.run !== null && save.run !== undefined;
  if (hasRun && !isValidRun(save.run)) return { ok: false, reason: "invalid" };
  if (!hasRun && !isValidMeta(save.meta)) return { ok: false, reason: "invalid" };

  const runSaved = !hasRun || saveRun(save.run);
  const metaSaved = !isValidMeta(save.meta) || saveMeta(save.meta);
  return runSaved && metaSaved ? { ok: true } : { ok: false, reason: "storageFailed" };
}
