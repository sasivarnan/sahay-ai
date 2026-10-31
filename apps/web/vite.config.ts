import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
  const projectRoot = resolve(import.meta.dirname, "../..")
  const environment = loadEnv(mode, projectRoot, "")
  for (const [key, value] of Object.entries(environment))
    if (!(key in process.env)) process.env[key] = value
  return {
    envDir: projectRoot,
    plugins: [tailwindcss(), tanstackStart(), react()],
    resolve: { alias: { "@": resolve(import.meta.dirname, "./src") } },
    server: { port: 3000, host: "127.0.0.1" },
  }
})
