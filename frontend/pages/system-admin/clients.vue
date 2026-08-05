<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";
import { formatAppDateTime } from "~/utils/date-format";

// Starter credential for a new client account; must_change_password is sent
// alongside it so the owner replaces it on first sign-in.
const QUICK_FILL_PASSWORD = "123456";

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

type ApiSystemConfig = {
	default_can_create_branches: number;
	default_max_branches_per_store: number | null;
};

type ClientDeleteCheck = {
	client_id: string;
	can_delete: boolean;
	counts: {
		stores: number;
		branches: number;
		store_memberships: number;
		orders: number;
		purchase_orders: number;
		inventory_balances: number;
		inventory_movements: number;
		store_integrations: number;
		fb_connections: number;
		wa_connections: number;
	};
	reasons: string[];
};

type CreatedClientCredential = {
	name: string;
	email: string;
	password: string;
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
const deleteOpen = ref(false);
const resetPasswordOpen = ref(false);
const showCreatePassword = ref(false);
const showResetPassword = ref(false);
const createSuccess = ref<CreatedClientCredential | null>(null);
const resetPasswordSuccess = ref<CreatedClientCredential | null>(null);
const deleteCheckPending = ref(false);
const deleteCheck = ref<ClientDeleteCheck | null>(null);
const deleteConfirmText = ref("");
const systemDefaults = ref<ApiSystemConfig>({
	default_can_create_branches: 1,
	default_max_branches_per_store: 5,
});
// Branch creation is not supported yet, so both forms only draft the store
// quota.
const createBranchDraft = reactive({
	max_stores: "1",
});
const detailBranchDraft = reactive({
	max_stores: "1",
});

const createForm = reactive({
	name: "",
	email: "",
	password: "",
	ui_locale: "th",
	can_create_stores: true,
	max_stores: "1",
	must_change_password: true,
});

const detailForm = reactive({
	name: "",
	email: "",
	ui_locale: "th",
	can_create_stores: true,
	max_stores: "1",
	must_change_password: false,
	suspend_reason: "",
});

const resetPasswordForm = reactive({
	password: "",
	must_change_password: true,
});

const canManageSystem = computed(() => (
	can("system_admin.clients.create")
	|| can("system_admin.clients.update")
	|| can("system_admin.clients.delete")
));
const isSelectedCurrentUser = computed(() => selectedClient.value?.id === currentUser.value?.id);
const deleteConfirmTarget = computed(() => selectedClient.value?.email || "");
const canSubmitDelete = computed(() => (
	Boolean(selectedClient.value)
	&& Boolean(deleteCheck.value?.can_delete)
	&& deleteConfirmText.value.trim().toLowerCase() === deleteConfirmTarget.value.trim().toLowerCase()
	&& !isSelectedCurrentUser.value
));

const selectedClient = computed(() =>
	clients.value.find((client) => client.id === selectedClientId.value) || null,
);

const detailHasChanges = computed(() => {
	if (!selectedClient.value) return false;

	return (
		detailForm.name !== selectedClient.value.name
		|| detailForm.email !== selectedClient.value.email
		|| detailForm.ui_locale !== (selectedClient.value.ui_locale || "th")
		|| detailForm.can_create_stores !== Boolean(selectedClient.value.can_create_stores)
		|| detailForm.max_stores !== (selectedClient.value.max_stores === null ? "" : String(selectedClient.value.max_stores))
		|| detailForm.must_change_password !== Boolean(selectedClient.value.must_change_password)
	);
});

const totalPages = computed(() => Math.max(1, Math.ceil(totalClients.value / pageSize.value)));
const pageLabel = computed(() => `ໜ້າ ${currentPage.value} / ${totalPages.value}`);
const pageStart = computed(() => (
	totalClients.value === 0
		? 0
		: ((currentPage.value - 1) * pageSize.value) + 1
));
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, totalClients.value));
const pageSummaryText = computed(() => (
	totalClients.value === 0
		? "ຍັງບໍ່ມີຂໍ້ມູນ"
		: `${pageStart.value}-${pageEnd.value} ຈາກ ${totalClients.value} ບັນຊີ`
));
const createStorePermissionHint = computed(() => (
	createForm.can_create_stores
		? "ບັນຊີນີ້ສາມາດ login ແລ້ວເລີ່ມສ້າງຮ້ານທຳອິດຂອງຕົນເອງໄດ້ ລວມເຖິງເພີ່ມຮ້ານຕໍ່ໄປຕາມ quota"
		: "ບັນຊີນີ້ login ໄດ້ ແຕ່ຍັງເລີ່ມສ້າງຮ້ານທຳອິດ ຫຼື ເພີ່ມຮ້ານໃໝ່ບໍ່ໄດ້"
));
const detailStorePermissionHint = computed(() => (
	detailForm.can_create_stores
		? "ບັນຊີນີ້ສາມາດ login ແລ້ວເລີ່ມສ້າງຮ້ານທຳອິດຂອງຕົນເອງໄດ້ ລວມເຖິງເພີ່ມຮ້ານຕໍ່ໄປຕາມ quota"
		: "ບັນຊີນີ້ login ໄດ້ ແຕ່ຍັງເລີ່ມສ້າງຮ້ານທຳອິດ ຫຼື ເພີ່ມຮ້ານໃໝ່ບໍ່ໄດ້"
));

watch(selectedClient, (client) => {
	if (!client) return;
	detailForm.name = client.name;
	detailForm.email = client.email;
	detailForm.ui_locale = client.ui_locale || "th";
	detailForm.can_create_stores = Boolean(client.can_create_stores);
	detailForm.max_stores = client.max_stores === null ? "" : String(client.max_stores);
	detailForm.must_change_password = Boolean(client.must_change_password);
	detailForm.suspend_reason = client.client_suspended_reason || "";
	detailBranchDraft.max_stores = detailForm.max_stores;
}, { immediate: true });

watch(() => createForm.can_create_stores, (enabled, previous) => {
	if (enabled) {
		if (previous === false) {
			createForm.max_stores = createBranchDraft.max_stores || "1";
		}
		return;
	}

	createBranchDraft.max_stores = createForm.max_stores;
	createForm.max_stores = "";
});

watch(() => detailForm.can_create_stores, (enabled, previous) => {
	if (enabled) {
		if (previous === false) {
			detailForm.max_stores = detailBranchDraft.max_stores || "1";
		}
		return;
	}

	detailBranchDraft.max_stores = detailForm.max_stores;
	detailForm.max_stores = "";
});

watch(createOpen, (opened) => {
	if (opened) return;
	resetCreateForm();
});

watch(detailOpen, (opened) => {
	if (opened) return;
	closeDeleteModal();
	closeResetPasswordModal();
});

// This console is Lao-only, so dates use the shared Lao month names instead
// of a Thai locale.
function formatDate(value: string | null) {
	if (!value) return "ຍັງບໍ່ມີ";
	return formatAppDateTime(value, "lo");
}

function statusTone(status: ClientRecord["status"]) {
	return status === "active" ? "success" : "warning";
}

function storeQuotaLabel(client: ClientRecord) {
	if (!client.can_create_stores) return "ປິດສິດ";
	return client.max_stores ?? "ບໍ່ຈຳກັດ";
}

function branchQuotaLabel(client: ClientRecord) {
	if (!client.can_create_stores || !client.can_create_branches) return "ປິດສິດ";
	return client.max_branches_per_store ?? "ບໍ່ຈຳກັດ";
}

function openDetail(clientId: string) {
	selectedClientId.value = clientId;
	detailOpen.value = true;
}

async function openDeleteModal() {
	if (!selectedClient.value) return;
	deleteOpen.value = true;
	deleteConfirmText.value = "";
	deleteCheck.value = null;
	deleteCheckPending.value = true;

	try {
		const response = await apiFetch<ApiEnvelope<ClientDeleteCheck>>(`/system-admin/clients/${encodeURIComponent(selectedClient.value.id)}/delete-check`);
		deleteCheck.value = response.data;
	} catch (err) {
		appToast.error({
			title: "ໂຫຼດເງື່ອນໄຂການລຶບບໍ່ສຳເລັດ",
			description: resolveApiErrorMessage(err),
		});
		deleteOpen.value = false;
	} finally {
		deleteCheckPending.value = false;
	}
}

function openCreateModal() {
	if (!canManageSystem.value) {
		appToast.error({
			title: "ບໍ່ມີສິດໃຊ້ງານ",
			description: "ບັນຊີນີ້ບໍ່ສາມາດສ້າງ Super Admin ໄດ້",
		});
		return;
	}

	createOpen.value = true;
}

function fillQuickPassword() {
	createForm.password = QUICK_FILL_PASSWORD;
}

function quickFillResetPassword() {
	resetPasswordForm.password = QUICK_FILL_PASSWORD;
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
	createForm.password = "";
	createForm.ui_locale = "th";
	createForm.can_create_stores = true;
	createForm.max_stores = "1";
	createForm.must_change_password = true;
	createBranchDraft.max_stores = createForm.max_stores;
	showCreatePassword.value = false;
	createSuccess.value = null;
}

function closeCreateModal() {
	createOpen.value = false;
	resetCreateForm();
}

function closeDeleteModal() {
	deleteOpen.value = false;
	deleteCheckPending.value = false;
	deleteCheck.value = null;
	deleteConfirmText.value = "";
}

function resetResetPasswordForm() {
	resetPasswordForm.password = "";
	resetPasswordForm.must_change_password = true;
	showResetPassword.value = false;
	resetPasswordSuccess.value = null;
}

function openResetPasswordModal() {
	if (!selectedClient.value) return;
	resetResetPasswordForm();
	resetPasswordOpen.value = true;
}

function closeResetPasswordModal() {
	resetPasswordOpen.value = false;
	resetResetPasswordForm();
}

function completeResetPasswordFlow() {
	closeResetPasswordModal();
	detailOpen.value = false;
}

async function copyCreatedCredential() {
	if (!createSuccess.value || !import.meta.client) return;

	const text = [
		`Username: ${createSuccess.value.email}`,
		`Password: ${createSuccess.value.password}`,
	].join("\n");

	try {
		await navigator.clipboard.writeText(text);
		appToast.success({
			title: "ຄັດລອກ credential ແລ້ວ",
			description: "ນຳໄປສົ່ງຕໍ່ໃຫ້ client ໄດ້ທັນທີ",
		});
	} catch {
		appToast.error({
			title: "ຄັດລອກບໍ່ສຳເລັດ",
			description: "ກະລຸນາລອງຄັດລອກອີກຄັ້ງ",
		});
	}
}

async function copyDeleteConfirmTarget() {
	if (!deleteConfirmTarget.value || !import.meta.client) return;

	try {
		await navigator.clipboard.writeText(deleteConfirmTarget.value);
		appToast.success({
			title: "ຄັດລອກອີເມວແລ້ວ",
			description: "ນຳອີເມວນີ້ໄປໃຊ້ຢືນຢັນການລຶບໄດ້ທັນທີ",
		});
	} catch {
		appToast.error({
			title: "ຄັດລອກບໍ່ສຳເລັດ",
			description: "ກະລຸນາລອງຄັດລອກອີກຄັ້ງ",
		});
	}
}

async function shareCreatedCredential() {
	if (!createSuccess.value || !import.meta.client) return;

	const text = [
		`Username: ${createSuccess.value.email}`,
		`Password: ${createSuccess.value.password}`,
	].join("\n");

	if (typeof navigator.share === "function") {
		try {
			await navigator.share({
				title: "Client login credential",
				text,
			});
			return;
		} catch (error) {
			const message = error instanceof Error ? error.message : "";
			if (message.toLowerCase().includes("abort")) return;
		}
	}

	await copyCreatedCredential();
	appToast.success({
		title: "ອຸປະກອນນີ້ບໍ່ຮອງຮັບ share ໂດຍກົງ",
		description: "ລະບົບຄັດລອກ credential ໃຫ້ແລ້ວ ເພື່ອນຳໄປວາງສົ່ງຕໍ່ໄດ້ທັນທີ",
	});
}

async function copyResetPasswordCredential() {
	if (!resetPasswordSuccess.value || !import.meta.client) return;

	const text = [
		`Username: ${resetPasswordSuccess.value.email}`,
		`Password: ${resetPasswordSuccess.value.password}`,
	].join("\n");

	try {
		await navigator.clipboard.writeText(text);
		appToast.success({
			title: "ຄັດລອກ credential ແລ້ວ",
			description: "ນຳໄປສົ່ງຕໍ່ໃຫ້ client ໄດ້ທັນທີ",
		});
	} catch {
		appToast.error({
			title: "ຄັດລອກບໍ່ສຳເລັດ",
			description: "ກະລຸນາລອງຄັດລອກອີກຄັ້ງ",
		});
	}
}

async function shareResetPasswordCredential() {
	if (!resetPasswordSuccess.value || !import.meta.client) return;

	const text = [
		`Username: ${resetPasswordSuccess.value.email}`,
		`Password: ${resetPasswordSuccess.value.password}`,
	].join("\n");

	if (typeof navigator.share === "function") {
		try {
			await navigator.share({
				title: "Client login credential",
				text,
			});
			return;
		} catch (error) {
			const message = error instanceof Error ? error.message : "";
			if (message.toLowerCase().includes("abort")) return;
		}
	}

	await copyResetPasswordCredential();
	appToast.success({
		title: "ອຸປະກອນນີ້ບໍ່ຮອງຮັບ share ໂດຍກົງ",
		description: "ລະບົບຄັດລອກ credential ໃຫ້ແລ້ວ ເພື່ອນຳໄປວາງສົ່ງຕໍ່ໄດ້ທັນທີ",
	});
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
		error.value = resolveApiErrorMessage(err, "ໂຫຼດ client accounts ບໍ່ສຳເລັດ", {
			forbiddenMessage: "ບັນຊີນີ້ບໍ່ມີສິດເບິ່ງ Client Accounts",
		});
	} finally {
		pending.value = false;
	}
}

async function loadCreateDefaults() {
	try {
		const response = await apiFetch<ApiEnvelope<ApiSystemConfig>>("/system-admin/config");
		systemDefaults.value = response.data;
		resetCreateForm();
	} catch {
		resetCreateForm();
	}
}

async function createClient() {
	saving.value = true;
	try {
		const plainPassword = createForm.password;
		await apiFetch<ApiEnvelope<ClientRecord>>("/system-admin/clients", {
			method: "POST",
			body: {
				name: createForm.name,
				email: createForm.email,
				password: createForm.password,
				ui_locale: createForm.ui_locale,
				can_create_stores: createForm.can_create_stores ? 1 : 0,
				max_stores: createForm.can_create_stores ? toOptionalNumber(createForm.max_stores) : null,
				max_branches_per_store: null,
				can_create_branches: 0,
				must_change_password: createForm.must_change_password,
				created_by: currentUser.value?.id || null,
			},
		});
		createSuccess.value = {
			name: createForm.name,
			email: createForm.email,
			password: plainPassword,
		};
		resetListPage();
		appToast.success({
			title: "ສ້າງ Super Admin ແລ້ວ",
			description: "ບັນຊີໃໝ່ພ້ອມສຳລັບ login ແລ້ວເລີ່ມ onboarding ຮ້ານຂອງຕົນເອງ",
		});
		await loadClients();
	} catch (err) {
		appToast.error({
			title: "ສ້າງບັນຊີບໍ່ສຳເລັດ",
			description: resolveApiErrorMessage(err),
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
				email: detailForm.email,
				ui_locale: detailForm.ui_locale,
				can_create_stores: detailForm.can_create_stores ? 1 : 0,
				max_stores: detailForm.can_create_stores ? toOptionalNumber(detailForm.max_stores) : null,
				max_branches_per_store: null,
				can_create_branches: 0,
				must_change_password: detailForm.must_change_password,
				actor_user_id: currentUser.value?.id || null,
			},
		});
		appToast.success({
			title: "ອັບເດດ client ແລ້ວ",
			description: "ສິດ onboarding ຮ້ານ ແລະ quota ຖືກບັນທຶກແລ້ວ",
		});
		await loadClients();
	} catch (err) {
		appToast.error({
			title: "ບັນທຶກບໍ່ສຳເລັດ",
			description: resolveApiErrorMessage(err),
		});
	} finally {
		saving.value = false;
	}
}

async function resetClientPassword() {
	if (!selectedClient.value) return;
	saving.value = true;
	try {
		const plainPassword = resetPasswordForm.password;
		await apiFetch<ApiEnvelope<ClientRecord>>(`/system-admin/clients/${encodeURIComponent(selectedClient.value.id)}/reset-password`, {
			method: "POST",
			body: {
				password: resetPasswordForm.password,
				must_change_password: resetPasswordForm.must_change_password,
				actor_user_id: currentUser.value?.id || null,
			},
		});
		resetPasswordSuccess.value = {
			name: selectedClient.value.name,
			email: selectedClient.value.email,
			password: plainPassword,
		};
		appToast.success({
			title: "ອັບເດດລະຫັດຜ່ານແລ້ວ",
			description: "credential ຊຸດໃໝ່ພ້ອມສົ່ງຕໍ່ໃຫ້ client ແລ້ວ",
		});
		await loadClients();
	} catch (err) {
		appToast.error({
			title: "ອັບເດດລະຫັດຜ່ານບໍ່ສຳເລັດ",
			description: resolveApiErrorMessage(err),
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
			title: nextStatus === "suspended" ? "ພັກບັນຊີແລ້ວ" : "ເປີດໃຊ້ງານແລ້ວ",
			description: nextStatus === "suspended" ? "ບັນຊີນີ້ຈະບໍ່ສາມາດ login ໄດ້ຈົນກວ່າຈະເປີດໃຊ້ງານອີກຄັ້ງ" : "ບັນຊີກັບມາໃຊ້ງານໄດ້ແລ້ວ",
		});
		await loadClients();
	} catch (err) {
		appToast.error({
			title: "ອັບເດດສະຖານະບໍ່ສຳເລັດ",
			description: resolveApiErrorMessage(err),
		});
	} finally {
		saving.value = false;
	}
}

async function deleteClient() {
	if (!selectedClient.value) return;
	saving.value = true;

	try {
		await apiFetch<ApiEnvelope<{ id: string; deleted: true }>>(`/system-admin/clients/${encodeURIComponent(selectedClient.value.id)}`, {
			method: "DELETE",
			body: {
				actor_user_id: currentUser.value?.id || null,
			},
		});
		appToast.success({
			title: "ລຶບ client ແລ້ວ",
			description: "ບັນຊີນີ້ຖືກລຶບອອກຈາກລະບົບຮຽບຮ້ອຍແລ້ວ",
		});
		closeDeleteModal();
		detailOpen.value = false;
		selectedClientId.value = "";
		await loadClients();
	} catch (err) {
		appToast.error({
			title: "ລຶບ client ບໍ່ສຳເລັດ",
			description: resolveApiErrorMessage(err),
		});
	} finally {
		saving.value = false;
	}
}

onMounted(async () => {
	await Promise.all([
		loadClients(),
		loadCreateDefaults(),
	]);
});
</script>

<template>
		<AppSidebarShell
			:nav-items="appNavItems"
			:active-ids="['system-clients']"
			sidebar-eyebrow="System"
			sidebar-title="System Admin"
		sidebar-compact-title="SYS"
		sidebar-description="ຈັດການ client / superadmin accounts ທີ່ຈະ login ແລ້ວເລີ່ມສ້າງຮ້ານຂອງຕົນເອງ"
	>
		<template #default="{ openSidebar }">
			<div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
					<AppPageHeader
						title="ບັນຊີ Client"
						description=""
						:title-badge="false"
						compact
						body-class="px-3 py-2.5 sm:px-4 sm:py-3"
						:tablet-layout="true"
					@menu="openSidebar"
				>
					<template #actions>
						<div class="ml-auto flex w-full flex-wrap justify-end gap-2 md:w-auto">
								<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-arrow-path-20-solid" :loading="pending" :disabled="pending" :spin-icon-on-loading="true" @click="loadClients">ໂຫຼດໃໝ່</AppButton>
								<AppButton color="primary" variant="solid" size="md" class="rounded-md" icon="i-heroicons-plus-20-solid" @click="openCreateModal">ສ້າງ Super Admin</AppButton>
						</div>
					</template>
					<template #default>
						<div class="flex flex-col gap-2 md:flex-row md:items-center">
							<div class="relative min-w-0 flex-1">
								<UIcon name="i-heroicons-magnifying-glass-20-solid" class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
								<input
									v-model="searchQuery"
									type="text"
									placeholder="ຄົ້ນຫາຊື່ ຫຼື ອີເມວຂອງ Super Admin"
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
										{ id: 'all', label: 'ທັງໝົດ' },
										{ id: 'active', label: 'ໃຊ້ງານ' },
										{ id: 'suspended', label: 'ພັກບັນຊີ' },
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
									<p class="text-sm font-semibold text-stone-950">ບັນຊີ Super Admin</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">ມຸມມອງຕາຕະລາງຊ່ວຍໃຫ້ໄລ່ເບິ່ງສະຖານະ, quota ແລະ ວັນທີ່ສ້າງໄດ້ໄວກວ່າ card list</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									{{ pageSummaryText }}
								</div>
							</div>

							<div class="min-h-0 flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
								<div v-if="pending" class="min-h-[280px]">
									<AppInlineLoadingBar container-class="bg-neutral-100" />
								</div>
								<div v-else-if="error" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center text-stone-500">
									{{ error }}
								</div>
								<div v-else-if="!clients.length" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center text-stone-500">
									ຍັງບໍ່ມີ Super Admin account ໃນລະບົບ
								</div>
								<table v-else class="min-w-[940px] w-full border-separate border-spacing-0">
									<thead class="sticky top-0 z-10 bg-[#fcfbf8]">
										<tr class="text-left text-xs font-medium uppercase tracking-[0.18em] text-stone-400">
											<th class="border-b border-[#ece6dc] px-4 py-3">Super Admin</th>
											<th class="border-b border-[#ece6dc] px-4 py-3">ສະຖານະ</th>
											<th class="border-b border-[#ece6dc] px-4 py-3">ຮ້ານ</th>
											<th class="border-b border-[#ece6dc] px-4 py-3">quota ສາຂາ</th>
											<th class="border-b border-[#ece6dc] px-4 py-3">ພາສາ</th>
											<th class="border-b border-[#ece6dc] px-4 py-3">ສ້າງເມື່ອ</th>
											<th class="border-b border-[#ece6dc] px-4 py-3 text-right">ຈັດການ</th>
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
												<UBadge :color="statusTone(client.status)" variant="soft" :label="client.status === 'active' ? 'ພ້ອມໃຊ້ງານ' : 'ພັກບັນຊີ'" />
											</td>
											<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600">{{ storeQuotaLabel(client) }}</td>
											<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600">{{ branchQuotaLabel(client) }}</td>
											<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600">{{ client.ui_locale.toUpperCase() }}</td>
											<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-500">{{ formatDate(client.created_at) }}</td>
											<td class="border-b border-[#f1ede6] px-4 py-4 text-right">
													<AppButton color="neutral" variant="soft" size="md" class="rounded-md" icon="i-heroicons-chevron-right-20-solid" @click.stop="openDetail(client.id)">
													ຈັດການ
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
											<label class="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">ຕໍ່ໜ້າ</label>
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
												aria-label="ໜ້າກ່ອນໜ້າ"
												title="ໜ້າກ່ອນໜ້າ"
												@click="goToPage(currentPage - 1)"
											>
												<span class="hidden sm:inline">ກ່ອນໜ້າ</span>
											</AppButton>
											<AppButton
												color="neutral"
												variant="soft"
													size="md"
												class="rounded-md"
												trailing-icon="i-heroicons-chevron-right-20-solid"
												:disabled="currentPage >= totalPages || pending"
												aria-label="ໜ້າຕໍ່ໄປ"
												title="ໜ້າຕໍ່ໄປ"
												@click="goToPage(currentPage + 1)"
											>
												<span class="hidden sm:inline">ຕໍ່ໄປ</span>
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
					title="ສ້າງ Super Admin"
					description="ບັນຊີນີ້ຈະໃຊ້ login ເພື່ອເລີ່ມສ້າງຮ້ານທຳອິດ ແລະ ຕັ້ງຄ່າທີມ/ຂໍ້ມູນທຸລະກິດຂອງຕົນເອງ"
					desktop-width="680px"
					mobile-max-height="88dvh"
					:fill-mobile-height="true"
					close-button-size="md"
					compact-header
					content-class="flex h-full flex-col overflow-hidden px-0 py-0"
				>
				<div class="flex h-full min-h-0 flex-col">
					<div class="scrollbar-soft min-h-0 flex-1 overflow-y-auto px-5 py-5">
						<div v-if="!createSuccess" class="space-y-4 pb-6">
							<div class="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
								<p class="text-sm font-medium text-stone-900">ບັນຊີໃໝ່ຈະຍັງບໍ່ມີຮ້ານໃນທັນທີ</p>
								<p class="mt-1 text-xs leading-5 text-stone-500">ເມື່ອ login ຄັ້ງທຳອິດ ລະບົບຈະພາ client ໄປເລີ່ມ onboarding ຮ້ານທຳອິດຂອງຕົນເອງຕາມສິດທີ່ທ່ານກຳນົດໃນ modal ນີ້</p>
							</div>

							<div class="grid gap-4">
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">ຊື່</label>
									<input v-model="createForm.name" type="text" placeholder="ຕົວຢ່າງ: ສົມໄຊ ວົງສະຫວັນ" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
								</div>
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">ອີເມວ</label>
									<input v-model="createForm.email" type="email" placeholder="example@business.com" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
								</div>
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">ລະຫັດຜ່ານ</label>
									<div class="relative">
										<input
											v-model="createForm.password"
											:type="showCreatePassword ? 'text' : 'password'"
											placeholder="ຢ່າງໜ້ອຍ 6 ຕົວອັກສອນ"
											class="w-full rounded-md border border-neutral-200 bg-white py-3 pl-4 pr-12 text-sm text-stone-900 placeholder:text-stone-400 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
										>
										<button
											type="button"
											class="absolute right-2.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 transition hover:bg-primary-50 hover:text-primary-700"
											:aria-label="showCreatePassword ? 'ເຊື່ອງລະຫັດຜ່ານ' : 'ສະແດງລະຫັດຜ່ານ'"
											:title="showCreatePassword ? 'ເຊື່ອງລະຫັດຜ່ານ' : 'ສະແດງລະຫັດຜ່ານ'"
											@click="showCreatePassword = !showCreatePassword"
										>
											<UIcon :name="showCreatePassword ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'" class="h-4 w-4" />
										</button>
									</div>
									<p class="mt-2 text-xs leading-5 text-stone-500">ກຳນົດລະຫັດຜ່ານເລີ່ມຕົ້ນເອງກ່ອນສ້າງບັນຊີ ລະບົບຈະບໍ່ຕື່ມຄ່າ default ໃຫ້ແລ້ວ</p>
									<button
										type="button"
										class="mt-2 inline-flex items-center gap-1 rounded-md bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 transition hover:bg-primary-100"
										@click="fillQuickPassword"
									>
										<UIcon name="i-heroicons-bolt-20-solid" class="h-3.5 w-3.5" />
										ໃຊ້ລະຫັດ 123456
									</button>
								</div>
							</div>

							<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<input v-model="createForm.can_create_stores" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
								<div>
									<p class="text-sm font-medium text-stone-900">ອະນຸຍາດໃຫ້ເລີ່ມສ້າງຮ້ານຂອງຕົນເອງ</p>
									<p class="mt-1 text-xs leading-5 text-stone-500">{{ createStorePermissionHint }}</p>
								</div>
							</label>

							<div v-if="createForm.can_create_stores">
								<label class="mb-2 block text-xs font-medium text-stone-500">ຮ້ານທີ່ສ້າງໄດ້</label>
								<input v-model="createForm.max_stores" type="number" min="1" placeholder="1" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
								<p class="mt-2 text-xs leading-5 text-stone-500">ກຳນົດຈຳນວນຮ້ານລວມທີ່ບັນຊີນີ້ສ້າງໄດ້ ຖ້າໃຫ້ມີໄດ້ແຕ່ຮ້ານທຳອິດຂອງຕົນເອງ ໃຫ້ຄົງຄ່າ 1</p>
							</div>

							<div v-else class="rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-4 py-3">
								<p class="text-sm font-medium text-stone-900">ເຊື່ອງການຕັ້ງຄ່າ quota ໄວ້ກ່ອນ</p>
								<p class="mt-1 text-xs leading-5 text-stone-500">ເມື່ອເປີດສິດສ້າງຮ້ານ ລະບົບຈະສະແດງຈຳນວນຮ້ານລວມທີ່ສ້າງໄດ້ໃຫ້ອັດຕະໂນມັດ</p>
							</div>

							<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<input v-model="createForm.must_change_password" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
								<div>
									<p class="text-sm font-medium text-stone-900">ບັງຄັບໃຫ້ປ່ຽນລະຫັດຜ່ານເມື່ອ login ຄັ້ງທຳອິດ</p>
								</div>
							</label>
						</div>

						<div v-else class="space-y-4 pb-6">
							<div class="rounded-md border border-success/20 bg-success/5 p-4">
								<div class="flex items-start gap-3">
									<div class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-success/10 text-success ring-1 ring-success/15">
										<UIcon name="i-heroicons-check-circle-20-solid" class="h-5 w-5" />
									</div>
									<div>
										<p class="text-sm font-semibold text-stone-950">ສ້າງ Super Admin ສຳເລັດແລ້ວ</p>
										<p class="mt-1 text-sm leading-6 text-stone-600">ຄັດລອກ username ແລະ password ຊຸດນີ້ໄປສົ່ງຕໍ່ໃຫ້ client ໄດ້ທັນທີ ກ່ອນກົດ done ເພື່ອປິດ modal</p>
									</div>
								</div>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">ຂໍ້ມູນເຂົ້າໃຊ້</p>
								<div class="mt-4 space-y-3">
									<div>
										<label class="mb-2 block text-xs font-medium text-stone-500">ຊື່ຜູ້ໃຊ້</label>
										<div class="rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900">
											{{ createSuccess.email }}
										</div>
									</div>
									<div>
										<label class="mb-2 block text-xs font-medium text-stone-500">ລະຫັດຜ່ານ</label>
										<div class="rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900">
											{{ createSuccess.password }}
										</div>
									</div>
								</div>
							</div>

							<div class="rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-4 py-3">
								<p class="text-sm font-medium text-stone-900">{{ createSuccess.name }}</p>
								<p class="mt-1 text-xs leading-5 text-stone-500">credential ນີ້ສະແດງຊົ່ວຄາວໃນ modal ນີ້ເທົ່ານັ້ນ ຫຼັງປິດ modal ແລ້ວຈະບໍ່ສະແດງ password ເດີມອີກ</p>
							</div>
						</div>
					</div>

						<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
							<div v-if="!createSuccess" class="grid w-full grid-cols-2 gap-2">
								<AppButton color="neutral" variant="soft" size="md" :block="true" @click="closeCreateModal">ຍົກເລີກ</AppButton>
								<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-plus-20-solid" :loading="saving" :disabled="!canManageSystem" :spin-icon-on-loading="true" :block="true" @click="createClient">ສ້າງບັນຊີ</AppButton>
							</div>
							<div v-else class="grid w-full gap-2 sm:grid-cols-3">
								<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-clipboard-document-20-solid" :block="true" @click="copyCreatedCredential">ຄັດລອກ</AppButton>
								<AppButton color="primary" variant="soft" size="md" icon="i-heroicons-share-20-solid" :block="true" @click="shareCreatedCredential">ແບ່ງປັນ</AppButton>
								<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-check-20-solid" :block="true" @click="closeCreateModal">ສຳເລັດ</AppButton>
							</div>
						</div>
					</div>
				</AppResponsivePanel>

				<AppResponsivePanel
					v-model="detailOpen"
					title="ລາຍລະອຽດ Client"
					description="ປັບສິດ onboarding ຮ້ານ, quota ການຂະຫຍາຍຮ້ານ ແລະ ສະຖານະຂອງ Super Admin ບັນຊີນີ້"
					desktop-width="680px"
					mobile-max-height="88dvh"
					:fill-mobile-height="true"
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
									<UBadge :color="statusTone(selectedClient.status)" variant="soft" :label="selectedClient.status === 'active' ? 'ພ້ອມໃຊ້ງານ' : 'ພັກບັນຊີ'" />
								</div>
								<div class="mt-4 grid gap-3 text-xs text-stone-500 sm:grid-cols-2">
									<div>ສ້າງເມື່ອ {{ formatDate(selectedClient.created_at) }}</div>
									<div>ພັກບັນຊີຫຼ້າສຸດ {{ formatDate(selectedClient.client_suspended_at) }}</div>
								</div>
							</div>

							<div class="grid gap-4">
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">ຊື່</label>
									<input v-model="detailForm.name" type="text" placeholder="ຊື່ຂອງ Super Admin" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
								</div>
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">ອີເມວ</label>
									<input v-model="detailForm.email" type="email" placeholder="example@business.com" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
								</div>
							</div>

							<div class="space-y-3">
								<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<input v-model="detailForm.can_create_stores" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
									<div>
										<p class="text-sm font-medium text-stone-900">ອະນຸຍາດໃຫ້ເລີ່ມສ້າງຮ້ານຂອງຕົນເອງ</p>
										<p class="mt-1 text-xs leading-5 text-stone-500">{{ detailStorePermissionHint }}</p>
									</div>
								</label>

								<div v-if="detailForm.can_create_stores">
									<label class="mb-2 block text-xs font-medium text-stone-500">ຮ້ານທີ່ສ້າງໄດ້</label>
									<input v-model="detailForm.max_stores" type="number" min="1" placeholder="1" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
									<p class="mt-2 text-xs leading-5 text-stone-500">ປັບຈຳນວນຮ້ານລວມທີ່ບັນຊີນີ້ສ້າງໄດ້ ລວມຮ້ານທຳອິດທີ່ client ຈະເລີ່ມສ້າງຕອນ onboarding</p>
								</div>

								<div v-else class="rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-4 py-3">
									<p class="text-sm font-medium text-stone-900">ເຊື່ອງການຕັ້ງຄ່າ quota ໄວ້ກ່ອນ</p>
									<p class="mt-1 text-xs leading-5 text-stone-500">ເມື່ອເປີດສິດສ້າງຮ້ານ ລະບົບຈະສະແດງຈຳນວນຮ້ານລວມທີ່ສ້າງໄດ້ໃຫ້ອັດຕະໂນມັດ</p>
								</div>

								<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<input v-model="detailForm.must_change_password" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
									<div>
										<p class="text-sm font-medium text-stone-900">ບັງຄັບປ່ຽນລະຫັດຜ່ານໃນການ login ຄັ້ງຕໍ່ໄປ</p>
									</div>
								</label>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<p class="text-sm font-medium text-stone-900">ຄວາມປອດໄພ</p>
								<p class="mt-1 text-xs leading-5 text-stone-500">ຕັ້ງລະຫັດຜ່ານໃໝ່ໃຫ້ບັນຊີນີ້ ແລະ ສົ່ງຕໍ່ credential ຊຸດໃໝ່ໃຫ້ client ໄດ້ທັນທີ</p>
								<div class="mt-4">
									<AppButton
										color="primary"
										variant="soft"
										size="md"
										icon="i-heroicons-key-20-solid"
										:disabled="!canManageSystem"
										@click="openResetPasswordModal"
									>
										ອັບເດດລະຫັດຜ່ານ
									</AppButton>
								</div>
							</div>

							<div class="rounded-md border border-warning-200 bg-warning-50 p-4">
								<p class="text-sm font-medium text-stone-900">ສະຖານະບັນຊີ</p>
								<p class="mt-1 text-xs leading-5 text-stone-500">ໃຊ້ສ່ວນນີ້ໃນການພັກບັນຊີຊົ່ວຄາວ ຫຼື ເປີດໃຊ້ງານກັບເມື່ອພ້ອມ</p>
								<div v-if="selectedClient.status === 'active'" class="mt-4 space-y-3">
									<textarea
										v-model="detailForm.suspend_reason"
										rows="3"
										placeholder="ເຫດຜົນທີ່ພັກບັນຊີ"
										class="w-full resize-none rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
									/>
										<AppButton color="warning" variant="soft" size="md" icon="i-heroicons-pause-circle-20-solid" :loading="saving" :disabled="!canManageSystem" :spin-icon-on-loading="true" @click="updateClientStatus('suspended')">ພັກບັນຊີ</AppButton>
								</div>
								<div v-else class="mt-4 space-y-3">
									<p class="text-xs text-stone-500">ເຫດຜົນຫຼ້າສຸດ: {{ selectedClient.client_suspended_reason || "ບໍ່ໄດ້ລະບຸ" }}</p>
										<AppButton color="success" variant="soft" size="md" icon="i-heroicons-check-circle-20-solid" :loading="saving" :disabled="!canManageSystem" :spin-icon-on-loading="true" @click="updateClientStatus('active')">ເປີດໃຊ້ງານກັບ</AppButton>
								</div>
							</div>

							<div class="rounded-md border border-error-200 bg-error-50 p-4">
								<p class="text-sm font-medium text-stone-900">ໂຊນອັນຕະລາຍ</p>
								<p class="mt-1 text-xs leading-5 text-stone-500">ລຶບໄດ້ສະເພາະບັນຊີທີ່ຍັງບໍ່ມີຮ້ານ, ອໍເດີ, ສະຕັອກ, integration ຫຼື ຂໍ້ມູນຜູກອື່ນໆ ເທົ່ານັ້ນ</p>
								<p v-if="isSelectedCurrentUser" class="mt-3 text-xs leading-5 text-error">ບັນຊີທີ່ກຳລັງ login ໃຊ້ງານຢູ່ ບໍ່ສາມາດລຶບຕົນເອງຈາກໜ້ານີ້ໄດ້</p>
								<div class="mt-4">
									<AppButton
										color="error"
										variant="soft"
										size="md"
										icon="i-heroicons-trash-20-solid"
										:disabled="!canManageSystem || isSelectedCurrentUser"
										@click="openDeleteModal"
									>
										ລຶບ client
									</AppButton>
								</div>
							</div>
						</div>
					</div>

						<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
							<div class="grid w-full grid-cols-2 gap-2">
								<AppButton color="neutral" variant="soft" size="md" :block="true" @click="detailOpen = false">ປິດ</AppButton>
								<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-check-20-solid" :loading="saving" :disabled="!canManageSystem || !detailHasChanges" :spin-icon-on-loading="true" :block="true" @click="saveClient">ບັນທຶກ</AppButton>
							</div>
						</div>
					</div>
			</AppResponsivePanel>

			<AppResponsivePanel
				v-model="resetPasswordOpen"
				title="ອັບເດດລະຫັດຜ່ານ"
				description="ຕັ້ງລະຫັດຜ່ານໃໝ່ໃຫ້ບັນຊີນີ້ ແລະ ສົ່ງຕໍ່ credential ໃຫ້ client ໄດ້ທັນທີ"
				desktop-width="680px"
				mobile-max-height="88dvh"
				:fill-mobile-height="true"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<div v-if="selectedClient" class="flex h-full min-h-0 flex-col">
					<div class="scrollbar-soft min-h-0 flex-1 overflow-y-auto px-5 py-5">
						<div v-if="!resetPasswordSuccess" class="space-y-4 pb-6">
							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<p class="text-sm font-medium text-stone-900">{{ selectedClient.name }}</p>
								<p class="mt-1 text-xs text-stone-500">{{ selectedClient.email }}</p>
							</div>

							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">ລະຫັດຜ່ານໃໝ່</label>
								<div class="relative">
									<input
										v-model="resetPasswordForm.password"
										:type="showResetPassword ? 'text' : 'password'"
										placeholder="ຕັ້ງລະຫັດຜ່ານຢ່າງໜ້ອຍ 6 ຕົວອັກສອນ"
										class="w-full rounded-md border border-neutral-200 bg-white py-3 pl-4 pr-12 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
									>
									<button
										type="button"
										class="absolute right-2.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 transition hover:bg-primary-50 hover:text-primary-700"
										:aria-label="showResetPassword ? 'ເຊື່ອງລະຫັດຜ່ານ' : 'ສະແດງລະຫັດຜ່ານ'"
										:title="showResetPassword ? 'ເຊື່ອງລະຫັດຜ່ານ' : 'ສະແດງລະຫັດຜ່ານ'"
										@click="showResetPassword = !showResetPassword"
									>
										<UIcon :name="showResetPassword ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'" class="h-4 w-4" />
									</button>
								</div>
								<p class="mt-2 text-xs leading-5 text-stone-500">ໃຊ້ລະຫັດຊົ່ວຄາວສຳລັບສົ່ງໃຫ້ client ກ່ອນປ່ຽນເອງຄັ້ງທຳອິດ</p>
								<button
									type="button"
									class="mt-2 inline-flex items-center gap-1 rounded-md bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 transition hover:bg-primary-100"
									@click="quickFillResetPassword"
								>
									<UIcon name="i-heroicons-bolt-20-solid" class="h-3.5 w-3.5" />
									ໃຊ້ລະຫັດ 123456
								</button>
							</div>

							<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<input v-model="resetPasswordForm.must_change_password" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
								<div>
									<p class="text-sm font-medium text-stone-900">ບັງຄັບໃຫ້ປ່ຽນລະຫັດຜ່ານໃນການ login ຄັ້ງຕໍ່ໄປ</p>
								</div>
							</label>
						</div>

						<div v-else class="space-y-4 pb-6">
							<div class="rounded-md border border-success/20 bg-success/5 p-4">
								<div class="flex items-start gap-3">
									<div class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-success/10 text-success ring-1 ring-success/15">
										<UIcon name="i-heroicons-check-circle-20-solid" class="h-5 w-5" />
									</div>
									<div>
										<p class="text-sm font-semibold text-stone-950">ອັບເດດລະຫັດຜ່ານສຳເລັດແລ້ວ</p>
										<p class="mt-1 text-sm leading-6 text-stone-600">ຄັດລອກ username ແລະ password ຊຸດນີ້ໄປສົ່ງຕໍ່ໃຫ້ client ໄດ້ທັນທີ ກ່ອນກົດ done ເພື່ອປິດ modal</p>
									</div>
								</div>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">ຂໍ້ມູນເຂົ້າໃຊ້</p>
								<div class="mt-4 space-y-3">
									<div>
										<label class="mb-2 block text-xs font-medium text-stone-500">ຊື່ຜູ້ໃຊ້</label>
										<div class="rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900">
											{{ resetPasswordSuccess.email }}
										</div>
									</div>
									<div>
										<label class="mb-2 block text-xs font-medium text-stone-500">ລະຫັດຜ່ານ</label>
										<div class="rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900">
											{{ resetPasswordSuccess.password }}
										</div>
									</div>
								</div>
							</div>

							<div class="rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-4 py-3">
								<p class="text-sm font-medium text-stone-900">{{ resetPasswordSuccess.name }}</p>
								<p class="mt-1 text-xs leading-5 text-stone-500">credential ນີ້ສະແດງຊົ່ວຄາວໃນ modal ນີ້ເທົ່ານັ້ນ ຫຼັງປິດ modal ແລ້ວຈະບໍ່ສະແດງ password ເດີມອີກ</p>
							</div>
						</div>
					</div>

					<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
						<div v-if="!resetPasswordSuccess" class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="closeResetPasswordModal">ຍົກເລີກ</AppButton>
							<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-key-20-solid" :loading="saving" :disabled="!canManageSystem || resetPasswordForm.password.trim().length < 6" :spin-icon-on-loading="true" :block="true" @click="resetClientPassword">ອັບເດດລະຫັດຜ່ານ</AppButton>
						</div>
						<div v-else class="grid w-full gap-2 sm:grid-cols-3">
							<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-clipboard-document-20-solid" :block="true" @click="copyResetPasswordCredential">ຄັດລອກ</AppButton>
							<AppButton color="primary" variant="soft" size="md" icon="i-heroicons-share-20-solid" :block="true" @click="shareResetPasswordCredential">ແບ່ງປັນ</AppButton>
							<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-check-20-solid" :block="true" @click="completeResetPasswordFlow">ສຳເລັດ</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>

			<AppResponsivePanel
				v-model="deleteOpen"
				title="ລຶບ client"
				description="ກວດ dependency ກ່ອນລຶບຈິງ ເພື່ອກັນລຶບບັນຊີທີ່ຍັງມີຮ້ານ ຫຼື ຂໍ້ມູນໃຊ້ງານຢູ່"
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
							<div class="rounded-md border border-error-200 bg-error-50 p-4">
								<p class="text-sm font-semibold text-stone-950">ລຶບແບບຖາວອນ</p>
								<p class="mt-1 text-xs leading-5 text-stone-600">ຖ້າລຶບສຳເລັດ ບັນຊີນີ້ຈະຫາຍຈາກລະບົບທັນທີ ແລະ ຈະບໍ່ສາມາດ login ໄດ້ອີກ</p>
							</div>

							<div v-if="selectedClient" class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<p class="text-sm font-medium text-stone-900">{{ selectedClient.name }}</p>
								<p class="mt-1 text-xs text-stone-500">{{ selectedClient.email }}</p>
							</div>

							<AppInlineLoadingBar
								v-if="deleteCheckPending"
								label="ກຳລັງກວດສອບເງື່ອນໄຂການລຶບ..."
							/>

							<div v-else-if="deleteCheck" class="space-y-4">
								<div
									class="rounded-md border p-4"
									:class="deleteCheck.can_delete ? 'border-success/20 bg-success/5' : 'border-warning-200 bg-warning-50'"
								>
									<p class="text-sm font-medium text-stone-900">
										{{ deleteCheck.can_delete ? 'ພ້ອມລຶບໄດ້' : 'ຍັງລຶບບໍ່ໄດ້' }}
									</p>
									<p class="mt-1 text-xs leading-5 text-stone-600">
										{{ deleteCheck.can_delete
											? 'ບໍ່ພົບ store, order, stock ຫຼື integration ທີ່ຜູກກັບ client ນີ້ແລ້ວ'
											: 'ຍັງມີຂໍ້ມູນໃຊ້ງານຜູກຢູ່ໃນລະບົບ ຈຶ່ງຕ້ອງຍ້າຍ ຫຼື ປິດຂໍ້ມູນເຫຼົ່ານີ້ກ່ອນ' }}
									</p>
								</div>

								<div v-if="deleteCheck.reasons.length" class="rounded-md border border-neutral-200 bg-white p-4">
									<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">ເຫດຜົນທີ່ຍັງລຶບບໍ່ໄດ້</p>
									<ul class="mt-3 space-y-2 text-sm text-stone-700">
										<li v-for="reason in deleteCheck.reasons" :key="reason" class="flex items-start gap-2">
											<UIcon name="i-heroicons-exclamation-circle-20-solid" class="mt-0.5 h-4 w-4 shrink-0 text-warning" />
											<span>{{ reason }}</span>
										</li>
									</ul>
								</div>

								<div v-else class="rounded-md border border-neutral-200 bg-white p-4">
									<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">ຢືນຢັນການລຶບ</p>
									<p class="mt-3 text-sm text-stone-700">ພິມອີເມວຂອງ client ນີ້ເພື່ອຢືນຢັນການລຶບແບບຖາວອນ</p>
									<div class="mt-3 flex items-center justify-between gap-2 rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-3 py-2">
										<div class="min-w-0 flex-1 truncate text-sm text-stone-900">
											{{ deleteConfirmTarget }}
										</div>
										<AppButton
											color="neutral"
											variant="soft"
											size="sm"
											icon="i-heroicons-clipboard-document-20-solid"
											aria-label="ຄັດລອກອີເມວ"
											title="ຄັດລອກອີເມວ"
											@click="copyDeleteConfirmTarget"
										/>
									</div>
									<input
										v-model="deleteConfirmText"
										type="text"
										placeholder="ພິມອີເມວເພື່ອຢືນຢັນ"
										class="mt-3 w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
									>
								</div>
							</div>
						</div>
					</div>

					<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
						<div class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="closeDeleteModal">ປິດ</AppButton>
							<AppButton
								color="error"
								variant="solid"
								size="md"
								icon="i-heroicons-trash-20-solid"
								:loading="saving"
								:disabled="deleteCheckPending || !canSubmitDelete"
								:spin-icon-on-loading="true"
								:block="true"
								@click="deleteClient"
							>
								ລຶບຖາວອນ
							</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>
		</template>
	</AppSidebarShell>
</template>
