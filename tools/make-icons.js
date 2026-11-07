// Делает PNG-иконки игры из tools/icon.svg. Запуск: node tools/make-icons.js
// Нужен только когда меняешь icon.svg: готовые PNG лежат в public/assets/images
import sharp from "sharp";

const SIZES = [180, 192, 512];

for (const size of SIZES) {
  await sharp("tools/icon.svg").resize(size, size).png().toFile(`public/assets/images/icon-${size}.png`);
  console.log(`icon-${size}.png`);
}
