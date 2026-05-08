<script setup lang="ts">
const route = useRoute();

const items = [
	{
		id: "users",
		label: "ผู้ใช้งาน",
		to: "/settings/users",
		icon: "i-heroicons-users",
	},
	{
		id: "roles",
		label: "บทบาท",
		to: "/settings/roles",
		icon: "i-heroicons-identification",
	},
];

function isActive(path: string) {
	return route.path === path;
}
</script>

<template>
	<div class="flex flex-wrap items-center gap-2">
		<NuxtLink
			v-for="item in items"
			:key="item.id"
			:to="item.to"
			class="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition"
			:class="isActive(item.to)
				? 'border-primary-200 bg-primary-50 text-primary-700 shadow-sm'
				: 'border-neutral-200 bg-white text-stone-600 hover:border-neutral-300 hover:bg-neutral-50'"
		>
			<UIcon :name="item.icon" class="h-4 w-4" />
			<span>{{ item.label }}</span>
		</NuxtLink>
	</div>
</template>
