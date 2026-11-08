// Генерация карты акта. Этот файл не трогает HTML: только создаёт данные карты.
import { CONFIG } from "../config.ts";
import { nextFloat, nextInt, pickWeighted } from "./rng.ts";
import type { ActMechanic, DungeonMap, MapNode, NodeType, Rng } from "../types.ts";

// Узлы лежат в сетке из рядов и колонок. Каждый путь — это колонка на каждом этаже.
// Колонки путей всегда отсортированы по порядку, поэтому линии между рядами не пересекаются.
// mechanic — особенность акта из data/acts.js: deadEnds меняет число тупиков, noRest убирает отдых
export function generateMap(rng: Rng, mechanic: ActMechanic = {}): DungeonMap {
  const { floors, columns, pathCount } = CONFIG.map;
  const nodes: Record<string, MapNode> = {};
  const rows: string[][] = [];

  let paths = rollStartColumns(rng, pathCount, columns);
  for (let floor = 1; floor <= floors; floor++) {
    const nextPaths = floor < floors ? rollNextColumns(rng, paths, columns) : null;
    const row: string[] = [];
    paths.forEach((column, pathIndex) => {
      const id = nodeId(floor, column);
      if (!nodes[id]) {
        nodes[id] = { id, floor, column, type: null, next: [] };
        row.push(id);
      }
      if (nextPaths) {
        const nextId = nodeId(floor + 1, nextPaths[pathIndex]);
        if (!nodes[id].next.includes(nextId)) nodes[id].next.push(nextId);
      }
    });
    rows.push(row);
    if (nextPaths) paths = nextPaths;
  }

  assignNodeTypes(rng, nodes, rows, mechanic);
  placeSaveRooms(rng, nodes, rows);
  addDeadEnds(rng, nodes, mechanic.deadEnds ?? CONFIG.map.deadEnds);
  placeBoss(rng, nodes, rows);
  return { nodes, rows };
}

// Комнаты сохранения: 2–3 на акт в случайных комнатах основных путей — не ниже saveMinFloor, не ближе saveGap этажей
// друг к другу и каждая в своей колонке (на своём пути). Сундук и верхний отдых не трогаем
function placeSaveRooms(rng: Rng, nodes: Record<string, MapNode>, rows: string[][]): void {
  const { saveRooms, saveMinFloor, saveGap, chestFloor, restFloor } = CONFIG.map;
  const count = nextInt(rng, saveRooms[0], saveRooms[1]);
  const candidates = rows.flat().map((id) => nodes[id])
    .filter((node) => node.floor >= saveMinFloor && node.floor !== chestFloor && node.floor !== restFloor);
  const chosen: MapNode[] = [];
  while (chosen.length < count && candidates.length > 0) {
    const node = candidates.splice(nextInt(rng, 0, candidates.length - 1), 1)[0];
    const fits = chosen.every((other) => Math.abs(other.floor - node.floor) >= saveGap && other.column !== node.column);
    if (fits) chosen.push(node);
  }
  for (const node of chosen) node.type = "save";
}

// Комната босса в каждом акте в случайном месте: туннель к ней отходит от случайной комнаты основных путей
// не ниже bossMinFloor. Верхние комнаты, из которых больше никуда не ведёт, становятся тупиками — босса придётся искать
function placeBoss(rng: Rng, nodes: Record<string, MapNode>, rows: string[][]): void {
  const { columns, maxTunnels, bossMinFloor } = CONFIG.map;
  const hosts = rows.flat().map((id) => nodes[id]).filter((node) => node.floor >= bossMinFloor && node.next.length < maxTunnels);
  const host = hosts[nextInt(rng, 0, hosts.length - 1)];
  // Сдвиг в сторону нужен только карте: так комната босса не ляжет поверх соседней
  const column = Math.max(-0.3, Math.min(columns - 0.7, host.column + nextInt(rng, -1, 1) * 0.5));
  const boss: MapNode = { id: nodeId(host.floor + 1, "boss"), floor: host.floor + 1, column, type: "boss", next: [] };
  host.next.push(boss.id);
  nodes[boss.id] = boss;
}

// Тупики: от некоторых развилок отходит боковой туннель. В нём одна комната, а за ней тупик —
// иногда с сундуком, иногда пустой. Чтобы идти дальше, придётся вернуться к развилке.
// Боковых комнат нет в rows: это ряды основных путей, по ним строится карта
function addDeadEnds(rng: Rng, nodes: Record<string, MapNode>, deadEnds: number): void {
  const { floors, columns, maxTunnels, deadEndChestChance, deadEndRoomWeights, eliteMinFloor } = CONFIG.map;
  // Тупик заканчивается двумя этажами выше развилки и не должен дойти до этажа перед боссом
  const forks = Object.values(nodes).filter((node) => node.floor >= 2 && node.floor <= floors - 3 && node.next.length < maxTunnels);
  for (let index = 0; index < deadEnds && forks.length > 0; index++) {
    const fork = forks.splice(nextInt(rng, 0, forks.length - 1), 1)[0];
    // Боковой туннель уходит к ближнему краю карты, между колонками основных путей
    const side = fork.column <= (columns - 1) / 2 ? -1 : 1;
    const column = Math.max(-0.3, Math.min(columns - 0.7, fork.column + side * 0.5));

    const weights: Partial<Record<NodeType, number>> = { ...deadEndRoomWeights };
    if (fork.floor + 1 < eliteMinFloor) delete weights.elite;
    const room: MapNode = { id: `${fork.floor + 1}-dead${index}`, floor: fork.floor + 1, column, type: pickWeighted(rng, weights), next: [] };
    const end: MapNode = {
      id: `${fork.floor + 2}-dead${index}`,
      floor: fork.floor + 2,
      column,
      type: nextFloat(rng) < deadEndChestChance ? "chest" : "deadEnd",
      next: [],
    };
    room.next.push(end.id);
    fork.next.push(room.id);
    nodes[room.id] = room;
    nodes[end.id] = end;
  }
}

function nodeId(floor: number, column: number | string): string {
  return `${floor}-${column}`;
}

// Стартовые колонки путей: минимум две разные. Из начальной комнаты ведут не больше трёх туннелей,
// а дальше больше трёх и не бывает: путь шагает только прямо или на колонку в сторону
function rollStartColumns(rng: Rng, pathCount: number, columns: number): number[] {
  const { minNodesInRow, maxTunnels } = CONFIG.map;
  let result: number[];
  do {
    result = [];
    for (let i = 0; i < pathCount; i++) result.push(nextInt(rng, 0, columns - 1));
    result.sort((a, b) => a - b);
  } while (countDistinct(result) < minNodesInRow || countDistinct(result) > maxTunnels);
  return result;
}

// Каждый путь шагает вверх прямо или на колонку в сторону. Сортировка сохраняет порядок путей:
// никакая линия не пересечёт соседнюю. Повторяем, пока в ряду не наберётся минимум узлов.
function rollNextColumns(rng: Rng, paths: number[], columns: number): number[] {
  let result: number[];
  do {
    result = paths.map((column) => {
      const moved = column + nextInt(rng, -1, 1);
      return Math.max(0, Math.min(columns - 1, moved));
    });
    result.sort((a, b) => a - b);
  } while (countDistinct(result) < CONFIG.map.minNodesInRow);
  return result;
}

function countDistinct(items: number[]): number {
  return new Set(items).size;
}

// Типы назначаем снизу вверх: так у каждого узла уже известны типы узлов перед ним
function assignNodeTypes(rng: Rng, nodes: Record<string, MapNode>, rows: string[][], mechanic: ActMechanic): void {
  const parents: Record<string, MapNode[]> = {};
  for (const node of Object.values(nodes)) {
    for (const nextId of node.next) (parents[nextId] ??= []).push(node);
  }

  for (const row of rows) {
    for (const id of row) {
      const node = nodes[id];
      if (node.type) continue;
      node.type = pickNodeType(rng, node.floor, parents[id] ?? [], mechanic);
    }
  }
}

// В акте без передышки отдыха нет: верхний этаж отдыха становится событием
function pickNodeType(rng: Rng, floor: number, parentNodes: MapNode[], mechanic: ActMechanic): NodeType {
  const { chestFloor, restFloor, eliteMinFloor, nodeWeights } = CONFIG.map;
  if (floor === 1) return "battle";
  if (floor === chestFloor) return "chest";
  if (floor === restFloor) return mechanic.noRest ? "event" : "rest";

  const weights: Partial<Record<NodeType, number>> = { ...nodeWeights };
  if (mechanic.noRest) delete weights.rest;
  if (floor < eliteMinFloor) delete weights.elite;
  // Отдых и Тайник не стоят два раза подряд на одном пути
  if (floor + 1 === restFloor) delete weights.rest;
  for (const parent of parentNodes) {
    if (parent.type === "rest") delete weights.rest;
    if (parent.type === "cache") delete weights.cache;
  }
  return pickWeighted(rng, weights);
}
