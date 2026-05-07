<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type ProfileUpdateResponse = {
	user: {
		id: string;
		email: string;
		name: string;
		systemRole: string;
		mustChangePassword: boolean;
		uiLocale: string;
	};
};

type PasswordChangeResponse = ProfileUpdateResponse & {
	passwordChanged: true;
};

const { apiFetch } = useApiClient();
const { currentUser, currentSession, currentAccess, fetchMe } = useAuthSession();
const appToast = useAppToast();

const profileForm = reactive({
	name: "",
});

const passwordForm = reactive({
	currentPassword: "",
	newPassword: "",
	confirmPassword: "",
});

const profilePending = ref(false);
const passwordPending = ref(false);
const profileSuccess = ref("");
const passwordSuccess = ref("");
const profileError = ref<string | null>(null);
const passwordError = ref<string | null>(null);
const profileModalOpen = ref(false);
const passwordModalOpen = ref(false);
const passwordVisibility = reactive({
	current: false,
	next: false,
	confirm: false,
});

const primaryMembership = computed(() => currentAccess.value?.memberships?.[0] ?? null);
const permissionCount = computed(() => currentAccess.value?.permissions?.length ?? 0);
const membershipCount = computed(() => currentAccess.value?.memberships?.length ?? 0);

watch(currentUser, (value) => {
	profileForm.name = value?.name || "";
}, { immediate: true });

function extractErrorMessage(error: unknown, fallback: string) {
	if (typeof error === "object" && error && "data" in error) {
		const data = Reflect.get(error, "data") as { message?: string } | undefined;
		if (data?.message) return data.message;
	}

	if (error instanceof Error && error.message) return error.message;
	return fallback;
}

async function refreshProfile() {
	profileError.value = null;
	passwordError.value = null;
	try {
		await fetchMe();
		return true;
	} catch (error) {
		const message = extractErrorMessage(error, "โหลดข้อมูลโปรไฟล์ไม่สำเร็จ");
		profileError.value = message;
		appToast.error({
			title: "โหลดโปรไฟล์ไม่สำเร็จ",
			description: message,
		});
		return false;
	}
}

function openProfileModal() {
	profileError.value = null;
	profileSuccess.value = "";
	profileModalOpen.value = true;
}

function openPasswordModal() {
	passwordError.value = null;
	passwordSuccess.value = "";
	passwordVisibility.current = false;
	passwordVisibility.next = false;
	passwordVisibility.confirm = false;
	passwordModalOpen.value = true;
}

async function submitProfile() {
	profilePending.value = true;
	profileError.value = null;
	profileSuccess.value = "";

	try {
		await apiFetch<ApiEnvelope<ProfileUpdateResponse>>("/auth/profile", {
			method: "PATCH",
			body: {
				name: profileForm.name,
			},
		});

		await refreshProfile();
		profileSuccess.value = "อัปเดตชื่อผู้ใช้แล้ว";
		appToast.success({
			title: "อัปเดตโปรไฟล์แล้ว",
			description: "ชื่อผู้ใช้ใหม่ถูกบันทึกเรียบร้อย",
		});
		profileModalOpen.value = false;
	} catch (error) {
		profileError.value = extractErrorMessage(error, "อัปเดตโปรไฟล์ไม่สำเร็จ");
		appToast.error({
			title: "อัปเดตโปรไฟล์ไม่สำเร็จ",
			description: profileError.value || undefined,
		});
	} finally {
		profilePending.value = false;
	}
}

async function submitPassword() {
	passwordPending.value = true;
	passwordError.value = null;
	passwordSuccess.value = "";

	try {
		await apiFetch<ApiEnvelope<PasswordChangeResponse>>("/auth/change-password", {
			method: "POST",
			body: {
				currentPassword: passwordForm.currentPassword,
				newPassword: passwordForm.newPassword,
				confirmPassword: passwordForm.confirmPassword,
			},
		});

		passwordForm.currentPassword = "";
		passwordForm.newPassword = "";
		passwordForm.confirmPassword = "";
		passwordVisibility.current = false;
		passwordVisibility.next = false;
		passwordVisibility.confirm = false;
		await refreshProfile();
		passwordSuccess.value = "เปลี่ยนรหัสผ่านแล้ว และยกเลิก session อื่นเรียบร้อย";
		appToast.success({
			title: "เปลี่ยนรหัสผ่านแล้ว",
			description: "ยกเลิก session อื่นของบัญชีนี้เรียบร้อย",
		});
		passwordModalOpen.value = false;
	} catch (error) {
		passwordError.value = extractErrorMessage(error, "เปลี่ยนรหัสผ่านไม่สำเร็จ");
		appToast.error({
			title: "เปลี่ยนรหัสผ่านไม่สำเร็จ",
			description: passwordError.value || undefined,
		});
	} finally {
		passwordPending.value = false;
	}
}

onMounted(async () => {
	await refreshProfile();
});
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['settings']"
		sidebar-eyebrow="Profile"
		sidebar-title="ตั้งค่าโปรไฟล์"
		sidebar-compact-title="ME"
		sidebar-description="แก้ไขชื่อผู้ใช้ เปลี่ยนรหัสผ่าน และดูข้อมูลบัญชีปัจจุบัน"
	>
		<template #default="{ openSidebar }">
			<div class="space-y-4 lg:grid lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-4 lg:space-y-0">
				<div class="space-y-4 lg:min-h-0 lg:overflow-hidden lg:col-span-2">
					<AppPageHeader
						title="ตั้งค่าโปรไฟล์"
						description="ใช้หน้านี้สำหรับจัดการชื่อผู้ใช้ รหัสผ่าน และดูรายละเอียดบัญชีที่ล็อกอินอยู่ตอนนี้"
						@menu="openSidebar"
					>
						<template #badges>
							<UBadge color="gray" variant="soft" label="Profile" />
							<UBadge color="orange" variant="soft" :label="currentUser?.systemRole || 'บัญชีผู้ใช้'" />
						</template>

						<template #actions>
							<UBadge color="gray" variant="soft" :label="primaryMembership?.role_name || 'ไม่มี role ร้าน'" />
						</template>
					</AppPageHeader>
				</div>

				<div class="space-y-4 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
					<UCard class="border-0 bg-white shadow-lg ring-1 ring-[#e7e4dd]">
						<div class="space-y-4">
							<div class="flex items-start gap-3">
								<div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fbf1ea] text-lg font-semibold text-[#97532c] ring-1 ring-[#efd7c6]">
									{{ (currentUser?.name || "U").slice(0, 1).toUpperCase() }}
								</div>
								<div class="min-w-0 flex-1">
									<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Account summary</p>
									<h2 class="mt-2 truncate text-xl font-semibold text-stone-950">{{ currentUser?.name || "-" }}</h2>
									<p class="mt-1 truncate text-sm text-stone-500">{{ currentUser?.email || "-" }}</p>
								</div>
							</div>

							<div class="grid grid-cols-2 gap-2 text-xs text-stone-500">
								<div class="rounded-2xl bg-[#fbfbf8] px-3 py-3 ring-1 ring-[#e7e4dd]">
									<p>System role</p>
									<p class="mt-1 text-sm font-semibold text-stone-900">{{ currentUser?.systemRole || "-" }}</p>
								</div>
								<div class="rounded-2xl bg-[#fbfbf8] px-3 py-3 ring-1 ring-[#e7e4dd]">
									<p>UI locale</p>
									<p class="mt-1 text-sm font-semibold text-stone-900">{{ currentUser?.uiLocale || "-" }}</p>
								</div>
								<div class="rounded-2xl bg-[#fbfbf8] px-3 py-3 ring-1 ring-[#e7e4dd]">
									<p>สิทธิ์ทั้งหมด</p>
									<p class="mt-1 text-sm font-semibold text-stone-900">{{ permissionCount }}</p>
								</div>
								<div class="rounded-2xl bg-[#fbfbf8] px-3 py-3 ring-1 ring-[#e7e4dd]">
									<p>Memberships</p>
									<p class="mt-1 text-sm font-semibold text-stone-900">{{ membershipCount }}</p>
								</div>
							</div>

							<dl class="space-y-3 text-sm">
								<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
									<dt class="text-stone-500">Role ร้านหลัก</dt>
									<dd class="text-right font-medium text-stone-900">{{ primaryMembership?.role_name || "-" }}</dd>
								</div>
								<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
									<dt class="text-stone-500">Store ล่าสุด</dt>
									<dd class="text-right font-medium text-stone-900">{{ primaryMembership?.store_id || "-" }}</dd>
								</div>
								<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
									<dt class="text-stone-500">Session ID</dt>
									<dd class="max-w-[190px] text-right font-medium break-all text-stone-900">{{ currentSession?.id || "-" }}</dd>
								</div>
								<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
									<dt class="text-stone-500">Remember me</dt>
									<dd class="text-right font-medium text-stone-900">{{ currentSession?.rememberMe ? "เปิด" : "ปิด" }}</dd>
								</div>
								<div class="flex items-start justify-between gap-4">
									<dt class="text-stone-500">Refresh session ถึง</dt>
									<dd class="text-right font-medium text-stone-900">{{ currentSession?.refreshExpiresAt || "-" }}</dd>
								</div>
							</dl>
						</div>
					</UCard>
				</div>

				<div class="space-y-4 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
					<UCard class="border-0 bg-white shadow-lg ring-1 ring-[#e7e4dd]">
						<div class="space-y-4">
							<div>
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Actions</p>
								<h2 class="mt-2 text-xl font-semibold text-stone-950">จัดการบัญชี</h2>
								<p class="mt-2 text-sm leading-6 text-stone-500">แก้ไขชื่อผู้ใช้หรือเปลี่ยนรหัสผ่านผ่าน modal เดียวกับ pattern ของระบบ เพื่อให้หน้าหลักอ่านข้อมูลง่ายขึ้น</p>
							</div>

							<div v-if="profileSuccess" class="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-100">
								{{ profileSuccess }}
							</div>

							<div class="rounded-[28px] bg-[#fbfbf8] p-4 ring-1 ring-[#e7e4dd]">
								<div class="flex items-start justify-between gap-4">
									<div class="min-w-0">
										<p class="text-sm font-semibold text-stone-900">ข้อมูลบัญชี</p>
										<p class="mt-1 text-sm leading-6 text-stone-500">แก้ไขชื่อที่ใช้แสดงผลของบัญชีนี้ โดยอีเมลจะยังเป็นข้อมูลอ้างอิงเดิม</p>
									</div>
									<UButton color="orange" variant="soft" size="sm" @click="openProfileModal">
										แก้ข้อมูลบัญชี
									</UButton>
								</div>
								<dl class="mt-4 space-y-2 text-sm">
									<div class="flex items-center justify-between gap-4">
										<dt class="text-stone-500">ชื่อปัจจุบัน</dt>
										<dd class="font-medium text-stone-900">{{ currentUser?.name || "-" }}</dd>
									</div>
									<div class="flex items-center justify-between gap-4">
										<dt class="text-stone-500">อีเมล</dt>
										<dd class="max-w-[220px] truncate font-medium text-stone-900">{{ currentUser?.email || "-" }}</dd>
									</div>
								</dl>
							</div>

							<div v-if="passwordSuccess" class="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-100">
								{{ passwordSuccess }}
							</div>

							<div class="rounded-[28px] bg-[#fbfbf8] p-4 ring-1 ring-[#e7e4dd]">
								<div class="flex items-start justify-between gap-4">
									<div class="min-w-0">
										<p class="text-sm font-semibold text-stone-900">เปลี่ยนรหัสผ่าน</p>
										<p class="mt-1 text-sm leading-6 text-stone-500">เมื่อเปลี่ยนรหัสผ่าน ระบบจะยกเลิก session อื่นของบัญชีนี้เพื่อความปลอดภัย</p>
									</div>
									<UButton color="gray" variant="soft" size="sm" @click="openPasswordModal">
										เปลี่ยนรหัสผ่าน
									</UButton>
								</div>
								<div class="mt-4 rounded-2xl border border-dashed border-[#ddd4c8] bg-white px-4 py-3 text-sm text-stone-500">
									ระบบจะให้กรอกรหัสผ่านปัจจุบัน รหัสผ่านใหม่ และยืนยันรหัสผ่านใหม่ใน modal ก่อนบันทึก
								</div>
							</div>
						</div>
					</UCard>
				</div>
			</div>

			<AppResponsivePanel
				:model-value="profileModalOpen"
				title="แก้ข้อมูลบัญชี"
				description="อัปเดตชื่อผู้ใช้ของบัญชีปัจจุบัน"
				desktop-width="440px"
				@update:model-value="profileModalOpen = $event"
			>
				<div class="space-y-4">
					<div v-if="profileError" class="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600 ring-1 ring-rose-100">
						{{ profileError }}
					</div>

					<div class="grid gap-4">
						<div>
							<label class="mb-2 block text-xs font-medium text-stone-500">อีเมล</label>
							<UInput :model-value="currentUser?.email || ''" disabled size="lg" color="gray" class="w-full [&_input]:rounded-2xl [&_input]:border-[#e7e4dd] [&_input]:bg-[#fbfbf8] [&_input]:py-3" />
						</div>
						<div>
							<label class="mb-2 block text-xs font-medium text-stone-500">ชื่อผู้ใช้</label>
							<UInput v-model="profileForm.name" size="lg" color="gray" class="w-full [&_input]:rounded-2xl [&_input]:border-[#e7e4dd] [&_input]:bg-[#fbfbf8] [&_input]:py-3" />
						</div>
					</div>

					<div class="flex justify-end">
						<UButton color="orange" variant="solid" size="lg" :loading="profilePending" @click="submitProfile">
							บันทึกชื่อผู้ใช้
						</UButton>
					</div>
				</div>
			</AppResponsivePanel>

			<AppResponsivePanel
				:model-value="passwordModalOpen"
				title="เปลี่ยนรหัสผ่าน"
				description="ยืนยันรหัสผ่านเดิมก่อนตั้งรหัสผ่านใหม่"
				desktop-width="440px"
				@update:model-value="passwordModalOpen = $event"
			>
				<div class="space-y-4">
					<div v-if="passwordError" class="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600 ring-1 ring-rose-100">
						{{ passwordError }}
					</div>

					<div class="grid gap-4">
						<div>
							<label class="mb-2 block text-xs font-medium text-stone-500">รหัสผ่านปัจจุบัน</label>
							<div class="relative">
								<UInput
									v-model="passwordForm.currentPassword"
									:type="passwordVisibility.current ? 'text' : 'password'"
									size="lg"
									color="gray"
									class="w-full [&_input]:rounded-2xl [&_input]:border-[#e7e4dd] [&_input]:bg-[#fbfbf8] [&_input]:py-3 [&_input]:pr-11"
								/>
								<UButton
									color="gray"
									variant="ghost"
									size="xs"
									class="absolute top-1/2 right-2 h-8 w-8 -translate-y-1/2 justify-center rounded-xl text-stone-500 hover:bg-white hover:text-stone-900"
									:icon="passwordVisibility.current ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'"
									:aria-label="passwordVisibility.current ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'"
									:title="passwordVisibility.current ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'"
									@click="passwordVisibility.current = !passwordVisibility.current"
								/>
							</div>
						</div>
						<div>
							<label class="mb-2 block text-xs font-medium text-stone-500">รหัสผ่านใหม่</label>
							<div class="relative">
								<UInput
									v-model="passwordForm.newPassword"
									:type="passwordVisibility.next ? 'text' : 'password'"
									size="lg"
									color="gray"
									class="w-full [&_input]:rounded-2xl [&_input]:border-[#e7e4dd] [&_input]:bg-[#fbfbf8] [&_input]:py-3 [&_input]:pr-11"
								/>
								<UButton
									color="gray"
									variant="ghost"
									size="xs"
									class="absolute top-1/2 right-2 h-8 w-8 -translate-y-1/2 justify-center rounded-xl text-stone-500 hover:bg-white hover:text-stone-900"
									:icon="passwordVisibility.next ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'"
									:aria-label="passwordVisibility.next ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'"
									:title="passwordVisibility.next ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'"
									@click="passwordVisibility.next = !passwordVisibility.next"
								/>
							</div>
						</div>
						<div>
							<label class="mb-2 block text-xs font-medium text-stone-500">ยืนยันรหัสผ่านใหม่</label>
							<div class="relative">
								<UInput
									v-model="passwordForm.confirmPassword"
									:type="passwordVisibility.confirm ? 'text' : 'password'"
									size="lg"
									color="gray"
									class="w-full [&_input]:rounded-2xl [&_input]:border-[#e7e4dd] [&_input]:bg-[#fbfbf8] [&_input]:py-3 [&_input]:pr-11"
								/>
								<UButton
									color="gray"
									variant="ghost"
									size="xs"
									class="absolute top-1/2 right-2 h-8 w-8 -translate-y-1/2 justify-center rounded-xl text-stone-500 hover:bg-white hover:text-stone-900"
									:icon="passwordVisibility.confirm ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'"
									:aria-label="passwordVisibility.confirm ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'"
									:title="passwordVisibility.confirm ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'"
									@click="passwordVisibility.confirm = !passwordVisibility.confirm"
								/>
							</div>
						</div>
					</div>

					<div class="flex justify-end">
						<UButton color="orange" variant="solid" size="lg" :loading="passwordPending" @click="submitPassword">
							เปลี่ยนรหัสผ่าน
						</UButton>
					</div>
				</div>
			</AppResponsivePanel>
		</template>
	</AppSidebarShell>
</template>
