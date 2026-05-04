export default defineNuxtConfig({
	devtools: { enabled: true },
	ssr: true,
	telemetry: false,
	css: ["~/assets/css/main.css"],
	nitro: {
		compatibilityDate: "2026-05-04",
	},
	postcss: {
		plugins: {
			tailwindcss: {},
			autoprefixer: {},
		},
	},
	runtimeConfig: {
		public: {
			apiBase: process.env.NUXT_PUBLIC_API_BASE || "http://localhost:3000/api",
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
			],
		},
	},
});
