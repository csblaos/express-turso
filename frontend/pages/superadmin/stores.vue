<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type StoreRecord = {
	id: string;
	name: string;
	store_type: string;
	currency: string;
	owner_user_id: string | null;
	address: string | null;
	phone_number: string | null;
	pdf_header_color: string;
	created_at: string;
};

const { apiFetch } = useApiClient();
const { currentUser, currentStoreId, fetchMe, can } = useAuthSession();
const appToast = useAppToast();

const searchQuery = ref("");
const activeType = ref<"all" | "RETAIL" | "CAFE" | "RESTAURANT" | "SERVICE" | "OTHER">("all");
const activeCurrency = ref<"all" | "LAK" | "THB" | "USD">("all");
const pending = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);
const stores = ref<StoreRecord[]>([]);
const currentPage = ref(1);
const pageSize = ref(20);
const pageSizeOptions = [ 10, 20, 50 ];
const storesListScrollRef = ref<HTMLElement | null>(null);
const createOpen = ref(false);
const detailOpen = ref(false);
const selectedStoreId = ref("");

const createForm = reactive({
	name: "",
	store_type: "RETAIL",
	currency: "LAK",
	address: "",
	phone_number: "",
	pdf_header_color: "#22c55e",
});

const detailForm = reactive({
	name: "",
	store_type: "RETAIL",
	currency: "LAK",
	address: "",
	phone_number: "",
	pdf_header_color: "#22c55e",
});

const canManageStore = computed(() => (
	can("settings.store.create")
	|| can("settings.store.update")
	|| can("settings.store.archive")
	|| can("superadmin.stores.create")
	|| can("superadmin.stores.update")
	|| can("superadmin.stores.archive")
));

const filteredStores = computed(() => stores.value.filter((store) => {
	const query = searchQuery.value.trim().toLowerCase();
	const matchesQuery = !query
		|| store.name.toLowerCase().includes(query)
		|| store.id.toLowerCase().includes(query)
		|| (store.owner_user_id || "").toLowerCase().includes(query);
	const matchesType = activeType.value === "all" || store.store_type === activeType.value;
	const matchesCurrency = activeCurrency.value === "all" || store.currency === activeCurrency.value;
	return matchesQuery && matchesType && matchesCurrency;
}));
const paginatedStores = computed(() => {
	const start = (currentPage.value - 1) * pageSize.value;
	const end = start + pageSize.value;
	return filteredStores.value.slice(start, end);
});

const selectedStore = computed(() => stores.value.find((store) => store.id === selectedStoreId.value) || null);

const canCreateStore = computed(() => createForm.name.trim().length > 0);
const canSaveDetail = computed(() => Boolean(selectedStore.value) && detailForm.name.trim().length > 0);
const totalFilteredStores = computed(() => filteredStores.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(totalFilteredStores.value / pageSize.value)));
const pageLabel = computed(() => `หน้า ${currentPage.value} / ${totalPages.value}`);
const pageStart = computed(() => (
	totalFilteredStores.value === 0
		? 0
		: ((currentPage.value - 1) * pageSize.value) + 1
));
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, totalFilteredStores.value));
const pageSummaryText = computed(() => (
	totalFilteredStores.value === 0
		? "ยังไม่มีข้อมูล"
		: `${pageStart.value}-${pageEnd.value} จาก ${totalFilteredStores.value} ร้าน`
));

const overviewStats = computed(() => {
	const all = stores.value;
	return [
		{ label: "ร้านทั้งหมด", value: all.length },
		{ label: "Retail", value: all.filter((item) => item.store_type === "RETAIL").length },
		{ label: "Cafe", value: all.filter((item) => item.store_type === "CAFE").length },
		{ label: "Restaurant", value: all.filter((item) => item.store_type === "RESTAURANT").length },
	];
});

function formatDateTime(value: string) {
	return new Intl.DateTimeFormat("th-TH", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function resolveApiErrorMessage(errorValue: unknown, fallback = "โปรดลองอีกครั้ง") {
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

function resetCreateForm() {
	createForm.name = "";
	createForm.store_type = "RETAIL";
	createForm.currency = "LAK";
	createForm.address = "";
	createForm.phone_number = "";
	createForm.pdf_header_color = "#22c55e";
}

function scrollStoresListToTop() {
	storesListScrollRef.value?.scrollTo({
		top: 0,
		behavior: "auto",
	});
}

function resetListPage() {
	currentPage.value = 1;
}

function goToPage(nextPage: number) {
	const normalizedPage = Math.min(Math.max(1, nextPage), totalPages.value);
	if (normalizedPage === currentPage.value) return;
	currentPage.value = normalizedPage;
	scrollStoresListToTop();
}

function updatePageSize(nextPageSize: number | string) {
	const normalizedSize = Number(nextPageSize);
	if (!Number.isFinite(normalizedSize) || normalizedSize <= 0 || normalizedSize === pageSize.value) return;
	pageSize.value = normalizedSize;
	resetListPage();
	scrollStoresListToTop();
}

function openCreateModal() {
	if (!canManageStore.value) {
		appToast.error({
			title: "ไม่มีสิทธิ์ใช้งาน",
			description: "บัญชีนี้ไม่สามารถจัดการร้านได้",
		});
		return;
	}
	resetCreateForm();
	createOpen.value = true;
}

function openDetailModal(storeId: string) {
	const store = stores.value.find((item) => item.id === storeId);
	if (!store) return;
	selectedStoreId.value = store.id;
	detailForm.name = store.name;
	detailForm.store_type = store.store_type as typeof detailForm.store_type;
	detailForm.currency = store.currency as typeof detailForm.currency;
	detailForm.address = store.address || "";
	detailForm.phone_number = store.phone_number || "";
	detailForm.pdf_header_color = store.pdf_header_color || "#22c55e";
	detailOpen.value = true;
}

async function loadStores() {
	pending.value = true;
	error.value = null;
	await nextTick();
	scrollStoresListToTop();
	try {
		const response = await apiFetch<ApiEnvelope<StoreRecord[]>>("/superadmin/stores");
		stores.value = response.data;
		if (selectedStoreId.value && !stores.value.some((item) => item.id === selectedStoreId.value)) {
			selectedStoreId.value = "";
			detailOpen.value = false;
		}

		const maxPage = Math.max(1, Math.ceil(filteredStores.value.length / pageSize.value));
		if (currentPage.value > maxPage) currentPage.value = maxPage;
	} catch (err) {
		error.value = resolveApiErrorMessage(err, "โหลดร้านไม่สำเร็จ");
	} finally {
		pending.value = false;
	}
}

async function reloadStores() {
	resetListPage();
	await loadStores();
}

async function createStore() {
	if (!canCreateStore.value) return;
	saving.value = true;
	try {
		await apiFetch<ApiEnvelope<StoreRecord>>("/stores", {
			method: "POST",
			body: {
				name: createForm.name.trim(),
				store_type: createForm.store_type,
				currency: createForm.currency,
				address: createForm.address.trim() || null,
				phone_number: createForm.phone_number.trim() || null,
				pdf_header_color: createForm.pdf_header_color,
				owner_user_id: currentUser.value?.id || null,
			},
		});

		appToast.success({
			title: "สร้างร้านแล้ว",
			description: "บันทึกลงฐานข้อมูลเรียบร้อย",
		});
		createOpen.value = false;
		await fetchMe(currentStoreId.value || undefined);
		await loadStores();
	} catch (err) {
		appToast.error({
			title: "สร้างร้านไม่สำเร็จ",
			description: resolveApiErrorMessage(err),
		});
	} finally {
		saving.value = false;
	}
}

async function saveDetail() {
	if (!selectedStore.value || !canSaveDetail.value) return;
	saving.value = true;
	try {
		await apiFetch<ApiEnvelope<StoreRecord>>(`/stores/${encodeURIComponent(selectedStore.value.id)}`, {
			method: "PUT",
			body: {
				name: detailForm.name.trim(),
				store_type: detailForm.store_type,
				currency: detailForm.currency,
				address: detailForm.address.trim() || null,
				phone_number: detailForm.phone_number.trim() || null,
				pdf_header_color: detailForm.pdf_header_color,
			},
		});

		appToast.success({
			title: "อัปเดตร้านแล้ว",
			description: "ข้อมูลถูกบันทึกลงฐานข้อมูลแล้ว",
		});
		detailOpen.value = false;
		await loadStores();
	} catch (err) {
		appToast.error({
			title: "บันทึกไม่สำเร็จ",
			description: resolveApiErrorMessage(err),
		});
	} finally {
		saving.value = false;
	}
}

onMounted(loadStores);

watch([ searchQuery, activeType, activeCurrency ], () => {
	resetListPage();
	nextTick(() => {
		scrollStoresListToTop();
	});
});
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['superadmin']"
		sidebar-eyebrow="Superadmin"
		sidebar-title="Superadmin"
		sidebar-compact-title="SUP"
		sidebar-description="จัดการร้านในมุม superadmin และติดตามสถานะการใช้งานแต่ละร้าน"
	>
		<template #default="{ openSidebar }">
			<div class="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-3 lg:gap-4">
				<AppPageHeader
					title="Superadmin Stores"
					description="ข้อมูลร้านภายใต้ superadmin ปัจจุบันจาก API /superadmin/stores"
					@menu="openSidebar"
				>
					<template #actions>
						<div class="ml-auto flex w-full flex-wrap justify-end gap-2 md:w-auto">
							<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-arrow-path-20-solid" :loading="pending" :disabled="pending" :spin-icon-on-loading="true" @click="reloadStores">
								รีโหลด
							</AppButton>
							<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-building-storefront-20-solid" @click="openCreateModal">
								เพิ่มร้าน
							</AppButton>
						</div>
					</template>
				</AppPageHeader>

				<div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
					<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
						<div class="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
							<div
								v-for="item in overviewStats"
								:key="item.label"
								class="rounded-md border border-[#ece6dc] bg-neutral-50 px-4 py-3.5"
							>
								<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">{{ item.label }}</p>
								<p class="mt-2 text-2xl font-semibold text-stone-950">{{ item.value }}</p>
							</div>
						</div>
					</UCard>

					<div class="min-h-0 overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">Stores</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">มุมมองรายการร้านพร้อมแบ่งหน้าแบบ sticky bottom เหมือนหน้า clients</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									{{ pageSummaryText }}
								</div>
							</div>

							<div class="border-b border-[#ece6dc] px-4 py-3">
								<div class="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_180px_180px]">
									<div class="relative">
										<UIcon name="i-heroicons-magnifying-glass-20-solid" class="pointer-events-none absolute top-1/2 left-3.5 h-4.5 w-4.5 -translate-y-1/2 text-stone-400" />
										<input
											v-model="searchQuery"
											type="search"
											placeholder="ค้นหาชื่อร้าน, owner id หรือ store id"
											class="w-full rounded-md border border-neutral-200 bg-white py-2.5 pl-10 pr-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
										>
									</div>
									<select v-model="activeType" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
										<option value="all">ทุกประเภทร้าน</option>
										<option value="RETAIL">Retail</option>
										<option value="CAFE">Cafe</option>
										<option value="RESTAURANT">Restaurant</option>
										<option value="SERVICE">Service</option>
										<option value="OTHER">Other</option>
									</select>
									<select v-model="activeCurrency" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
										<option value="all">ทุกสกุลเงิน</option>
										<option value="LAK">LAK</option>
										<option value="THB">THB</option>
										<option value="USD">USD</option>
									</select>
								</div>
							</div>

							<div ref="storesListScrollRef" class="scrollbar-soft min-h-0 flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
								<div v-if="pending" class="min-h-[280px]">
									<AppInlineLoadingBar container-class="bg-neutral-100" />
								</div>
								<div v-else-if="error" class="p-5 text-center text-sm text-error">{{ error }}</div>
								<div v-else-if="!totalFilteredStores" class="p-5 text-center text-sm text-stone-500">ไม่พบร้านตามเงื่อนไขที่เลือก</div>
								<template v-else>
									<button
										v-for="store in paginatedStores"
										:key="store.id"
										type="button"
										class="w-full border-b border-[#f1ede6] px-4 py-3 text-left transition hover:bg-primary-50"
										@click="openDetailModal(store.id)"
									>
										<div class="flex items-center justify-between gap-3">
											<div class="min-w-0">
												<p class="truncate text-sm font-semibold text-stone-900">{{ store.name }}</p>
												<p class="mt-1 truncate text-xs text-stone-500">{{ store.id }} · owner: {{ store.owner_user_id || '-' }}</p>
												<p class="mt-2 text-xs text-stone-500">{{ store.store_type }} · {{ store.currency }} · สร้างเมื่อ {{ formatDateTime(store.created_at) }}</p>
											</div>
											<div class="flex items-center gap-2">
												<span class="inline-block h-4 w-4 rounded-full ring-1 ring-black/10" :style="{ backgroundColor: store.pdf_header_color || '#22c55e' }" />
												<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-chevron-right-20-solid">จัดการ</AppButton>
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

			<AppResponsivePanel
				v-model="createOpen"
				title="Create Store"
				description="สร้างร้านใหม่บนฐานข้อมูลจริง"
				desktop-width="560px"
				mobile-max-height="88dvh"
				:fill-mobile-height="true"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<div class="flex h-full min-h-0 flex-col">
					<div class="scrollbar-soft min-h-0 flex-1 overflow-y-auto px-5 py-5">
						<div class="space-y-4 pb-6">
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">ชื่อร้าน</label>
								<input v-model="createForm.name" type="text" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
							</div>
							<div class="grid gap-4 sm:grid-cols-2">
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">ประเภทร้าน</label>
									<select v-model="createForm.store_type" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
										<option value="RETAIL">Retail</option>
										<option value="CAFE">Cafe</option>
										<option value="RESTAURANT">Restaurant</option>
										<option value="SERVICE">Service</option>
										<option value="OTHER">Other</option>
									</select>
								</div>
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">สกุลเงิน</label>
									<select v-model="createForm.currency" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
										<option value="LAK">LAK</option>
										<option value="THB">THB</option>
										<option value="USD">USD</option>
									</select>
								</div>
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">เบอร์โทร</label>
								<input v-model="createForm.phone_number" type="text" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">ที่อยู่</label>
								<textarea v-model="createForm.address" rows="3" class="w-full resize-none rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200" />
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">สีหัวเอกสาร</label>
								<input v-model="createForm.pdf_header_color" type="color" class="h-11 w-full rounded-md border border-neutral-200 bg-white px-2 py-2 shadow-sm">
							</div>
						</div>
					</div>
					<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
						<div class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="createOpen = false">ยกเลิก</AppButton>
							<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-building-storefront-20-solid" :loading="saving" :disabled="!canCreateStore" :spin-icon-on-loading="true" :block="true" @click="createStore">สร้างร้าน</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>

			<AppResponsivePanel
				v-model="detailOpen"
				title="Store Detail"
				description="แก้ไขข้อมูลร้านบนฐานข้อมูลจริง"
				desktop-width="560px"
				mobile-max-height="88dvh"
				:fill-mobile-height="true"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<div v-if="selectedStore" class="flex h-full min-h-0 flex-col">
					<div class="scrollbar-soft min-h-0 flex-1 overflow-y-auto px-5 py-5">
						<div class="space-y-4 pb-6">
							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<p class="text-sm font-semibold text-stone-950">{{ selectedStore.id }}</p>
								<p class="mt-1 text-xs text-stone-500">owner: {{ selectedStore.owner_user_id || '-' }} · สร้างเมื่อ {{ formatDateTime(selectedStore.created_at) }}</p>
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">ชื่อร้าน</label>
								<input v-model="detailForm.name" type="text" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
							</div>
							<div class="grid gap-4 sm:grid-cols-2">
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">ประเภทร้าน</label>
									<select v-model="detailForm.store_type" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
										<option value="RETAIL">Retail</option>
										<option value="CAFE">Cafe</option>
										<option value="RESTAURANT">Restaurant</option>
										<option value="SERVICE">Service</option>
										<option value="OTHER">Other</option>
									</select>
								</div>
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">สกุลเงิน</label>
									<select v-model="detailForm.currency" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
										<option value="LAK">LAK</option>
										<option value="THB">THB</option>
										<option value="USD">USD</option>
									</select>
								</div>
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">เบอร์โทร</label>
								<input v-model="detailForm.phone_number" type="text" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">ที่อยู่</label>
								<textarea v-model="detailForm.address" rows="3" class="w-full resize-none rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200" />
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">สีหัวเอกสาร</label>
								<input v-model="detailForm.pdf_header_color" type="color" class="h-11 w-full rounded-md border border-neutral-200 bg-white px-2 py-2 shadow-sm">
							</div>
						</div>
					</div>
					<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
						<div class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="detailOpen = false">ปิด</AppButton>
							<AppButton color="primary" variant="solid" size="md" :loading="saving" :disabled="!canSaveDetail" :spin-icon-on-loading="true" :block="true" @click="saveDetail">บันทึก</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>
		</template>
	</AppSidebarShell>
</template>
