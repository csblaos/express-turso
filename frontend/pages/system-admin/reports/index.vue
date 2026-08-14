<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";
import { formatAppDateTime } from "~/utils/date-format";

type StoreReportRow = {
	id: string; name: string; store_type: string; currency: string; business_day_start_minutes: number;
	period: { from: string; to: string };
	summary: { revenue: number; gross_profit: number; bill_count: number; average_bill: number; known_cost: number; cost_coverage_percent: number };
	stock: { inventory_value: number; low_count: number; out_count: number; negative_count: number };
};
type Response = { data: { generated_at: string; items: StoreReportRow[] } };

const { apiFetch } = useApiClient();
const preset = ref("today");
const dateFrom = ref("");
const dateTo = ref("");
const loading = ref(true);
const refreshing = ref(false);
const error = ref("");
const report = ref<Response["data"] | null>(null);

const presets = [
	{ id: "today", label: "ມື້ນີ້" }, { id: "yesterday", label: "ມື້ວານ" },
	{ id: "this_week", label: "ອາທິດນີ້" }, { id: "last_week", label: "ອາທິດກ່ອນ" },
	{ id: "this_month", label: "ເດືອນນີ້" }, { id: "last_month", label: "ເດືອນກ່ອນ" }, { id: "custom", label: "ກຳນົດເອງ" },
];

function query() {
	const params = new URLSearchParams({ preset: preset.value, timezone_offset: "420" });
	if (preset.value === "custom") { params.set("date_from", dateFrom.value); params.set("date_to", dateTo.value); }
	return params.toString();
}
function money(value: number, currency: string) {
	const normalizedCurrency = currency || "LAK";
	const formatted = new Intl.NumberFormat("lo-LA", { maximumFractionDigits: 0 }).format(value || 0);
	return normalizedCurrency === "LAK" ? `${formatted}₭` : new Intl.NumberFormat("lo-LA", { style: "currency", currency: normalizedCurrency, maximumFractionDigits: 0 }).format(value || 0);
}
function number(value: number) { return new Intl.NumberFormat("lo-LA").format(value || 0); }
function formatRange(row: StoreReportRow) {
	const format = (value: string) => formatAppDateTime(value, "lo");
	return `${format(row.period.from)} – ${format(new Date(new Date(row.period.to).getTime() - 1).toISOString())}`;
}
function startTime(minutes: number) {
	return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
async function load(options?: { refresh?: boolean }) {
	if (preset.value === "custom" && (!dateFrom.value || !dateTo.value)) return;
	if (options?.refresh) refreshing.value = true; else loading.value = true;
	error.value = "";
	try { report.value = (await apiFetch<Response>(`/system-admin/reports?${query()}`)).data; }
	catch (cause) { error.value = resolveApiErrorMessage(cause, "ໂຫຼດລາຍງານຮ້ານບໍ່ສຳເລັດ"); }
	finally { loading.value = false; refreshing.value = false; }
}
function selectPreset(id: string) { preset.value = id; if (id !== "custom") void load(); }
onMounted(() => void load());
</script>

<template>
	<AppSidebarShell :nav-items="appNavItems" :active-ids="['system-reports']" sidebar-eyebrow="ລະບົບ" sidebar-title="ຜູ້ດູແລລະບົບ" sidebar-compact-title="SYS" sidebar-description="ລາຍງານຂ້າມຮ້ານສຳລັບກວດຍອດຂາຍ, ຕົ້ນທຶນ ແລະ ສະຕັອກ">
		<template #default="{ openSidebar }">
			<div class="min-w-0 space-y-3 pb-6">
				<AppPageHeader title="ລາຍງານຮ້ານ" description="ເບິ່ງຜົນງານແຕ່ລະຮ້ານຈາກໜ້າຜູ້ດູແລລະບົບ ໂດຍບໍ່ເຂົ້າ workspace ຂອງຮ້ານ" :title-badge="false" compact body-class="px-3 py-2.5 sm:px-4 sm:py-3" :tablet-layout="true" @menu="openSidebar">
					<template #actions><AppButton color="neutral" variant="soft" icon="i-heroicons-arrow-path-20-solid" :loading="refreshing" :spin-icon-on-loading="true" @click="load({ refresh: true })">ໂຫຼດໃໝ່</AppButton></template>
				</AppPageHeader>

				<section class="rounded-md border border-neutral-200 bg-white p-4 shadow-sm">
					<div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
						<div class="min-w-0"><h1 class="text-base font-semibold text-stone-950">ຊ່ວງລາຍງານ</h1><p class="mt-1 text-sm text-stone-500">ແຕ່ລະຮ້ານຄິດໄລ່ຕາມເວລາປິດຮອບຂອງຕົນເອງ</p></div>
						<div class="flex max-w-full flex-wrap gap-2 xl:max-w-[44rem] xl:justify-end">
							<AppButton v-for="item in presets" :key="item.id" size="sm" :color="preset === item.id ? 'primary' : 'neutral'" :variant="preset === item.id ? 'solid' : 'soft'" @click="selectPreset(item.id)">{{ item.label }}</AppButton>
						</div>
					</div>
					<div v-if="preset === 'custom'" class="mt-4 flex flex-col gap-3 border-t border-neutral-100 pt-4 lg:flex-row lg:items-end lg:justify-end"><AppDateRangePicker v-model:from="dateFrom" v-model:to="dateTo" :from-label="'ຈາກວັນທີ'" :to-label="'ເຖິງວັນທີ'" :select-label="'ເລືອກວັນທີ'" /><AppButton color="primary" @click="load()">ນຳໃຊ້</AppButton></div>
				</section>

				<div v-if="loading" class="min-h-[280px] rounded-md border border-neutral-200 bg-white"><AppInlineLoadingBar container-class="bg-neutral-100" /></div>
				<div v-else-if="error" class="rounded-md border border-rose-200 bg-rose-50 p-5 text-center text-sm text-rose-700">{{ error }}</div>
				<section v-else class="overflow-hidden rounded-md border border-neutral-200 bg-white shadow-sm">
					<div class="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3"><div><h2 class="font-semibold text-stone-950">ລາຍຊື່ຮ້ານ</h2><p class="mt-1 text-xs text-stone-500">ຄລິກແຖວເພື່ອເບິ່ງລາຍງານລະອຽດຂອງຮ້ານ</p></div><span class="rounded-md bg-neutral-100 px-2.5 py-1 text-xs text-stone-500">{{ number(report?.items.length || 0) }} ຮ້ານ</span></div>
					<div class="overflow-x-auto"><table class="min-w-[1120px] w-full text-sm"><thead class="bg-neutral-50 text-left text-xs text-stone-500"><tr><th class="p-3">ຮ້ານ</th><th class="p-3 text-right">ຍອດຂາຍສຸດທິ</th><th class="p-3 text-right">ຕົ້ນທຶນທີ່ຮູ້</th><th class="p-3 text-right">ກຳໄລຂັ້ນຕົ້ນ</th><th class="p-3 text-right">ບິນ</th><th class="p-3 text-right">ມູນຄ່າສະຕັອກ</th><th class="p-3">ສະຕັອກທີ່ຄວນກວດ</th><th class="p-3"></th></tr></thead><tbody><tr v-for="store in report?.items" :key="store.id" class="border-t border-neutral-100 hover:bg-primary-50/40"><td class="p-3"><p class="font-semibold text-stone-900">{{ store.name }}</p><p class="mt-1 text-xs text-stone-500">ຮອບວັນເລີ່ມ {{ startTime(store.business_day_start_minutes) }} · {{ formatRange(store) }}</p></td><td class="p-3 text-right font-semibold">{{ money(store.summary.revenue, store.currency) }}</td><td class="p-3 text-right">{{ money(store.summary.known_cost, store.currency) }}</td><td class="p-3 text-right text-emerald-700">{{ money(store.summary.gross_profit, store.currency) }}<p class="mt-1 text-xs text-stone-400">ຕົ້ນທຶນຄົບ {{ store.summary.cost_coverage_percent.toFixed(1) }}%</p></td><td class="p-3 text-right">{{ number(store.summary.bill_count) }}</td><td class="p-3 text-right">{{ money(store.stock.inventory_value, store.currency) }}</td><td class="p-3"><span v-if="store.stock.low_count + store.stock.out_count + store.stock.negative_count === 0" class="text-emerald-700">ປົກກະຕິ</span><span v-else class="text-amber-700">ຕ່ຳ {{ store.stock.low_count }} · ໝົດ {{ store.stock.out_count }} · ຕິດລົບ {{ store.stock.negative_count }}</span></td><td class="p-3 text-right"><NuxtLink :to="{ path: `/system-admin/reports/${store.id}`, query: { preset, date_from: preset === 'custom' ? dateFrom : undefined, date_to: preset === 'custom' ? dateTo : undefined } }"><AppButton size="sm" color="primary" variant="soft">ເບິ່ງລາຍງານ</AppButton></NuxtLink></td></tr></tbody></table></div>
					<div v-if="!report?.items.length" class="p-10 text-center text-sm text-stone-500">ຍັງບໍ່ມີຮ້ານໃນລະບົບ</div>
				</section>
			</div>
		</template>
	</AppSidebarShell>
</template>
