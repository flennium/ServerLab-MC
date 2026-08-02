import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        carbon: "#070A0E",
        panel: "#101821",
        rail: "#172232",
        copper: {
          DEFAULT: "#79D928",
          hover: "#A8F23D",
          muted: "#254716",
        },
        grass: "#64D63A",
        redstone: "#EF4444",
        lapis: "#6BA7FF",
        glowstone: "#B87532",
        surface: {
          DEFAULT: "#070A0E",
          1: "#0B1118",
          2: "#101821",
          3: "#172232",
          console: "#05080C",
        },
        border: "#263241",
        accent: {
          DEFAULT: "#79D928",
          hover: "#A8F23D",
        },
        danger: "#EF4444",
        warning: "#B87532",
        muted: "#8E9AA8",
        info: "#6BA7FF",
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "Inter", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "IBM Plex Sans", "system-ui", "sans-serif"],
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
