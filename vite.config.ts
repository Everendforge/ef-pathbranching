import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: true,
    watch: {
      // Rust changes are rebuilt and reloaded by `tauri dev`, not Vite.
      ignored: ["**/src-tauri/**"],
    },
  },
});
