<script setup lang="ts">
type BreadcrumbItem = {
	label: string;
	to?: string;
};

defineProps<{
	items: BreadcrumbItem[];
}>();
</script>

<template>
	<nav aria-label="Breadcrumb" class="min-w-0">
		<ol class="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] font-medium text-stone-400 sm:text-xs">
			<li
				v-for="(item, index) in items"
				:key="`${item.label}-${index}`"
				class="flex min-w-0 items-center gap-1.5"
			>
				<UIcon
					v-if="index > 0"
					name="i-heroicons-chevron-right-20-solid"
					class="h-3.5 w-3.5 shrink-0 text-stone-300"
				/>
				<NuxtLink
					v-if="item.to"
					:to="item.to"
					class="truncate transition hover:text-primary-700"
				>
					{{ item.label }}
				</NuxtLink>
				<span v-else class="truncate text-stone-500">
					{{ item.label }}
				</span>
			</li>
		</ol>
	</nav>
</template>
