import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: "#050A18",
        "committee-blue": "#2563EB",
        "signal-cyan": "#22D3EE",
        "policy-gold": "#F5B841",
        "risk-red": "#FF4D5E",
        "liquidity-green": "#2CE88A",
        "governance-purple": "#8B5CF6",
        "paper-white": "#F7F3EA",
        "slate-grey": "#8B93A1",
        graphite: "#111827",
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
        accent: ["Archivo Black", "sans-serif"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};

export default config;
