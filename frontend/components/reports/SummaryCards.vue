<script setup lang="ts">
// One card row, shared by every report tab. Each tab owns its own set of cards,
// so the numbers on screen always belong to the tab that is open.
import type { SummaryCard } from "~/utils/report-cards";

withDefaults(defineProps<{
	cards: SummaryCard[];
	columns?: string;
	compact?: boolean;
}>(), {
	columns: "grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
	compact: false,
});

defineEmits<{ action: [key: string] }>();
</script>

<template>
	<div class="grid min-w-0 gap-2 [&>*]:min-w-0 sm:gap-3" :class="columns">
		<div
			v-for="card in cards"
			:key="card.key"
			class="min-w-0 rounded-md border bg-white shadow-sm"
			:class="[card.tone === 'amber' ? 'border-amber-200' : 'border-stone-200', compact ? 'px-3.5 py-3' : 'p-3.5']"
		>
			<div class="flex min-w-0 items-start justify-between gap-2">
				<p class="min-w-0 truncate text-xs font-semibold" :class="card.tone === 'amber' ? 'text-amber-700' : 'text-stone-500'">{{ card.label }}</p>
				<span
					v-if="card.badge"
					class="shrink-0 rounded-full bg-sky-50 px-1.5 py-0.5 text-[9px] font-medium text-sky-700"
					:title="card.badgeTitle"
				>{{ card.badge }}</span>
				<span
					v-else-if="card.delta"
					class="shrink-0 rounded-full bg-stone-50 px-2 py-0.5 text-[10px]"
					:class="card.delta.positive ? 'text-emerald-700' : 'text-rose-700'"
				>{{ card.delta.text }}</span>
			</div>
			<p
				class="mt-1.5 truncate font-semibold"
				:class="[card.tone === 'amber' ? 'text-amber-900' : 'text-stone-950', compact ? 'text-base tabular-nums' : 'text-lg sm:text-xl']"
			>{{ card.value }}</p>
			<p v-if="card.note" class="mt-1 text-xs leading-4" :class="card.tone === 'amber' ? 'text-amber-700' : 'text-stone-500'">{{ card.note }}</p>
			<p v-else-if="card.hint" class="mt-1 text-xs leading-4 text-stone-400">{{ card.hint }}</p>
			<AppButton
				v-if="card.actionLabel"
				class="mt-2"
				size="xs"
				color="primary"
				variant="soft"
				:label="card.actionLabel"
				:disabled="card.actionDisabled"
				@click="$emit('action', card.key)"
			/>
		</div>
	</div>
</template>
