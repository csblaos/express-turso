<script setup lang="ts">
defineOptions({
	inheritAttrs: false,
});
</script>

<template>
	<svg
		v-bind="$attrs"
		viewBox="0 0 24 24"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		aria-hidden="true"
	>
		<path
			d="M6.5 14.5 3 18l3 3h5l3.5-3.5m-8-3L13 6.5m-6.5 8H13m-2.5-8L17 3l4 4-6.5 6.5m-8-1.5 8-8"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
</template>
