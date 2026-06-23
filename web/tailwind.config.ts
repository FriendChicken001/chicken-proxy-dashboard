import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-2": "var(--bg-2)",
        panel: "var(--panel)",
        "panel-2": "var(--panel-2)",
        border: "var(--border)",
        text: "var(--text)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        accent: "var(--accent)",
        green: "var(--green)",
        amber: "var(--amber)",
        red: "var(--red)",
        orange: "var(--orange)",
        purple: "var(--purple)",
      },
      fontFamily: {
        mono: ["SF Mono", "JetBrains Mono", "ui-monospace", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
