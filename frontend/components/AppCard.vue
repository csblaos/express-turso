<script setup lang="ts">
defineOptions({
	inheritAttrs: false,
});

const props = withDefaults(defineProps<{
	variant?: "surface" | "compact" | "empty";
	bodyClass?: string;
	clickable?: boolean;
}>(), {
	variant: "surface",
	bodyClass: undefined,
	clickable: false,
});

const attrs = useAttrs();

const variantClass = computed(() => {
	switch (props.variant) {
		case "compact":
			return "rounded-md border border-neutral-200 bg-white shadow-sm";
		case "empty":
			return "rounded-md border border-dashed border-neutral-200 bg-neutral-50 shadow-none";
		case "surface":
		default:
			return "rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md";
	}
});

const resolvedBodyClass = computed(() => {
	if (props.bodyClass) {
		return props.bodyClass;
	}

	if (props.variant === "compact" || props.variant === "empty") {
		return "p-0 sm:p-0";
	}

	return "p-0";
});

const rootClass = computed(() => [
	"overflow-hidden",
	"bg-white",
	"transition",
	props.clickable ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : "",
	variantClass.value,
]);
</script>

<template>
	<div v-bind="attrs" :class="rootClass">
		<div :class="resolvedBodyClass">
			<slot />
		</div>
	</div>
</template>
