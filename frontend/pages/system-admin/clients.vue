<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type ClientRecord = {
	id: string;
	email: string;
	name: string;
	system_role: string;
	ui_locale: string;
	can_create_stores: number;
	max_stores: number | null;
	can_create_branches: number;
	max_branches_per_store: number | null;
	must_change_password: number;
	client_suspended: number;
	client_suspended_at: string | null;
	client_suspended_reason: string | null;
	client_suspended_by: string | null;
	created_by: string | null;
	created_at: string;
	status: "active" | "suspended";
};

type ClientListResponse = {
	items: ClientRecord[];
	page: number;
	limit: number;
	total: number;
	has_more: boolean;
	summary: {
		total: number;
		active: number;
		suspended: number;
	};
};

const { apiFetch } = useApiClient();
const { currentUser, can } = useAuthSession();
const appToast = useAppToast();

const searchQuery = ref("");
const activeStatus = ref<"all" | "active" | "suspended">("all");
const pending = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);
const clients = ref<ClientRecord[]>([]);
const currentPage = ref(1);
const pageSize = ref(20);
const pageSizeOptions = [ 10, 20, 50 ];
const totalClients = ref(0);
const summaryData = ref({
	total: 0,
	active: 0,
	suspended: 0,
});
const selectedClientId = ref("");
const createOpen = ref(false);
const detailOpen = ref(false);

const createForm = reactive({
	name: "",
	email: "",
	password: "dev123456",
	ui_locale: "th",
	can_create_stores: true,
	max_branches_per_store: "5",
	can_create_branches: true,
	must_change_password: true,
});

const detailForm = reactive({
	name: "",
	ui_locale: "th",
	can_create_stores: true,
	max_branches_per_store: "",
	can_create_branches: true,
	must_change_password: false,
	suspend_reason: "",
});

const canManageSystem = computed(() => can("system_admin.manage"));

const selectedClient = computed(() =>
	clients.value.find((client) => client.id === selectedClientId.value) || null,
);

const detailHasChanges = computed(() => {
	if (!selectedClient.value) return false;

	return (
		detailForm.name !== selectedClient.value.name
		|| detailForm.ui_locale !== (selectedClient.value.ui_locale || "th")
		|| detailForm.can_create_stores !== Boolean(selectedClient.value.can_create_stores)
		|| detailForm.max_branches_per_store !== (selectedClient.value.max_branches_per_store === null ? "" : String(selectedClient.value.max_branches_per_store))
		|| detailForm.can_create_branches !== Boolean(selectedClient.value.can_create_branches)
		|| detailForm.must_change_password !== Boolean(selectedClient.value.must_change_password)
	);
});

const totalPages = computed(() => Math.max(1, Math.ceil(totalClients.value / pageSize.value)));
const pageLabel = computed(() => `หน้า ${currentPage.value} / ${totalPages.value}`);
const pageStart = computed(() => (
	totalClients.value === 0
		? 0
		: ((currentPage.value - 1) * pageSize.value) + 1
));
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, totalClients.value));
const pageSummaryText = computed(() => (
	totalClients.value === 0
		? "ยังไม่มีข้อมูล"
		: `${pageStart.value}-${pageEnd.value} จาก ${totalClients.value} บัญชี`
));

watch(selectedClient, (client) => {
	if (!client) return;
	detailForm.name = client.name;
	detailForm.ui_locale = client.ui_locale || "th";
	detailForm.can_create_stores = Boolean(client.can_create_stores);
	detailForm.max_branches_per_store = client.max_branches_per_store === null ? "" : String(client.max_branches_per_store);
	detailForm.can_create_branches = Boolean(client.can_create_branches);
	detailForm.must_change_password = Boolean(client.must_change_password);
	detailForm.suspend_reason = client.client_suspended_reason || "";
}, { immediate: true });

function formatDate(value: string | null) {
	if (!value) return "ยังไม่มี";
	return new Intl.DateTimeFormat("th-TH", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function statusTone(status: ClientRecord["status"]) {
	return status === "active" ? "success" : "warning";
}

function openDetail(clientId: string) {
	selectedClientId.value = clientId;
	detailOpen.value = true;
}

function openCreateModal() {
	if (!canManageSystem.value) {
		appToast.error({
			title: "ไม่มีสิทธิ์ใช้งาน",
			description: "บัญชีนี้ไม่สามารถสร้าง Superadmin ได้",
		});
		return;
	}

	createOpen.value = true;
}

function toOptionalNumber(value: string | number) {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}

	const trimmed = value.trim();
	return trimmed === "" ? null : Number(trimmed);
}

function resetCreateForm() {
	createForm.name = "";
	createForm.email = "";
	createForm.password = "dev123456";
	createForm.ui_locale = "th";
	createForm.can_create_stores = true;
	createForm.max_branches_per_store = "5";
	createForm.can_create_branches = true;
	createForm.must_change_password = true;
}

function resetListPage() {
	currentPage.value = 1;
}

function applyFilters() {
	resetListPage();
	return loadClients();
}

function goToPage(nextPage: number) {
	const normalizedPage = Math.min(Math.max(1, nextPage), totalPages.value);
	if (normalizedPage === currentPage.value) return;
	currentPage.value = normalizedPage;
	return loadClients();
}

function updatePageSize(nextPageSize: number | string) {
	const normalizedSize = Number(nextPageSize);
	if (!Number.isFinite(normalizedSize) || normalizedSize <= 0 || normalizedSize === pageSize.value) return;
	pageSize.value = normalizedSize;
	resetListPage();
	return loadClients();
}

async function loadClients() {
	pending.value = true;
	error.value = null;
	try {
		const params = new URLSearchParams();
		if (searchQuery.value.trim()) params.set("search", searchQuery.value.trim());
		if (activeStatus.value !== "all") params.set("status", activeStatus.value);
		params.set("page", String(currentPage.value));
		params.set("limit", String(pageSize.value));

		const response = await apiFetch<ApiEnvelope<ClientListResponse>>(`/system-admin/clients?${params.toString()}`);
		clients.value = response.data.items;
		totalClients.value = response.data.total;
		summaryData.value = response.data.summary;

		if (selectedClientId.value && !clients.value.some((client) => client.id === selectedClientId.value)) {
			selectedClientId.value = "";
			detailOpen.value = false;
		}
	} catch (err) {
		error.value = err instanceof Error ? err.message : "โหลด client accounts ไม่สำเร็จ";
	} finally {
		pending.value = false;
	}
}

async function createClient() {
	saving.value = true;
	try {
		await apiFetch<ApiEnvelope<ClientRecord>>("/system-admin/clients", {
			method: "POST",
			body: {
				name: createForm.name,
				email: createForm.email,
				password: createForm.password,
				ui_locale: createForm.ui_locale,
				can_create_stores: createForm.can_create_stores ? 1 : 0,
				max_branches_per_store: toOptionalNumber(createForm.max_branches_per_store),
				can_create_branches: createForm.can_create_branches ? 1 : 0,
				must_change_password: createForm.must_change_password,
				created_by: currentUser.value?.id || null,
			},
		});
		createOpen.value = false;
		resetCreateForm();
		resetListPage();
		appToast.success({
			title: "สร้าง Superadmin แล้ว",
			description: "บัญชีใหม่พร้อมใช้สำหรับสร้างร้านของตัวเอง",
		});
		await loadClients();
	} catch (err) {
		appToast.error({
			title: "สร้างบัญชีไม่สำเร็จ",
			description: err instanceof Error ? err.message : "โปรดลองอีกครั้ง",
		});
	} finally {
		saving.value = false;
	}
}

async function saveClient() {
	if (!selectedClient.value) return;
	saving.value = true;
	try {
		await apiFetch<ApiEnvelope<ClientRecord>>(`/system-admin/clients/${encodeURIComponent(selectedClient.value.id)}`, {
			method: "PATCH",
			body: {
				name: detailForm.name,
				ui_locale: detailForm.ui_locale,
				can_create_stores: detailForm.can_create_stores ? 1 : 0,
				max_branches_per_store: toOptionalNumber(detailForm.max_branches_per_store),
				can_create_branches: detailForm.can_create_branches ? 1 : 0,
				must_change_password: detailForm.must_change_password,
				actor_user_id: currentUser.value?.id || null,
			},
		});
		appToast.success({
			title: "อัปเดต client แล้ว",
			description: "quota และสิทธิ์สร้างร้านถูกบันทึกแล้ว",
		});
		await loadClients();
	} catch (err) {
		appToast.error({
			title: "บันทึกไม่สำเร็จ",
			description: err instanceof Error ? err.message : "โปรดลองอีกครั้ง",
		});
	} finally {
		saving.value = false;
	}
}

async function updateClientStatus(nextStatus: "active" | "suspended") {
	if (!selectedClient.value) return;
	saving.value = true;
	try {
		await apiFetch<ApiEnvelope<ClientRecord>>(`/system-admin/clients/${encodeURIComponent(selectedClient.value.id)}/status`, {
			method: "PATCH",
			body: {
				status: nextStatus,
				reason: nextStatus === "suspended" ? detailForm.suspend_reason : null,
				actor_user_id: currentUser.value?.id || null,
			},
		});
		appToast.success({
			title: nextStatus === "suspended" ? "พักบัญชีแล้ว" : "เปิดใช้งานแล้ว",
			description: nextStatus === "suspended" ? "บัญชีนี้จะไม่สามารถ login ได้จนกว่าจะเปิดใช้งานอีกครั้ง" : "บัญชีกลับมาใช้งานได้แล้ว",
		});
		await loadClients();
	} catch (err) {
		appToast.error({
			title: "อัปเดตสถานะไม่สำเร็จ",
			description: err instanceof Error ? err.message : "โปรดลองอีกครั้ง",
		});
	} finally {
		saving.value = false;
	}
}

onMounted(loadClients);
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['system-admin']"
		sidebar-eyebrow="System"
		sidebar-title="System Admin"
		sidebar-compact-title="SYS"
		sidebar-description="จัดการ client / superadmin accounts ที่จะไปสร้างร้านของตัวเองต่อ"
	>
		<template #default="{ openSidebar }">
			<div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
				<AppPageHeader
					title="Clients"
					description=""
					:tablet-layout="true"
					@menu="openSidebar"
				>
					<template #actions>
						<div class="ml-auto flex w-full flex-wrap justify-end gap-2 md:w-auto">
								<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-arrow-path-20-solid" :loading="pending" :disabled="pending" :spin-icon-on-loading="true" @click="loadClients">รีโหลด</AppButton>
								<AppButton color="primary" variant="solid" size="md" class="rounded-md" icon="i-heroicons-plus-20-solid" @click="openCreateModal">สร้าง Superadmin</AppButton>
						</div>
					</template>
					<template #default>
						<div class="flex flex-col gap-2 md:flex-row md:items-center">
							<div class="relative min-w-0 flex-1">
								<UIcon name="i-heroicons-magnifying-glass-20-solid" class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
								<input
									v-model="searchQuery"
									type="text"
									placeholder="ค้นหาชื่อหรืออีเมลของ Superadmin"
									class="w-full rounded-md border border-neutral-200 bg-white py-2.5 pl-10 pr-11 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
									@keydown.enter="applyFilters"
								>
								<button
									v-if="searchQuery"
									type="button"
									class="absolute right-2.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 transition hover:bg-primary-50 hover:text-primary-700"
									@click="searchQuery = ''; applyFilters()"
								>
									<UIcon name="i-heroicons-x-mark-20-solid" class="h-4 w-4" />
								</button>
							</div>

							<div class="flex w-full flex-wrap items-center justify-end gap-2 md:w-auto">
								<AppButton
									v-for="option in [
										{ id: 'all', label: 'ทั้งหมด' },
										{ id: 'active', label: 'ใช้งาน' },
										{ id: 'suspended', label: 'พักบัญชี' },
									]"
									:key="option.id"
									:color="activeStatus === option.id ? 'primary' : 'neutral'"
									:variant="activeStatus === option.id ? 'solid' : 'soft'"
										size="md"
									class="rounded-md"
									@click="activeStatus = option.id as 'all' | 'active' | 'suspended'; applyFilters()"
								>
									{{ option.label }}
								</AppButton>
							</div>
						</div>
					</template>
				</AppPageHeader>

				<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)] gap-3">
					<div class="h-full min-h-0 overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">Superadmin accounts</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">มุมมองตารางช่วยให้ไล่ดูสถานะ, quota และวันที่สร้างได้เร็วกว่า card list</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									{{ pageSummaryText }}
								</div>
							</div>

							<div class="min-h-0 flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
								<div v-if="pending" class="min-h-[280px]">
									<div class="overflow-hidden bg-neutral-100">
										<div class="client-loading-line h-[2px] w-1/3 rounded-r-full bg-primary" />
									</div>
								</div>
								<div v-else-if="error" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center text-stone-500">
									{{ error }}
								</div>
								<div v-else-if="!clients.length" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center text-stone-500">
									ยังไม่มี Superadmin account ในระบบ
								</div>
								<table v-else class="min-w-[940px] w-full border-separate border-spacing-0">
									<thead class="sticky top-0 z-10 bg-[#fcfbf8]">
										<tr class="text-left text-xs font-medium uppercase tracking-[0.18em] text-stone-400">
											<th class="border-b border-[#ece6dc] px-4 py-3">Superadmin</th>
											<th class="border-b border-[#ece6dc] px-4 py-3">สถานะ</th>
											<th class="border-b border-[#ece6dc] px-4 py-3">Store</th>
											<th class="border-b border-[#ece6dc] px-4 py-3">Branch quota</th>
											<th class="border-b border-[#ece6dc] px-4 py-3">Locale</th>
											<th class="border-b border-[#ece6dc] px-4 py-3">Created</th>
											<th class="border-b border-[#ece6dc] px-4 py-3 text-right">Action</th>
										</tr>
									</thead>
									<tbody>
										<tr
											v-for="client in clients"
											:key="client.id"
											class="cursor-pointer text-sm text-stone-700 transition hover:bg-primary-50"
											@click="openDetail(client.id)"
										>
											<td class="border-b border-[#f1ede6] px-4 py-4">
												<div class="min-w-0">
													<p class="truncate font-semibold text-stone-950">{{ client.name }}</p>
													<p class="mt-1 truncate text-xs text-stone-500">{{ client.email }}</p>
												</div>
											</td>
											<td class="border-b border-[#f1ede6] px-4 py-4">
												<UBadge :color="statusTone(client.status)" variant="soft" :label="client.status === 'active' ? 'พร้อมใช้งาน' : 'พักบัญชี'" />
											</td>
											<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600">1 store</td>
											<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600">{{ client.max_branches_per_store ?? "ไม่จำกัด" }}</td>
											<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600">{{ client.ui_locale.toUpperCase() }}</td>
											<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-500">{{ formatDate(client.created_at) }}</td>
											<td class="border-b border-[#f1ede6] px-4 py-4 text-right">
													<AppButton color="neutral" variant="soft" size="md" class="rounded-md" icon="i-heroicons-chevron-right-20-solid" @click.stop="openDetail(client.id)">
													จัดการ
												</AppButton>
											</td>
										</tr>
									</tbody>
								</table>
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

				<AppResponsivePanel
					v-model="createOpen"
					title="สร้าง Superadmin"
					description="บัญชีนี้จะใช้เป็นเจ้าของฝั่งธุรกิจเพื่อเข้าไปสร้างและดูแลร้านของตัวเองต่อ"
					desktop-width="520px"
					close-button-size="md"
					compact-header
					content-class="flex h-full flex-col overflow-hidden px-0 py-0"
				>
				<div class="flex h-full min-h-0 flex-col">
					<div class="scrollbar-soft min-h-0 flex-1 overflow-y-auto px-5 py-5">
						<div class="space-y-4 pb-6">
							<div class="grid gap-4">
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">ชื่อ</label>
									<input v-model="createForm.name" type="text" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
								</div>
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">อีเมล</label>
									<input v-model="createForm.email" type="email" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
								</div>
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">รหัสผ่านเริ่มต้น</label>
									<input v-model="createForm.password" type="text" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
								</div>
							</div>

							<div class="grid gap-4 sm:grid-cols-2">
								<div class="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
									<p class="text-xs font-medium text-stone-500">โควต้าร้าน</p>
									<p class="mt-2 text-sm font-semibold text-stone-900">1 Superadmin = 1 Store</p>
								</div>
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">สาขาต่อร้าน</label>
									<input v-model="createForm.max_branches_per_store" type="number" min="1" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
								</div>
							</div>

							<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<input v-model="createForm.can_create_stores" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
								<div>
									<p class="text-sm font-medium text-stone-900">อนุญาตให้สร้างร้าน</p>
									<p class="mt-1 text-xs leading-5 text-stone-500">ใช้สำหรับเจ้าของธุรกิจที่จะ onboarding ร้านของตัวเอง</p>
								</div>
							</label>

							<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<input v-model="createForm.can_create_branches" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
								<div>
									<p class="text-sm font-medium text-stone-900">อนุญาตให้สร้างสาขา</p>
									<p class="mt-1 text-xs leading-5 text-stone-500">ใช้คู่กับ quota สาขาต่อร้าน</p>
								</div>
							</label>

							<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<input v-model="createForm.must_change_password" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
								<div>
									<p class="text-sm font-medium text-stone-900">บังคับให้เปลี่ยนรหัสผ่านเมื่อ login ครั้งแรก</p>
								</div>
							</label>
						</div>
					</div>

						<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
							<div class="grid w-full grid-cols-2 gap-2">
								<AppButton color="neutral" variant="soft" size="md" :block="true" @click="createOpen = false">ยกเลิก</AppButton>
								<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-plus-20-solid" :loading="saving" :disabled="!canManageSystem" :spin-icon-on-loading="true" :block="true" @click="createClient">สร้างบัญชี</AppButton>
							</div>
						</div>
					</div>
				</AppResponsivePanel>

				<AppResponsivePanel
					v-model="detailOpen"
					title="Client detail"
					description="ปรับ quota, สิทธิ์สร้างร้าน และสถานะของ Superadmin บัญชีนี้"
					desktop-width="560px"
					close-button-size="md"
					compact-header
					content-class="flex h-full flex-col overflow-hidden px-0 py-0"
				>
				<div v-if="selectedClient" class="flex h-full min-h-0 flex-col">
					<div class="scrollbar-soft min-h-0 flex-1 overflow-y-auto px-5 py-5">
						<div class="space-y-5 pb-6">
							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<div class="flex flex-wrap items-center justify-between gap-3">
									<div>
										<p class="text-lg font-semibold text-stone-950">{{ selectedClient.name }}</p>
										<p class="mt-1 text-sm text-stone-500">{{ selectedClient.email }}</p>
									</div>
									<UBadge :color="statusTone(selectedClient.status)" variant="soft" :label="selectedClient.status === 'active' ? 'พร้อมใช้งาน' : 'พักบัญชี'" />
								</div>
								<div class="mt-4 grid gap-3 text-xs text-stone-500 sm:grid-cols-2">
									<div>สร้างเมื่อ {{ formatDate(selectedClient.created_at) }}</div>
									<div>พักบัญชีล่าสุด {{ formatDate(selectedClient.client_suspended_at) }}</div>
								</div>
							</div>

							<div class="grid gap-4">
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">ชื่อ</label>
									<input v-model="detailForm.name" type="text" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
								</div>
								<div class="grid gap-4 sm:grid-cols-2">
									<div class="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
										<p class="text-xs font-medium text-stone-500">โควต้าร้าน</p>
										<p class="mt-2 text-sm font-semibold text-stone-900">คงที่ 1 ร้านต่อบัญชี</p>
									</div>
									<div>
										<label class="mb-2 block text-xs font-medium text-stone-500">สาขาต่อร้าน</label>
										<input v-model="detailForm.max_branches_per_store" type="number" min="1" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
									</div>
								</div>
							</div>

							<div class="space-y-3">
								<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<input v-model="detailForm.can_create_stores" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
									<div>
										<p class="text-sm font-medium text-stone-900">อนุญาตให้สร้างร้าน</p>
									</div>
								</label>
								<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<input v-model="detailForm.can_create_branches" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
									<div>
										<p class="text-sm font-medium text-stone-900">อนุญาตให้สร้างสาขา</p>
									</div>
								</label>
								<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<input v-model="detailForm.must_change_password" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
									<div>
										<p class="text-sm font-medium text-stone-900">บังคับเปลี่ยนรหัสผ่านในการ login ครั้งถัดไป</p>
									</div>
								</label>
							</div>

							<div class="rounded-md border border-warning-200 bg-warning-50 p-4">
								<p class="text-sm font-medium text-stone-900">สถานะบัญชี</p>
								<p class="mt-1 text-xs leading-5 text-stone-500">ใช้ส่วนนี้ในการพักบัญชีชั่วคราว หรือเปิดใช้งานกลับเมื่อพร้อม</p>
								<div v-if="selectedClient.status === 'active'" class="mt-4 space-y-3">
									<textarea
										v-model="detailForm.suspend_reason"
										rows="3"
										placeholder="เหตุผลที่พักบัญชี"
										class="w-full resize-none rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
									/>
										<AppButton color="warning" variant="soft" size="md" icon="i-heroicons-pause-circle-20-solid" :loading="saving" :disabled="!canManageSystem" :spin-icon-on-loading="true" @click="updateClientStatus('suspended')">พักบัญชี</AppButton>
								</div>
								<div v-else class="mt-4 space-y-3">
									<p class="text-xs text-stone-500">เหตุผลล่าสุด: {{ selectedClient.client_suspended_reason || "ไม่ได้ระบุ" }}</p>
										<AppButton color="success" variant="soft" size="md" icon="i-heroicons-check-circle-20-solid" :loading="saving" :disabled="!canManageSystem" :spin-icon-on-loading="true" @click="updateClientStatus('active')">เปิดใช้งานกลับ</AppButton>
								</div>
							</div>
						</div>
					</div>

						<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
							<div class="grid w-full grid-cols-2 gap-2">
								<AppButton color="neutral" variant="soft" size="md" :block="true" @click="detailOpen = false">ปิด</AppButton>
								<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-check-20-solid" :loading="saving" :disabled="!canManageSystem || !detailHasChanges" :spin-icon-on-loading="true" :block="true" @click="saveClient">บันทึก</AppButton>
							</div>
						</div>
					</div>
			</AppResponsivePanel>
		</template>
	</AppSidebarShell>
</template>

<style scoped>
@keyframes client-loading-slide {
	0% { transform: translateX(-120%); }
	100% { transform: translateX(420%); }
}

.client-loading-line {
	animation: client-loading-slide 1.2s linear infinite;
	will-change: transform;
}
</style>
