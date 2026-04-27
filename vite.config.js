import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // This ensures that the "@" symbol correctly points to your "src" folder
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    // Explicitly disable proxy logic for local development
    proxy: {},
  },
});
