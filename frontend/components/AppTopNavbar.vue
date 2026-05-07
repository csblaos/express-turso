<script setup lang="ts">
const props = withDefaults(defineProps<{
	title: string;
	eyebrow?: string;
	icon?: string;
	menuTitle?: string;
}>(), {
	eyebrow: "",
	icon: "",
	menuTitle: "เมนู",
});

const slots = useSlots();

const hasLeft = computed(() => Boolean(slots.left));
const hasCenter = computed(() => Boolean(slots.center));
const hasRight = computed(() => Boolean(slots.right));

defineEmits<{
	(event: "menu"): void;
}>();
</script>

<template>
	<UCard
		class="rounded-none border-0 border-b border-[#e7e4dd] bg-white shadow-none ring-0"
		:ui="{ body: { padding: 'p-0 sm:p-0' } }"
	>
		<div class="flex min-h-[48px] items-center gap-2 px-3 py-1.5 sm:min-h-[52px] sm:px-4 sm:py-2">
			<UButton
				color="gray"
				variant="soft"
				size="md"
				class="justify-center"
				icon="i-heroicons-bars-3-20-solid"
				:title="menuTitle"
				:aria-label="menuTitle"
				@click="$emit('menu')"
			/>

			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-3">
					<div
						v-if="icon"
						class="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fbf1ea] text-[#97532c] ring-1 ring-[#efd7c6] sm:flex"
					>
						<UIcon :name="icon" class="h-4 w-4" />
					</div>

					<div class="min-w-0">
						<p
							v-if="eyebrow"
							class="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400"
						>
							{{ eyebrow }}
						</p>
						<p class="truncate text-sm font-semibold text-stone-900">
							{{ title }}
						</p>
					</div>
				</div>
			</div>

			<div v-if="hasLeft" class="hidden items-center gap-2 xl:flex">
				<slot name="left" />
			</div>

			<div v-if="hasCenter" class="hidden min-w-0 flex-1 items-center justify-center xl:flex">
				<slot name="center" />
			</div>

			<div v-if="hasRight" class="ml-auto flex items-center gap-2">
				<slot name="right" />
			</div>
		</div>
	</UCard>
</template>
