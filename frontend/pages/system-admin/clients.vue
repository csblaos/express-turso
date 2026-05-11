<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";

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
const createBranchDraft = reactive({
	max_stores: "1",
	max_branches_per_store: "",
	can_create_branches: true,
});
const detailBranchDraft = reactive({
	max_stores: "1",
	max_branches_per_store: "",
	can_create_branches: true,
});

const createForm = reactive({
	name: "",
	email: "",
	password: "",
	ui_locale: "th",
	can_create_stores: true,
	max_stores: "1",
	max_branches_per_store: "",
	can_create_branches: true,
	must_change_password: true,
});

const detailForm = reactive({
	name: "",
	email: "",
	ui_locale: "th",
	can_create_stores: true,
	max_stores: "1",
	max_branches_per_store: "",
	can_create_branches: true,
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
const createStorePermissionHint = computed(() => (
	createForm.can_create_stores
		? "บัญชีนี้สามารถ login แล้วเริ่มสร้างร้านแรกของตัวเองได้ รวมถึงเพิ่มร้านถัดไปตาม quota"
		: "บัญชีนี้ login ได้ แต่ยังเริ่มสร้างร้านแรกหรือเพิ่มร้านใหม่ไม่ได้"
));
const createBranchPermissionHint = computed(() => {
	if (!createForm.can_create_stores) return "ต้องอนุญาตให้สร้างร้านก่อน จึงจะตั้งค่าสาขาได้";
	return createForm.can_create_branches
		? "หลังมีร้านแล้ว บัญชีนี้สามารถเพิ่มสาขาได้ตาม quota สาขาต่อร้าน"
		: "หลังมีร้านแล้ว บัญชีนี้จะไม่สามารถเพิ่มสาขาใหม่ได้ แม้ quota จะยังเหลือ";
});
const detailStorePermissionHint = computed(() => (
	detailForm.can_create_stores
		? "บัญชีนี้สามารถ login แล้วเริ่มสร้างร้านแรกของตัวเองได้ รวมถึงเพิ่มร้านถัดไปตาม quota"
		: "บัญชีนี้ login ได้ แต่ยังเริ่มสร้างร้านแรกหรือเพิ่มร้านใหม่ไม่ได้"
));
const detailBranchPermissionHint = computed(() => {
	if (!detailForm.can_create_stores) return "ต้องอนุญาตให้สร้างร้านก่อน จึงจะตั้งค่าสาขาได้";
	return detailForm.can_create_branches
		? "หลังมีร้านแล้ว บัญชีนี้สามารถเพิ่มสาขาได้ตาม quota สาขาต่อร้าน"
		: "หลังมีร้านแล้ว บัญชีนี้จะไม่สามารถเพิ่มสาขาใหม่ได้ แม้ quota จะยังเหลือ";
});

watch(selectedClient, (client) => {
	if (!client) return;
	detailForm.name = client.name;
	detailForm.email = client.email;
	detailForm.ui_locale = client.ui_locale || "th";
	detailForm.can_create_stores = Boolean(client.can_create_stores);
	detailForm.max_stores = client.max_stores === null ? "" : String(client.max_stores);
	detailForm.max_branches_per_store = client.max_branches_per_store === null ? "" : String(client.max_branches_per_store);
	detailForm.can_create_branches = Boolean(client.can_create_branches);
	detailForm.must_change_password = Boolean(client.must_change_password);
	detailForm.suspend_reason = client.client_suspended_reason || "";
	detailBranchDraft.max_stores = detailForm.max_stores;
	detailBranchDraft.max_branches_per_store = detailForm.max_branches_per_store;
	detailBranchDraft.can_create_branches = detailForm.can_create_branches;
}, { immediate: true });

watch(() => createForm.can_create_stores, (enabled, previous) => {
	if (enabled) {
		if (previous === false) {
			createForm.max_stores = createBranchDraft.max_stores || "1";
			createForm.max_branches_per_store = createBranchDraft.max_branches_per_store
				|| (systemDefaults.value.default_max_branches_per_store === null ? "" : String(systemDefaults.value.default_max_branches_per_store));
			createForm.can_create_branches = createBranchDraft.can_create_branches;
		}
		return;
	}

	createBranchDraft.max_stores = createForm.max_stores;
	createBranchDraft.max_branches_per_store = createForm.max_branches_per_store;
	createBranchDraft.can_create_branches = createForm.can_create_branches;
	createForm.max_stores = "";
	createForm.max_branches_per_store = "";
	createForm.can_create_branches = false;
});

watch(() => detailForm.can_create_stores, (enabled, previous) => {
	if (enabled) {
		if (previous === false) {
			detailForm.max_stores = detailBranchDraft.max_stores || "1";
			detailForm.max_branches_per_store = detailBranchDraft.max_branches_per_store;
			detailForm.can_create_branches = detailBranchDraft.can_create_branches;
		}
		return;
	}

	detailBranchDraft.max_stores = detailForm.max_stores;
	detailBranchDraft.max_branches_per_store = detailForm.max_branches_per_store;
	detailBranchDraft.can_create_branches = detailForm.can_create_branches;
	detailForm.max_stores = "";
	detailForm.max_branches_per_store = "";
	detailForm.can_create_branches = false;
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

function storeQuotaLabel(client: ClientRecord) {
	if (!client.can_create_stores) return "ปิดสิทธิ์";
	return client.max_stores ?? "ไม่จำกัด";
}

function branchQuotaLabel(client: ClientRecord) {
	if (!client.can_create_stores || !client.can_create_branches) return "ปิดสิทธิ์";
	return client.max_branches_per_store ?? "ไม่จำกัด";
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
			title: "โหลดเงื่อนไขการลบไม่สำเร็จ",
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
			title: "ไม่มีสิทธิ์ใช้งาน",
			description: "บัญชีนี้ไม่สามารถสร้าง Superadmin ได้",
		});
		return;
	}

	createOpen.value = true;
}

function fillQuickPassword() {
	createForm.password = "123456";
}

function quickFillResetPassword() {
	resetPasswordForm.password = "123456";
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
	createForm.max_branches_per_store = systemDefaults.value.default_max_branches_per_store === null
		? ""
		: String(systemDefaults.value.default_max_branches_per_store);
	createForm.can_create_branches = Boolean(systemDefaults.value.default_can_create_branches);
	createForm.must_change_password = true;
	createBranchDraft.max_stores = createForm.max_stores;
	createBranchDraft.max_branches_per_store = createForm.max_branches_per_store;
	createBranchDraft.can_create_branches = createForm.can_create_branches;
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
			title: "คัดลอก credential แล้ว",
			description: "นำไปส่งต่อให้ client ได้ทันที",
		});
	} catch {
		appToast.error({
			title: "คัดลอกไม่สำเร็จ",
			description: "โปรดลองคัดลอกอีกครั้ง",
		});
	}
}

async function copyDeleteConfirmTarget() {
	if (!deleteConfirmTarget.value || !import.meta.client) return;

	try {
		await navigator.clipboard.writeText(deleteConfirmTarget.value);
		appToast.success({
			title: "คัดลอกอีเมลแล้ว",
			description: "นำอีเมลนี้ไปใช้ยืนยันการลบได้ทันที",
		});
	} catch {
		appToast.error({
			title: "คัดลอกไม่สำเร็จ",
			description: "โปรดลองคัดลอกอีกครั้ง",
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
		title: "อุปกรณ์นี้ไม่รองรับ share โดยตรง",
		description: "ระบบคัดลอก credential ให้แล้ว เพื่อนำไปวางส่งต่อได้ทันที",
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
			title: "คัดลอก credential แล้ว",
			description: "นำไปส่งต่อให้ client ได้ทันที",
		});
	} catch {
		appToast.error({
			title: "คัดลอกไม่สำเร็จ",
			description: "โปรดลองคัดลอกอีกครั้ง",
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
		title: "อุปกรณ์นี้ไม่รองรับ share โดยตรง",
		description: "ระบบคัดลอก credential ให้แล้ว เพื่อนำไปวางส่งต่อได้ทันที",
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
		error.value = resolveApiErrorMessage(err, "โหลด client accounts ไม่สำเร็จ", {
			forbiddenMessage: "บัญชีนี้ไม่มีสิทธิ์ดู Client Accounts",
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
				max_branches_per_store: createForm.can_create_stores ? toOptionalNumber(createForm.max_branches_per_store) : null,
				can_create_branches: createForm.can_create_stores && createForm.can_create_branches ? 1 : 0,
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
			title: "สร้าง Superadmin แล้ว",
			description: "บัญชีใหม่พร้อมสำหรับ login แล้วเริ่ม onboarding ร้านของตัวเอง",
		});
		await loadClients();
	} catch (err) {
		appToast.error({
			title: "สร้างบัญชีไม่สำเร็จ",
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
				max_branches_per_store: detailForm.can_create_stores ? toOptionalNumber(detailForm.max_branches_per_store) : null,
				can_create_branches: detailForm.can_create_stores && detailForm.can_create_branches ? 1 : 0,
				must_change_password: detailForm.must_change_password,
				actor_user_id: currentUser.value?.id || null,
			},
		});
		appToast.success({
			title: "อัปเดต client แล้ว",
			description: "สิทธิ์ onboarding ร้านและ quota ถูกบันทึกแล้ว",
		});
		await loadClients();
	} catch (err) {
		appToast.error({
			title: "บันทึกไม่สำเร็จ",
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
			title: "อัปเดตรหัสผ่านแล้ว",
			description: "credential ชุดใหม่พร้อมส่งต่อให้ client แล้ว",
		});
		await loadClients();
	} catch (err) {
		appToast.error({
			title: "อัปเดตรหัสผ่านไม่สำเร็จ",
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
			title: nextStatus === "suspended" ? "พักบัญชีแล้ว" : "เปิดใช้งานแล้ว",
			description: nextStatus === "suspended" ? "บัญชีนี้จะไม่สามารถ login ได้จนกว่าจะเปิดใช้งานอีกครั้ง" : "บัญชีกลับมาใช้งานได้แล้ว",
		});
		await loadClients();
	} catch (err) {
		appToast.error({
			title: "อัปเดตสถานะไม่สำเร็จ",
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
			title: "ลบ client แล้ว",
			description: "บัญชีนี้ถูกลบออกจากระบบเรียบร้อยแล้ว",
		});
		closeDeleteModal();
		detailOpen.value = false;
		selectedClientId.value = "";
		await loadClients();
	} catch (err) {
		appToast.error({
			title: "ลบ client ไม่สำเร็จ",
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
		sidebar-description="จัดการ client / superadmin accounts ที่จะ login แล้วเริ่มสร้างร้านของตัวเอง"
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
									<AppInlineLoadingBar container-class="bg-neutral-100" />
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
											<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600">{{ storeQuotaLabel(client) }}</td>
											<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600">{{ branchQuotaLabel(client) }}</td>
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
					description="บัญชีนี้จะใช้ login เพื่อเริ่มสร้างร้านแรกและตั้งค่าธีม/ข้อมูลธุรกิจของตัวเอง"
					desktop-width="520px"
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
								<p class="text-sm font-medium text-stone-900">บัญชีใหม่จะยังไม่มีร้านในทันที</p>
								<p class="mt-1 text-xs leading-5 text-stone-500">เมื่อ login ครั้งแรก ระบบจะพา client ไปเริ่ม onboarding ร้านแรกของตัวเองตามสิทธิ์ที่คุณกำหนดใน modal นี้</p>
							</div>

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
									<label class="mb-2 block text-xs font-medium text-stone-500">รหัสผ่าน</label>
									<div class="relative">
										<input
											v-model="createForm.password"
											:type="showCreatePassword ? 'text' : 'password'"
											placeholder="ตั้งรหัสผ่านอย่างน้อย 6 ตัวอักษร"
											class="w-full rounded-md border border-neutral-200 bg-white py-3 pl-4 pr-12 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
										>
										<button
											type="button"
											class="absolute right-2.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 transition hover:bg-primary-50 hover:text-primary-700"
											:aria-label="showCreatePassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'"
											:title="showCreatePassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'"
											@click="showCreatePassword = !showCreatePassword"
										>
											<UIcon :name="showCreatePassword ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'" class="h-4 w-4" />
										</button>
									</div>
									<p class="mt-2 text-xs leading-5 text-stone-500">กำหนดรหัสผ่านเริ่มต้นเองก่อนสร้างบัญชี ระบบจะไม่เติมค่า default ให้แล้ว</p>
									<button
										type="button"
										class="mt-2 inline-flex items-center gap-1 rounded-md bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 transition hover:bg-primary-100"
										@click="fillQuickPassword"
									>
										<UIcon name="i-heroicons-bolt-20-solid" class="h-3.5 w-3.5" />
										ใช้รหัส 123456
									</button>
								</div>
							</div>

							<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<input v-model="createForm.can_create_stores" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
								<div>
									<p class="text-sm font-medium text-stone-900">อนุญาตให้เริ่มสร้างร้านของตัวเอง</p>
									<p class="mt-1 text-xs leading-5 text-stone-500">{{ createStorePermissionHint }}</p>
								</div>
							</label>

							<div v-if="createForm.can_create_stores" class="grid gap-4 sm:grid-cols-2">
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">ร้านที่สร้างได้</label>
									<input v-model="createForm.max_stores" type="number" min="1" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
									<p class="mt-2 text-xs leading-5 text-stone-500">กำหนดจำนวนร้านรวมที่บัญชีนี้สร้างได้ ถ้าให้มีได้แค่ร้านแรกของตัวเอง ให้คงค่า 1</p>
								</div>
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">สาขาต่อร้าน</label>
									<input v-model="createForm.max_branches_per_store" type="number" min="1" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
									<p class="mt-2 text-xs leading-5 text-stone-500">ค่าเริ่มต้นดึงจาก System Policy ปัจจุบัน และยังแก้ต่อรายบัญชีได้</p>
								</div>
							</div>

							<label v-if="createForm.can_create_stores" class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<input v-model="createForm.can_create_branches" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
								<div>
									<p class="text-sm font-medium text-stone-900">อนุญาตให้สร้างสาขา</p>
									<p class="mt-1 text-xs leading-5 text-stone-500">{{ createBranchPermissionHint }}</p>
								</div>
							</label>

							<div v-else class="rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-4 py-3">
								<p class="text-sm font-medium text-stone-900">ซ่อนการตั้งค่าสาขาไว้ก่อน</p>
								<p class="mt-1 text-xs leading-5 text-stone-500">เมื่อเปิดสิทธิ์สร้างร้าน ระบบจะแสดงจำนวนร้านรวมที่สร้างได้, สาขาต่อร้าน และสิทธิ์สร้างสาขาให้อัตโนมัติ</p>
							</div>

							<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<input v-model="createForm.must_change_password" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
								<div>
									<p class="text-sm font-medium text-stone-900">บังคับให้เปลี่ยนรหัสผ่านเมื่อ login ครั้งแรก</p>
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
										<p class="text-sm font-semibold text-stone-950">สร้าง Superadmin สำเร็จแล้ว</p>
										<p class="mt-1 text-sm leading-6 text-stone-600">คัดลอก username และ password ชุดนี้ไปส่งต่อให้ client ได้ทันที ก่อนกด done เพื่อปิด modal</p>
									</div>
								</div>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">Credential</p>
								<div class="mt-4 space-y-3">
									<div>
										<label class="mb-2 block text-xs font-medium text-stone-500">Username</label>
										<div class="rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900">
											{{ createSuccess.email }}
										</div>
									</div>
									<div>
										<label class="mb-2 block text-xs font-medium text-stone-500">Password</label>
										<div class="rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900">
											{{ createSuccess.password }}
										</div>
									</div>
								</div>
							</div>

							<div class="rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-4 py-3">
								<p class="text-sm font-medium text-stone-900">{{ createSuccess.name }}</p>
								<p class="mt-1 text-xs leading-5 text-stone-500">credential นี้แสดงชั่วคราวใน modal นี้เท่านั้น หลังปิด modal แล้วจะไม่แสดง password เดิมอีก</p>
							</div>
						</div>
					</div>

						<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
							<div v-if="!createSuccess" class="grid w-full grid-cols-2 gap-2">
								<AppButton color="neutral" variant="soft" size="md" :block="true" @click="closeCreateModal">ยกเลิก</AppButton>
								<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-plus-20-solid" :loading="saving" :disabled="!canManageSystem" :spin-icon-on-loading="true" :block="true" @click="createClient">สร้างบัญชี</AppButton>
							</div>
							<div v-else class="grid w-full gap-2 sm:grid-cols-3">
								<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-clipboard-document-20-solid" :block="true" @click="copyCreatedCredential">Copy</AppButton>
								<AppButton color="primary" variant="soft" size="md" icon="i-heroicons-share-20-solid" :block="true" @click="shareCreatedCredential">Share</AppButton>
								<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-check-20-solid" :block="true" @click="closeCreateModal">Done</AppButton>
							</div>
						</div>
					</div>
				</AppResponsivePanel>

				<AppResponsivePanel
					v-model="detailOpen"
					title="Client detail"
					description="ปรับสิทธิ์ onboarding ร้าน, quota การขยายร้าน และสถานะของ Superadmin บัญชีนี้"
					desktop-width="560px"
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
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">อีเมล</label>
									<input v-model="detailForm.email" type="email" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
								</div>
							</div>

							<div class="space-y-3">
								<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<input v-model="detailForm.can_create_stores" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
									<div>
										<p class="text-sm font-medium text-stone-900">อนุญาตให้เริ่มสร้างร้านของตัวเอง</p>
										<p class="mt-1 text-xs leading-5 text-stone-500">{{ detailStorePermissionHint }}</p>
									</div>
								</label>

								<div v-if="detailForm.can_create_stores" class="grid gap-4 sm:grid-cols-2">
									<div>
										<label class="mb-2 block text-xs font-medium text-stone-500">ร้านที่สร้างได้</label>
										<input v-model="detailForm.max_stores" type="number" min="1" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
										<p class="mt-2 text-xs leading-5 text-stone-500">ปรับจำนวนร้านรวมที่บัญชีนี้สร้างได้ รวมร้านแรกที่ client จะเริ่มสร้างตอน onboarding</p>
									</div>
									<div>
										<label class="mb-2 block text-xs font-medium text-stone-500">สาขาต่อร้าน</label>
										<input v-model="detailForm.max_branches_per_store" type="number" min="1" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
										<p class="mt-2 text-xs leading-5 text-stone-500">ปรับจำนวนสาขาที่แต่ละร้านสร้างได้สำหรับบัญชีนี้</p>
									</div>
								</div>

								<label v-if="detailForm.can_create_stores" class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<input v-model="detailForm.can_create_branches" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
									<div>
										<p class="text-sm font-medium text-stone-900">อนุญาตให้สร้างสาขา</p>
										<p class="mt-1 text-xs leading-5 text-stone-500">{{ detailBranchPermissionHint }}</p>
									</div>
								</label>

								<div v-else class="rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-4 py-3">
									<p class="text-sm font-medium text-stone-900">ซ่อนการตั้งค่าสาขาไว้ก่อน</p>
									<p class="mt-1 text-xs leading-5 text-stone-500">เมื่อเปิดสิทธิ์สร้างร้าน ระบบจะแสดงจำนวนร้านรวมที่สร้างได้, สาขาต่อร้าน และสิทธิ์สร้างสาขาให้อีกครั้ง</p>
								</div>

								<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<input v-model="detailForm.must_change_password" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
									<div>
										<p class="text-sm font-medium text-stone-900">บังคับเปลี่ยนรหัสผ่านในการ login ครั้งถัดไป</p>
									</div>
								</label>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<p class="text-sm font-medium text-stone-900">Security</p>
								<p class="mt-1 text-xs leading-5 text-stone-500">ตั้งรหัสผ่านใหม่ให้บัญชีนี้ และส่งต่อ credential ชุดใหม่ให้ client ได้ทันที</p>
								<div class="mt-4">
									<AppButton
										color="primary"
										variant="soft"
										size="md"
										icon="i-heroicons-key-20-solid"
										:disabled="!canManageSystem"
										@click="openResetPasswordModal"
									>
										อัปเดตรหัสผ่าน
									</AppButton>
								</div>
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

							<div class="rounded-md border border-error-200 bg-error-50 p-4">
								<p class="text-sm font-medium text-stone-900">โซนอันตราย</p>
								<p class="mt-1 text-xs leading-5 text-stone-500">ลบได้เฉพาะบัญชีที่ยังไม่มีร้าน, ออเดอร์, สต็อก, integration หรือข้อมูลผูกอื่น ๆ เท่านั้น</p>
								<p v-if="isSelectedCurrentUser" class="mt-3 text-xs leading-5 text-error">บัญชีที่กำลัง login ใช้งานอยู่ไม่สามารถลบตัวเองจากหน้านี้ได้</p>
								<div class="mt-4">
									<AppButton
										color="error"
										variant="soft"
										size="md"
										icon="i-heroicons-trash-20-solid"
										:disabled="!canManageSystem || isSelectedCurrentUser"
										@click="openDeleteModal"
									>
										ลบ client
									</AppButton>
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

			<AppResponsivePanel
				v-model="resetPasswordOpen"
				title="Update password"
				description="ตั้งรหัสผ่านใหม่ให้บัญชีนี้ และส่งต่อ credential ให้ client ได้ทันที"
				desktop-width="560px"
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
								<label class="mb-2 block text-xs font-medium text-stone-500">รหัสผ่านใหม่</label>
								<div class="relative">
									<input
										v-model="resetPasswordForm.password"
										:type="showResetPassword ? 'text' : 'password'"
										placeholder="ตั้งรหัสผ่านอย่างน้อย 6 ตัวอักษร"
										class="w-full rounded-md border border-neutral-200 bg-white py-3 pl-4 pr-12 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
									>
									<button
										type="button"
										class="absolute right-2.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 transition hover:bg-primary-50 hover:text-primary-700"
										:aria-label="showResetPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'"
										:title="showResetPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'"
										@click="showResetPassword = !showResetPassword"
									>
										<UIcon :name="showResetPassword ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'" class="h-4 w-4" />
									</button>
								</div>
								<p class="mt-2 text-xs leading-5 text-stone-500">ใช้รหัสชั่วคราวสำหรับส่งให้ client ก่อนเปลี่ยนเองครั้งแรก</p>
								<button
									type="button"
									class="mt-2 inline-flex items-center gap-1 rounded-md bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 transition hover:bg-primary-100"
									@click="quickFillResetPassword"
								>
									<UIcon name="i-heroicons-bolt-20-solid" class="h-3.5 w-3.5" />
									ใช้รหัส 123456
								</button>
							</div>

							<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<input v-model="resetPasswordForm.must_change_password" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
								<div>
									<p class="text-sm font-medium text-stone-900">บังคับให้เปลี่ยนรหัสผ่านในการ login ครั้งถัดไป</p>
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
										<p class="text-sm font-semibold text-stone-950">อัปเดตรหัสผ่านสำเร็จแล้ว</p>
										<p class="mt-1 text-sm leading-6 text-stone-600">คัดลอก username และ password ชุดนี้ไปส่งต่อให้ client ได้ทันที ก่อนกด done เพื่อปิด modal</p>
									</div>
								</div>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">Credential</p>
								<div class="mt-4 space-y-3">
									<div>
										<label class="mb-2 block text-xs font-medium text-stone-500">Username</label>
										<div class="rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900">
											{{ resetPasswordSuccess.email }}
										</div>
									</div>
									<div>
										<label class="mb-2 block text-xs font-medium text-stone-500">Password</label>
										<div class="rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900">
											{{ resetPasswordSuccess.password }}
										</div>
									</div>
								</div>
							</div>

							<div class="rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-4 py-3">
								<p class="text-sm font-medium text-stone-900">{{ resetPasswordSuccess.name }}</p>
								<p class="mt-1 text-xs leading-5 text-stone-500">credential นี้แสดงชั่วคราวใน modal นี้เท่านั้น หลังปิด modal แล้วจะไม่แสดง password เดิมอีก</p>
							</div>
						</div>
					</div>

					<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
						<div v-if="!resetPasswordSuccess" class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="closeResetPasswordModal">ยกเลิก</AppButton>
							<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-key-20-solid" :loading="saving" :disabled="!canManageSystem || resetPasswordForm.password.trim().length < 6" :spin-icon-on-loading="true" :block="true" @click="resetClientPassword">อัปเดตรหัสผ่าน</AppButton>
						</div>
						<div v-else class="grid w-full gap-2 sm:grid-cols-3">
							<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-clipboard-document-20-solid" :block="true" @click="copyResetPasswordCredential">Copy</AppButton>
							<AppButton color="primary" variant="soft" size="md" icon="i-heroicons-share-20-solid" :block="true" @click="shareResetPasswordCredential">Share</AppButton>
							<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-check-20-solid" :block="true" @click="completeResetPasswordFlow">Done</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>

			<AppResponsivePanel
				v-model="deleteOpen"
				title="Delete client"
				description="ตรวจ dependency ก่อนลบจริง เพื่อกันลบบัญชีที่ยังมีร้านหรือข้อมูลใช้งานอยู่"
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
							<div class="rounded-md border border-error-200 bg-error-50 p-4">
								<p class="text-sm font-semibold text-stone-950">ลบแบบถาวร</p>
								<p class="mt-1 text-xs leading-5 text-stone-600">ถ้าลบสำเร็จ บัญชีนี้จะหายจากระบบทันที และจะไม่สามารถ login ได้อีก</p>
							</div>

							<div v-if="selectedClient" class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<p class="text-sm font-medium text-stone-900">{{ selectedClient.name }}</p>
								<p class="mt-1 text-xs text-stone-500">{{ selectedClient.email }}</p>
							</div>

							<AppInlineLoadingBar
								v-if="deleteCheckPending"
								label="กำลังตรวจสอบเงื่อนไขการลบ..."
							/>

							<div v-else-if="deleteCheck" class="space-y-4">
								<div
									class="rounded-md border p-4"
									:class="deleteCheck.can_delete ? 'border-success/20 bg-success/5' : 'border-warning-200 bg-warning-50'"
								>
									<p class="text-sm font-medium text-stone-900">
										{{ deleteCheck.can_delete ? 'พร้อมลบได้' : 'ยังลบไม่ได้' }}
									</p>
									<p class="mt-1 text-xs leading-5 text-stone-600">
										{{ deleteCheck.can_delete
											? 'ไม่พบ store, order, stock หรือ integration ที่ผูกกับ client นี้แล้ว'
											: 'ยังมีข้อมูลใช้งานผูกอยู่ในระบบ จึงต้องย้ายหรือปิดข้อมูลเหล่านี้ก่อน' }}
									</p>
								</div>

								<div v-if="deleteCheck.reasons.length" class="rounded-md border border-neutral-200 bg-white p-4">
									<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">เหตุผลที่ยังลบไม่ได้</p>
									<ul class="mt-3 space-y-2 text-sm text-stone-700">
										<li v-for="reason in deleteCheck.reasons" :key="reason" class="flex items-start gap-2">
											<UIcon name="i-heroicons-exclamation-circle-20-solid" class="mt-0.5 h-4 w-4 shrink-0 text-warning" />
											<span>{{ reason }}</span>
										</li>
									</ul>
								</div>

								<div v-else class="rounded-md border border-neutral-200 bg-white p-4">
									<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">Confirm delete</p>
									<p class="mt-3 text-sm text-stone-700">พิมพ์อีเมลของ client นี้เพื่อยืนยันการลบแบบถาวร</p>
									<div class="mt-3 flex items-center justify-between gap-2 rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-3 py-2">
										<div class="min-w-0 flex-1 truncate text-sm text-stone-900">
											{{ deleteConfirmTarget }}
										</div>
										<AppButton
											color="neutral"
											variant="soft"
											size="sm"
											icon="i-heroicons-clipboard-document-20-solid"
											aria-label="คัดลอกอีเมล"
											title="คัดลอกอีเมล"
											@click="copyDeleteConfirmTarget"
										/>
									</div>
									<input
										v-model="deleteConfirmText"
										type="text"
										placeholder="พิมพ์อีเมลเพื่อยืนยัน"
										class="mt-3 w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
									>
								</div>
							</div>
						</div>
					</div>

					<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
						<div class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="closeDeleteModal">ปิด</AppButton>
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
								ลบถาวร
							</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>
		</template>
	</AppSidebarShell>
</template>
