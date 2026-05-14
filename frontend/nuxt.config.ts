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
		classSuffix: "",
	},
	runtimeConfig: {
		public: {
			apiBase: process.env.NUXT_PUBLIC_API_BASE || (process.env.NODE_ENV === "production" ? "/api" : "http://localhost:3005/api"),
			r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL || "https://cdn.codesabai.com",
		},
	},
	icon: {
		serverBundle: {
			collections: [ "heroicons" ],
		},
		clientBundle: {
			// Bundle the icons we actually use so sidebar/nav icons do not depend on
			// runtime cache state during local development.
			scan: true,
			icons: [
				"heroicons:building-storefront-20-solid",
				"heroicons:squares-2x2-20-solid",
				"heroicons:shopping-cart-20-solid",
				"heroicons:cube-20-solid",
				"heroicons:clipboard-document-list-20-solid",
				"heroicons:chart-bar-square-20-solid",
				"heroicons:clock-20-solid",
				"heroicons:cog-6-tooth-20-solid",
				"heroicons:building-office-2-20-solid",
				"heroicons:shield-check-20-solid",
			],
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
					content: "light dark",
				},
				{
					name: "theme-color",
					content: "#22c55e",
				},
			],
			link: [
				{
					rel: "icon",
					type: "image/png",
					href: "/icons/icon-192.png",
				},
				{
					rel: "apple-touch-icon",
					href: "/icons/apple-touch-icon.png",
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
					src: "/icons/icon-192.png",
					sizes: "192x192",
					type: "image/png",
					purpose: "any",
				},
				{
					src: "/icons/icon-512.png",
					sizes: "512x512",
					type: "image/png",
					purpose: "any",
				},
				{
					src: "/icons/maskable-icon.png",
					sizes: "512x512",
					type: "image/png",
					purpose: "maskable",
				},
			],
		},
		// Keep the initial PWA setup intentionally minimal.
		// We are not enabling asset/API caching yet; offline and cache strategies
		// can be added later when product requirements are clearer.
	},
});
