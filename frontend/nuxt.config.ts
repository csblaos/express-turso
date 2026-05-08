export default defineNuxtConfig({
	devtools: { enabled: process.env.NODE_ENV !== "production" },
	ssr: true,
	telemetry: false,
	modules: ["@nuxt/ui"],
	css: ["~/assets/css/main.css"],
	nitro: {
		compatibilityDate: "2026-05-04",
	},
	colorMode: {
		preference: "light",
		fallback: "light",
	},
	runtimeConfig: {
		public: {
			apiBase: process.env.NUXT_PUBLIC_API_BASE || (process.env.NODE_ENV === "production" ? "/api" : "http://localhost:3005/api"),
			r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL || "https://cdn.codesabai.com",
		},
	},
	app: {
		head: {
			title: "POS Starter UI",
			meta: [
				{
					name: "description",
					content: "Responsive POS starter interface built with Nuxt and Tailwind CSS.",
				},
				{
					name: "color-scheme",
					content: "light",
				},
			],
		},
	},
});
