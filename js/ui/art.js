import { HEROES } from "../data/heroes.ts";
import { getHeroFilter } from "../engine/town.ts";
import { loadMeta } from "../save.ts";

// Как выглядят бойцы. Спрайты лежат в assets/images/units: это отрисованные 3D-модели, откуда они взяты — на экране «Авторы».
// Заменить рисунок просто: положи файл с тем же именем. У героя без своего рисунка в HEROES указан чужой (sprite)
export function heroSprite(heroId) {
  return `assets/images/units/${HEROES[heroId]?.sprite ?? `hero-${heroId}`}.png`;
}

// Новые враги актов 4–10 пока без своих рисунков: берут рисунок похожего врага (финальные — на этапе 9)
const STAND_IN_SPRITES = {
  bog_leech: "spider",
  toad: "gargoyle",
  drowned: "ghoul",
  myconid: "cultist",
  bog_hag: "acolyte",
  hydra: "demon",
  mire_golem: "golem",
  bog_mother: "witch_queen",
  citadel_guard: "skeleton",
  crossbowman: "bandit",
  inquisitor: "cultist",
  shadow_hound: "grave_hound",
  dark_mage: "warlock",
  black_knight: "death_knight",
  dark_cardinal: "blood_priest",
  citadel_lord: "fallen_knight",
  cave_bat: "rat_swarm",
  blind_stalker: "assassin",
  frost_spirit: "wraith",
  cave_troll: "golem",
  deep_worm: "spider",
  frost_giant: "bone_colossus",
  broodmother: "spider",
  light_devourer: "lich_king",
};

export function enemySprite(enemyId) {
  return `assets/images/units/enemy-${STAND_IN_SPRITES[enemyId] ?? enemyId}.png`;
}

// Окраска героя из лавки красок: одна и та же в городе, в доме героев, в коллекции и в бою
export function applyHeroLook(image, heroId, meta = loadMeta()) {
  image.style.filter = getHeroFilter(meta, heroId);
}

// В бою у модели свой фильтр (тень и контур, css/vivid.css), поэтому окраску отдаём ему переменной --look
export function setHeroLookVariable(image, heroId, meta = loadMeta()) {
  image.style.setProperty("--look", getHeroFilter(meta, heroId));
}

// Загружает все спрайты заранее: иначе модель могла бы мигнуть, когда экран рисуется заново
const preloaded = [];
export function preloadSprites(enemyIds, heroIds) {
  for (const src of [...enemyIds.map(enemySprite), ...heroIds.map(heroSprite)]) {
    const image = new Image();
    image.src = src;
    preloaded.push(image);
  }
}

// Как враг бьёт. Кого нет в таблице, тот рубит оружием.
// claw — бросается и рвёт когтями или зубами, magic — стреляет снарядом этого цвета
export const ATTACK_STYLES = {
  spider: { kind: "claw" },
  grave_hound: { kind: "claw" },
  ghoul: { kind: "claw" },
  rat_swarm: { kind: "claw" },
  gargoyle: { kind: "claw" },
  vampire_lord: { kind: "claw" },
  hellhound: { kind: "claw" },
  demon: { kind: "claw" },
  banshee: { kind: "magic", color: "#a9d8ff" },
  warlock: { kind: "magic", color: "#7de0ff" },
  witch_queen: { kind: "magic", color: "#c77dff" },
  wraith: { kind: "magic", color: "#9fe8ff" },
  blood_priest: { kind: "magic", color: "#ff5a5a" },
  acolyte: { kind: "magic", color: "#8ce0c4" },
  lich_king: { kind: "magic", color: "#7dd3ff" },
  bog_leech: { kind: "claw" },
  toad: { kind: "claw" },
  hydra: { kind: "claw" },
  bog_hag: { kind: "magic", color: "#9be35a" },
  bog_mother: { kind: "magic", color: "#7fc94a" },
  shadow_hound: { kind: "claw" },
  dark_mage: { kind: "magic", color: "#b07dff" },
  dark_cardinal: { kind: "magic", color: "#ff7d7d" },
  cave_bat: { kind: "claw" },
  deep_worm: { kind: "claw" },
  broodmother: { kind: "claw" },
  frost_spirit: { kind: "magic", color: "#bfeaff" },
  light_devourer: { kind: "magic", color: "#5a3d8a" },
};

// Как двигается модель в покое. Кого нет в таблице, тот просто дышит
export const IDLE_STYLES = {
  spider: "scuttle",
  rat_swarm: "scuttle",
  banshee: "float",
  wraith: "float",
  gargoyle: "heavy",
  golem: "heavy",
  bone_colossus: "heavy",
  grave_hound: "pant",
  hellhound: "pant",
  bog_leech: "scuttle",
  drowned: "float",
  mire_golem: "heavy",
  hydra: "heavy",
  shadow_hound: "pant",
  black_knight: "heavy",
  cave_bat: "float",
  frost_spirit: "float",
  cave_troll: "heavy",
  frost_giant: "heavy",
  deep_worm: "scuttle",
};

export const LOGO_ART = `<svg viewBox="0 0 512 512" aria-hidden="true"><g transform="rotate(-10 256 256)"><rect x="146" y="106" width="220" height="300" rx="22" fill="#5e2626" stroke="#e0b84c" stroke-width="12"/><g transform="rotate(45 256 256)" fill="#efe6d5"><path d="M244 136 L256 112 L268 136 L268 300 L244 300 Z"/><rect x="216" y="300" width="80" height="16" rx="6" fill="#e0b84c"/><rect x="246" y="316" width="20" height="48" rx="6" fill="#a89f91"/></g><g transform="rotate(-45 256 256)" fill="#efe6d5"><path d="M244 136 L256 112 L268 136 L268 300 L244 300 Z"/><rect x="216" y="300" width="80" height="16" rx="6" fill="#e0b84c"/><rect x="246" y="316" width="20" height="48" rx="6" fill="#a89f91"/></g></g></svg>`;

// Старейшина города: седобородый старик в синей мантии с посохом, у него задания. Отрисованная 3D-модель, как и бойцы
export const ELDER_ART = `<img src="assets/images/units/elder.png" alt="" draggable="false">`;
