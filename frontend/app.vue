<script setup lang="ts">
import "vue-sonner/style.css";
import { Toaster } from "vue-sonner";

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
	<Toaster
		position="top-right"
		:rich-colors="true"
		:close-button="true"
		:expand="false"
		:visible-toasts="5"
		:toast-options="{ duration: 2800 }"
	/>
</template>
