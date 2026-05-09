export default defineNuxtConfig({
	devtools: { enabled: process.env.NODE_ENV !== "production" },
	ssr: true,
	telemetry: false,
	modules: [ "@nuxt/ui", "@vite-pwa/nuxt" ],
	css: [ "~/assets/css/main.css" ],
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
			title: "O KhaiDee+",
			meta: [
				{
					name: "description",
					content: "O KhaiDee+ web application.",
				},
				{
					name: "color-scheme",
					content: "light",
				},
				{
					name: "theme-color",
					content: "#22c55e",
				},
			],
			link: [
				{
					rel: "icon",
					type: "image/svg+xml",
					href: "/icons/icon-192.svg",
				},
				{
					rel: "apple-touch-icon",
					href: "/icons/apple-touch-icon.svg",
				},
			],
		},
	},
	pwa: {
		registerType: "autoUpdate",
		strategies: "injectManifest",
		srcDir: "public",
		filename: "sw.js",
		injectManifest: {
			injectionPoint: undefined,
		},
		devOptions: {
			enabled: false,
		},
		manifest: {
			name: "CodeSabai POS",
			short_name: "CodeSabai",
			description: "CodeSabai POS web application.",
			theme_color: "#22c55e",
			background_color: "#ffffff",
			display: "standalone",
			lang: "th",
			start_url: "/",
			icons: [
				{
					src: "/icons/icon-192.svg",
					sizes: "192x192",
					type: "image/svg+xml",
					purpose: "any",
				},
				{
					src: "/icons/icon-512.svg",
					sizes: "512x512",
					type: "image/svg+xml",
					purpose: "any",
				},
				{
					src: "/icons/maskable-icon.svg",
					sizes: "512x512",
					type: "image/svg+xml",
					purpose: "maskable",
				},
			],
		},
		// Keep the initial PWA setup intentionally minimal.
		// We are not enabling asset/API caching yet; offline and cache strategies
		// can be added later when product requirements are clearer.
	},
});
