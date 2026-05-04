<script setup lang="ts">
defineProps<{
	title: string;
	value: string;
	description: string;
}>();
</script>

<template>
	<section class="status-card">
		<p class="eyebrow">{{ title }}</p>
		<h2>{{ value }}</h2>
		<p class="description">{{ description }}</p>
	</section>
</template>
