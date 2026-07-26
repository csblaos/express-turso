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
	"ขายหน้าร้าน": "breadcrumbs.pos",
	"สินค้า": "breadcrumbs.products",
	"ออเดอร์": "breadcrumbs.orders",
	"สต็อก": "breadcrumbs.inventory",
	"ประวัติสต็อก": "breadcrumbs.inventoryHistory",
	"สั่งซื้อ": "breadcrumbs.purchaseOrders",
	"รายงาน": "breadcrumbs.reports",
	"กิจกรรม": "breadcrumbs.activity",
	"ตั้งค่า": "breadcrumbs.settings",
	Profile: "breadcrumbs.profile",
	Settings: "breadcrumbs.settings",
	Users: "breadcrumbs.users",
	Categories: "breadcrumbs.categories",
	Units: "breadcrumbs.units",
	Language: "breadcrumbs.language",
	Roles: "breadcrumbs.roles",
	Stock: "breadcrumbs.stockPolicy",
	"Store Finance": "breadcrumbs.storeFinance",
	Rates: "breadcrumbs.rates",
	"Store Payments": "breadcrumbs.storePayments",
	Printing: "breadcrumbs.printing",
	"Sales Receipt": "breadcrumbs.salesReceipt",
	"Super Admin": "breadcrumbs.superadmin",
	Overview: "breadcrumbs.overview",
	"Global Config": "breadcrumbs.globalConfig",
	Stores: "breadcrumbs.stores",
	"Role Settings": "breadcrumbs.roleSettings",
	Security: "breadcrumbs.security",
	Quotas: "breadcrumbs.quotas",
	"Branch Config": "breadcrumbs.branchConfig",
	Integrations: "breadcrumbs.integrations",
	"System Admin": "breadcrumbs.systemAdmin",
	Dashboard: "breadcrumbs.dashboard",
	Clients: "breadcrumbs.clients",
	"System Policy": "breadcrumbs.systemPolicy",
	Monitoring: "breadcrumbs.monitoring",
	"Third-party Usage": "breadcrumbs.thirdPartyUsage",
	Config: "breadcrumbs.config",
	System: "breadcrumbs.system",
	Access: "breadcrumbs.access",
};
const breadcrumbLabel = (label: string) => breadcrumbKeys[label] ? t(breadcrumbKeys[label]) : label;
</script>

<template>
	<nav :aria-label="t('breadcrumbs.ariaLabel')" class="min-w-0">
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
