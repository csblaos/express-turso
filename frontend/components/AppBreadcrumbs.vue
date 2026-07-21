<script setup lang="ts">
type BreadcrumbItem = {
	label: string;
	to?: string;
};

defineProps<{
	items: BreadcrumbItem[];
}>();

const { t } = useI18n();
const breadcrumbKeys: Record<string, string> = {
	"ขายหน้าร้าน": "nav.pos", "สินค้า": "nav.products", "ออเดอร์": "nav.orders", "สต็อก": "nav.inventory",
	"สั่งซื้อ": "nav.purchaseOrders", "รายงาน": "nav.reports", "กิจกรรม": "nav.activity", Settings: "nav.settings",
	Superadmin: "nav.superadmin", Dashboard: "nav.dashboard", Clients: "nav.clients", "System Policy": "nav.policy",
	Monitoring: "nav.monitoring", Security: "nav.security", "Third-party Usage": "nav.thirdParty",
};
const breadcrumbLabel = (label: string) => breadcrumbKeys[label] ? t(breadcrumbKeys[label]) : label;
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
					{{ breadcrumbLabel(item.label) }}
				</NuxtLink>
				<span v-else class="truncate text-stone-500">
					{{ breadcrumbLabel(item.label) }}
				</span>
			</li>
		</ol>
	</nav>
</template>
