/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ivory: "var(--ivory)",
        paper: "var(--paper)",
        champagne: { DEFAULT: "var(--champagne)", deep: "var(--champagne-deep)" },
        line: "var(--line)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        wine: { DEFAULT: "var(--wine)", deep: "var(--wine-deep)", tint: "var(--wine-tint)" },
        ok: { DEFAULT: "var(--ok)", tint: "var(--ok-tint)" },
        warn: { DEFAULT: "var(--warn)", tint: "var(--warn-tint)" },
        danger: { DEFAULT: "var(--danger)", tint: "var(--danger-tint)" },
        studio: {
          bg: "var(--studio-bg)",
          panel: "var(--studio-panel)",
          raised: "var(--studio-raised)",
          line: "var(--studio-line)",
          text: "var(--studio-text)",
          muted: "var(--studio-muted)",
          accent: "var(--studio-accent)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
      fontSize: {
        display: ["clamp(2.5rem, 1.6rem + 3.8vw, 4.5rem)", { lineHeight: "1.06", letterSpacing: "-0.025em" }],
        h1: ["clamp(2.125rem, 1.75rem + 1.6vw, 3rem)", { lineHeight: "1.12", letterSpacing: "-0.015em" }],
        h2: ["clamp(1.625rem, 1.45rem + .75vw, 2rem)", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
        h3: ["clamp(1.25rem, 1.2rem + .25vw, 1.375rem)", { lineHeight: "1.28" }],
        lead: ["clamp(1.125rem, 1.08rem + .2vw, 1.25rem)", { lineHeight: "1.55" }],
        base: ["1rem", { lineHeight: "1.625" }],
        sm: ["0.875rem", { lineHeight: "1.43" }],
        label: ["0.8125rem", { lineHeight: "1.38", fontWeight: "500" }],
      },
      maxWidth: { measure: "62ch" },
      borderRadius: { sm: "8px", md: "12px", lg: "20px" },
      boxShadow: { lift: "var(--shadow-lift)", float: "var(--shadow-float)" },
      transitionTimingFunction: { brand: "cubic-bezier(.2,.8,.2,1)" },
    },
  },
  plugins: [],
};
