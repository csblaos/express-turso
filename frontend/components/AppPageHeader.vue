<script setup lang="ts">
const props = withDefaults(defineProps<{
	title: string;
	description?: string;
	sticky?: boolean;
	tabletLayout?: boolean;
}>(), {
	description: "",
	sticky: true,
	tabletLayout: false,
});

const slots = useSlots();

const hasActions = computed(() => Boolean(slots.actions));
const hasDefault = computed(() => Boolean(slots.default));
const hasBadges = computed(() => Boolean(slots.badges));
const headerLayoutClass = computed(() => {
	if (!hasActions.value) return "";
	return props.tabletLayout
		? "md:flex-row md:items-end md:justify-between"
		: "lg:flex-row lg:items-end lg:justify-between";
});
const actionsLayoutClass = computed(() => (
	props.tabletLayout ? "md:justify-end" : "lg:justify-end"
));
</script>

<template>
	<UCard
		class="overflow-hidden rounded-none border-0 border-b border-[#efeae2] bg-white shadow-none ring-0 lg:rounded-md lg:border-0 lg:shadow-[0_10px_30px_rgba(31,28,24,0.06)] lg:ring-0"
		:ui="{ body: 'p-3 sm:p-4 lg:p-5' }"
		:class="sticky ? 'lg:sticky lg:top-0 lg:z-20' : ''"
	>
		<div class="space-y-3 lg:space-y-4">
			<div class="flex flex-col gap-3 lg:gap-4" :class="headerLayoutClass">
				<div class="min-w-0 flex-1">
					<div v-if="hasBadges" class="flex flex-wrap items-center gap-2">
						<slot name="badges" />
					</div>
					<h1
						class="text-xl font-semibold tracking-[-0.04em] text-stone-950 lg:text-[1.7rem]"
						:class="hasBadges ? 'mt-2 lg:mt-3' : ''"
					>
						{{ title }}
					</h1>
					<p v-if="description" class="mt-1.5 max-w-3xl text-sm leading-6 text-stone-500">{{ description }}</p>
				</div>

				<div v-if="hasActions" class="flex flex-wrap gap-2" :class="actionsLayoutClass">
					<slot name="actions" />
				</div>
			</div>

			<div v-if="hasDefault" class="pt-1">
				<slot />
			</div>
		</div>
	</UCard>
</template>
