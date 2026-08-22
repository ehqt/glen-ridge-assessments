import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" makes the build work at any GitHub Pages path
// (username.github.io/repo-name/) without configuration.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
