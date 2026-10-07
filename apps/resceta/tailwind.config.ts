import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}", "../../packages/core/src/agent-kit/react/**/*.tsx"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
