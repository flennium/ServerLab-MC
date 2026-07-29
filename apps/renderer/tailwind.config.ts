import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ServerLab MC dark palette
        surface: {
          DEFAULT: "#0f0f0f",
          1: "#161616",
          2: "#1e1e1e",
          3: "#272727",
          console: "#0a0a0a",
        },
        border: "#2e2e2e",
        accent: {
          DEFAULT: "#22c55e",
          hover: "#16a34a",
        },
        danger: "#ef4444",
        warning: "#f59e0b",
        muted: "#6b7280",
        info: "#5555FF",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      borderRadius: {
        DEFAULT: "8px",
        lg: "12px",
        xl: "16px",
      },
    },
  },
  plugins: [],
};

export default config;
