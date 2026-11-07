// Настройки сборки. Vite превращает .ts в обычный JavaScript и собирает игру в папку dist.
// Картинки, звуки и manifest.json лежат в public/ и копируются в сборку как есть.
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Относительные пути: игра работает из любой папки сайта (например, на GitHub Pages)
  base: "./",
  build: {
    // Свои файлы сборки кладём в build/, чтобы не смешивать с нашей папкой assets/
    assetsDir: "build",
    // Игра грузится один раз и хранится на телефоне, большой файл кода не страшен
    chunkSizeWarningLimit: 2000,
  },
  plugins: [
    VitePWA({
      // Новая версия игры ставится сама при следующем запуске
      registerType: "autoUpdate",
      // manifest.json свой, в public/
      manifest: false,
      workbox: {
        // Что хранить для игры без интернета: всё, что нужно игре
        globPatterns: ["**/*.{js,css,html,png,jpg,jpeg,webp,svg,mp3,json}"],
        // Музыка весит больше стандартного предела в 2 МБ
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
    }),
  ],
});
