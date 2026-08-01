import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        carbon: "#101214",
        panel: "#171A1E",
        rail: "#22272E",
        copper: {
          DEFAULT: "#D9823B",
          hover: "#F09A4A",
          muted: "#5A3A25",
        },
        grass: "#4CAF50",
        redstone: "#EF4444",
        lapis: "#4D7CFE",
        glowstone: "#F6C85F",
        surface: {
          DEFAULT: "#101214",
          1: "#13161A",
          2: "#171A1E",
          3: "#22272E",
          console: "#080A0D",
        },
        border: "#303741",
        accent: {
          DEFAULT: "#D9823B",
          hover: "#F09A4A",
        },
        danger: "#EF4444",
        warning: "#F6C85F",
        muted: "#8B949E",
        info: "#4D7CFE",
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
