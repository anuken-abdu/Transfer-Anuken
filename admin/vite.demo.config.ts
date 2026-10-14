// Сборка демо одним HTML-файлом (для превью)
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({ plugins: [react(), viteSingleFile()], build: { assetsInlineLimit: 100_000_000 } });
