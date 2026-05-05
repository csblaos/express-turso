<script setup lang="ts">
const colorMode = useColorMode();

colorMode.preference = "light";

if (import.meta.client) {
	onMounted(() => {
		colorMode.preference = "light";
		colorMode.value = "light";

		const root = document.documentElement;
		root.classList.remove("dark", "dark-mode");
		root.style.colorScheme = "light";

		try {
			localStorage.setItem("nuxt-color-mode", "light");
		} catch {
			// Ignore storage failures in restricted contexts.
		}
	});
}
</script>

<template>
	<NuxtLayout>
		<NuxtPage />
	</NuxtLayout>
</template>
