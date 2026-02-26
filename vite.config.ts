import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiUrl = env.VITE_API_URL || "http://localhost:5173";

  // Try to load lovable-tagger if it exists, otherwise ignore.
  let lovablePlugin: any = null;
  try {
    const mod = await import("lovable-tagger");
    // Some packages export default, some named; handle both.
    const fn = (mod as any).default ?? (mod as any).lovableTagger ?? (mod as any);
    lovablePlugin = typeof fn === "function" ? fn() : null;
  } catch {
    lovablePlugin = null;
  }

  return {
    plugins: [react(), ...(lovablePlugin ? [lovablePlugin] : [])],
    server: {
      proxy: {
        "/api": {
          target: apiUrl,
          changeOrigin: true,
          secure: false
        }
      }
    }
  };
});