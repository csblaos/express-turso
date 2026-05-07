<script setup lang="ts">
const route = useRoute();

const items = [
	{
		id: "users",
		label: "ผู้ใช้งาน",
		to: "/settings/access/users",
		icon: "i-heroicons-users",
	},
	{
		id: "roles",
		label: "บทบาท",
		to: "/settings/access/roles",
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
			class="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition"
			:class="isActive(item.to)
				? 'border-[#e8cdb8] bg-[#fbf1ea] text-[#97532c] shadow-sm'
				: 'border-[#e7e4dd] bg-white text-stone-600 hover:border-[#d9d5cd] hover:bg-[#faf8f4]'"
		>
			<UIcon :name="item.icon" class="h-4 w-4" />
			<span>{{ item.label }}</span>
		</NuxtLink>
	</div>
</template>
