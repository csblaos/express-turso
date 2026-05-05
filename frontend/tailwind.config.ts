import type { Config } from "tailwindcss";

export default <Partial<Config>>{
	content: [
		"./app.vue",
		"./components/**/*.{vue,js,ts}",
		"./layouts/**/*.vue",
		"./pages/**/*.vue",
		"./plugins/**/*.{js,ts}",
	],
	theme: {
			extend: {
				colors: {
					canvas: "#f6f6f3",
					surface: "#fffefd",
					"surface-soft": "#fbfbf8",
					"surface-muted": "#f3f2ee",
					border: "#e7e4dd",
					ink: "#1f1c18",
					mist: "#6b645c",
					brand: {
						50: "#fbf1ea",
						100: "#f8e9de",
						500: "#c97745",
						600: "#b56839",
						700: "#97532c",
					},
					sage: {
						100: "#e8f1eb",
						500: "#6f9378",
					},
					rose: {
						100: "#f6e8e8",
						500: "#b77474",
					},
				},
			fontFamily: {
				sans: ["Avenir Next", "Manrope", "Segoe UI", "sans-serif"],
			},
				boxShadow: {
					panel: "0 24px 56px rgba(41, 34, 25, 0.08)",
					float: "0 14px 36px rgba(41, 34, 25, 0.12)",
				},
				backgroundImage: {
					"pos-glow":
						"radial-gradient(circle at top left, rgba(201, 119, 69, 0.12), transparent 24%), radial-gradient(circle at top right, rgba(111, 147, 120, 0.1), transparent 22%), linear-gradient(180deg, rgba(255,255,255,0.78), rgba(255,255,255,0.56))",
				},
			},
		},
};
