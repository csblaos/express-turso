<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { formatAppDateTime } from "~/utils/date-format";

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
	owner_user_name: string | null;
	address: string | null;
	phone_number: string | null;
	created_at: string;
};

const { apiFetch } = useApiClient();
const { currentUser, currentStoreId, fetchMe, can } = useAuthSession();
const appToast = useAppToast();
const { locale } = useI18n();

const copy = computed(() => locale.value === "lo" ? {
	description: "ຈັດການຮ້ານໃນມຸມ Super Admin ແລະ ຕິດຕາມສະຖານະຂອງແຕ່ລະຮ້ານ",
	search: "ຄົ້ນຫາຊື່ຮ້ານ, owner ID ຫຼື store ID", reload: "ໂຫຼດໃໝ່", add: "ເພີ່ມຮ້ານ",
	total: "ຮ້ານທັງໝົດ", retail: "ຂາຍຍ່ອຍ", cafe: "ຄາເຟ່", restaurant: "ຮ້ານອາຫານ",
	stores: "ຮ້ານ", listHint: "ລາຍການຮ້ານພ້ອມແບ່ງໜ້າ", allTypes: "ທຸກປະເພດຮ້ານ", allCurrencies: "ທຸກສະກຸນເງິນ",
	noResults: "ບໍ່ພົບຮ້ານຕາມເງື່ອນໄຂ", noData: "ຍັງບໍ່ມີຂໍ້ມູນ", store: "ຮ້ານ", owner: "ເຈົ້າຂອງ", type: "ປະເພດ", currency: "ສະກຸນເງິນ", address: "ທີ່ຢູ່", created: "ສ້າງເມື່ອ", action: "ຈັດການ", manage: "ຈັດການ",
	perPage: "ຕໍ່ໜ້າ", previous: "ກ່ອນໜ້າ", next: "ໜ້າຖັດໄປ", page: "ໜ້າ", of: "ຈາກ",
	createTitle: "ເພີ່ມຮ້ານ", createDescription: "ສ້າງຮ້ານໃໝ່ໃນຖານຂໍ້ມູນ", detailTitle: "ລາຍລະອຽດຮ້ານ", detailDescription: "ແກ້ໄຂຂໍ້ມູນຮ້ານໃນຖານຂໍ້ມູນ", name: "ຊື່ຮ້ານ", phone: "ເບີໂທ", cancel: "ຍົກເລີກ", close: "ປິດ", save: "ບັນທຶກ", create: "ສ້າງຮ້ານ", ownerCreated: "ເຈົ້າຂອງ: {owner} · ສ້າງເມື່ອ {date}",
	noPermission: "ບໍ່ມີສິດໃຊ້ງານ", noPermissionHint: "ບັນຊີນີ້ບໍ່ສາມາດຈັດການຮ້ານໄດ້", loadFailed: "ໂຫຼດຮ້ານບໍ່ສຳເລັດ", createSuccess: "ສ້າງຮ້ານແລ້ວ", savedDb: "ບັນທຶກໃນຖານຂໍ້ມູນແລ້ວ", createFailed: "ສ້າງຮ້ານບໍ່ສຳເລັດ", updateSuccess: "ອັບເດດຮ້ານແລ້ວ", saveFailed: "ບັນທຶກບໍ່ສຳເລັດ",
	deleteStore: "ລົບຮ້ານ", deleteTitle: "ລົບຮ້ານຖາວອນ", deleteDescription: "ການລົບນີ້ບໍ່ສາມາດກູ້ຄືນໄດ້", deleteWarning: "ຂໍ້ມູນທັງໝົດຂອງຮ້ານ ລວມທັງອໍເດີ, ສິນຄ້າ, ສະຕັອກ, ສະມາຊິກ ແລະ ລາຍງານຈະຖືກລົບຖາວອນ.", typeConfirm: "ພິມ confirm ເພື່ອຢືນຢັນ", deletedSuccess: "ລົບຮ້ານແລ້ວ", deleteFailed: "ລົບຮ້ານບໍ່ສຳເລັດ"
} : locale.value === "en" ? {
	description: "Manage stores as Super Admin and monitor the status of each store.",
	search: "Search store name, owner ID, or store ID", reload: "Reload", add: "Add store",
	total: "Total stores", retail: "Retail", cafe: "Cafe", restaurant: "Restaurant",
	stores: "Stores", listHint: "Store list with pagination", allTypes: "All store types", allCurrencies: "All currencies",
	noResults: "No stores match the selected filters", noData: "No data yet", store: "Store", owner: "Owner", type: "Type", currency: "Currency", address: "Address", created: "Created", action: "Action", manage: "Manage",
	perPage: "Per page", previous: "Previous", next: "Next", page: "Page", of: "of",
	createTitle: "Create store", createDescription: "Create a new store in the database.", detailTitle: "Store details", detailDescription: "Edit store information in the database.", name: "Store name", phone: "Phone number", cancel: "Cancel", close: "Close", save: "Save", create: "Create store", ownerCreated: "Owner: {owner} · Created {date}",
	noPermission: "No permission", noPermissionHint: "This account cannot manage stores.", loadFailed: "Unable to load stores", createSuccess: "Store created", savedDb: "Saved to the database.", createFailed: "Unable to create store", updateSuccess: "Store updated", saveFailed: "Unable to save store",
	deleteStore: "Delete store", deleteTitle: "Permanently delete store", deleteDescription: "This action cannot be undone.", deleteWarning: "All store data—including orders, products, inventory, members, and reports—will be permanently deleted.", typeConfirm: "Type confirm to continue", deletedSuccess: "Store deleted", deleteFailed: "Unable to delete store"
} : {
	description: "จัดการร้านในมุม Super Admin และติดตามสถานะการใช้งานแต่ละร้าน",
	search: "ค้นหาชื่อร้าน, owner ID หรือ store ID", reload: "รีโหลด", add: "เพิ่มร้าน",
	total: "ร้านทั้งหมด", retail: "Retail", cafe: "Cafe", restaurant: "Restaurant",
	stores: "Stores", listHint: "มุมมองรายการร้านพร้อมแบ่งหน้า", allTypes: "ทุกประเภทร้าน", allCurrencies: "ทุกสกุลเงิน",
	noResults: "ไม่พบร้านตามเงื่อนไขที่เลือก", noData: "ยังไม่มีข้อมูล", store: "Store", owner: "Owner", type: "Type", currency: "Currency", address: "Address", created: "Created", action: "Action", manage: "จัดการ",
	perPage: "ต่อหน้า", previous: "ก่อนหน้า", next: "ถัดไป", page: "หน้า", of: "จาก",
	createTitle: "สร้างร้าน", createDescription: "สร้างร้านใหม่บนฐานข้อมูลจริง", detailTitle: "รายละเอียดร้าน", detailDescription: "แก้ไขข้อมูลร้านบนฐานข้อมูลจริง", name: "ชื่อร้าน", phone: "เบอร์โทร", cancel: "ยกเลิก", close: "ปิด", save: "บันทึก", create: "สร้างร้าน", ownerCreated: "เจ้าของ: {owner} · สร้างเมื่อ {date}",
	noPermission: "ไม่มีสิทธิ์ใช้งาน", noPermissionHint: "บัญชีนี้ไม่สามารถจัดการร้านได้", loadFailed: "โหลดร้านไม่สำเร็จ", createSuccess: "สร้างร้านแล้ว", savedDb: "บันทึกลงฐานข้อมูลเรียบร้อย", createFailed: "สร้างร้านไม่สำเร็จ", updateSuccess: "อัปเดตร้านแล้ว", saveFailed: "บันทึกไม่สำเร็จ",
	deleteStore: "ลบร้าน", deleteTitle: "ลบร้านถาวร", deleteDescription: "การดำเนินการนี้ไม่สามารถกู้คืนได้", deleteWarning: "ข้อมูลทั้งหมดของร้าน รวมถึงออเดอร์ สินค้า สต็อก สมาชิก และรายงาน จะถูกลบอย่างถาวร", typeConfirm: "พิมพ์ confirm เพื่อดำเนินการต่อ", deletedSuccess: "ลบร้านแล้ว", deleteFailed: "ลบร้านไม่สำเร็จ"
});

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
const deleteOpen = ref(false);
const selectedStoreId = ref("");
const deleteConfirmation = ref("");
const deleting = ref(false);

const createForm = reactive({
	name: "",
	store_type: "RETAIL",
	currency: "LAK",
	address: "",
	phone_number: "",
});

const detailForm = reactive({
	name: "",
	store_type: "RETAIL",
	currency: "LAK",
	address: "",
	phone_number: "",
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
		|| (store.owner_user_name || "").toLowerCase().includes(query)
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
const canDeleteSelectedStore = computed(() => (
	Boolean(selectedStore.value)
	&& deleteConfirmation.value === "confirm"
	&& !deleting.value
));
const totalFilteredStores = computed(() => filteredStores.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(totalFilteredStores.value / pageSize.value)));
const pageLabel = computed(() => `${copy.value.page} ${currentPage.value} / ${totalPages.value}`);
const pageStart = computed(() => (
	totalFilteredStores.value === 0
		? 0
		: ((currentPage.value - 1) * pageSize.value) + 1
));
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, totalFilteredStores.value));
const pageSummaryText = computed(() => (
	totalFilteredStores.value === 0
		? copy.value.noData
		: `${pageStart.value}-${pageEnd.value} ${copy.value.of} ${totalFilteredStores.value} ${copy.value.stores}`
));

const overviewStats = computed(() => {
	const all = stores.value;
	return [
		{ label: copy.value.total, value: all.length },
		{ label: copy.value.retail, value: all.filter((item) => item.store_type === "RETAIL").length },
		{ label: copy.value.cafe, value: all.filter((item) => item.store_type === "CAFE").length },
		{ label: copy.value.restaurant, value: all.filter((item) => item.store_type === "RESTAURANT").length },
	];
});

function formatDateTime(value: string) {
	return formatAppDateTime(value, locale.value as "th" | "lo" | "en");
}

function storeTypeLabel(storeType: string) {
	switch (storeType) {
		case "RETAIL":
			return copy.value.retail;
		case "CAFE":
			return copy.value.cafe;
		case "RESTAURANT":
			return copy.value.restaurant;
		case "SERVICE":
			return locale.value === "lo" ? "ບໍລິການ" : locale.value === "en" ? "Service" : "บริการ";
		default:
			return locale.value === "lo" ? "ອື່ນໆ" : locale.value === "en" ? "Other" : "อื่นๆ";
	}
}

function storeTypeTone(storeType: string) {
	switch (storeType) {
		case "RETAIL":
			return "primary";
		case "CAFE":
			return "amber";
		case "RESTAURANT":
			return "red";
		case "SERVICE":
			return "neutral";
		default:
			return "gray";
	}
}

function resolveApiErrorMessage(errorValue: unknown, fallback = "Please try again") {
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
			title: copy.value.noPermission,
			description: copy.value.noPermissionHint,
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
	detailOpen.value = true;
}

async function openDeleteModal() {
	if (!selectedStore.value) return;
	deleteConfirmation.value = "";
	detailOpen.value = false;
	await nextTick();
	deleteOpen.value = true;
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
		error.value = resolveApiErrorMessage(err, copy.value.loadFailed);
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
				owner_user_id: currentUser.value?.id || null,
			},
		});

		appToast.success({
			title: copy.value.createSuccess,
			description: copy.value.savedDb,
		});
		createOpen.value = false;
		await fetchMe(currentStoreId.value || undefined);
		await loadStores();
	} catch (err) {
		appToast.error({
			title: copy.value.createFailed,
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
			},
		});

		appToast.success({
			title: copy.value.updateSuccess,
			description: copy.value.savedDb,
		});
		detailOpen.value = false;
		await loadStores();
	} catch (err) {
		appToast.error({
			title: copy.value.saveFailed,
			description: resolveApiErrorMessage(err),
		});
	} finally {
		saving.value = false;
	}
}

async function deleteStore() {
	const store = selectedStore.value;
	if (!store || !canDeleteSelectedStore.value) return;
	deleting.value = true;
	try {
		await apiFetch<ApiEnvelope<null>>(`/stores/${encodeURIComponent(store.id)}`, {
			method: "DELETE",
			body: { confirmation: deleteConfirmation.value },
		});
		appToast.success({
			title: copy.value.deletedSuccess,
			description: store.name,
		});
		deleteOpen.value = false;
		selectedStoreId.value = "";
		deleteConfirmation.value = "";
		if (currentStoreId.value === store.id) {
			currentStoreId.value = null;
		}
		await fetchMe(currentStoreId.value || undefined);
		await loadStores();
	} catch (err) {
		appToast.error({
			title: copy.value.deleteFailed,
			description: resolveApiErrorMessage(err),
		});
	} finally {
		deleting.value = false;
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
		sidebar-eyebrow="Super Admin"
		sidebar-title="Super Admin"
		sidebar-compact-title="SUP"
		:sidebar-description="copy.description"
	>
		<template #default="{ openSidebar }">
			<div class="grid gap-3 pb-3 lg:gap-4">
				<AppPageHeader
					title=""
					compact
					@menu="openSidebar"
				>
					<template #default>
						<div class="flex w-full flex-wrap items-center gap-2 pt-0.5 sm:pt-1">
							<UInput
								v-model="searchQuery"
								icon="i-heroicons-magnifying-glass-20-solid"
								size="lg"
								color="neutral"
								:placeholder="copy.search"
								class="min-w-0 flex-1 [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5 [&_input]:shadow-sm [&_input]:focus:border-primary-300 [&_input]:focus:ring-2 [&_input]:focus:ring-primary-200"
							/>
							<div class="flex shrink-0 gap-2">
								<AppButton
									color="neutral"
									variant="soft"
									size="md"
									icon="i-heroicons-arrow-path-20-solid"
									class="h-9 w-9 shrink-0 justify-center rounded-md px-0 sm:h-auto sm:w-auto sm:px-3"
									:loading="pending"
									:disabled="pending"
									:spin-icon-on-loading="true"
								:aria-label="copy.reload"
								:title="copy.reload"
									@click="reloadStores"
								>
									<span class="hidden sm:inline">{{ copy.reload }}</span>
								</AppButton>
								<AppButton
									color="primary"
									variant="solid"
									size="md"
									icon="i-heroicons-building-storefront-20-solid"
									class="h-9 w-9 shrink-0 justify-center rounded-md px-0 sm:h-auto sm:w-auto sm:px-3"
								:aria-label="copy.add"
								:title="copy.add"
									@click="openCreateModal"
								>
									<span class="hidden sm:inline">{{ copy.add }}</span>
								</AppButton>
							</div>
						</div>
					</template>
				</AppPageHeader>

				<div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
					<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
						<div class="grid grid-cols-2 gap-2.5 md:grid-cols-4">
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
									<p class="text-sm font-semibold text-stone-950">{{ copy.stores }}</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">{{ copy.listHint }}</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									{{ pageSummaryText }}
								</div>
							</div>

							<div class="border-b border-[#ece6dc] px-4 py-3">
								<div class="grid grid-cols-2 gap-2.5">
									<select v-model="activeType" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
										<option value="all">{{ copy.allTypes }}</option>
										<option value="RETAIL">{{ storeTypeLabel('RETAIL') }}</option>
										<option value="CAFE">{{ storeTypeLabel('CAFE') }}</option>
										<option value="RESTAURANT">{{ storeTypeLabel('RESTAURANT') }}</option>
										<option value="SERVICE">{{ storeTypeLabel('SERVICE') }}</option>
										<option value="OTHER">{{ storeTypeLabel('OTHER') }}</option>
									</select>
									<select v-model="activeCurrency" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
										<option value="all">{{ copy.allCurrencies }}</option>
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
								<div v-else-if="!totalFilteredStores" class="p-5 text-center text-sm text-stone-500">{{ copy.noResults }}</div>
								<template v-else>
									<div class="overflow-x-auto">
										<table class="min-w-[1080px] w-full border-separate border-spacing-0">
										<thead class="sticky top-0 z-10 bg-[#fcfbf8] dark:bg-[#221d18]">
											<tr class="text-left text-xs font-medium uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">
											<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.store }}</th>
											<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.owner }}</th>
											<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.type }}</th>
											<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.currency }}</th>
											<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.address }}</th>
											<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.created }}</th>
											<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 text-right dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.action }}</th>
											</tr>
										</thead>
											<tbody>
												<tr
													v-for="store in paginatedStores"
													:key="store.id"
													class="cursor-pointer text-sm text-stone-700 transition hover:bg-primary-50 focus-within:bg-primary-50"
													:class="detailOpen && selectedStoreId === store.id ? '!bg-primary-50' : 'bg-white'"
													@click="openDetailModal(store.id)"
												>
													<td class="border-b border-[#f1ede6] px-4 py-4">
														<div class="min-w-0">
															<p class="truncate font-semibold text-stone-950">{{ store.name }}</p>
														</div>
													</td>
													<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600">
														{{ store.owner_user_name || '-' }}
													</td>
													<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600">
														{{ storeTypeLabel(store.store_type) }}
													</td>
													<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600">
														{{ store.currency }}
													</td>
													<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600">
														<p class="truncate">{{ store.address || '-' }}</p>
													</td>
													<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600">
														{{ formatDateTime(store.created_at) }}
													</td>
													<td class="border-b border-[#f1ede6] px-4 py-4 text-right">
														<AppButton
															color="neutral"
															variant="soft"
															size="md"
															class="rounded-md"
															icon="i-heroicons-chevron-right-20-solid"
															@click.stop="openDetailModal(store.id)"
														>
															{{ copy.manage }}
														</AppButton>
													</td>
												</tr>
											</tbody>
										</table>
									</div>
								</template>
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

			<AppResponsivePanel
				v-model="createOpen"
				:title="copy.createTitle"
				:description="copy.createDescription"
				desktop-width="680px"
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
								<label class="mb-2 block text-xs font-medium text-stone-500">{{ copy.name }}</label>
								<input v-model="createForm.name" type="text" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
							</div>
							<div class="grid gap-4 sm:grid-cols-2">
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">{{ copy.type }}</label>
									<select v-model="createForm.store_type" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
										<option value="RETAIL">{{ storeTypeLabel('RETAIL') }}</option>
										<option value="CAFE">{{ storeTypeLabel('CAFE') }}</option>
										<option value="RESTAURANT">{{ storeTypeLabel('RESTAURANT') }}</option>
										<option value="SERVICE">{{ storeTypeLabel('SERVICE') }}</option>
										<option value="OTHER">{{ storeTypeLabel('OTHER') }}</option>
									</select>
								</div>
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">{{ copy.currency }}</label>
									<select v-model="createForm.currency" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
										<option value="LAK">LAK</option>
										<option value="THB">THB</option>
										<option value="USD">USD</option>
									</select>
								</div>
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">{{ copy.phone }}</label>
								<input v-model="createForm.phone_number" type="text" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">{{ copy.address }}</label>
								<textarea v-model="createForm.address" rows="3" class="w-full resize-none rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200" />
							</div>
						</div>
					</div>
					<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
						<div class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="createOpen = false">{{ copy.cancel }}</AppButton>
							<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-building-storefront-20-solid" :loading="saving" :disabled="!canCreateStore" :spin-icon-on-loading="true" :block="true" @click="createStore">{{ copy.create }}</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>

				<AppResponsivePanel
					v-model="detailOpen"
					:title="copy.detailTitle"
				:description="copy.detailDescription"
				desktop-width="680px"
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
								<p class="mt-1 text-xs text-stone-500">{{ copy.ownerCreated.replace('{owner}', selectedStore.owner_user_name || '-').replace('{date}', formatDateTime(selectedStore.created_at)) }}</p>
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">{{ copy.name }}</label>
								<input v-model="detailForm.name" type="text" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
							</div>
							<div class="grid gap-4 sm:grid-cols-2">
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">{{ copy.type }}</label>
									<select v-model="detailForm.store_type" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
										<option value="RETAIL">{{ storeTypeLabel('RETAIL') }}</option>
										<option value="CAFE">{{ storeTypeLabel('CAFE') }}</option>
										<option value="RESTAURANT">{{ storeTypeLabel('RESTAURANT') }}</option>
										<option value="SERVICE">{{ storeTypeLabel('SERVICE') }}</option>
										<option value="OTHER">{{ storeTypeLabel('OTHER') }}</option>
									</select>
								</div>
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">{{ copy.currency }}</label>
									<select v-model="detailForm.currency" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
										<option value="LAK">LAK</option>
										<option value="THB">THB</option>
										<option value="USD">USD</option>
									</select>
								</div>
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">{{ copy.phone }}</label>
								<input v-model="detailForm.phone_number" type="text" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">{{ copy.address }}</label>
								<textarea v-model="detailForm.address" rows="3" class="w-full resize-none rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200" />
							</div>
							<div class="rounded-md border border-error-200 bg-error-50 p-4">
								<p class="text-sm font-semibold text-error-700">{{ copy.deleteTitle }}</p>
								<p class="mt-1 text-xs leading-5 text-error-600">{{ copy.deleteWarning }}</p>
								<AppButton
									color="error"
									variant="soft"
									size="md"
									icon="i-heroicons-trash-20-solid"
									class="mt-3 rounded-md"
									:block="true"
									@click="openDeleteModal"
								>
									{{ copy.deleteStore }}
								</AppButton>
							</div>
						</div>
					</div>
					<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
						<div class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="detailOpen = false">{{ copy.close }}</AppButton>
							<AppButton color="primary" variant="solid" size="md" :loading="saving" :disabled="!canSaveDetail" :spin-icon-on-loading="true" :block="true" @click="saveDetail">{{ copy.save }}</AppButton>
						</div>
					</div>
				</div>
				</AppResponsivePanel>

			<AppResponsivePanel
				v-model="deleteOpen"
				:title="copy.deleteTitle"
				:description="copy.deleteDescription"
				desktop-width="680px"
				mobile-max-height="88dvh"
				:fill-mobile-height="true"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<div v-if="selectedStore" class="flex h-full min-h-0 flex-col">
					<div class="scrollbar-soft min-h-0 flex-1 overflow-y-auto px-5 py-5">
						<div class="rounded-md border border-error-200 bg-error-50 p-4">
							<p class="font-semibold text-error-800">{{ selectedStore.name }}</p>
							<p class="mt-2 text-sm leading-6 text-error-700">{{ copy.deleteWarning }}</p>
						</div>
						<label class="mt-5 block text-sm font-medium text-stone-700">{{ copy.typeConfirm }}</label>
						<input
							v-model="deleteConfirmation"
							type="text"
							autocomplete="off"
							spellcheck="false"
							placeholder="confirm"
							class="mt-2 w-full rounded-md border border-neutral-200 bg-white px-4 py-3 font-mono text-sm text-stone-900 shadow-sm outline-none transition focus:border-error-300 focus:ring-2 focus:ring-error-100"
							@keyup.enter="deleteStore"
						>
					</div>
					<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
						<div class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" :disabled="deleting" @click="deleteOpen = false">{{ copy.cancel }}</AppButton>
							<AppButton color="error" variant="solid" size="md" icon="i-heroicons-trash-20-solid" :block="true" :loading="deleting" :disabled="!canDeleteSelectedStore" :spin-icon-on-loading="true" @click="deleteStore">{{ copy.deleteStore }}</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>
				</div>
		</template>
	</AppSidebarShell>
</template>
