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

type RoleRecord = {
	id: string;
	store_id: string;
	name: string;
	is_system: number;
	permissions: PermissionRecord[];
	permissions_count: number;
};

const { apiFetch } = useApiClient();
const { can, currentUser } = useAuthSession();

const selectedStoreId = ref("");
const selectedRoleId = ref("");
const detailOpen = ref(false);
const createOpen = ref(false);
const duplicateOpen = ref(false);
const saving = ref(false);
const loading = ref(true);
const error = ref<string | null>(null);
const stores = ref<StoreRecord[]>([]);
const permissions = ref<PermissionRecord[]>([]);
const roles = ref<RoleRecord[]>([]);

const createForm = reactive({
	name: "",
	permissionKeys: [] as string[],
});

const duplicateForm = reactive({
	name: "",
});

const canManageRoles = computed(() => can("settings.manage_roles"));
const selectedRole = computed(() => roles.value.find((role) => role.id === selectedRoleId.value) ?? roles.value[0] ?? null);

const editorForm = reactive({
	name: "",
	permissionKeys: [] as string[],
});

const groupedPermissions = computed(() => {
	const groups = new Map<string, PermissionRecord[]>();
	for (const permission of permissions.value) {
		const label = permission.resource;
		if (!groups.has(label)) groups.set(label, []);
		groups.get(label)?.push(permission);
	}
	return Array.from(groups.entries()).map(([resource, items]) => ({
		resource,
		items,
	}));
});

watch(selectedRole, (role) => {
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
		duplicateForm.name = `${selectedRole.value.name} Copy`;
	}
});

watch(selectedStoreId, async (value) => {
	if (!value) return;
	await fetchRoles();
}, { immediate: false });

function isPermissionChecked(permissionKey: string) {
	return editorForm.permissionKeys.includes(permissionKey);
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

function selectRole(roleId: string) {
	selectedRoleId.value = roleId;
	detailOpen.value = true;
}

async function fetchStores() {
	const response = await apiFetch<ApiEnvelope<StoreRecord[]>>("/stores");
	stores.value = response.data;
	if (!selectedStoreId.value) {
		selectedStoreId.value = stores.value[0]?.id || "";
	}
}

async function fetchPermissions() {
	const response = await apiFetch<ApiEnvelope<PermissionRecord[]>>("/rbac/permissions");
	permissions.value = response.data;
}

async function fetchRoles() {
	if (!selectedStoreId.value) return;
	const response = await apiFetch<ApiEnvelope<RoleRecord[]>>(`/rbac/roles?store_id=${encodeURIComponent(selectedStoreId.value)}`);
	roles.value = response.data;
	if (!roles.value.some((role) => role.id === selectedRoleId.value)) {
		selectedRoleId.value = roles.value[0]?.id || "";
	}
}

async function createRole() {
	if (!selectedStoreId.value) return;
	saving.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<RoleRecord>>("/rbac/roles", {
			method: "POST",
			body: {
				store_id: selectedStoreId.value,
				name: createForm.name,
				permission_keys: createForm.permissionKeys,
				actor_user_id: currentUser.value?.id || null,
			},
		});
		createOpen.value = false;
		createForm.name = "";
		createForm.permissionKeys = [];
		await fetchRoles();
		selectedRoleId.value = response.data.id;
	} finally {
		saving.value = false;
	}
}

async function saveRole() {
	if (!selectedRole.value) return;
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
	} finally {
		saving.value = false;
	}
}

onMounted(async () => {
	loading.value = true;
	error.value = null;
	try {
		await Promise.all([fetchStores(), fetchPermissions()]);
		if (selectedStoreId.value) {
			await fetchRoles();
		}
	} catch (fetchError) {
		error.value = fetchError instanceof Error ? fetchError.message : "โหลดข้อมูลบทบาทไม่สำเร็จ";
	} finally {
		loading.value = false;
	}
});
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['settings']"
		sidebar-eyebrow="Settings"
		sidebar-title="สิทธิ์การใช้งาน"
		sidebar-compact-title="ACC"
		sidebar-description="จัดการบทบาทของร้านและสิทธิ์ที่แต่ละ role ถืออยู่"
	>
		<template #default="{ openSidebar }">
			<div class="space-y-3 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-3">
				<AppPageHeader
					title="บทบาทและสิทธิ์ที่อนุญาต"
					description="ใช้ role เป็นตัวกลางในการควบคุมสิทธิ์ของผู้ใช้แต่ละคนในร้าน"
					@menu="openSidebar"
				>

					<SettingsAccessTabs />

					<div class="grid gap-3 pt-2 lg:grid-cols-[minmax(0,1fr)_auto]">
						<select
							v-model="selectedStoreId"
							class="w-full rounded-md border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
						>
							<option v-for="store in stores" :key="store.id" :value="store.id">{{ store.name }}</option>
						</select>

						<AppButton
							color="primary"
							size="md"
							class="justify-center rounded-md"
							icon="i-heroicons-plus-20-solid"
							label="สร้างบทบาท"
							:disabled="!canManageRoles || !selectedStoreId"
							@click="createOpen = true"
						/>
					</div>
				</AppPageHeader>

				<div class="grid min-h-0 gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
					<UCard class="min-h-0 rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md xl:col-span-2">
						<div class="flex items-center justify-between gap-3">
							<div>
								<h2 class="text-lg font-semibold text-stone-950">รายการบทบาท</h2>
								<p class="mt-1 text-sm text-stone-500">เลือก role เพื่อแก้ชื่อและสิทธิ์ที่อนุญาต</p>
							</div>
							<UBadge color="neutral" variant="soft" :label="`${roles.length} roles`" />
						</div>

						<div v-if="loading" class="mt-4 min-h-[120px]">
							<div class="overflow-hidden bg-neutral-100">
								<div class="roles-loading-line h-[2px] w-1/3 rounded-r-full bg-primary" />
							</div>
						</div>

						<div v-else-if="error" class="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
							{{ error }}
						</div>

						<div v-else-if="!roles.length" class="mt-4 rounded-md border border-dashed border-neutral-200 bg-[#faf8f4] px-5 py-10 text-center">
							<UIcon name="i-heroicons-identification" class="mx-auto h-8 w-8 text-stone-300" />
							<p class="mt-3 text-sm font-medium text-stone-700">ยังไม่มี role ในร้านนี้</p>
						</div>

						<div v-else class="mt-4 grid gap-3">
							<button
								v-for="role in roles"
								:key="role.id"
								type="button"
								class="rounded-md border p-4 text-left transition"
								:class="selectedRoleId === role.id
									? 'border-primary-200 bg-primary-50 shadow-sm'
									: 'border-neutral-200 bg-[#fffefd] hover:border-neutral-300 hover:shadow-sm'"
								@click="selectRole(role.id)"
							>
								<div class="flex items-center justify-between gap-3">
									<div>
										<p class="text-sm font-semibold text-stone-950">{{ role.name }}</p>
										<p class="mt-1 text-sm text-stone-500">{{ role.permissions_count }} permissions</p>
									</div>
									<div class="flex items-center gap-2">
										<UBadge :color="role.is_system ? 'neutral' : 'primary'" variant="soft" :label="role.is_system ? 'system' : 'custom'" />
										<UIcon name="i-heroicons-chevron-right-20-solid" class="h-5 w-5 text-stone-300" />
									</div>
								</div>
							</button>
						</div>
					</UCard>
				</div>
			</div>

			<AppResponsivePanel
				v-model="detailOpen"
				:title="selectedRole ? selectedRole.name : 'Role editor'"
				description="ปรับชื่อบทบาทและกำหนด permission ที่ role นี้สามารถใช้งานได้"
				desktop-width="620px"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<template v-if="selectedRole">
					<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
						<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-5 py-4">
							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">ชื่อบทบาท</label>
								<UInput
									v-model="editorForm.name"
									size="lg"
									color="neutral"
									class="mt-3 w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
								/>
							</div>

							<div
								v-for="group in groupedPermissions"
								:key="group.resource"
								class="rounded-md border border-neutral-200 bg-neutral-50 p-4"
							>
								<div class="flex items-center justify-between gap-3">
									<div>
										<p class="text-sm font-semibold capitalize text-stone-900">{{ group.resource }}</p>
										<p class="mt-1 text-xs text-stone-500">เลือก action ที่ role นี้สามารถใช้งานได้</p>
									</div>
									<UBadge
										color="neutral"
										variant="soft"
										:label="`${group.items.filter((item) => editorForm.permissionKeys.includes(item.key)).length}/${group.items.length}`"
									/>
								</div>

								<div class="mt-4 grid gap-3 md:grid-cols-2">
									<label
										v-for="permission in group.items"
										:key="permission.id"
										class="flex items-start gap-3 rounded-md border border-neutral-200 bg-white px-4 py-3"
									>
										<input
											:checked="isPermissionChecked(permission.key)"
											type="checkbox"
											class="mt-1 h-4 w-4 rounded border-[#d6d3d1] text-[#c97745] focus:ring-[#c97745]"
											:disabled="!canManageRoles"
											@change="togglePermission(permission.key, ($event.target as HTMLInputElement).checked)"
										/>
										<div class="min-w-0">
											<p class="text-sm font-medium text-stone-800">{{ permission.key }}</p>
											<p class="mt-1 text-xs text-stone-500">{{ permission.action }}</p>
										</div>
									</label>
								</div>
							</div>
						</div>

						<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
							<div class="grid w-full grid-cols-2 gap-2">
								<AppButton color="neutral" variant="soft" size="md" :block="true" @click="detailOpen = false">ปิด</AppButton>
								<AppButton
									color="primary"
									variant="solid"
									size="md"
									icon="i-heroicons-check-20-solid"
									:block="true"
									:disabled="!canManageRoles || saving"
									:loading="saving"
									:spin-icon-on-loading="true"
									@click="saveRole"
								>
									บันทึก
								</AppButton>
							</div>
							<div class="mt-2">
								<AppButton
									color="neutral"
									variant="soft"
									size="md"
									icon="i-heroicons-document-duplicate-20-solid"
									:block="true"
									:disabled="!canManageRoles || saving"
									@click="duplicateOpen = true"
								>
									ทำสำเนา role นี้
								</AppButton>
							</div>
						</div>
					</div>
				</template>
			</AppResponsivePanel>

			<AppResponsivePanel
				v-model="createOpen"
				title="สร้างบทบาทใหม่"
				description="เริ่มจากชื่อ role แล้วเลือกสิทธิ์ที่เหมาะกับทีมงานของร้านนี้"
				desktop-width="520px"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
					<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-5 py-4">
						<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
							<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">ชื่อบทบาท</label>
							<UInput
								v-model="createForm.name"
								size="lg"
								color="neutral"
								class="mt-3 w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
							/>
						</div>

						<div
							v-for="group in groupedPermissions"
							:key="`create-${group.resource}`"
							class="rounded-md border border-neutral-200 bg-neutral-50 p-4"
						>
							<p class="text-sm font-semibold capitalize text-stone-900">{{ group.resource }}</p>
							<div class="mt-4 grid gap-3 md:grid-cols-2">
								<label
									v-for="permission in group.items"
									:key="permission.id"
									class="flex items-start gap-3 rounded-md border border-neutral-200 bg-white px-4 py-3"
								>
									<input
										:checked="createForm.permissionKeys.includes(permission.key)"
										type="checkbox"
										class="mt-1 h-4 w-4 rounded border-[#d6d3d1] text-[#c97745] focus:ring-[#c97745]"
										@change="createForm.permissionKeys = ($event.target as HTMLInputElement).checked
											? [...new Set([...createForm.permissionKeys, permission.key])]
											: createForm.permissionKeys.filter((key) => key !== permission.key)"
									/>
									<div class="min-w-0">
										<p class="text-sm font-medium text-stone-800">{{ permission.key }}</p>
										<p class="mt-1 text-xs text-stone-500">{{ permission.action }}</p>
									</div>
								</label>
							</div>
						</div>
					</div>

					<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
						<div class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="createOpen = false">ยกเลิก</AppButton>
							<AppButton color="primary" variant="solid" size="md" :block="true" :disabled="!canManageRoles || saving" :loading="saving" :spin-icon-on-loading="true" @click="createRole">
								สร้างบทบาท
							</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>

			<AppResponsivePanel
				v-model="duplicateOpen"
				title="ทำสำเนาบทบาท"
				description="ระบบจะคัดลอก permission จาก role ปัจจุบันไปยัง role ใหม่"
				desktop-width="420px"
				mobile-max-height="72vh"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
					<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-5 py-4">
						<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
							<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">ชื่อบทบาทใหม่</label>
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
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="duplicateOpen = false">ยกเลิก</AppButton>
							<AppButton color="primary" variant="solid" size="md" :block="true" :disabled="!canManageRoles || saving" :loading="saving" :spin-icon-on-loading="true" @click="duplicateRole">
								ทำสำเนา
							</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>
		</template>
	</AppSidebarShell>
</template>

<style scoped>
@keyframes roles-loading-slide {
	0% { transform: translateX(-120%); }
	100% { transform: translateX(420%); }
}

.roles-loading-line {
	animation: roles-loading-slide 1.2s linear infinite;
	will-change: transform;
}
</style>
