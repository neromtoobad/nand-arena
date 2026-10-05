import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@sdk": fileURLToPath(new URL("../sdk", import.meta.url)) },
    dedupe: ["ethers"],
  },
  server: { fs: { allow: [".."] } },
  build: { chunkSizeWarningLimit: 1200 },
});
