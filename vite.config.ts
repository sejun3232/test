import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],

  // Tauri: Rust 에러가 Vite 로그에 가려지지 않도록
  clearScreen: false,

  server: {
    // Tauri dev 시 고정 포트 필요, CLI --port 로 덮어쓸 수 있음
    port: 1420,
    strictPort: !!process.env.TAURI_DEV_HOST, // Tauri 환경에서만 strict
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
