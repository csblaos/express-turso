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
};

type PermissionRecord = {
	id: string;
	key: string;
	resource: string;
	action: string;
};

type PermissionMatrixRow = {
	resource: string;
	permissions: PermissionRecord[];
	allKeys: string[];
};

type RoleRecord = {
	id: string;
	store_id: string;
	name: string;
	is_system: number;
	permissions_count: number;
};

type RoleDetailRecord = RoleRecord & {
	permissions: PermissionRecord[];
};

type ApplyRoleMode = "create" | "update";

const VISIBLE_STORE_ROLE_PERMISSION_KEYS = new Set([
	"pos.create_order",
	"pos.restaurant.open",
	"pos.restaurant.send_kitchen",
	"pos.restaurant.transfer",
	"pos.restaurant.cancel_sent",
	"pos.restaurant.apply_promotion",
	"pos.restaurant.print",
	"products.view",
	"products.create",
	"products.update",
	"products.update_cost",
	"products.archive",
	"promotions.view",
	"promotions.create",
	"promotions.update",
	"promotions.archive",
	"inventory.view",
	"inventory.adjust",
	"purchase_orders.view",
	"purchase_orders.create",
	"purchase_orders.update",
	"purchase_orders.receive",
	"reports.view",
	"activity.view",
	"stores.view",
	"settings.view",
	"settings.store.view",
	"settings.store.update",
	"settings.restaurant.view",
	"settings.restaurant.update",
	"settings.users.view",
	"settings.users.create",
	"settings.users.update",
	"settings.users.suspend",
	"settings.users.assign_role",
	"settings.users.reset_password",
	"settings.roles.view",
	"settings.roles.create",
	"settings.roles.update",
	"settings.roles.archive",
]);

function isVisibleStoreRolePermissionKey(permissionKey: string) {
	return VISIBLE_STORE_ROLE_PERMISSION_KEYS.has(permissionKey);
}

const { apiFetch } = useApiClient();
const { can, currentUser } = useAuthSession();
const appToast = useAppToast();
const { locale } = useI18n();

const copy = computed(() => locale.value === "lo" ? {
	description: "ຈັດການບົດບາດລະດັບຮ້ານສຳລັບຮ້ານທີ່ທ່ານດູແລ", headerDescription: "ກຳນົດບົດບາດ ແລະ ສິດຜູ້ໃຊ້ໃນແຕ່ລະຮ້ານຈາກມຸມ Super Admin",
	search: "ຄົ້ນຫາບົດບາດ, ຮ້ານ, ປະເພດ ຫຼື ID", reload: "ໂຫຼດໃໝ່", add: "ເພີ່ມບົດບາດ", title: "ບົດບາດ Super Admin", listHint: "ຈັດການບົດບາດຕາມຮ້ານ ພ້ອມມຸມມອງລາຍການ ແລະ ການແບ່ງໜ້າ", applyFilter: "ໃຊ້ຕົວກອງ", emptySearch: "ບໍ່ພົບບົດບາດທີ່ຕົງກັບຄຳຄົ້ນ", empty: "ຍັງບໍ່ມີບົດບາດໃນຮ້ານນີ້",
	role: "ບົດບາດ", store: "ຮ້ານ", permissions: "ສິດ", type: "ປະເພດ", action: "ຈັດການ", manage: "ຈັດການ", perPage: "ຕໍ່ໜ້າ", previous: "ກ່ອນໜ້າ", next: "ໜ້າຖັດໄປ", page: "ໜ້າ", of: "ຈາກ", roles: "ບົດບາດ", noData: "ຍັງບໍ່ມີຂໍ້ມູນ",
	editor: "ແກ້ໄຂບົດບາດ", editorDescription: "ປັບຊື່ບົດບາດ ແລະ ກຳນົດສິດທີ່ບົດບາດນີ້ໃຊ້ໄດ້", systemRole: "ບົດບາດລະບົບ", systemRoleHint: "ເປັນບົດບາດເລີ່ມຕົ້ນຂອງລະບົບ ຈຶ່ງລຶບບໍ່ໄດ້", roleName: "ຊື່ບົດບາດ", selected: "ເລືອກແລ້ວ", selectAll: "ເລືອກທັງໝົດ", clearAll: "ລ້າງທັງໝົດ", actions: "ການດຳເນີນການ", permission: "ສິດ", close: "ປິດ", save: "ບັນທຶກ", duplicate: "ທຳສຳເນົາບົດບາດນີ້", applyOther: "ໃຊ້ກັບອີກຮ້ານ", delete: "ລຶບບົດບາດ",
	createTitle: "ສ້າງບົດບາດໃໝ່", createDescription: "ເລີ່ມຈາກຊື່ບົດບາດ ແລ້ວເລືອກສິດທີ່ເໝາະກັບທີມງານ", preparing: "ກຳລັງກຽມຂໍ້ມູນສຳລັບສ້າງບົດບາດ...", noStoreCreate: "ຍັງບໍ່ພົບຮ້ານສຳລັບສ້າງບົດບາດ ກະລຸນາສ້າງຮ້ານກ່ອນ ຫຼື ໂຫຼດໃໝ່", cancel: "ຍົກເລີກ", create: "ສ້າງບົດບາດ",
	duplicateTitle: "ທຳສຳເນົາບົດບາດ", duplicateDescription: "ລະບົບຈະຄັດລອກສິດຈາກບົດບາດປັດຈຸບັນໄປຫາບົດບາດໃໝ່", newRoleName: "ຊື່ບົດບາດໃໝ່", duplicateAction: "ທຳສຳເນົາ",
	applyTitle: "ໃຊ້ບົດບາດນີ້ກັບອີກຮ້ານ", applyDescription: "ຄັດລອກສິດໄປຫາຮ້ານປາຍທາງ", noOtherStore: "ຍັງບໍ່ມີຮ້ານອື່ນໃຫ້ໃຊ້ບົດບາດນີ້", targetStore: "ຮ້ານປາຍທາງ", mode: "ໂໝດ", createTargetHint: "ເໝາະສຳລັບສ້າງບົດບາດໃໝ່ໃນຮ້ານປາຍທາງດ້ວຍສິດຊຸດດຽວກັນ", loadingTarget: "ກຳລັງໂຫຼດບົດບາດຂອງຮ້ານປາຍທາງ...", noTargetRole: "ຮ້ານປາຍທາງຍັງບໍ່ມີບົດບາດໃຫ້ເລືອກອັບເດດ", targetRole: "ບົດບາດປາຍທາງ", createTarget: "ສ້າງໃນຮ້ານປາຍທາງ", updateTarget: "ອັບເດດບົດບາດປາຍທາງ",
	deleteSystemTitle: "ລຶບບົດບາດລະບົບບໍ່ໄດ້", deleteTitle: "ຢືນຢັນການລຶບບົດບາດ", deleteSystemDescription: "ບົດບາດນີ້ເປັນຄ່າເລີ່ມຕົ້ນຂອງລະບົບ ຈຶ່ງປ້ອງກັນການລຶບເພື່ອຄວາມປອດໄພ", deleteDescription: "ລະບົບຈະລຶບບົດບາດແບບ soft delete", cannotDelete: "ເປັນບົດບາດລະບົບ ຈຶ່ງລຶບບໍ່ໄດ້", confirmDelete: "ຕ້ອງການລຶບບົດບາດນີ້ຫຼືບໍ?", duplicateInstead: "ທຳສຳເນົາແທນ",
	loadFailed: "ໂຫຼດຂໍ້ມູນບົດບາດບໍ່ສຳເລັດ", reloadFailed: "ໂຫຼດໃໝ່ບໍ່ສຳເລັດ", noStore: "ຍັງບໍ່ພົບຮ້ານ", noStoreHint: "ກະລຸນາສ້າງຮ້ານກ່ອນ", noTarget: "ຍັງບໍ່ມີຮ້ານປາຍທາງ", noTargetHint: "ຕ້ອງມີຮ້ານອື່ນຢ່າງໜ້ອຍ 1 ຮ້ານ", requiredName: "ກະລຸນາລະບຸຊື່ບົດບາດ", requiredPermission: "ກະລຸນາເລືອກສິດຢ່າງໜ້ອຍ 1 ລາຍການ", createFailed: "ສ້າງບົດບາດບໍ່ສຳເລັດ", createSuccess: "ສ້າງບົດບາດແລ້ວ", createSuccessHint: "ເພີ່ມບົດບາດໃໝ່ແລ້ວ", applySuccess: "ໃຊ້ບົດບາດກັບອີກຮ້ານແລ້ວ", applyFailed: "ໃຊ້ບົດບາດກັບອີກຮ້ານບໍ່ສຳເລັດ", deleteSuccess: "ລຶບບົດບາດແລ້ວ", deleteSuccessHint: "ບັນທຶກແບບ soft delete ແລ້ວ", deleteFailed: "ລຶບບົດບາດບໍ່ສຳເລັດ"
} : locale.value === "en" ? {
	description: "Manage store-level roles for stores you oversee.", headerDescription: "Configure user roles and permissions for each store from the Super Admin view.",
	search: "Search role, store, type, or ID", reload: "Reload", add: "Add role", title: "Super Admin roles", listHint: "Manage store roles with a paginated list view.", applyFilter: "Apply filter", emptySearch: "No roles match your search", empty: "No roles in this store yet",
	role: "Role", store: "Store", permissions: "Permissions", type: "Type", action: "Action", manage: "Manage", perPage: "Per page", previous: "Previous", next: "Next", page: "Page", of: "of", roles: "roles", noData: "No data yet",
	editor: "Role editor", editorDescription: "Edit the role name and permissions available to this role.", systemRole: "System role", systemRoleHint: "This default system role cannot be deleted.", roleName: "Role name", selected: "Selected", selectAll: "Select all", clearAll: "Clear all", actions: "Actions", permission: "Permission", close: "Close", save: "Save", duplicate: "Duplicate this role", applyOther: "Apply to another store", delete: "Delete role",
	createTitle: "Create role", createDescription: "Start with a role name, then choose permissions for the store team.", preparing: "Preparing role creation data...", noStoreCreate: "No store is available for role creation. Create a store first or reload.", cancel: "Cancel", create: "Create role",
	duplicateTitle: "Duplicate role", duplicateDescription: "Permissions from the current role will be copied to the new role.", newRoleName: "New role name", duplicateAction: "Duplicate",
	applyTitle: "Apply this role to another store", applyDescription: "Copy the current role permissions to a target store.", noOtherStore: "There is no other store available for this role.", targetStore: "Target store", mode: "Mode", createTargetHint: "Create a new role in the target store with the same permissions.", loadingTarget: "Loading target-store roles...", noTargetRole: "The target store has no role to update.", targetRole: "Target role", createTarget: "Create in target store", updateTarget: "Update target role",
	deleteSystemTitle: "System role cannot be deleted", deleteTitle: "Confirm role deletion", deleteSystemDescription: "This is a default system role and is protected from deletion for safety.", deleteDescription: "The role will be soft-deleted.", cannotDelete: "This is a system role and cannot be deleted.", confirmDelete: "Delete this role?", duplicateInstead: "Duplicate instead",
	loadFailed: "Unable to load role data", reloadFailed: "Unable to reload", noStore: "No store found", noStoreHint: "Create a store before creating roles.", noTarget: "No target store", noTargetHint: "At least one other store is required.", requiredName: "Enter a role name", requiredPermission: "Select at least one permission", createFailed: "Unable to create role", createSuccess: "Role created", createSuccessHint: "The new role has been added.", applySuccess: "Role applied to another store", applyFailed: "Unable to apply role to another store", deleteSuccess: "Role deleted", deleteSuccessHint: "The role was soft-deleted.", deleteFailed: "Unable to delete role"
} : {
	description: "จัดการบทบาทระดับร้านภายใต้ร้านที่คุณดูแล", headerDescription: "กำหนดบทบาทและสิทธิ์ของผู้ใช้ในแต่ละร้านจากมุม Super Admin",
	search: "ค้นหา role, ร้าน, type หรือ ID", reload: "รีโหลด", add: "สร้างบทบาท", title: "Super Admin roles", listHint: "จัดการบทบาทตามร้าน พร้อมมุมมองรายการและการแบ่งหน้า", applyFilter: "ใช้ตัวกรอง", emptySearch: "ไม่พบ role ที่ตรงกับคำค้น", empty: "ยังไม่มี role ในร้านนี้",
	role: "Role", store: "ร้าน", permissions: "Permissions", type: "Type", action: "Action", manage: "จัดการ", perPage: "ต่อหน้า", previous: "ก่อนหน้า", next: "ถัดไป", page: "หน้า", of: "จาก", roles: "บทบาท", noData: "ยังไม่มีข้อมูล",
	editor: "แก้ไขบทบาท", editorDescription: "ปรับชื่อบทบาทและกำหนด permission ที่ role นี้สามารถใช้งานได้", systemRole: "System role", systemRoleHint: "บทบาทค่าเริ่มต้นของระบบ ไม่สามารถลบได้", roleName: "ชื่อบทบาท", selected: "เลือกแล้ว", selectAll: "เลือกทั้งหมด", clearAll: "ล้างทั้งหมด", actions: "Actions", permission: "Permission", close: "ปิด", save: "บันทึก", duplicate: "ทำสำเนา role นี้", applyOther: "ใช้กับอีกร้าน", delete: "ลบบทบาท",
	createTitle: "สร้างบทบาทใหม่", createDescription: "เริ่มจากชื่อ role แล้วเลือกสิทธิ์ที่เหมาะกับทีมงานของร้านนี้", preparing: "กำลังเตรียมข้อมูลสำหรับสร้างบทบาท...", noStoreCreate: "ยังไม่พบร้านสำหรับสร้างบทบาท กรุณาสร้างร้านก่อนหรือรีโหลดข้อมูลอีกครั้ง", cancel: "ยกเลิก", create: "สร้างบทบาท",
	duplicateTitle: "ทำสำเนาบทบาท", duplicateDescription: "ระบบจะคัดลอก permission จาก role ปัจจุบันไปยัง role ใหม่", newRoleName: "ชื่อบทบาทใหม่", duplicateAction: "ทำสำเนา",
	applyTitle: "ใช้ role นี้กับอีกร้าน", applyDescription: "คัดลอก permission ของ role ปัจจุบันไปยังร้านปลายทาง", noOtherStore: "ยังไม่มีร้านอื่นให้ใช้ role นี้ต่อได้", targetStore: "ร้านปลายทาง", mode: "โหมด", createTargetHint: "เหมาะกับการสร้าง role ใหม่ในร้านปลายทาง โดยใช้ permission ชุดเดียวกับต้นทาง", loadingTarget: "กำลังโหลดบทบาทของร้านปลายทาง...", noTargetRole: "ร้านปลายทางยังไม่มี role ให้เลือกอัปเดต", targetRole: "บทบาทปลายทาง", createTarget: "สร้างในร้านปลายทาง", updateTarget: "อัปเดต role ปลายทาง",
	deleteSystemTitle: "ลบบทบาทระบบไม่ได้", deleteTitle: "ยืนยันการลบบทบาท", deleteSystemDescription: "บทบาทนี้ถูกสร้างเป็นค่าเริ่มต้นของระบบ จึงป้องกันการลบเพื่อความปลอดภัย", deleteDescription: "ระบบจะลบบทบาทแบบ soft delete", cannotDelete: "เป็นบทบาทระบบ จึงลบไม่ได้", confirmDelete: "ต้องการลบบทบาทนี้ใช่หรือไม่?", duplicateInstead: "ทำสำเนาแทน",
	loadFailed: "โหลดข้อมูลบทบาทไม่สำเร็จ", reloadFailed: "รีโหลดไม่สำเร็จ", noStore: "ยังไม่พบร้าน", noStoreHint: "กรุณาสร้างร้านก่อน จึงจะสร้างบทบาทได้", noTarget: "ยังไม่มีร้านปลายทาง", noTargetHint: "ต้องมีร้านอื่นอย่างน้อย 1 ร้านก่อน จึงจะใช้ role นี้ข้ามร้านได้", requiredName: "กรุณาระบุชื่อบทบาท", requiredPermission: "กรุณาเลือกสิทธิ์อย่างน้อย 1 รายการ", createFailed: "สร้างบทบาทไม่สำเร็จ", createSuccess: "สร้างบทบาทแล้ว", createSuccessHint: "เพิ่ม role ใหม่เรียบร้อย", applySuccess: "ใช้ role กับอีกร้านแล้ว", applyFailed: "ใช้ role กับอีกร้านไม่สำเร็จ", deleteSuccess: "ลบบทบาทแล้ว", deleteSuccessHint: "ระบบบันทึกแบบ soft delete เรียบร้อย", deleteFailed: "ลบบทบาทไม่สำเร็จ"
});

const selectedStoreId = ref("");
const selectedRoleId = ref("");
const detailOpen = ref(false);
const createOpen = ref(false);
const duplicateOpen = ref(false);
const applyOpen = ref(false);
const deleteConfirmOpen = ref(false);
const saving = ref(false);
const deletingRoleId = ref("");
const loading = ref(true);
const reloading = ref(false);
const roleDetailPending = ref(false);
const createMetaPending = ref(false);
const applyTargetRolesPending = ref(false);
const suppressStoreWatch = ref(false);
const rolesListScrollRef = ref<HTMLElement | null>(null);
const searchQuery = ref("");
const error = ref<string | null>(null);
const createError = ref<string | null>(null);
const applyError = ref<string | null>(null);
const stores = ref<StoreRecord[]>([]);
const permissions = ref<PermissionRecord[]>([]);
const roles = ref<RoleRecord[]>([]);
const roleDetailsById = ref<Record<string, RoleDetailRecord>>({});
const applyTargetRolesByStoreId = ref<Record<string, RoleRecord[]>>({});
const currentPage = ref(1);
const pageSize = ref(20);
const pageSizeOptions = [ 10, 20, 50 ];

const createForm = reactive({
	name: "",
	permissionKeys: [] as string[],
});

const duplicateForm = reactive({
	name: "",
});

const applyForm = reactive({
	targetStoreId: "",
	mode: "create" as ApplyRoleMode,
	name: "",
	targetRoleId: "",
});

const canManageRoles = computed(() => (
	can("superadmin.roles.create")
	|| can("superadmin.roles.update")
	|| can("superadmin.roles.archive")
	|| can("settings.roles.create")
	|| can("settings.roles.update")
	|| can("settings.roles.archive")
));
const isCreateRoleButtonDisabled = computed(() => (
	!canManageRoles.value
	|| saving.value
));
const createPanelPending = computed(() => (
	createMetaPending.value || (loading.value && (!stores.value.length || !permissions.value.length))
));
const createRolePermissionCount = computed(() => createForm.permissionKeys.length);
const visiblePermissions = computed(() => permissions.value.filter((permission) => (
	isVisibleStoreRolePermissionKey(permission.key)
)));
const createRolePermissionTotal = computed(() => permissionMatrixRows.value.reduce((total, row) => total + row.allKeys.length, 0));
const canSubmitCreateRole = computed(() => (
	canManageRoles.value
	&& !saving.value
	&& Boolean(selectedStoreId.value)
	&& createForm.name.trim().length > 0
	&& createRolePermissionCount.value > 0
));
const selectedRole = computed(() => roles.value.find((role) => role.id === selectedRoleId.value) ?? roles.value[0] ?? null);
const selectedRoleDetail = computed(() => (
	selectedRoleId.value ? roleDetailsById.value[selectedRoleId.value] || null : null
));
const applyTargetStoreOptions = computed(() => (
	stores.value.filter((store) => store.id !== selectedRole.value?.store_id)
));
const applyTargetRoles = computed(() => applyTargetRolesByStoreId.value[applyForm.targetStoreId] ?? []);
const applyModeOptions = computed(() => [
	{ value: "create" as ApplyRoleMode, label: copy.value.createTarget },
	{ value: "update" as ApplyRoleMode, label: copy.value.updateTarget },
]);
const canSubmitApplyRole = computed(() => (
	canManageRoles.value
	&& !saving.value
	&& Boolean(selectedRole.value)
	&& Boolean(applyForm.targetStoreId)
	&& (
		applyForm.mode === "create"
			? applyForm.name.trim().length > 0
			: applyForm.targetRoleId.trim().length > 0
	)
));
const selectedApplyTargetRole = computed(() => (
	applyTargetRoles.value.find((role) => role.id === applyForm.targetRoleId) ?? null
));
const selectedRolePermissionCount = computed(() => (
	selectedRoleDetail.value?.permissions.filter((permission) => isVisibleStoreRolePermissionKey(permission.key)).length
	?? selectedRole.value?.permissions_count
	?? 0
));
const isSelectedSystemRole = computed(() => Number(selectedRole.value?.is_system || 0) === 1);
const filteredRoles = computed(() => {
	const keyword = searchQuery.value.trim().toLowerCase();
	if (!keyword) return roles.value;

	return roles.value.filter((role) => (
		role.name.toLowerCase().includes(keyword)
		|| role.id.toLowerCase().includes(keyword)
		|| getStoreName(role.store_id).toLowerCase().includes(keyword)
		|| roleLabel(role).toLowerCase().includes(keyword)
		|| String(role.permissions_count).includes(keyword)
	));
});
const roleDetailHasChanges = computed(() => {
	const roleDetail = selectedRoleDetail.value;
	if (!roleDetail) return false;

	const currentName = editorForm.name.trim();
	const originalName = roleDetail.name.trim();
	if (currentName !== originalName) return true;

	const currentPermissions = [ ...new Set(editorForm.permissionKeys) ].sort();
	const originalPermissions = [ ...new Set(roleDetail.permissions.map((permission) => permission.key)) ].sort();
	if (currentPermissions.length !== originalPermissions.length) return true;

	return currentPermissions.some((key, index) => key !== originalPermissions[index]);
});
const listPending = computed(() => loading.value || reloading.value);
const totalRoles = computed(() => filteredRoles.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(totalRoles.value / pageSize.value)));
const pageLabel = computed(() => `${copy.value.page} ${currentPage.value} / ${totalPages.value}`);
const pageStart = computed(() => (
	totalRoles.value === 0
		? 0
		: ((currentPage.value - 1) * pageSize.value) + 1
));
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, totalRoles.value));
const pageSummaryText = computed(() => (
	totalRoles.value === 0
		? copy.value.noData
		: `${pageStart.value}-${pageEnd.value} ${copy.value.of} ${totalRoles.value} ${copy.value.roles}`
));
const paginatedRoles = computed(() => {
	const start = (currentPage.value - 1) * pageSize.value;
	const end = start + pageSize.value;
	return filteredRoles.value.slice(start, end);
});

const editorForm = reactive({
	name: "",
	permissionKeys: [] as string[],
});

function getPermissionAction(permission: PermissionRecord): string {
	if (typeof permission.action === "string" && permission.action.trim()) {
		return permission.action.trim().toLowerCase();
	}
	const keyParts = permission.key.split(".");
	return String(keyParts[keyParts.length - 1] || "").trim().toLowerCase();
}

function permissionActionLabel(action: string) {
	const normalized = action.toLowerCase();
	const labels: Record<string, [string, string, string]> = {
		read: [ "ເບິ່ງ", "View", "ดู" ],
		view: [ "ເບິ່ງ", "View", "ดู" ],
		create: [ "ສ້າງ", "Create", "สร้าง" ],
		update: [ "ແກ້ໄຂ", "Update", "แก้ไข" ],
		archive: [ "ປິດໃຊ້ງານ/ລຶບ", "Archive", "ปิดใช้งาน/ลบ" ],
		deactivate: [ "ປິດການຂາຍ", "Deactivate", "ปิดการขาย" ],
		update_cost: [ "ປັບຕົ້ນທຶນ", "Update cost", "ปรับต้นทุน" ],
		adjust: [ "ປັບສະຕັອກ", "Adjust stock", "ปรับสต็อก" ],
		adjust_negative: [ "ອະນຸຍາດສະຕັອກຕິດລົບ", "Allow negative stock", "อนุญาตสต็อกติดลบ" ],
		cancel: [ "ຍົກເລີກ", "Cancel", "ยกเลิก" ],
		receive: [ "ຮັບສິນຄ້າ", "Receive goods", "รับสินค้า" ],
		export: [ "ສົ່ງອອກ", "Export", "ส่งออก" ],
		manage_store: [ "ຈັດການຮ້ານ", "Manage store", "จัดการร้าน" ],
		manage_users: [ "ຈັດການຜູ້ໃຊ້", "Manage users", "จัดการผู้ใช้" ],
		manage_roles: [ "ຈັດການບົດບາດ", "Manage roles", "จัดการบทบาท" ],
		suspend: [ "ລະງັບບັນຊີ", "Suspend", "ระงับบัญชี" ],
		assign_role: [ "ກຳນົດບົດບາດ", "Assign role", "กำหนดบทบาท" ],
		reset_password: [ "ຕັ້ງລະຫັດໃໝ່", "Reset password", "ตั้งรหัสผ่านใหม่" ],
		apply_discount: [ "ໃຊ້ສ່ວນຫຼຸດ", "Apply discount", "ใช้ส่วนลด" ],
		override_price: [ "ປັບລາຄາ", "Override price", "ปรับราคา" ],
		create_order: [ "ສ້າງອໍເດີ", "Create order", "สร้างออเดอร์" ],
		open: [ "ເປີດອໍເດີ/ໂຕະ", "Open order/table", "เปิดออเดอร์/โต๊ะ" ],
		send_kitchen: [ "ສົ່ງເຂົ້າຄົວ", "Send to kitchen", "ส่งเข้าครัว" ],
		transfer: [ "ຍ້າຍໂຕະ", "Transfer table", "ย้ายโต๊ะ" ],
		cancel_sent: [ "ຍົກເລີກລາຍການທີ່ສົ່ງຄົວ", "Cancel sent item", "ยกเลิกรายการที่ส่งครัว" ],
		apply_promotion: [ "ໃຊ້ໂປຣໂມຊັນ", "Apply promotion", "ใช้โปรโมชั่น" ],
		print: [ "ພິມບິນ", "Print receipt", "พิมพ์บิล" ],
	};
	const [ lao, english, thai ] = labels[normalized] || [ normalized, normalized, normalized ];
	return locale.value === "lo" ? lao : locale.value === "en" ? english : thai;
}

function permissionResourceLabel(resource: string) {
	const labels: Record<string, [string, string, string]> = {
		activity: [ "ກິດຈະກຳ", "Activity", "กิจกรรม" ],
		inventory: [ "ສະຕັອກ", "Inventory", "สต็อก" ],
		products: [ "ສິນຄ້າ", "Products", "สินค้า" ],
		promotions: [ "ໂປຣໂມຊັນ", "Promotions", "โปรโมชั่น" ],
		purchase_orders: [ "ສັ່ງຊື້", "Purchase orders", "สั่งซื้อ" ],
		reports: [ "ລາຍງານ", "Reports", "รายงาน" ],
		stores: [ "ຮ້ານ", "Stores", "ร้าน" ],
		settings: [ "ຕັ້ງຄ່າ", "Settings", "ตั้งค่า" ],
		"settings.store": [ "ຕັ້ງຄ່າຮ້ານ", "Store settings", "ตั้งค่าร้าน" ],
		"settings.restaurant": [ "ຕັ້ງຄ່າຮ້ານອາຫານ", "Restaurant settings", "ตั้งค่าร้านอาหาร" ],
		"settings.users": [ "ຜູ້ໃຊ້ຮ້ານ", "Store users", "ผู้ใช้ร้าน" ],
		"settings.roles": [ "ບົດບາດຮ້ານ", "Store roles", "บทบาทร้าน" ],
		pos: [ "ຂາຍໜ້າຮ້ານ", "POS", "ขายหน้าร้าน" ],
		"pos.restaurant": [ "ຂາຍໜ້າຮ້ານອາຫານ", "Restaurant POS", "ขายหน้าร้านอาหาร" ],
	};
	const [ lao, english, thai ] = labels[resource] || [ resource, resource, resource ];
	return locale.value === "lo" ? lao : locale.value === "en" ? english : thai;
}

const permissionMatrixRows = computed<PermissionMatrixRow[]>(() => {
	const rows = new Map<string, PermissionMatrixRow>();

	for (const permission of visiblePermissions.value) {
		const resource = permission.resource;
		const existing = rows.get(resource) || {
			resource,
			permissions: [],
			allKeys: [],
		};

		existing.allKeys.push(permission.key);
		existing.permissions.push(permission);

		rows.set(resource, existing);
	}

	return Array.from(rows.values())
		.map((row) => ({
			...row,
			allKeys: Array.from(new Set(row.allKeys)),
			permissions: row.permissions.slice().sort((left, right) => (
				permissionActionLabel(getPermissionAction(left)).localeCompare(permissionActionLabel(getPermissionAction(right)))
			)),
		}))
		.filter((row) => row.allKeys.length > 0)
		.sort((left, right) => permissionResourceLabel(left.resource).localeCompare(permissionResourceLabel(right.resource)));
});

watch(selectedRoleDetail, (role) => {
	if (!role) {
		editorForm.name = "";
		editorForm.permissionKeys = [];
		return;
	}
	editorForm.name = role.name;
	editorForm.permissionKeys = role.permissions.map((permission) => permission.key);
}, { immediate: true });

watch(duplicateOpen, (isOpen) => {
	if (isOpen && selectedRole.value) {
		duplicateForm.name = `${selectedRole.value.name} ${locale.value === "lo" ? "ສຳເນົາ" : locale.value === "en" ? "Copy" : "สำเนา"}`;
	}
});

watch(applyOpen, async (isOpen) => {
	if (!isOpen || !selectedRole.value) return;
	applyForm.mode = "create";
	applyForm.name = selectedRole.value.name;
	applyForm.targetRoleId = "";
	applyForm.targetStoreId = applyTargetStoreOptions.value[0]?.id || "";
});

watch(createOpen, (isOpen) => {
	if (isOpen) {
		createError.value = null;
		if (!selectedStoreId.value && stores.value.length > 0) {
			selectedStoreId.value = stores.value[0].id;
		}
	}
});

watch(() => applyForm.targetStoreId, async (value, previousValue) => {
	if (!applyOpen.value || !value || value === previousValue) return;
	applyForm.targetRoleId = "";
	if (applyForm.mode === "update") {
		await fetchApplyTargetRoles(value);
		applyForm.targetRoleId = applyTargetRolesByStoreId.value[value]?.[0]?.id || "";
	}
});

watch(() => applyForm.mode, async (mode) => {
	if (!applyOpen.value) return;
	if (mode === "create") {
		applyForm.targetRoleId = "";
		if (!applyForm.name.trim() && selectedRole.value) {
			applyForm.name = selectedRole.value.name;
		}
		return;
	}

	if (applyForm.targetStoreId) {
		await fetchApplyTargetRoles(applyForm.targetStoreId);
		applyForm.targetRoleId = applyTargetRolesByStoreId.value[applyForm.targetStoreId]?.[0]?.id || "";
	}
});

watch(selectedStoreId, async (value, previousValue) => {
	if (!value) return;
	if (suppressStoreWatch.value) return;
	if (value === previousValue) return;
	currentPage.value = 1;
	await fetchRoles();
}, { immediate: false });

watch(searchQuery, () => {
	currentPage.value = 1;
});

function scrollRolesListToTop() {
	rolesListScrollRef.value?.scrollTo({
		top: 0,
		behavior: "auto",
	});
}

function goToPage(nextPage: number) {
	const normalizedPage = Math.min(Math.max(1, nextPage), totalPages.value);
	if (normalizedPage === currentPage.value) return;
	currentPage.value = normalizedPage;
	nextTick(() => {
		scrollRolesListToTop();
	});
}

function updatePageSize(nextPageSize: number | string) {
	const normalizedSize = Number(nextPageSize);
	if (!Number.isFinite(normalizedSize) || normalizedSize <= 0 || normalizedSize === pageSize.value) return;
	pageSize.value = normalizedSize;
	currentPage.value = 1;
	nextTick(() => {
		scrollRolesListToTop();
	});
}

function applyStoreFilter() {
	currentPage.value = 1;
	void fetchRoles();
}

function isPermissionChecked(permissionKey: string) {
	return editorForm.permissionKeys.includes(permissionKey);
}

function setPermissionGroupSelection(current: string[], permissionKeys: string[], checked: boolean): string[] {
	if (checked) {
		return [ ...new Set([ ...current, ...permissionKeys ]) ];
	}
	const removeSet = new Set(permissionKeys);
	return current.filter((key) => !removeSet.has(key));
}

function countSelectedPermissionKeys(selectedKeys: string[], permissionKeys: string[]): number {
	if (!selectedKeys.length || !permissionKeys.length) return 0;
	const selectedSet = new Set(selectedKeys);
	return permissionKeys.reduce((count, permissionKey) => (
		selectedSet.has(permissionKey) ? count + 1 : count
	), 0);
}

function getStoreName(storeId: string) {
	return stores.value.find((store) => store.id === storeId)?.name || storeId || "-";
}

function roleTone(role: RoleRecord) {
	return Number(role.is_system || 0) === 1 ? "neutral" : "primary";
}

function roleLabel(role: RoleRecord) {
	return Number(role.is_system || 0) === 1
		? copy.value.systemRole
		: (locale.value === "lo" ? "ກຳນົດເອງ" : locale.value === "en" ? "Custom" : "กำหนดเอง");
}

function togglePermission(permissionKey: string, checked: boolean) {
	if (checked) {
		if (!editorForm.permissionKeys.includes(permissionKey)) {
			editorForm.permissionKeys = [ ...editorForm.permissionKeys, permissionKey ];
		}
		return;
	}
	editorForm.permissionKeys = editorForm.permissionKeys.filter((key) => key !== permissionKey);
}

function togglePermissionGroup(permissionKeys: string[], checked: boolean) {
	editorForm.permissionKeys = setPermissionGroupSelection(editorForm.permissionKeys, permissionKeys, checked);
}

function isCreatePermissionChecked(permissionKey: string) {
	return createForm.permissionKeys.includes(permissionKey);
}

function toggleCreatePermission(permissionKey: string, checked: boolean) {
	if (checked) {
		if (!createForm.permissionKeys.includes(permissionKey)) {
			createForm.permissionKeys = [ ...createForm.permissionKeys, permissionKey ];
		}
		return;
	}
	createForm.permissionKeys = createForm.permissionKeys.filter((key) => key !== permissionKey);
}

function toggleCreatePermissionGroup(groupPermissionKeys: string[], checked: boolean) {
	createForm.permissionKeys = setPermissionGroupSelection(createForm.permissionKeys, groupPermissionKeys, checked);
}

function resolveApiErrorMessage(errorValue: unknown, fallback = copy.value.loadFailed) {
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

async function selectRole(roleId: string) {
	selectedRoleId.value = roleId;
	detailOpen.value = true;
	await loadRoleDetail(roleId);
}

function openCreateRolePanel() {
	if (!canManageRoles.value) return;
	if (!selectedStoreId.value && !loading.value && !stores.value.length) {
		appToast.error({
			title: copy.value.noStore,
			description: copy.value.noStoreHint,
		});
		return;
	}
	createOpen.value = true;
}

function openApplyRolePanel() {
	if (!canManageRoles.value || !selectedRole.value) return;
	if (!applyTargetStoreOptions.value.length) {
		appToast.error({
			title: copy.value.noTarget,
			description: copy.value.noTargetHint,
		});
		return;
	}
	applyError.value = null;
	applyOpen.value = true;
}

async function reloadRolePage() {
	if (loading.value || reloading.value) return;
	reloading.value = true;
	error.value = null;
	try {
		suppressStoreWatch.value = true;
		await Promise.all([ fetchStores(), fetchPermissions() ]);
		suppressStoreWatch.value = false;
		if (selectedStoreId.value) {
			await fetchRoles();
		}
	} catch (fetchError) {
		error.value = fetchError instanceof Error ? fetchError.message : copy.value.loadFailed;
		appToast.error({
			title: copy.value.reloadFailed,
			description: error.value,
		});
	} finally {
		suppressStoreWatch.value = false;
		reloading.value = false;
	}
}

async function fetchStores() {
	const response = await apiFetch<ApiEnvelope<StoreRecord[]>>("/superadmin/stores");
	stores.value = response.data;
	const hasCurrentStore = stores.value.some((store) => store.id === selectedStoreId.value);
	const nextStoreId = hasCurrentStore ? selectedStoreId.value : (stores.value[0]?.id || "");
	if (nextStoreId !== selectedStoreId.value) {
		selectedStoreId.value = nextStoreId;
	}
}

async function fetchPermissions() {
	const response = await apiFetch<ApiEnvelope<PermissionRecord[]>>("/rbac/permissions");
	permissions.value = response.data;
}

async function fetchRoles() {
	if (!selectedStoreId.value) return;
	const response = await apiFetch<ApiEnvelope<RoleRecord[]>>(`/rbac/roles-summary?store_id=${encodeURIComponent(selectedStoreId.value)}`);
	roles.value = response.data;
	const validRoleIds = new Set(roles.value.map((role) => role.id));
	roleDetailsById.value = Object.fromEntries(
		Object.entries(roleDetailsById.value).filter(([ roleId ]) => validRoleIds.has(roleId)),
	);
	if (!roles.value.some((role) => role.id === selectedRoleId.value)) {
		selectedRoleId.value = roles.value[0]?.id || "";
	}
	if (currentPage.value > totalPages.value) {
		currentPage.value = totalPages.value;
	}
	await nextTick();
	scrollRolesListToTop();
}

async function fetchApplyTargetRoles(storeId: string, force = false) {
	if (!storeId) return;
	if (!force && applyTargetRolesByStoreId.value[storeId]) return;
	applyTargetRolesPending.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<RoleRecord[]>>(`/rbac/roles-summary?store_id=${encodeURIComponent(storeId)}`);
		applyTargetRolesByStoreId.value = {
			...applyTargetRolesByStoreId.value,
			[storeId]: response.data,
		};
	} finally {
		applyTargetRolesPending.value = false;
	}
}

async function loadRoleDetail(roleId: string, force = false) {
	if (!roleId) return;
	if (!force && roleDetailsById.value[roleId]) return;
	roleDetailPending.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<RoleDetailRecord>>(`/rbac/roles/${encodeURIComponent(roleId)}`);
		roleDetailsById.value = {
			...roleDetailsById.value,
			[roleId]: response.data,
		};
	} finally {
		roleDetailPending.value = false;
	}
}

async function createRole() {
	if (createPanelPending.value) return;
	if (!selectedStoreId.value) return;
	if (!createForm.name.trim()) {
		createError.value = copy.value.requiredName;
		appToast.error({
			title: copy.value.createFailed,
			description: createError.value,
		});
		return;
	}
	if (!createForm.permissionKeys.length) {
		createError.value = copy.value.requiredPermission;
		appToast.error({
			title: copy.value.createFailed,
			description: createError.value,
		});
		return;
	}

	createError.value = null;
	saving.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<RoleRecord>>("/rbac/roles", {
			method: "POST",
			body: {
				store_id: selectedStoreId.value,
				name: createForm.name.trim(),
				permission_keys: createForm.permissionKeys,
				actor_user_id: currentUser.value?.id || null,
			},
		});
		createOpen.value = false;
		createForm.name = "";
		createForm.permissionKeys = [];
		await fetchRoles();
		selectedRoleId.value = response.data.id;
		await loadRoleDetail(response.data.id, true);
		appToast.success({
			title: copy.value.createSuccess,
			description: copy.value.createSuccessHint,
		});
	} catch (err) {
		createError.value = resolveApiErrorMessage(err, copy.value.createFailed);
		appToast.error({
			title: copy.value.createFailed,
			description: createError.value,
		});
	} finally {
		saving.value = false;
	}
}

async function saveRole() {
	if (!selectedRole.value) return;
	if (!roleDetailHasChanges.value) return;
	saving.value = true;
	try {
		await apiFetch(`/rbac/roles/${encodeURIComponent(selectedRole.value.id)}`, {
			method: "PUT",
			body: {
				name: editorForm.name,
				permission_keys: editorForm.permissionKeys,
				actor_user_id: currentUser.value?.id || null,
			},
		});
		await fetchRoles();
		await loadRoleDetail(selectedRole.value.id, true);
	} finally {
		saving.value = false;
	}
}

async function duplicateRole() {
	if (!selectedRole.value) return;
	saving.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<RoleRecord>>(`/rbac/roles/${encodeURIComponent(selectedRole.value.id)}/duplicate`, {
			method: "POST",
			body: {
				name: duplicateForm.name,
				actor_user_id: currentUser.value?.id || null,
			},
		});
		duplicateOpen.value = false;
		await fetchRoles();
		selectedRoleId.value = response.data.id;
		await loadRoleDetail(response.data.id, true);
	} finally {
		saving.value = false;
	}
}

async function applyRoleToAnotherStore() {
	if (!selectedRole.value || !canSubmitApplyRole.value) return;
	applyError.value = null;
	saving.value = true;
	try {
		await apiFetch(`/rbac/roles/${encodeURIComponent(selectedRole.value.id)}/apply`, {
			method: "POST",
			body: {
				target_store_id: applyForm.targetStoreId,
				mode: applyForm.mode,
				name: applyForm.mode === "create" ? applyForm.name.trim() : undefined,
				target_role_id: applyForm.mode === "update" ? applyForm.targetRoleId : undefined,
				actor_user_id: currentUser.value?.id || null,
			},
		});
		applyOpen.value = false;
		appToast.success({
			title: copy.value.applySuccess,
			description: applyForm.mode === "create"
				? copy.value.createTargetHint
				: copy.value.updateTarget,
		});
	} catch (err) {
		applyError.value = resolveApiErrorMessage(err, copy.value.applyFailed);
		appToast.error({
			title: copy.value.applyFailed,
			description: applyError.value,
		});
	} finally {
		saving.value = false;
	}
}

function openDeleteRoleConfirm() {
	const role = selectedRole.value;
	if (!role) return;
	deleteConfirmOpen.value = true;
}

async function removeRole() {
	const role = selectedRole.value;
	if (!role) return;
	deletingRoleId.value = role.id;
	try {
		await apiFetch(`/rbac/roles/${encodeURIComponent(role.id)}`, {
			method: "DELETE",
		});
		appToast.success({
			title: copy.value.deleteSuccess,
			description: copy.value.deleteSuccessHint,
		});
		deleteConfirmOpen.value = false;
		detailOpen.value = false;
		await fetchRoles();
	} catch (err) {
		appToast.error({
			title: copy.value.deleteFailed,
			description: resolveApiErrorMessage(err),
		});
	} finally {
		deletingRoleId.value = "";
	}
}

onMounted(async () => {
	loading.value = true;
	error.value = null;
	try {
		suppressStoreWatch.value = true;
		await Promise.all([fetchStores(), fetchPermissions()]);
		suppressStoreWatch.value = false;
		if (selectedStoreId.value) {
			await fetchRoles();
		}
	} catch (fetchError) {
		error.value = fetchError instanceof Error ? fetchError.message : copy.value.loadFailed;
	} finally {
		suppressStoreWatch.value = false;
		loading.value = false;
	}
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
					:description="copy.headerDescription"
					@menu="openSidebar"
				>
						<div class="ml-auto grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 pt-0.5 sm:pt-1 lg:w-auto lg:grid-cols-[minmax(320px,1fr)_auto_auto] lg:gap-3 lg:justify-end">
						<UInput
							v-model="searchQuery"
							icon="i-heroicons-magnifying-glass-20-solid"
							size="lg"
							color="neutral"
							:placeholder="copy.search"
							class="min-w-0 w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5 [&_input]:shadow-sm [&_input]:focus:border-primary-300 [&_input]:focus:ring-2 [&_input]:focus:ring-primary-200"
						/>
						<AppButton
							color="neutral"
							variant="soft"
							size="md"
							icon="i-heroicons-arrow-path-20-solid"
							class="h-9 w-9 shrink-0 justify-center rounded-md px-0 sm:h-auto sm:w-auto sm:px-3"
							:loading="listPending"
							:spin-icon-on-loading="true"
							:disabled="loading || saving"
							:aria-label="copy.reload"
							:title="copy.reload"
							@click="reloadRolePage"
						>
							<span class="hidden sm:inline">{{ copy.reload }}</span>
						</AppButton>
						<AppButton
							color="primary"
							variant="solid"
							size="md"
							icon="i-heroicons-plus-20-solid"
							class="h-9 w-9 shrink-0 justify-center rounded-md px-0 sm:h-auto sm:w-auto sm:px-3"
							:disabled="isCreateRoleButtonDisabled"
							:aria-label="copy.add"
							:title="copy.add"
							@click="openCreateRolePanel"
						>
							<span class="hidden sm:inline">{{ copy.add }}</span>
						</AppButton>
					</div>
				</AppPageHeader>

				<div class="grid gap-3 lg:pr-1">
					<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">{{ copy.title }}</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">{{ copy.listHint }}</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									{{ pageSummaryText }}
								</div>
							</div>

							<div class="border-b border-[#ece6dc] px-4 py-3">
								<div class="space-y-2.5">
									<div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5">
										<select
											v-model="selectedStoreId"
											class="w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
										>
											<option v-for="store in stores" :key="store.id" :value="store.id">{{ store.name }}</option>
										</select>
										<AppButton color="primary" variant="soft" size="md" icon="i-heroicons-funnel-20-solid" class="whitespace-nowrap rounded-md sm:self-stretch" @click="applyStoreFilter">
											{{ copy.applyFilter }}
										</AppButton>
									</div>
								</div>
							</div>

							<div ref="rolesListScrollRef" class="scrollbar-soft min-h-0 flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
								<div v-if="listPending" class="min-h-[280px]">
									<AppInlineLoadingBar container-class="bg-neutral-100" />
								</div>
								<div v-else-if="error" class="p-5 text-center text-sm text-error">
									{{ error }}
								</div>
								<div v-else-if="!roles.length" class="p-5 text-center text-sm text-stone-500">
									{{ searchQuery ? copy.emptySearch : copy.empty }}
								</div>
								<template v-else>
									<div class="overflow-x-auto">
										<table class="min-w-[920px] w-full border-separate border-spacing-0">
										<thead class="sticky top-0 z-10 bg-[#fcfbf8] dark:bg-[#221d18]">
											<tr class="text-left text-xs font-medium uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">
													<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.role }}</th>
													<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.store }}</th>
													<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.permissions }}</th>
													<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.type }}</th>
													<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 text-right dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.action }}</th>
											</tr>
										</thead>
											<tbody>
												<tr
													v-for="role in paginatedRoles"
													:key="role.id"
													class="cursor-pointer text-sm text-stone-700 transition hover:bg-primary-50 focus-within:bg-primary-50"
													:class="detailOpen && selectedRoleId === role.id ? '!bg-primary-50' : 'bg-white'"
													@click="selectRole(role.id)"
												>
											<td class="border-b border-[#f1ede6] px-4 py-4">
												<div class="min-w-0">
													<p class="truncate font-semibold text-stone-950">{{ role.name }}</p>
												</div>
											</td>
													<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600">
														{{ getStoreName(role.store_id) }}
													</td>
													<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600 tabular-nums">
														{{ role.permissions_count }}
													</td>
													<td class="border-b border-[#f1ede6] px-4 py-4">
														<UBadge :color="roleTone(role)" variant="soft" :label="roleLabel(role)" />
													</td>
													<td class="border-b border-[#f1ede6] px-4 py-4 text-right">
														<AppButton
															color="neutral"
															variant="soft"
															size="md"
															class="rounded-md"
															icon="i-heroicons-chevron-right-20-solid"
															@click.stop="selectRole(role.id)"
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
												:disabled="currentPage <= 1 || listPending"
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
												:disabled="currentPage >= totalPages || listPending"
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

			<AppResponsivePanel
				v-model="detailOpen"
				:title="selectedRole ? selectedRole.name : copy.editor"
				:description="copy.editorDescription"
				desktop-width="680px"
				mobile-max-height="88dvh"
				:fill-mobile-height="true"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<template v-if="selectedRole">
					<div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] text-stone-900">
						<div class="shrink-0 px-5 pt-3">
							<AppInlineLoadingBar
								v-if="roleDetailPending"
								:minimal="true"
							/>
						</div>
							<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-5 py-4">
								<div v-if="isSelectedSystemRole" class="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
									<div class="flex items-start gap-2.5">
										<UIcon name="i-heroicons-information-circle-20-solid" class="mt-0.5 h-5 w-5 text-amber-600" />
										<div class="min-w-0">
											<p class="text-sm font-semibold text-amber-800">{{ copy.systemRole }}</p>
											<p class="mt-1 text-sm text-amber-700">{{ copy.systemRoleHint }}</p>
										</div>
									</div>
								</div>
								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">{{ copy.roleName }}</label>
								<UInput
									v-model="editorForm.name"
									size="lg"
									color="neutral"
									:disabled="roleDetailPending || !selectedRoleDetail || saving || !canManageRoles"
									class="mt-3 w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
								/>
							</div>

							<div
								v-for="row in permissionMatrixRows"
								:key="row.resource"
								class="rounded-md border border-neutral-200 bg-neutral-50 p-4"
							>
								<div class="flex flex-wrap items-center justify-between gap-3">
									<div>
										<p class="text-sm font-semibold text-stone-900">{{ permissionResourceLabel(row.resource) }}</p>
										<p class="mt-1 text-xs text-stone-500">
											{{ copy.selected }} {{ countSelectedPermissionKeys(editorForm.permissionKeys, row.allKeys) }} / {{ row.allKeys.length }}
										</p>
									</div>
									<div class="flex flex-wrap gap-2">
										<AppButton
											color="neutral"
											variant="soft"
											size="md"
											:label="copy.selectAll"
											:disabled="!canManageRoles || saving || roleDetailPending || !selectedRoleDetail"
											@click="togglePermissionGroup(row.allKeys, true)"
										/>
										<AppButton
											color="neutral"
											variant="soft"
											size="md"
											:label="copy.clearAll"
											:disabled="!canManageRoles || saving || roleDetailPending || !selectedRoleDetail"
											@click="togglePermissionGroup(row.allKeys, false)"
										/>
									</div>
								</div>

								<div class="mt-4 grid gap-2 sm:grid-cols-2">
									<label
										v-for="permission in row.permissions"
										:key="permission.key"
										class="flex cursor-pointer items-center gap-3 rounded-md border border-neutral-200 bg-white px-3 py-3 text-sm text-stone-800 transition hover:bg-neutral-50"
										:class="{ 'cursor-not-allowed opacity-60': !canManageRoles || saving || roleDetailPending || !selectedRoleDetail }"
									>
										<input
											:checked="isPermissionChecked(permission.key)"
											type="checkbox"
											class="h-4 w-4 rounded border-[#d6d3d1] text-[#c97745] focus:ring-[#c97745]"
											:disabled="!canManageRoles || saving || roleDetailPending || !selectedRoleDetail"
											@change="togglePermission(permission.key, ($event.target as HTMLInputElement).checked)"
										/>
										<span>{{ permissionActionLabel(getPermissionAction(permission)) }}</span>
									</label>
								</div>

							</div>
						</div>

						<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
							<div class="grid w-full grid-cols-2 gap-2">
								<AppButton color="neutral" variant="soft" size="md" :block="true" @click="detailOpen = false">{{ copy.close }}</AppButton>
								<AppButton
									color="primary"
									variant="solid"
									size="md"
									icon="i-heroicons-check-20-solid"
									:block="true"
									:disabled="!canManageRoles || saving || roleDetailPending || !selectedRoleDetail || !roleDetailHasChanges"
									:loading="saving"
									:spin-icon-on-loading="true"
									@click="saveRole"
								>
									{{ copy.save }}
								</AppButton>
							</div>
							<div class="mt-2">
								<AppButton
									color="neutral"
									variant="soft"
									size="md"
									icon="i-heroicons-document-duplicate-20-solid"
									:block="true"
									:disabled="!canManageRoles || saving || roleDetailPending || !selectedRoleDetail"
									@click="duplicateOpen = true"
								>
									{{ copy.duplicate }}
								</AppButton>
							</div>
							<div class="mt-2">
								<AppButton
									color="primary"
									variant="soft"
									size="md"
									icon="i-heroicons-arrow-right-circle-20-solid"
									:block="true"
									:disabled="!canManageRoles || saving || roleDetailPending || !selectedRoleDetail"
									@click="openApplyRolePanel"
								>
									{{ copy.applyOther }}
								</AppButton>
							</div>
							<div class="mt-2">
								<AppButton
									color="error"
									variant="soft"
									size="md"
									icon="i-heroicons-trash-20-solid"
									:block="true"
									:disabled="!canManageRoles || saving || roleDetailPending || !selectedRoleDetail || deletingRoleId === selectedRole?.id"
									:loading="deletingRoleId === selectedRole?.id"
									:spin-icon-on-loading="true"
									@click="openDeleteRoleConfirm"
								>
									{{ copy.delete }}
								</AppButton>
							</div>
						</div>
					</div>
				</template>
			</AppResponsivePanel>

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
				<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
					<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-5 py-4">
						<div v-if="createPanelPending" class="space-y-4">
							<AppInlineLoadingBar :label="copy.preparing" />
						</div>

						<template v-else>
							<div v-if="!selectedStoreId" class="rounded-md border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-stone-700">
								{{ copy.noStoreCreate }}
							</div>

							<div class="rounded-md border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-stone-700">
								{{ copy.selected }} {{ createRolePermissionCount }} / {{ createRolePermissionTotal }} {{ copy.permissions }}
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">{{ copy.roleName }}</label>
								<UInput
									v-model="createForm.name"
									size="lg"
									color="neutral"
									class="mt-3 w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
								/>
							</div>

							<div
								v-for="row in permissionMatrixRows"
								:key="`create-${row.resource}`"
								class="rounded-md border border-neutral-200 bg-neutral-50 p-4"
							>
								<div class="flex flex-wrap items-center justify-between gap-3">
									<div>
										<p class="text-sm font-semibold text-stone-900">{{ permissionResourceLabel(row.resource) }}</p>
										<p class="mt-1 text-xs text-stone-500">
											{{ copy.selected }} {{ countSelectedPermissionKeys(createForm.permissionKeys, row.allKeys) }} / {{ row.allKeys.length }}
										</p>
									</div>
									<div class="flex flex-wrap gap-2">
										<AppButton
											color="neutral"
											variant="soft"
											size="md"
											:label="copy.selectAll"
											:disabled="!canManageRoles || saving"
											@click="toggleCreatePermissionGroup(row.allKeys, true)"
										/>
										<AppButton
											color="neutral"
											variant="soft"
											size="md"
											:label="copy.clearAll"
											:disabled="!canManageRoles || saving"
											@click="toggleCreatePermissionGroup(row.allKeys, false)"
										/>
									</div>
								</div>

								<div class="mt-4 grid gap-2 sm:grid-cols-2">
									<label
										v-for="permission in row.permissions"
										:key="permission.key"
										class="flex cursor-pointer items-center gap-3 rounded-md border border-neutral-200 bg-white px-3 py-3 text-sm text-stone-800 transition hover:bg-neutral-50"
										:class="{ 'cursor-not-allowed opacity-60': !canManageRoles || saving }"
									>
										<input
											:checked="isCreatePermissionChecked(permission.key)"
											type="checkbox"
											class="h-4 w-4 rounded border-[#d6d3d1] text-[#c97745] focus:ring-[#c97745]"
											:disabled="!canManageRoles || saving"
											@change="toggleCreatePermission(permission.key, ($event.target as HTMLInputElement).checked)"
										/>
										<span>{{ permissionActionLabel(getPermissionAction(permission)) }}</span>
									</label>
								</div>

							</div>

							<div v-if="createError" class="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
								{{ createError }}
							</div>
						</template>
					</div>

					<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
						<div class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="createOpen = false">{{ copy.cancel }}</AppButton>
							<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-plus-20-solid" :block="true" :disabled="createPanelPending || !canSubmitCreateRole" :loading="saving" :spin-icon-on-loading="true" @click="createRole">
								{{ copy.create }}
							</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>

			<AppResponsivePanel
				v-model="duplicateOpen"
				:title="copy.duplicateTitle"
				:description="copy.duplicateDescription"
				desktop-width="680px"
				mobile-max-height="88dvh"
				:fill-mobile-height="true"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
					<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-5 py-4">
						<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
							<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">{{ copy.newRoleName }}</label>
							<UInput
								v-model="duplicateForm.name"
								size="lg"
								color="neutral"
								class="mt-3 w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
							/>
						</div>
					</div>

					<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
						<div class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="duplicateOpen = false">{{ copy.cancel }}</AppButton>
							<AppButton color="primary" variant="solid" size="md" :block="true" :disabled="!canManageRoles || saving" :loading="saving" :spin-icon-on-loading="true" @click="duplicateRole">
								{{ copy.duplicateAction }}
							</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>

			<AppResponsivePanel
				v-model="applyOpen"
				:title="copy.applyTitle"
				:description="copy.applyDescription"
				desktop-width="680px"
				mobile-max-height="88dvh"
				:fill-mobile-height="true"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
					<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-5 py-4">
						<div class="rounded-md border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-stone-700">
							<div class="flex flex-wrap items-center justify-between gap-3">
								<div>
									<p class="font-semibold text-stone-900">{{ selectedRole?.name || "-" }}</p>
									<p class="mt-1 text-xs text-stone-500">{{ copy.store }}: {{ stores.find((store) => store.id === selectedRole?.store_id)?.name || "-" }}</p>
								</div>
								<UBadge color="primary" variant="soft" :label="`${selectedRolePermissionCount} ${copy.permissions}`" />
							</div>
						</div>

						<div v-if="!applyTargetStoreOptions.length" class="rounded-md border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-stone-700">
								{{ copy.noOtherStore }}
						</div>

						<template v-else>
							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">{{ copy.targetStore }}</label>
								<select
									v-model="applyForm.targetStoreId"
									class="mt-3 w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
								>
									<option v-for="store in applyTargetStoreOptions" :key="store.id" :value="store.id">{{ store.name }}</option>
								</select>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">{{ copy.mode }}</label>
								<div class="mt-3 grid gap-2 sm:grid-cols-2">
									<button
										v-for="option in applyModeOptions"
										:key="option.value"
										type="button"
										class="rounded-md border px-3 py-3 text-left text-sm transition"
										:class="applyForm.mode === option.value ? 'border-primary-300 bg-primary-50 text-primary-800' : 'border-neutral-200 bg-white text-stone-700 hover:bg-neutral-50'"
										@click="applyForm.mode = option.value"
									>
										{{ option.label }}
									</button>
								</div>
							</div>

							<div v-if="applyForm.mode === 'create'" class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">{{ copy.newRoleName }}</label>
								<UInput
									v-model="applyForm.name"
									size="lg"
									color="neutral"
									class="mt-3 w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
								/>
								<p class="mt-2 text-xs text-stone-500">{{ copy.createTargetHint }}</p>
							</div>

							<div v-else class="space-y-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<div v-if="applyTargetRolesPending">
									<AppInlineLoadingBar :label="copy.loadingTarget" />
								</div>
								<template v-else>
									<div v-if="!applyTargetRoles.length" class="rounded-md border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-stone-700">
										{{ copy.noTargetRole }}
									</div>
									<div v-else>
										<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">{{ copy.targetRole }}</label>
										<select
											v-model="applyForm.targetRoleId"
											class="mt-3 w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
										>
											<option v-for="role in applyTargetRoles" :key="role.id" :value="role.id">{{ role.name }}</option>
										</select>
										<p class="mt-2 text-xs text-stone-500">
											{{ locale === "lo" ? "ລະບົບຈະອັບເດດສິດຂອງ" : locale === "en" ? "The system will update permissions for" : "ระบบจะอัปเดตสิทธิ์ของ" }}
											<span class="font-semibold text-stone-700">{{ selectedApplyTargetRole?.name || copy.targetRole }}</span>
											{{ locale === "lo" ? "ໃຫ້ຕົງກັບບົດບາດຕົ້ນທາງ ໂດຍຮັກສາຊື່ເດີມໄວ້." : locale === "en" ? "to match the source role while keeping its current name." : "ให้ตรงกับบทบาทต้นทาง โดยคงชื่อเดิมไว้" }}
										</p>
									</div>
								</template>
							</div>

							<div v-if="applyError" class="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
								{{ applyError }}
							</div>
						</template>
					</div>

					<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
						<div class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="applyOpen = false">{{ copy.cancel }}</AppButton>
							<AppButton
								color="primary"
								variant="solid"
								size="md"
								icon="i-heroicons-arrow-right-circle-20-solid"
								:block="true"
								:disabled="applyTargetRolesPending || !canSubmitApplyRole"
								:loading="saving"
								:spin-icon-on-loading="true"
								@click="applyRoleToAnotherStore"
							>
								{{ applyForm.mode === 'create' ? copy.createTarget : copy.updateTarget }}
							</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>

			<AppResponsivePanel
				v-model="deleteConfirmOpen"
				:title="isSelectedSystemRole ? copy.deleteSystemTitle : copy.deleteTitle"
				:description="isSelectedSystemRole ? copy.deleteSystemDescription : copy.deleteDescription"
				desktop-width="680px"
				mobile-max-height="88dvh"
				:fill-mobile-height="true"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
					<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-5 py-4">
						<div
							class="rounded-md p-4"
							:class="isSelectedSystemRole ? 'border border-amber-200 bg-amber-50' : 'border border-rose-200 bg-rose-50'"
						>
							<p v-if="isSelectedSystemRole" class="text-sm text-amber-800">
								{{ copy.role }}
								<span class="font-semibold">"{{ selectedRole?.name || '-' }}"</span>
								{{ copy.cannotDelete }}
							</p>
							<p v-else class="text-sm text-rose-800">
								{{ copy.confirmDelete }}
								<span class="font-semibold">"{{ selectedRole?.name || '-' }}"</span>
							</p>
						</div>
					</div>

					<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
						<div v-if="isSelectedSystemRole" class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="deleteConfirmOpen = false">
								{{ copy.close }}
							</AppButton>
							<AppButton
								color="primary"
								variant="solid"
								size="md"
								icon="i-heroicons-document-duplicate-20-solid"
								:block="true"
								@click="deleteConfirmOpen = false; duplicateOpen = true"
							>
								{{ copy.duplicateInstead }}
							</AppButton>
						</div>
						<div v-else class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" :disabled="deletingRoleId === selectedRole?.id" @click="deleteConfirmOpen = false">
								{{ copy.cancel }}
							</AppButton>
							<AppButton
								color="error"
								variant="solid"
								size="md"
								icon="i-heroicons-trash-20-solid"
								:block="true"
								:disabled="deletingRoleId === selectedRole?.id"
								:loading="deletingRoleId === selectedRole?.id"
								:spin-icon-on-loading="true"
								@click="removeRole"
							>
								{{ copy.delete }}
							</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>
		</template>
	</AppSidebarShell>
</template>
