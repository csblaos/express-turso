<script setup lang="ts">
const props = withDefaults(defineProps<{
	loading?: boolean;
	idleIcon?: string;
	loadingIcon?: string;
	sizeClass?: string;
}>(), {
	loading: false,
	idleIcon: "i-heroicons-arrow-right-circle-20-solid",
	loadingIcon: "i-heroicons-arrow-path-20-solid",
	sizeClass: "h-5 w-5",
});

const iconName = computed(() => (props.loading ? props.loadingIcon : props.idleIcon));
</script>

<template>
	<UIcon
		:name="iconName"
		:class="[sizeClass, loading ? 'animate-spin' : '']"
	/>
</template>
