export default defineAppConfig({
	ui: {
		// Nuxt UI's own bg-elevated comes from a cool grey palette, which reads as
		// pale blue against this app's warm off-white surfaces. Skeletons are the
		// first thing on screen on every page, so they use the same muted neutral
		// the rest of the app already uses - one line, and every USkeleton matches.
		//
		// It has to be a class the app writes somewhere else too: Tailwind does not
		// scan this file, so an arbitrary value here would compile to nothing.
		// bg-neutral-100 is used across the pages and main.css already maps it to
		// the dark surface token, so dark mode follows for free.
		skeleton: {
			base: "animate-pulse rounded-md bg-neutral-100",
		},
	},
});
