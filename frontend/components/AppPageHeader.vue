<script setup lang="ts">
const props = withDefaults(defineProps<{
	title: string;
	description?: string;
	sticky?: boolean;
}>(), {
	description: "",
	sticky: true,
});

const slots = useSlots();

const hasActions = computed(() => Boolean(slots.actions));
const hasDefault = computed(() => Boolean(slots.default));
const hasBadges = computed(() => Boolean(slots.badges));
</script>

<template>
	<UCard
		class="rounded-none border-0 border-b border-[#e7e4dd] bg-white shadow-none ring-0 lg:rounded-2xl lg:border lg:shadow-lg lg:ring-1 lg:ring-[#e7e4dd]"
		:ui="{ body: { padding: 'p-3 sm:p-4 lg:p-5' } }"
		:class="sticky ? 'lg:sticky lg:top-0 lg:z-20' : ''"
	>
		<div class="space-y-3 lg:space-y-4">
			<div class="flex flex-col gap-3 lg:gap-4" :class="hasActions ? 'lg:flex-row lg:items-center lg:justify-between' : ''">
				<div class="min-w-0 flex-1">
					<div v-if="hasBadges" class="flex flex-wrap items-center gap-2">
						<slot name="badges" />
					</div>
					<h1 class="mt-2 text-xl font-semibold tracking-[-0.04em] text-stone-950 lg:mt-3 lg:text-2xl">{{ title }}</h1>
					<p v-if="description" class="mt-1 text-sm text-stone-500">{{ description }}</p>
				</div>

				<div v-if="hasActions" class="flex flex-wrap gap-2">
					<slot name="actions" />
				</div>
			</div>

			<div v-if="hasDefault">
				<slot />
			</div>
		</div>
	</UCard>
</template>
