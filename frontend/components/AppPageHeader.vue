<script setup lang="ts">
const props = withDefaults(defineProps<{
	title: string;
	description?: string;
	sticky?: boolean;
	tabletLayout?: boolean;
	compact?: boolean;
	titleBadge?: boolean;
	titleTone?: "primary" | "success";
}>(), {
	description: "",
	sticky: true,
	tabletLayout: false,
	compact: false,
	titleBadge: true,
	titleTone: "primary",
});

const slots = useSlots();

const hasActions = computed(() => Boolean(slots.actions));
const hasDefault = computed(() => Boolean(slots.default));
const hasBadges = computed(() => Boolean(slots.badges));
const hasHeaderRow = computed(() => Boolean(props.title) || hasActions.value || hasBadges.value);
const headerLayoutClass = computed(() => {
	if (!hasActions.value) return "";
	return props.tabletLayout
		? "md:flex-row md:items-end md:justify-between"
		: "lg:flex-row lg:items-end lg:justify-between";
});
const actionsLayoutClass = computed(() => (
	props.tabletLayout ? "md:justify-end" : "lg:justify-end"
));
const cardBodyClass = computed(() => (props.compact ? "p-0.5 sm:p-1 lg:p-1.5" : "p-3 sm:p-4 lg:p-5"));
const spacingClass = computed(() => (props.compact ? "space-y-1 lg:space-y-1.5" : "space-y-2.5 lg:space-y-3"));
const headerGapClass = computed(() => (props.compact ? "gap-1 lg:gap-1.5" : "gap-2.5 lg:gap-3"));
const titleClass = computed(() => (
	props.titleBadge
		? (
			props.compact
				? (props.titleTone === "success"
					? "inline-flex max-w-full items-center gap-2 rounded-full bg-primary-50 px-3 py-0.5 text-sm font-semibold tracking-[-0.02em] text-primary-800 ring-1 ring-primary-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-400/20"
					: "inline-flex max-w-full items-center gap-2 rounded-full bg-primary-50 px-3 py-0.5 text-sm font-semibold tracking-[-0.02em] text-primary-800 ring-1 ring-primary-100")
				: (props.titleTone === "success"
					? "inline-flex max-w-full items-center gap-2 rounded-full bg-primary-50 px-3 py-1.5 text-sm font-semibold tracking-[-0.02em] text-primary-800 ring-1 ring-primary-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-400/20"
					: "inline-flex max-w-full items-center gap-2 rounded-full bg-primary-50 px-3 py-1.5 text-sm font-semibold tracking-[-0.02em] text-primary-800 ring-1 ring-primary-100")
		)
		: (
			props.compact
				? (props.titleTone === "success"
					? "inline-flex max-w-full items-center text-sm font-semibold tracking-[-0.02em] text-primary-700 dark:text-emerald-200"
					: "inline-flex max-w-full items-center text-sm font-semibold tracking-[-0.02em] text-stone-950 dark:text-stone-50")
				: (props.titleTone === "success"
					? "inline-flex max-w-full items-center text-base font-semibold tracking-[-0.02em] text-primary-700 dark:text-emerald-200"
					: "inline-flex max-w-full items-center text-base font-semibold tracking-[-0.02em] text-stone-950 dark:text-stone-50")
		)
));
</script>

<template>
	<UCard
		class="overflow-hidden rounded-none border-0 border-b border-[#efeae2] bg-white shadow-none ring-0 lg:rounded-md lg:border-0 lg:shadow-[0_10px_30px_rgba(31,28,24,0.06)] lg:ring-0"
		:ui="{ body: cardBodyClass }"
		:class="sticky ? 'lg:sticky lg:top-0 lg:z-20' : ''"
	>
		<div :class="spacingClass">
			<div v-if="hasHeaderRow" class="flex flex-col" :class="[headerLayoutClass, headerGapClass]">
				<div class="min-w-0 flex-1">
					<div v-if="hasBadges" class="flex flex-wrap items-center gap-2">
						<slot name="badges" />
					</div>
					<h1 v-if="title" :class="[titleClass, hasBadges ? 'mt-2' : '']">
						<span v-if="props.titleBadge" class="h-1.5 w-1.5 shrink-0 rounded-full" :class="props.titleTone === 'success' ? 'bg-primary-500 dark:bg-emerald-500' : 'bg-primary-500'" />
						<span class="truncate">{{ title }}</span>
					</h1>
				</div>

				<div v-if="hasActions" class="flex flex-wrap gap-2" :class="actionsLayoutClass">
					<slot name="actions" />
				</div>
			</div>

			<div v-if="hasDefault" :class="compact ? 'pt-0' : 'pt-1'">
				<slot />
			</div>
		</div>
	</UCard>
</template>
