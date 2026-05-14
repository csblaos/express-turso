<script setup lang="ts">
import "vue-sonner/style.css";
import { Toaster } from "vue-sonner";

const colorMode = useColorMode();

if (import.meta.client) {
	watchEffect(() => {
		document.documentElement.style.colorScheme = colorMode.value === "dark" ? "dark" : "light";
	});
}
</script>

<template>
	<NuxtLayout>
		<NuxtPage />
	</NuxtLayout>
	<Toaster
		position="top-right"
		:theme="colorMode.value === 'dark' ? 'dark' : 'light'"
		:rich-colors="true"
		:close-button="true"
		:expand="false"
		:visible-toasts="5"
		:toast-options="{ duration: 2800 }"
	/>
</template>
