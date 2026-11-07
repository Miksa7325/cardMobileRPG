// Снимок экрана игры в невидимом браузере (Edge из Windows) размером с телефон.
// Нужен, чтобы проверить интерфейс без ручного запуска. Игра должна быть запущена: npm run dev
//
// Запуск: node tools/shot.js --script=шаги.js --out=снимок.png [--url=http://localhost:5173/]
// В файле шагов — тело асинхронной функции, она выполняется на странице. Внутри доступна
// window.__game: { state, showScreen, combatScreen, engine } — сама игра (main.js отдаёт его только в режиме разработки).
// Ещё можно передать --clicks='[".selector", {"selector": ".x", "x": 0.1, "nth": 2}, {"wait": 500}, ...]' —
// нажмёт по очереди после шагов. x и y — доля ширины и высоты элемента (по умолчанию середина), nth — какой по счёту.
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=")];
}));
const url = args.url || "http://localhost:5173/";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

await page.goto(url);
// Ждём, пока игра загрузится и нарисует первый экран
await page.waitForSelector("#app > *", { timeout: 30000 });
await page.waitForTimeout(300);
if (args.script) {
  const body = readFileSync(args.script, "utf8");
  await page.evaluate(`(async () => { const load = (path) => import(path); ${body} })()`);
}
for (const step of JSON.parse(args.clicks || "[]")) {
  if (step.wait) {
    await page.waitForTimeout(step.wait);
    continue;
  }
  // Перенос: {"drag": ".откуда", "nth": 0, "to": ".куда", "x": 0.5}
  if (step.drag) {
    const from = await page.locator(step.drag).nth(step.nth ?? 0).boundingBox();
    const to = await page.locator(step.to).nth(step.toNth ?? 0).boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    const tx = to.x + to.width * (step.x ?? 0.5), ty = to.y + to.height * (step.y ?? 0.5);
    await page.mouse.move(tx, ty, { steps: 12 });
    if (step.hold) await page.waitForTimeout(step.hold);
    if (step.shotDuring) await page.screenshot({ path: step.shotDuring });
    await page.mouse.up();
    await page.waitForTimeout(300);
    continue;
  }
  const { selector, x = 0.5, y = 0.5, nth = 0 } = typeof step === "string" ? { selector: step } : step;
  const box = await page.locator(selector).nth(nth).boundingBox();
  if (!box) throw new Error(`Не найден элемент ${selector}`);
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await page.waitForTimeout(300);
}
await page.waitForTimeout(Number(args.wait || 600));
await page.screenshot({ path: args.out || "shot.png" });
if (errors.length) console.log("Ошибки на странице:\n" + errors.join("\n"));
await browser.close();
