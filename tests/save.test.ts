// Автотесты сохранений: перенос кодом между телефонами и защита от кодов старой игры
import { beforeEach, describe, expect, it } from "vitest";

// В Node нет хранилища браузера: подставляем простое хранилище в памяти
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
  key: (index: number) => [...store.keys()][index] ?? null,
  get length() {
    return store.size;
  },
} as Storage;

const { exportSave, importSave, loadMeta, saveMeta, SAVE_VERSION } = await import("../js/save.js");

const encode = (data: unknown) => btoa(unescape(encodeURIComponent(JSON.stringify(data))));

describe("перенос сохранения", () => {
  beforeEach(() => store.clear());

  it("свой код загружается обратно", () => {
    const meta = loadMeta();
    saveMeta({ ...meta, runsPlayed: 3 });
    const code = exportSave();
    expect(code).not.toBeNull();
    store.clear();
    expect(importSave(code!)).toEqual({ ok: true });
    expect(loadMeta().runsPlayed).toBe(3);
  });

  it("код старой игры RPG 2 (без метки игры) не загружается", () => {
    const oldCode = encode({ version: SAVE_VERSION, run: null, meta: loadMeta() });
    expect(importSave(oldCode)).toEqual({ ok: false, reason: "otherGame" });
  });

  it("мусор вместо кода не загружается", () => {
    expect(importSave("это не сохранение")).toEqual({ ok: false, reason: "invalid" });
  });

  it("сохранения лежат под ключами bladeTempo.*", () => {
    saveMeta(loadMeta());
    expect([...store.keys()].every((key) => key.startsWith("bladeTempo."))).toBe(true);
  });
});
