export default defineNuxtConfig({
	devtools: { enabled: true },
	ssr: true,
	telemetry: false,
	modules: ["@nuxt/ui"],
	nitro: {
		compatibilityDate: "2026-05-04",
	},
	tailwindcss: {
		cssPath: "~/assets/css/main.css",
		configPath: "tailwind.config.ts",
		viewer: false,
	},
	postcss: {
		plugins: {
			tailwindcss: {},
			autoprefixer: {},
		},
	},
	colorMode: {
		preference: "light",
		fallback: "light",
	},
	runtimeConfig: {
		public: {
			apiBase: process.env.NUXT_PUBLIC_API_BASE || "http://localhost:3005/api",
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
