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
				canvas: "#f5efe6",
				ink: "#221b17",
				mist: "#6e6259",
				brand: {
					50: "#fff2e8",
					100: "#ffd9ba",
					500: "#d86d32",
					600: "#b45721",
					700: "#8d4316",
				},
				mint: {
					100: "#d8f1e7",
					500: "#4d9e82",
				},
				berry: {
					100: "#f2dde5",
					500: "#af5d79",
				},
			},
			fontFamily: {
				sans: ["Avenir Next", "Manrope", "Segoe UI", "sans-serif"],
			},
			boxShadow: {
				panel: "0 24px 60px rgba(73, 48, 24, 0.12)",
				float: "0 16px 40px rgba(40, 29, 21, 0.16)",
			},
			backgroundImage: {
				"pos-glow":
					"radial-gradient(circle at top left, rgba(222, 123, 52, 0.18), transparent 26%), radial-gradient(circle at top right, rgba(94, 165, 140, 0.18), transparent 24%), linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0.52))",
			},
		},
	},
};
