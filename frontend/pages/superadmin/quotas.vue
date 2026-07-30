<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { formatAppDateTime } from "~/utils/date-format";

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
const { locale } = useI18n();

const copy = computed(() => locale.value === "lo" ? {
	description: "ຈັດການໂຄຕາບັນຊີ ຮ້ານ ແລະ ການຂະຫຍາຍຮ້ານພາຍໃຕ້ Super Admin ນີ້", reload: "ໂຫຼດໃໝ່", title: "ໂຄຕາ Super Admin", hint: "ເບິ່ງຄວາມຈຸຈິງ ແລະ ບັນຊີທີ່ໃກ້ຮອດຂີດຈຳກັດ", search: "ຄົ້ນຫາຊື່ ຫຼື ອີເມວ", all: "ໂຄຕາທັງໝົດ", storeEnabled: "ສ້າງຮ້ານໄດ້", limited: "ຈຳກັດ", unlimited: "ບໍ່ຈຳກັດ", attention: "ໃກ້ຮອດຂີດຈຳກັດ", apply: "ໃຊ້ຕົວກອງ", noData: "ຍັງບໍ່ມີຂໍ້ມູນ", accounts: "ບັນຊີ", noQuota: "ບໍ່ມີຂໍ້ມູນໂຄຕາໃນຂອບເຂດນີ້", active: "ໃຊ້ງານ", suspended: "ລະງັບ", disabled: "ປິດສິດ", stores: "ຮ້ານ", branchesPerStore: "ສາຂາ/ຮ້ານ", createdAt: "ສ້າງເມື່ອ", used: "ໃຊ້ໄປ", storeQuota: "ໂຄຕາຮ້ານ", remaining: "ເຫຼືອ", branchQuota: "ໂຄຕາສາຂາ", perPage: "ຕໍ່ໜ້າ", previous: "ກ່ອນໜ້າ", next: "ໜ້າຖັດໄປ", page: "ໜ້າ", of: "ຈາກ", staff: "ພະນັກງານ",
	stats: [["ເປີດໂຄຕາຮ້ານ", "ບັນຊີທີ່ເລີ່ມສ້າງຮ້ານໄດ້"], ["ໃຊ້ຮ້ານແລ້ວ", "ຮ້ານໃນຂອບເຂດ Super Admin ນີ້"], ["ເຫຼືອແບບຈຳກັດ", "ຄວາມຈຸທີ່ເຫຼືອຂອງບັນຊີແບບຈຳກັດ"], ["ຕ້ອງກວດເບິ່ງ", "ບັນຊີທີ່ໃຊ້ໂຄຕາເຕັມ ຫຼື ເກີນ"], ["ຮ້ານບໍ່ຈຳກັດ", "ບັນຊີທີ່ບໍ່ມີເພດານຈຳນວນຮ້ານ"], ["ເປີດສາຂາໄດ້", "ບັນຊີທີ່ເພີ່ມສາຂາໄດ້"], ["ສາຂາບໍ່ຈຳກັດ", "ບັນຊີທີ່ບໍ່ຈຳກັດສາຂາຕໍ່ຮ້ານ"], ["ຄວາມຈຸຈຳກັດ", "ໂຄຕາຮ້ານແບບຈຳກັດລວມທັງໝົດ"]]
} : locale.value === "en" ? {
	description: "Manage account, store, and expansion quotas within this Super Admin scope.", reload: "Reload", title: "Super Admin quotas", hint: "Review real capacity and accounts close to their limit.", search: "Search name or email", all: "All quotas", storeEnabled: "Can create stores", limited: "Limited", unlimited: "Unlimited", attention: "At limit", apply: "Apply filter", noData: "No data yet", accounts: "accounts", noQuota: "No quota data in this scope", active: "Active", suspended: "Suspended", disabled: "Disabled", stores: "stores", branchesPerStore: "branches/store", createdAt: "Created", used: "Used", storeQuota: "Store quota", remaining: "Remaining", branchQuota: "Branch quota", perPage: "Per page", previous: "Previous", next: "Next", page: "Page", of: "of", staff: "Staff",
	stats: [["Store quota enabled", "Accounts that can create stores"], ["Stores used", "Stores in this Super Admin scope"], ["Remaining limited", "Remaining capacity from limited accounts"], ["Attention", "Accounts at or over quota"], ["Unlimited stores", "Accounts without a store limit"], ["Branch enabled", "Accounts that can add branches"], ["Unlimited branches", "Accounts without a branch-per-store limit"], ["Limited capacity", "Total limited store capacity"]]
} : {
	description: "จัดการ quota ของบัญชี ร้าน และการขยายร้าน ภายใต้ Super Admin นี้", reload: "รีโหลด", title: "Super Admin quotas", hint: "มุมมอง quota เพื่อดู capacity จริงและบัญชีที่ใกล้ชน limit", search: "ค้นหาชื่อหรืออีเมล", all: "ทุก quota", storeEnabled: "สร้างร้านได้", limited: "แบบจำกัด", unlimited: "ไม่จำกัด", attention: "ชน limit", apply: "ใช้ตัวกรอง", noData: "ยังไม่มีข้อมูล", accounts: "บัญชี", noQuota: "ยังไม่มีข้อมูล quota ใน scope นี้", active: "ใช้งาน", suspended: "ระงับ", disabled: "ปิดสิทธิ์", stores: "ร้าน", branchesPerStore: "สาขา/ร้าน", createdAt: "สร้างเมื่อ", used: "ใช้ไป", storeQuota: "Store quota", remaining: "Remaining", branchQuota: "Branch quota", perPage: "ต่อหน้า", previous: "ก่อนหน้า", next: "ถัดไป", page: "หน้า", of: "จาก", staff: "พนักงาน",
	stats: [["Store quota enabled", "บัญชีที่เริ่มสร้างร้านได้"], ["Stores used", "ร้านใน scope ของ Super Admin นี้"], ["Remaining limited", "capacity ที่ยังเหลือจากบัญชีแบบจำกัด"], ["Attention", "บัญชีที่ใช้ quota เต็มหรือเกินแล้ว"], ["Unlimited stores", "บัญชีที่ไม่มีเพดานจำนวนร้าน"], ["Branch enabled", "บัญชีที่เพิ่มสาขาได้"], ["Unlimited branches", "บัญชีที่ไม่จำกัดสาขาต่อร้าน"], ["Limited capacity", "โควต้าร้านรวมแบบจำกัดทั้งหมด"]]
});

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
const listScrollRef = ref<HTMLElement | null>(null);

const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / pageSize.value)));
const pageLabel = computed(() => `${copy.value.page} ${currentPage.value} / ${totalPages.value}`);
const pageStart = computed(() => (
	totalItems.value === 0
		? 0
		: ((currentPage.value - 1) * pageSize.value) + 1
));
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, totalItems.value));
const pageSummaryText = computed(() => (
	totalItems.value === 0
		? copy.value.noData
		: `${pageStart.value}-${pageEnd.value} ${copy.value.of} ${totalItems.value} ${copy.value.accounts}`
));

const overviewStats = computed(() => {
	if (locale.value === "lo") {
		return [
			{ label: "ບັນຊີທັງໝົດ", value: summary.value.accounts_total, note: "ບັນຊີຜູ້ໃຊ້ໃນລະບົບ" },
			{ label: "ຮ້ານທີ່ສ້າງແລ້ວ", value: summary.value.stores_total, note: "ຈຳນວນຮ້ານທັງໝົດ" },
			{ label: "ຍັງສ້າງໄດ້", value: summary.value.remaining_store_capacity_total, note: "ຈຳນວນຮ້ານທີ່ຍັງສາມາດສ້າງເພີ່ມ" },
		];
	}
	if (locale.value === "th") {
		return [
			{ label: "บัญชีทั้งหมด", value: summary.value.accounts_total, note: "บัญชีผู้ใช้ในระบบ" },
			{ label: "ร้านที่สร้างแล้ว", value: summary.value.stores_total, note: "จำนวนร้านทั้งหมด" },
			{ label: "ยังสร้างได้", value: summary.value.remaining_store_capacity_total, note: "จำนวนร้านที่ยังสามารถสร้างเพิ่ม" },
		];
	}
	return [
		{ label: "Total accounts", value: summary.value.accounts_total, note: "User accounts in the system" },
		{ label: "Stores created", value: summary.value.stores_total, note: "Total number of stores" },
		{ label: "Available capacity", value: summary.value.remaining_store_capacity_total, note: "Additional stores that can be created" },
	];
});

function resolveApiErrorMessage(errorValue: unknown, fallback = copy.value.noQuota) {
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
	return formatAppDateTime(value, locale.value as "th" | "lo" | "en");
}

function roleLabel(role: string) {
	const normalizedRole = role?.trim().toLowerCase();
	if (normalizedRole === "superadmin") {
		if (locale.value === "lo") return "ຜູ້ດູແລລະບົບສູງສຸດ";
		if (locale.value === "th") return "ผู้ดูแลระบบสูงสุด";
		return "Super Admin";
	}
	if (normalizedRole === "staff") return copy.value.staff;
	return role || copy.value.staff;
}

function statusTone(status: QuotaRecord["status"]) {
	return status === "active" ? "success" : "warning";
}

function statusLabel(status: QuotaRecord["status"]) {
	return status === "active" ? copy.value.active : copy.value.suspended;
}

function storeQuotaLabel(item: QuotaRecord) {
	if (!item.can_create_stores) return copy.value.disabled;
	if (item.max_stores === null) return copy.value.unlimited;
	return `${item.max_stores} ${copy.value.stores}`;
}

function remainingCapacityLabel(item: QuotaRecord) {
	if (!item.can_create_stores) return copy.value.disabled;
	if (item.remaining_store_capacity === null) return copy.value.unlimited;
	return `${item.remaining_store_capacity} ${copy.value.stores}`;
}

function storeUsageLabel(item: QuotaRecord) {
	if (!item.can_create_stores) return `${copy.value.used} ${item.owned_stores_count} ${copy.value.stores}`;
	if (item.max_stores === null) return `${copy.value.used} ${item.owned_stores_count} ${copy.value.stores}`;
	return `${copy.value.used} ${item.owned_stores_count} / ${item.max_stores} ${copy.value.stores}`;
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
		sidebar-eyebrow="Super Admin"
		sidebar-title="Super Admin"
		sidebar-compact-title="SUP"
		:sidebar-description="copy.description"
	>
		<template #default="{ openSidebar }">
			<div class="grid min-h-[calc(100dvh-4.25rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 lg:h-full lg:min-h-0">
				<AppPageHeader
					class="hidden md:block"
					:title-badge="false"
					compact
					@menu="openSidebar"
				>
					<template #actions>
						<div class="ml-auto hidden w-full flex-wrap justify-end gap-2 pt-0.5 md:flex md:w-auto">
							<AppButton
								color="neutral"
								variant="soft"
								size="md"
								icon="i-heroicons-arrow-path-20-solid"
								class="rounded-md"
								:loading="pending"
								:disabled="pending"
								:spin-icon-on-loading="true"
								@click="loadQuotas"
							>
								{{ copy.reload }}
							</AppButton>
						</div>
					</template>
				</AppPageHeader>

				<div class="grid min-h-0 grid-rows-[minmax(0,1fr)] gap-3">
					<div class="min-h-0 overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">{{ copy.title }}</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">{{ copy.hint }}</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									{{ pageSummaryText }}
								</div>
							</div>

							<div class="border-b border-[#ece6dc] px-4 py-3">
								<div class="grid gap-2.5 md:grid-cols-[minmax(0,1fr)_180px_auto]">
									<div class="relative">
										<UIcon name="i-heroicons-magnifying-glass-20-solid" class="pointer-events-none absolute top-1/2 left-3.5 h-4.5 w-4.5 -translate-y-1/2 text-stone-400" />
										<input
											v-model="searchQuery"
											type="search"
											:placeholder="copy.search"
											class="w-full rounded-md border border-neutral-200 bg-white py-2.5 pl-10 pr-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
											@keydown.enter="applyFilters"
										>
									</div>
									<div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5 md:contents">
										<select v-model="activeMode" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
											<option value="all">{{ copy.all }}</option>
											<option value="store-enabled">{{ copy.storeEnabled }}</option>
											<option value="limited">{{ copy.limited }}</option>
											<option value="unlimited">{{ copy.unlimited }}</option>
											<option value="attention">{{ copy.attention }}</option>
										</select>
										<AppButton color="primary" variant="soft" size="md" icon="i-heroicons-funnel-20-solid" class="whitespace-nowrap rounded-md" @click="applyFilters">
											{{ copy.apply }}
										</AppButton>
									</div>
								</div>
							</div>

							<div ref="listScrollRef" class="scrollbar-soft min-h-0 flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
								<div v-if="pending" class="min-h-[280px]">
									<AppInlineLoadingBar container-class="bg-neutral-100" />
								</div>
								<div v-else-if="error" class="p-5 text-center text-sm text-error">{{ error }}</div>
								<div v-else>
									<div class="grid grid-cols-1 gap-3 border-b border-[#f1ede6] p-4 sm:grid-cols-3">
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

									<div v-if="!quotas.length" class="p-5 text-center text-sm text-stone-500">
										{{ copy.noQuota }}
									</div>

									<template v-else>
										<button
											v-for="item in quotas"
											:key="item.id"
											type="button"
											class="w-full border-b border-[#f1ede6] px-4 py-3 text-left transition hover:bg-primary-50 dark:border-[#3a332a] dark:hover:bg-primary-950/20"
										>
											<div class="flex items-start justify-between gap-3">
												<div class="flex min-w-0 items-start gap-3">
													<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-50 text-sm font-semibold text-primary-700 dark:bg-primary-950/40 dark:text-primary-200">
														{{ item.name.slice(0, 1).toUpperCase() }}
													</div>
													<div class="min-w-0">
														<div class="flex flex-wrap items-center gap-2">
															<p class="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">{{ item.name }}</p>
															<UBadge :color="statusTone(item.status)" variant="soft" :label="statusLabel(item.status)" />
														</div>
														<p class="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">{{ item.email }}</p>
														<p class="mt-1 text-xs text-stone-500 dark:text-stone-400">{{ roleLabel(item.system_role) }} · {{ copy.createdAt }} {{ formatDateTime(item.created_at) }}</p>
													</div>
												</div>
												<div class="shrink-0 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-right text-[11px] font-medium text-stone-600 dark:border-[#3a332a] dark:bg-[#221d18] dark:text-stone-300">
													{{ storeUsageLabel(item) }}
												</div>
											</div>

											<div class="mt-3 grid grid-cols-2 divide-x divide-[#ece6dc] overflow-hidden rounded-md border border-neutral-200 bg-neutral-50 dark:divide-[#3a332a] dark:border-[#3a332a] dark:bg-[#221d18]">
												<div class="min-w-0 px-2.5 py-2.5 sm:px-3">
													<p class="truncate text-[10px] uppercase tracking-[0.1em] text-stone-400 sm:text-[11px] sm:tracking-[0.14em]">{{ copy.storeQuota }}</p>
													<p class="mt-1 truncate text-xs font-semibold text-stone-900 sm:text-sm dark:text-stone-100">{{ storeQuotaLabel(item) }}</p>
												</div>
												<div class="min-w-0 px-2.5 py-2.5 sm:px-3">
													<p class="truncate text-[10px] uppercase tracking-[0.1em] text-stone-400 sm:text-[11px] sm:tracking-[0.14em]">{{ copy.remaining }}</p>
													<p class="mt-1 truncate text-xs font-semibold text-stone-900 sm:text-sm dark:text-stone-100">{{ remainingCapacityLabel(item) }}</p>
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
											<label class="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">{{ copy.perPage }}</label>
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
												:aria-label="copy.previous"
												:title="copy.previous"
												@click="goToPage(currentPage - 1)"
											>
												<span class="hidden sm:inline">{{ copy.previous }}</span>
											</AppButton>
											<AppButton
												color="neutral"
												variant="soft"
												size="md"
												class="rounded-md"
												trailing-icon="i-heroicons-chevron-right-20-solid"
												:disabled="currentPage >= totalPages || pending"
												:aria-label="copy.next"
												:title="copy.next"
												@click="goToPage(currentPage + 1)"
											>
												<span class="hidden sm:inline">{{ copy.next }}</span>
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
