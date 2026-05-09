<script setup lang="ts">
withDefaults(defineProps<{
	label?: string;
	barClass?: string;
	containerClass?: string;
}>(), {
	label: "",
	barClass: "bg-primary",
	containerClass: "border border-neutral-200 bg-neutral-50",
});
</script>

<template>
	<div :class="['overflow-hidden rounded-md', containerClass]">
		<div :class="['app-inline-loading-bar h-[2px] w-1/3 rounded-r-full', barClass]" />
		<div v-if="label" class="px-4 py-3 text-sm text-stone-600">
			{{ label }}
		</div>
	</div>
</template>

<style scoped>
@keyframes app-inline-loading-slide {
	0% { transform: translateX(-120%); }
	100% { transform: translateX(420%); }
}

.app-inline-loading-bar {
	animation: app-inline-loading-slide 1.2s linear infinite;
	will-change: transform;
}
</style>
