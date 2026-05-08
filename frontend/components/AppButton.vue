<script setup lang="ts">
defineOptions({
	inheritAttrs: false,
});

const props = withDefaults(defineProps<{
	color?: "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";
	variant?: "solid" | "outline" | "soft" | "subtle" | "ghost" | "link";
	size?: "xs" | "sm" | "md" | "lg" | "xl";
	type?: "button" | "submit" | "reset";
	label?: string;
	icon?: string;
	trailingIcon?: string;
	loading?: boolean;
	loadingIcon?: string;
	spinIconOnLoading?: boolean;
	disabled?: boolean;
	block?: boolean;
	inline?: boolean;
}>(), {
	color: "primary",
	variant: "solid",
	size: "md",
	type: "button",
	label: "",
	icon: undefined,
	trailingIcon: undefined,
	loading: false,
	loadingIcon: "i-heroicons-arrow-path-20-solid",
	spinIconOnLoading: false,
	disabled: false,
	block: false,
	inline: false,
});

const attrs = useAttrs();
const slots = useSlots();
const hasDefaultSlot = computed(() => Boolean(slots.default));

const resolvedSize = computed(() => {
	return props.size === "md" ? "lg" : props.size;
});

const shouldUseSharedLoadingIcon = computed(() => (
	props.spinIconOnLoading && Boolean(props.icon)
));

const resolvedIcon = computed(() => (
	shouldUseSharedLoadingIcon.value ? undefined : props.icon
));

const resolvedLoading = computed(() => (
	shouldUseSharedLoadingIcon.value ? false : props.loading
));

const iconSizeClass = computed(() => {
	switch (resolvedSize.value) {
		case "xs":
			return "h-3.5 w-3.5";
		case "sm":
			return "h-4 w-4";
		case "lg":
			return "h-5 w-5";
		case "xl":
			return "h-5.5 w-5.5";
		default:
			return "h-4.5 w-4.5";
	}
});

const buttonClass = computed(() => {
	if (props.inline) {
		return [
			"h-auto min-h-0 rounded-none px-0 py-0 font-medium shadow-none",
			"hover:bg-transparent focus-visible:ring-0",
			props.block ? "w-full justify-between" : "",
		];
	}

	return [
		"rounded-md",
		props.block ? "w-full justify-center" : "",
	];
});
</script>

<template>
	<UButton
		v-bind="attrs"
			:type="type"
			:color="color"
			:variant="inline ? 'ghost' : variant"
			:size="resolvedSize"
		:icon="resolvedIcon"
		:trailing-icon="trailingIcon"
		:loading="resolvedLoading"
		:disabled="disabled || loading"
		:class="buttonClass"
	>
		<template v-if="shouldUseSharedLoadingIcon">
			<span class="inline-flex items-center gap-2">
				<AppLoadingIcon
					:loading="loading"
					:idle-icon="icon"
					:loading-icon="loadingIcon"
					:size-class="iconSizeClass"
				/>
				<span v-if="hasDefaultSlot || label" class="truncate">
					<slot v-if="hasDefaultSlot" />
					<template v-else>{{ label }}</template>
				</span>
			</span>
		</template>
		<slot v-else-if="hasDefaultSlot" />
		<template v-else>{{ label }}</template>
	</UButton>
</template>
