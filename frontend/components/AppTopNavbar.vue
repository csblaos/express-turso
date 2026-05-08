<script setup lang="ts">
const props = withDefaults(defineProps<{
	title: string;
	eyebrow?: string;
	icon?: string;
	menuTitle?: string;
	menuIcon?: string;
}>(), {
	eyebrow: "",
	icon: "",
	menuTitle: "เมนู",
	menuIcon: "i-heroicons-bars-3-bottom-left-20-solid",
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
		class="rounded-none border-0 bg-transparent shadow-none ring-0"
		:ui="{ body: 'p-0 sm:p-0' }"
	>
		<div class="flex h-[44px] min-w-0 items-center gap-1.5 overflow-x-hidden px-2.5 py-0 sm:h-[48px] sm:px-3 sm:py-0">
			<AppButton
				color="neutral"
				variant="soft"
				size="lg"
				:icon="menuIcon"
				class="h-8 w-12 cursor-pointer justify-center rounded-md border border-[#e7e4dd] bg-[#fbfbf8] px-0 text-stone-600 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 sm:h-10 sm:w-10 lg:h-9 lg:w-9"
				:title="menuTitle"
				:aria-label="menuTitle"
				@click="$emit('menu')"
			/>

			<div class="min-w-0 flex-1" />

			<div v-if="hasLeft" class="hidden items-center gap-2 xl:flex">
				<slot name="left" />
			</div>

			<div v-if="hasCenter" class="hidden min-w-0 flex-1 items-center justify-center xl:flex">
				<slot name="center" />
			</div>

			<div v-if="hasRight" class="ml-auto flex items-center gap-1.5">
				<slot name="right" />
			</div>
		</div>
	</UCard>
</template>
