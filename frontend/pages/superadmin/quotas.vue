<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type QuotaRecord = {
	id: string;
	email: string;
	name: string;
	system_role: string;
	status: "active" | "suspended";
	can_create_stores: number;
	max_stores: number | null;
	can_create_branches: number;
	max_branches_per_store: number | null;
	owned_stores_count: number;
	remaining_store_capacity: number | null;
	created_at: string;
};

type QuotaListResponse = {
	items: QuotaRecord[];
	page: number;
	limit: number;
	total: number;
	has_more: boolean;
	summary: {
		accounts_total: number;
		store_quota_enabled: number;
		branch_quota_enabled: number;
		limited_store_capacity_total: number;
		remaining_store_capacity_total: number;
		unlimited_store_accounts: number;
		unlimited_branch_accounts: number;
		attention_accounts: number;
		stores_total: number;
	};
	warnings: string[];
};

const { apiFetch } = useApiClient();

const searchQuery = ref("");
const activeMode = ref<"all" | "store-enabled" | "limited" | "unlimited" | "attention">("all");
const pending = ref(true);
const error = ref<string | null>(null);
const quotas = ref<QuotaRecord[]>([]);
const currentPage = ref(1);
const pageSize = ref(20);
const pageSizeOptions = [ 10, 20, 50 ];
const totalItems = ref(0);
const summary = ref<QuotaListResponse["summary"]>({
	accounts_total: 0,
	store_quota_enabled: 0,
	branch_quota_enabled: 0,
	limited_store_capacity_total: 0,
	remaining_store_capacity_total: 0,
	unlimited_store_accounts: 0,
	unlimited_branch_accounts: 0,
	attention_accounts: 0,
	stores_total: 0,
});
const warnings = ref<string[]>([]);
const listScrollRef = ref<HTMLElement | null>(null);

const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / pageSize.value)));
const pageLabel = computed(() => `หน้า ${currentPage.value} / ${totalPages.value}`);
const pageStart = computed(() => (
	totalItems.value === 0
		? 0
		: ((currentPage.value - 1) * pageSize.value) + 1
));
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, totalItems.value));
const pageSummaryText = computed(() => (
	totalItems.value === 0
		? "ยังไม่มีข้อมูล"
		: `${pageStart.value}-${pageEnd.value} จาก ${totalItems.value} บัญชี`
));

const overviewStats = computed(() => ([
	{ label: "Store quota enabled", value: summary.value.store_quota_enabled, note: "บัญชีที่เริ่มสร้างร้านได้" },
	{ label: "Stores used", value: summary.value.stores_total, note: "ร้านใน scope ของ superadmin นี้" },
	{ label: "Remaining limited", value: summary.value.remaining_store_capacity_total, note: "capacity ที่ยังเหลือจากบัญชีแบบจำกัด" },
	{ label: "Attention", value: summary.value.attention_accounts, note: "บัญชีที่ใช้ quota เต็มหรือเกินแล้ว" },
	{ label: "Unlimited stores", value: summary.value.unlimited_store_accounts, note: "บัญชีที่ไม่มีเพดานจำนวนร้าน" },
	{ label: "Branch enabled", value: summary.value.branch_quota_enabled, note: "บัญชีที่เพิ่มสาขาได้" },
	{ label: "Unlimited branches", value: summary.value.unlimited_branch_accounts, note: "บัญชีที่ไม่จำกัดสาขาต่อร้าน" },
	{ label: "Limited capacity", value: summary.value.limited_store_capacity_total, note: "โควต้าร้านรวมแบบจำกัดทั้งหมด" },
]));

function resolveApiErrorMessage(errorValue: unknown, fallback = "โหลด quota ไม่สำเร็จ") {
	if (typeof errorValue === "object" && errorValue) {
		const response = Reflect.get(errorValue, "response");
		if (typeof response === "object" && response) {
			const data = Reflect.get(response, "_data") || Reflect.get(response, "data");
			if (typeof data === "object" && data) {
				const message = Reflect.get(data, "message");
				if (typeof message === "string" && message.trim()) {
					return message;
				}
			}
		}
	}

	if (errorValue instanceof Error && errorValue.message.trim()) {
		return errorValue.message;
	}

	return fallback;
}

function formatDateTime(value: string) {
	return new Intl.DateTimeFormat("th-TH", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function roleLabel(role: string) {
	return role || "staff";
}

function statusTone(status: QuotaRecord["status"]) {
	return status === "active" ? "success" : "warning";
}

function statusLabel(status: QuotaRecord["status"]) {
	return status === "active" ? "ใช้งาน" : "ระงับ";
}

function storeQuotaLabel(item: QuotaRecord) {
	if (!item.can_create_stores) return "ปิดสิทธิ์";
	if (item.max_stores === null) return "ไม่จำกัด";
	return `${item.max_stores} ร้าน`;
}

function branchQuotaLabel(item: QuotaRecord) {
	if (!item.can_create_branches || !item.can_create_stores) return "ปิดสิทธิ์";
	if (item.max_branches_per_store === null) return "ไม่จำกัด";
	return `${item.max_branches_per_store} สาขา/ร้าน`;
}

function remainingCapacityLabel(item: QuotaRecord) {
	if (!item.can_create_stores) return "ปิดสิทธิ์";
	if (item.remaining_store_capacity === null) return "ไม่จำกัด";
	return `${item.remaining_store_capacity} ร้าน`;
}

function rowToneClass(item: QuotaRecord) {
	if (item.can_create_stores && item.max_stores !== null && item.owned_stores_count >= item.max_stores) {
		return "bg-amber-50";
	}
	return "";
}

function scrollListToTop() {
	listScrollRef.value?.scrollTo({
		top: 0,
		behavior: "auto",
	});
}

function resetListPage() {
	currentPage.value = 1;
}

async function loadQuotas() {
	pending.value = true;
	error.value = null;
	try {
		const query = new URLSearchParams({
			page: String(currentPage.value),
			limit: String(pageSize.value),
		});
		if (searchQuery.value.trim()) query.set("search", searchQuery.value.trim());
		if (activeMode.value !== "all") query.set("mode", activeMode.value);

		const response = await apiFetch<ApiEnvelope<QuotaListResponse>>(`/superadmin/quotas?${query.toString()}`);
		quotas.value = response.data.items;
		totalItems.value = response.data.total;
		summary.value = response.data.summary;
		warnings.value = response.data.warnings;
		scrollListToTop();
	} catch (err) {
		error.value = resolveApiErrorMessage(err);
	} finally {
		pending.value = false;
	}
}

function applyFilters() {
	resetListPage();
	return loadQuotas();
}

function goToPage(nextPage: number) {
	const normalizedPage = Math.min(Math.max(1, nextPage), totalPages.value);
	if (normalizedPage === currentPage.value) return;
	currentPage.value = normalizedPage;
	return loadQuotas();
}

function updatePageSize(nextPageSize: number | string) {
	const normalizedSize = Number(nextPageSize);
	if (!Number.isFinite(normalizedSize) || normalizedSize <= 0 || normalizedSize === pageSize.value) return;
	pageSize.value = normalizedSize;
	resetListPage();
	return loadQuotas();
}

onMounted(async () => {
	await loadQuotas();
});
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['superadmin']"
		sidebar-eyebrow="Superadmin"
		sidebar-title="Superadmin"
		sidebar-compact-title="SUP"
		sidebar-description="quota ของบัญชี ร้าน และการขยายร้าน ภายใต้ superadmin นี้เท่านั้น"
	>
		<template #default="{ openSidebar }">
			<div class="grid min-h-[calc(100dvh-4.25rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 lg:h-full lg:min-h-0">
				<AppPageHeader
					title="Quotas"
					description="ดูข้อจำกัดการสร้างร้านและสาขาของบัญชีใน scope ของ superadmin นี้ โดยไม่แตะ quota กลางของทั้งระบบ"
					:tablet-layout="true"
					@menu="openSidebar"
				>
					<template #actions>
						<div class="ml-auto flex w-full flex-wrap justify-end gap-2 md:w-auto">
							<AppButton
								color="neutral"
								variant="soft"
								size="md"
								icon="i-heroicons-arrow-path-20-solid"
								:loading="pending"
								:disabled="pending"
								:spin-icon-on-loading="true"
								@click="loadQuotas"
							>
								รีโหลด
							</AppButton>
						</div>
					</template>
				</AppPageHeader>

				<div class="grid min-h-0 grid-rows-[minmax(0,1fr)] gap-3">
					<div class="min-h-0 overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">Superadmin quotas</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">มุมมอง quota แบบ owner scope เพื่อดู capacity จริงและ account ที่ใกล้ชน limit</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									{{ pageSummaryText }}
								</div>
							</div>

							<div class="border-b border-[#ece6dc] px-4 py-3">
								<div class="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
									<div class="relative">
										<UIcon name="i-heroicons-magnifying-glass-20-solid" class="pointer-events-none absolute top-1/2 left-3.5 h-4.5 w-4.5 -translate-y-1/2 text-stone-400" />
										<input
											v-model="searchQuery"
											type="search"
											placeholder="ค้นหาชื่อหรืออีเมล"
											class="w-full rounded-md border border-neutral-200 bg-white py-2.5 pl-10 pr-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
											@keydown.enter="applyFilters"
										>
									</div>
									<select v-model="activeMode" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
										<option value="all">ทุก quota</option>
										<option value="store-enabled">สร้างร้านได้</option>
										<option value="limited">แบบจำกัด</option>
										<option value="unlimited">ไม่จำกัด</option>
										<option value="attention">ชน limit</option>
									</select>
									<AppButton color="primary" variant="soft" size="md" class="sm:self-stretch" @click="applyFilters">
										ใช้ตัวกรอง
									</AppButton>
								</div>
							</div>

							<div ref="listScrollRef" class="scrollbar-soft min-h-0 flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
								<div v-if="pending" class="min-h-[280px]">
									<AppInlineLoadingBar container-class="bg-neutral-100" />
								</div>
								<div v-else-if="error" class="p-5 text-center text-sm text-error">{{ error }}</div>
								<div v-else>
									<div class="grid gap-3 border-b border-[#f1ede6] p-4 md:grid-cols-2 xl:grid-cols-4">
										<div
											v-for="stat in overviewStats"
											:key="stat.label"
											class="rounded-md border border-[#ece6dc] bg-neutral-50 px-4 py-3.5"
										>
											<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">{{ stat.label }}</p>
											<p class="mt-2 text-2xl font-semibold text-stone-950">{{ stat.value }}</p>
											<p class="mt-1 text-xs leading-5 text-stone-500">{{ stat.note }}</p>
										</div>
									</div>

									<div v-if="warnings.length" class="grid gap-2 border-b border-[#f1ede6] p-4">
										<div
											v-for="warning in warnings"
											:key="warning"
											class="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"
										>
											{{ warning }}
										</div>
									</div>

									<div v-if="!quotas.length" class="p-5 text-center text-sm text-stone-500">
										ยังไม่มีข้อมูล quota ใน scope นี้
									</div>

									<template v-else>
										<button
											v-for="item in quotas"
											:key="item.id"
											type="button"
											class="w-full border-b border-[#f1ede6] px-4 py-3 text-left transition hover:bg-primary-50"
											:class="rowToneClass(item)"
										>
											<div class="flex items-start justify-between gap-3">
												<div class="min-w-0">
													<div class="flex flex-wrap items-center gap-2">
														<p class="truncate text-sm font-semibold text-stone-900">{{ item.name }}</p>
														<UBadge :color="statusTone(item.status)" variant="soft" :label="statusLabel(item.status)" />
													</div>
													<p class="mt-1 truncate text-xs text-stone-500">{{ item.email }}</p>
													<p class="mt-2 text-xs text-stone-500">{{ roleLabel(item.system_role) }} · สร้างเมื่อ {{ formatDateTime(item.created_at) }}</p>
												</div>
												<div class="shrink-0 rounded-md bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-stone-600">
													ใช้ไป {{ item.owned_stores_count }} ร้าน
												</div>
											</div>

											<div class="mt-3 grid gap-2 sm:grid-cols-3">
												<div class="rounded-md bg-neutral-50 px-3 py-2.5">
													<p class="text-[11px] uppercase tracking-[0.14em] text-stone-400">Store quota</p>
													<p class="mt-1 text-sm font-semibold text-stone-900">{{ storeQuotaLabel(item) }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-2.5">
													<p class="text-[11px] uppercase tracking-[0.14em] text-stone-400">Remaining</p>
													<p class="mt-1 text-sm font-semibold text-stone-900">{{ remainingCapacityLabel(item) }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-2.5">
													<p class="text-[11px] uppercase tracking-[0.14em] text-stone-400">Branch quota</p>
													<p class="mt-1 text-sm font-semibold text-stone-900">{{ branchQuotaLabel(item) }}</p>
												</div>
											</div>
										</button>
									</template>
								</div>
							</div>

							<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.96)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
								<div class="flex flex-col gap-2.5 sm:gap-3 md:flex-row md:items-center md:justify-between">
									<div class="flex items-center justify-between gap-3 md:min-w-0 md:flex-1">
										<div class="min-w-0 text-xs text-stone-500 sm:text-sm">
											<span class="sm:hidden">{{ pageSummaryText }}</span>
											<span class="hidden sm:inline">{{ pageLabel }} • {{ pageSummaryText }}</span>
										</div>
										<div class="shrink-0 rounded-md bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-stone-600 sm:hidden">
											{{ pageLabel }}
										</div>
									</div>

									<div class="flex items-center justify-between gap-2 sm:flex-wrap sm:justify-end md:flex-nowrap md:justify-end">
										<div class="flex items-center gap-2">
											<label class="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">ต่อหน้า</label>
											<select
												:value="pageSize"
												class="min-w-[68px] rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-sm text-stone-700 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
												@change="updatePageSize(($event.target as HTMLSelectElement).value)"
											>
												<option v-for="option in pageSizeOptions" :key="option" :value="option">
													{{ option }}
												</option>
											</select>
										</div>

										<div class="flex items-center gap-2">
											<AppButton
												color="neutral"
												variant="soft"
												size="md"
												class="rounded-md"
												icon="i-heroicons-chevron-left-20-solid"
												:disabled="currentPage <= 1 || pending"
												aria-label="หน้าก่อนหน้า"
												title="หน้าก่อนหน้า"
												@click="goToPage(currentPage - 1)"
											>
												<span class="hidden sm:inline">ก่อนหน้า</span>
											</AppButton>
											<AppButton
												color="neutral"
												variant="soft"
												size="md"
												class="rounded-md"
												trailing-icon="i-heroicons-chevron-right-20-solid"
												:disabled="currentPage >= totalPages || pending"
												aria-label="หน้าถัดไป"
												title="หน้าถัดไป"
												@click="goToPage(currentPage + 1)"
											>
												<span class="hidden sm:inline">ถัดไป</span>
											</AppButton>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</template>
	</AppSidebarShell>
</template>
