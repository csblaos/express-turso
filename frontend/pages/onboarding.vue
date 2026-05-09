<script setup lang="ts">
import { isOnboardingBlocked, needsAuthOnboarding } from "~/utils/auth-onboarding";

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type PasswordChangeResponse = {
	user: {
		id: string;
		email: string;
		name: string;
		systemRole: string;
		mustChangePassword: boolean;
		uiLocale: string;
		canCreateStores: boolean;
		maxStores: number | null;
		canCreateBranches: boolean;
		maxBranchesPerStore: number | null;
		ownedStoresCount: number;
	};
	passwordChanged: true;
};

type StoreRecord = {
	id: string;
	name: string;
	store_type: string;
	currency: string;
	pdf_header_color: string;
	address: string | null;
	phone_number: string | null;
};

const { apiFetch } = useApiClient();
const { currentUser, fetchMe, logout } = useAuthSession();
const appToast = useAppToast();

const pending = ref(true);
const passwordPending = ref(false);
const createStorePending = ref(false);
const currentStep = ref(1);
const pageError = ref<string | null>(null);
const passwordError = ref<string | null>(null);
const storeError = ref<string | null>(null);
const passwordVisibility = reactive({
	current: false,
	next: false,
	confirm: false,
});
const passwordTouched = reactive({
	current: false,
	next: false,
	confirm: false,
});
const passwordSubmitted = ref(false);

const passwordForm = reactive({
	currentPassword: "",
	newPassword: "",
	confirmPassword: "",
});
const passwordServerFieldErrors = reactive({
	current: "",
	next: "",
	confirm: "",
	form: "",
});

const storeForm = reactive({
	name: "",
	store_type: "RETAIL",
	phone_number: "",
	address: "",
	currency: "LAK",
	pdf_header_color: "#22c55e",
	vat_enabled: false,
	vat_rate: "7",
});

const themePresets = [
	{ name: "Emerald", value: "#22c55e" },
	{ name: "Amber", value: "#f59e0b" },
	{ name: "Sky", value: "#0ea5e9" },
	{ name: "Rose", value: "#f43f5e" },
];

const stepItems = computed(() => ([
	{
		id: 1,
		label: "Security",
		title: "ตั้งรหัสผ่านใหม่",
		complete: !currentUser.value?.mustChangePassword,
	},
	{
		id: 2,
		label: "Store",
		title: "สร้างร้านแรก",
		complete: Number(currentUser.value?.ownedStoresCount || 0) > 0,
	},
	{
		id: 3,
		label: "Review",
		title: "ตรวจสอบก่อนเริ่มใช้",
		complete: false,
	},
]));

const canGoToReview = computed(() => (
	storeForm.name.trim().length > 0
));

const onboardingIsBlocked = computed(() => isOnboardingBlocked(currentUser.value));
const onboardingDone = computed(() => !needsAuthOnboarding(currentUser.value));
const onboardingIntro = computed(() => {
	if (currentUser.value?.mustChangePassword) {
		return "เปลี่ยนรหัสผ่านชั่วคราวก่อน แล้วค่อยตั้งค่าร้านแรกของคุณ";
	}

	return "ตั้งค่าร้านแรกของคุณเพื่อเริ่มใช้งาน POS และ backoffice";
});

watch(currentUser, (user) => {
	if (!user) return;
	if (!user.mustChangePassword && currentStep.value === 1) {
		currentStep.value = 2;
	}
	if (Number(user.ownedStoresCount || 0) > 0 && currentStep.value < 3) {
		currentStep.value = 3;
	}
}, { immediate: true });

function extractErrorMessage(error: unknown, fallback: string) {
	if (typeof error === "object" && error) {
		const response = Reflect.get(error, "response");
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

	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}

	return fallback;
}

function normalizePasswordErrorMessage(message: string) {
	const normalized = message.trim();
	const lower = normalized.toLowerCase();
	if (lower.includes("current password is incorrect")) {
		return "รหัสผ่านปัจจุบันไม่ถูกต้อง";
	}
	if (lower.includes("new password must be different")) {
		return "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน";
	}
	if (lower.includes("confirmpassword") && lower.includes("at least 6")) {
		return "ยืนยันรหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";
	}
	if (lower.includes("newpassword") && lower.includes("at least 6")) {
		return "รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร";
	}
	return normalized;
}

function clearPasswordServerErrors() {
	passwordServerFieldErrors.current = "";
	passwordServerFieldErrors.next = "";
	passwordServerFieldErrors.confirm = "";
	passwordServerFieldErrors.form = "";
}

const passwordFieldErrors = computed(() => {
	const errors = {
		current: "",
		next: "",
		confirm: "",
	};

	if (!passwordForm.currentPassword.trim()) {
		errors.current = "กรุณากรอกรหัสผ่านปัจจุบัน";
	}

	if (!passwordForm.newPassword.trim()) {
		errors.next = "กรุณากรอกรหัสผ่านใหม่";
	} else if (passwordForm.newPassword.length < 6) {
		errors.next = "รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร";
	}

	if (!passwordForm.confirmPassword.trim()) {
		errors.confirm = "กรุณายืนยันรหัสผ่านใหม่";
	} else if (passwordForm.confirmPassword.length < 6) {
		errors.confirm = "ยืนยันรหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";
	} else if (passwordForm.confirmPassword !== passwordForm.newPassword) {
		errors.confirm = "รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน";
	}

	return errors;
});

function shouldShowPasswordFieldError(field: "current" | "next" | "confirm") {
	return Boolean(
		passwordServerFieldErrors[field]
		|| ((passwordTouched[field] || passwordSubmitted.value) && passwordFieldErrors.value[field]),
	);
}

function passwordFieldErrorMessage(field: "current" | "next" | "confirm") {
	if (passwordServerFieldErrors[field]) return passwordServerFieldErrors[field];
	return shouldShowPasswordFieldError(field) ? passwordFieldErrors.value[field] : "";
}

function passwordInputClass(field: "current" | "next" | "confirm") {
	const baseClass = "w-full [&_input]:rounded-md [&_input]:bg-white [&_input]:py-3 [&_input]:pr-11";
	void field;
	return `${baseClass} [&_input]:border-[#e7e4dd]`;
}

watch([
	() => passwordForm.currentPassword,
	() => passwordForm.newPassword,
	() => passwordForm.confirmPassword,
], () => {
	clearPasswordServerErrors();
	passwordError.value = null;
});

async function bootstrap() {
	pending.value = true;
	pageError.value = null;

	try {
		await fetchMe();
		if (onboardingDone.value) {
			await navigateTo("/");
			return;
		}
		currentStep.value = currentUser.value?.mustChangePassword ? 1 : 2;
	} catch (error) {
		pageError.value = extractErrorMessage(error, "โหลดข้อมูล onboarding ไม่สำเร็จ");
	} finally {
		pending.value = false;
	}
}

async function submitPasswordStep() {
	passwordSubmitted.value = true;
	passwordTouched.current = true;
	passwordTouched.next = true;
	passwordTouched.confirm = true;
	clearPasswordServerErrors();
	passwordError.value = null;
	if (
		passwordFieldErrors.value.current
		|| passwordFieldErrors.value.next
		|| passwordFieldErrors.value.confirm
	) {
		return;
	}

	passwordPending.value = true;
	passwordError.value = null;

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
		passwordTouched.current = false;
		passwordTouched.next = false;
		passwordTouched.confirm = false;
		passwordSubmitted.value = false;
		clearPasswordServerErrors();
		await fetchMe();
		currentStep.value = 2;
		appToast.success({
			title: "เปลี่ยนรหัสผ่านแล้ว",
			description: "ไปตั้งค่าร้านแรกของคุณต่อได้เลย",
		});
	} catch (error) {
		const rawMessage = extractErrorMessage(error, "เปลี่ยนรหัสผ่านไม่สำเร็จ");
		const normalizedMessage = normalizePasswordErrorMessage(rawMessage);
		const lower = rawMessage.toLowerCase();
		if (lower.includes("current password")) {
			passwordServerFieldErrors.current = normalizedMessage;
			return;
		}
		if (lower.includes("newpassword") || lower.includes("new password")) {
			passwordServerFieldErrors.next = normalizedMessage;
			return;
		}
		if (lower.includes("confirmpassword") || lower.includes("confirm password")) {
			passwordServerFieldErrors.confirm = normalizedMessage;
			return;
		}
		passwordError.value = normalizedMessage;
	} finally {
		passwordPending.value = false;
	}
}

function goToReview() {
	if (!canGoToReview.value) {
		storeError.value = "กรุณากรอกชื่อร้านก่อน";
		return;
	}

	storeError.value = null;
	currentStep.value = 3;
}

async function createFirstStore() {
	createStorePending.value = true;
	storeError.value = null;

	try {
		const response = await apiFetch<ApiEnvelope<StoreRecord>>("/stores", {
			method: "POST",
			body: {
				name: storeForm.name.trim(),
				store_type: storeForm.store_type,
				phone_number: storeForm.phone_number.trim() || null,
				address: storeForm.address.trim() || null,
				currency: storeForm.currency,
				supported_currencies: storeForm.currency,
				vat_enabled: storeForm.vat_enabled ? 1 : 0,
				vat_rate: Number(storeForm.vat_rate || 0),
				pdf_header_color: storeForm.pdf_header_color,
				pdf_company_name: storeForm.name.trim(),
				pdf_company_address: storeForm.address.trim() || null,
				pdf_company_phone: storeForm.phone_number.trim() || null,
			},
		});
		await fetchMe();
		appToast.success({
			title: "สร้างร้านแรกแล้ว",
			description: `${response.data.name} พร้อมเริ่มใช้งานแล้ว`,
		});
		await navigateTo("/");
	} catch (error) {
		storeError.value = extractErrorMessage(error, "สร้างร้านแรกไม่สำเร็จ");
	} finally {
		createStorePending.value = false;
	}
}

async function leaveAndLogout() {
	await logout();
	await navigateTo("/login");
}

onMounted(async () => {
	await bootstrap();
});
</script>

<template>
	<main class="min-h-[100dvh] bg-[#f6f6f3]">
		<div class="grid min-h-[100dvh] lg:grid-cols-[minmax(0,0.96fr)_560px]">
			<section class="relative hidden overflow-hidden lg:flex">
				<div class="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.14),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.10),_transparent_26%)]" />
				<div class="relative flex w-full flex-col justify-between p-10 xl:p-14">
					<div class="flex items-center gap-4">
						<div class="h-16 w-16 overflow-hidden rounded-3xl">
							<img src="/icons/icon-192.png" alt="App icon" class="h-full w-full object-cover" />
						</div>
						<div>
							<p class="text-xs uppercase tracking-[0.24em] text-stone-400">First Login</p>
							<h1 class="mt-1 text-2xl font-semibold tracking-[-0.04em] text-stone-950">Welcome setup</h1>
						</div>
					</div>

					<div class="max-w-2xl space-y-6">
						<UBadge color="primary" variant="soft" label="Store onboarding" />
						<div class="space-y-4">
							<h2 class="text-5xl leading-tight font-semibold tracking-[-0.05em] text-stone-950">
								เริ่มต้นร้านแรก, ตั้งธีมร้าน และเตรียมบัญชีให้พร้อมใช้งานจริง
							</h2>
							<p class="max-w-xl text-base leading-7 text-stone-500">
								flow นี้ออกแบบสำหรับ Superadmin รายใหม่ที่เพิ่งได้รับบัญชีจากระบบกลาง เพื่อให้ตั้งรหัสผ่านใหม่และสร้างร้านแรกของตัวเองในครั้งเดียว
							</p>
						</div>

						<div class="grid gap-4 sm:grid-cols-3">
							<UCard class="border-0 bg-[#fffefd] shadow-sm ring-1 ring-[#e7e4dd]">
								<p class="text-xs uppercase tracking-[0.18em] text-stone-400">Step 1</p>
								<p class="mt-3 text-2xl font-semibold text-stone-950">Security</p>
								<p class="mt-2 text-sm leading-6 text-stone-500">เปลี่ยนรหัสผ่านชั่วคราวให้ปลอดภัยก่อนเริ่มใช้งานจริง</p>
							</UCard>
							<UCard class="border-0 bg-[#fffefd] shadow-sm ring-1 ring-[#e7e4dd]">
								<p class="text-xs uppercase tracking-[0.18em] text-stone-400">Step 2</p>
								<p class="mt-3 text-2xl font-semibold text-stone-950">Store</p>
								<p class="mt-2 text-sm leading-6 text-stone-500">ตั้งชื่อร้าน, ประเภทร้าน, สกุลเงิน และข้อมูลพื้นฐานของร้านแรก</p>
							</UCard>
							<UCard class="border-0 bg-[#fffefd] shadow-sm ring-1 ring-[#e7e4dd]">
								<p class="text-xs uppercase tracking-[0.18em] text-stone-400">Step 3</p>
								<p class="mt-3 text-2xl font-semibold text-stone-950">Theme</p>
								<p class="mt-2 text-sm leading-6 text-stone-500">เลือกโทนสีเริ่มต้นให้เอกสารและภาพรวมร้านของคุณ</p>
							</UCard>
						</div>
					</div>

					<div class="flex items-center justify-between text-sm text-stone-400">
						<p>Client onboarding</p>
						<p>สร้างร้านแรกด้วยตัวเอง</p>
					</div>
				</div>
			</section>

			<section class="flex min-h-[100dvh] items-center justify-center px-0 py-4 sm:px-6 sm:py-6 lg:px-8">
				<div class="w-full max-w-[560px]">
						<UCard class="border-0 rounded-none bg-[#fffefd] shadow-xl ring-1 ring-[#e7e4dd] sm:rounded-md">
							<div v-if="pending" class="space-y-5 px-4 py-4 sm:px-1 sm:py-1">
								<AppInlineLoadingBar label="กำลังเตรียมหน้า onboarding..." />
								<div class="space-y-4 rounded-md border border-[#ece8df] bg-[var(--pos-surface-soft)] p-4">
									<div class="flex items-center gap-3">
										<div class="h-14 w-14 animate-pulse rounded-2xl bg-[#e8e4db]" />
										<div class="min-w-0 flex-1 space-y-2">
											<div class="h-3.5 w-36 animate-pulse rounded bg-[#e8e4db]" />
											<div class="h-6 w-56 animate-pulse rounded bg-[#e3ded2]" />
										</div>
									</div>
									<div class="grid gap-3 sm:grid-cols-3">
										<div class="space-y-2 rounded-md border border-[#e9e4da] bg-white p-3">
											<div class="h-3 w-16 animate-pulse rounded bg-[#ece8df]" />
											<div class="h-4 w-24 animate-pulse rounded bg-[#e4dfd4]" />
										</div>
										<div class="space-y-2 rounded-md border border-[#e9e4da] bg-white p-3">
											<div class="h-3 w-16 animate-pulse rounded bg-[#ece8df]" />
											<div class="h-4 w-24 animate-pulse rounded bg-[#e4dfd4]" />
										</div>
										<div class="space-y-2 rounded-md border border-[#e9e4da] bg-white p-3">
											<div class="h-3 w-16 animate-pulse rounded bg-[#ece8df]" />
											<div class="h-4 w-24 animate-pulse rounded bg-[#e4dfd4]" />
										</div>
									</div>
								</div>
								<div class="space-y-3 rounded-md border border-[#ece8df] bg-white p-4">
									<div class="h-4 w-48 animate-pulse rounded bg-[#e7e2d8]" />
									<div class="h-11 w-full animate-pulse rounded-md bg-[#efebe3]" />
									<div class="h-11 w-full animate-pulse rounded-md bg-[#efebe3]" />
									<div class="h-11 w-full animate-pulse rounded-md bg-[#efebe3]" />
								</div>
							</div>

						<div v-else-if="pageError" class="space-y-4">
							<div class="rounded-md bg-error-50 px-4 py-3 text-sm text-error">
								{{ pageError }}
							</div>
							<AppButton color="primary" variant="solid" size="md" :block="true" @click="bootstrap">
								ลองอีกครั้ง
							</AppButton>
						</div>

						<div v-else class="space-y-6">
							<div class="space-y-4 px-4 pt-4 sm:px-0 sm:pt-0">
								<div class="flex items-center gap-4">
									<div class="flex h-16 w-16 items-center justify-center rounded-3xl bg-[#eefbf2] text-2xl font-semibold text-primary shadow-sm ring-1 ring-[#d5f2df]">
										{{ (currentUser?.name || "S").slice(0, 1).toUpperCase() }}
									</div>
									<div class="min-w-0">
										<UBadge color="neutral" variant="soft" label="First login setup" />
										<h2 class="mt-3 text-3xl font-semibold tracking-[-0.04em] text-stone-950">ยินดีต้อนรับ {{ currentUser?.name || "" }}</h2>
										<p class="mt-2 text-sm leading-6 text-stone-500">
											{{ onboardingIntro }}
										</p>
									</div>
								</div>

								<div class="grid gap-3 sm:grid-cols-3">
									<div
										v-for="step in stepItems"
										:key="step.id"
										class="rounded-md border px-3 py-3"
										:class="currentStep === step.id ? 'border-primary-200 bg-primary-50' : step.complete ? 'border-success/20 bg-success/5' : 'border-neutral-200 bg-neutral-50'"
									>
										<p class="text-[11px] font-semibold uppercase tracking-[0.16em]" :class="currentStep === step.id ? 'text-primary-700' : 'text-stone-400'">
											{{ step.label }}
										</p>
										<p class="mt-2 text-sm font-semibold text-stone-950">{{ step.title }}</p>
									</div>
								</div>
							</div>

							<div v-if="onboardingIsBlocked" class="space-y-4">
								<div class="rounded-md border border-warning-200 bg-warning-50 px-4 py-4">
									<p class="text-sm font-semibold text-stone-950">บัญชีนี้ยังเริ่มสร้างร้านแรกไม่ได้</p>
									<p class="mt-1 text-sm leading-6 text-stone-600">ตอนนี้คุณ login ได้แล้ว แต่ยังไม่มีสิทธิ์สร้างร้านแรกของตัวเอง กรุณาติดต่อ System Admin เพื่อเปิดสิทธิ์ก่อนเริ่ม onboarding</p>
								</div>
								<div class="grid gap-2 sm:grid-cols-2">
									<AppButton color="neutral" variant="soft" size="md" :block="true" @click="bootstrap">
										รีโหลดสถานะ
									</AppButton>
									<AppButton color="primary" variant="solid" size="md" :block="true" @click="leaveAndLogout">
										ออกจากระบบ
									</AppButton>
								</div>
							</div>

							<div v-else-if="currentStep === 1" class="space-y-5">
								<div v-if="passwordError" class="rounded-md bg-error-50 px-4 py-3 text-sm text-error">
									{{ passwordError }}
								</div>

								<div class="rounded-md bg-[var(--pos-surface-soft)] p-4">
									<p class="text-sm font-semibold text-stone-900">เปลี่ยนรหัสผ่านชั่วคราว</p>
									<p class="mt-1 text-sm leading-6 text-stone-500">เพื่อความปลอดภัย บัญชีที่สร้างใหม่ต้องตั้งรหัสผ่านใหม่ก่อนเริ่มสร้างร้านแรก</p>
									<div class="mt-4 grid gap-4">
										<div>
											<label class="mb-2 block text-xs font-medium text-stone-500">อีเมลบัญชี</label>
											<UInput :model-value="currentUser?.email || ''" disabled size="lg" color="neutral" class="w-full [&_input]:rounded-md [&_input]:border-[#e7e4dd] [&_input]:bg-white [&_input]:py-3" />
										</div>
										<div>
											<label class="mb-2 block text-xs font-medium text-stone-500">รหัสผ่านปัจจุบัน</label>
											<div class="relative">
												<UInput
													v-model="passwordForm.currentPassword"
													:type="passwordVisibility.current ? 'text' : 'password'"
													size="lg"
													color="neutral"
													:class="passwordInputClass('current')"
													@blur="passwordTouched.current = true"
												/>
												<AppButton color="neutral" variant="ghost" size="xs" type="button" tabindex="-1" aria-label="แสดงหรือซ่อนรหัสผ่านปัจจุบัน" class="absolute top-1/2 right-2 h-8 w-8 -translate-y-1/2 justify-center rounded-md text-stone-500 hover:bg-white hover:text-stone-900" :icon="passwordVisibility.current ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'" @mousedown.prevent @click="passwordVisibility.current = !passwordVisibility.current" />
											</div>
											<p v-if="passwordFieldErrorMessage('current')" class="mt-2 text-xs text-rose-600">
												{{ passwordFieldErrorMessage("current") }}
											</p>
										</div>
										<div>
											<label class="mb-2 block text-xs font-medium text-stone-500">รหัสผ่านใหม่</label>
											<div class="relative">
												<UInput
													v-model="passwordForm.newPassword"
													:type="passwordVisibility.next ? 'text' : 'password'"
													size="lg"
													color="neutral"
													:class="passwordInputClass('next')"
													@blur="passwordTouched.next = true"
												/>
												<AppButton color="neutral" variant="ghost" size="xs" type="button" tabindex="-1" aria-label="แสดงหรือซ่อนรหัสผ่านใหม่" class="absolute top-1/2 right-2 h-8 w-8 -translate-y-1/2 justify-center rounded-md text-stone-500 hover:bg-white hover:text-stone-900" :icon="passwordVisibility.next ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'" @mousedown.prevent @click="passwordVisibility.next = !passwordVisibility.next" />
											</div>
											<p v-if="passwordFieldErrorMessage('next')" class="mt-2 text-xs text-rose-600">
												{{ passwordFieldErrorMessage("next") }}
											</p>
										</div>
										<div>
											<label class="mb-2 block text-xs font-medium text-stone-500">ยืนยันรหัสผ่านใหม่</label>
											<div class="relative">
												<UInput
													v-model="passwordForm.confirmPassword"
													:type="passwordVisibility.confirm ? 'text' : 'password'"
													size="lg"
													color="neutral"
													:class="passwordInputClass('confirm')"
													@blur="passwordTouched.confirm = true"
												/>
												<AppButton color="neutral" variant="ghost" size="xs" type="button" tabindex="-1" aria-label="แสดงหรือซ่อนยืนยันรหัสผ่านใหม่" class="absolute top-1/2 right-2 h-8 w-8 -translate-y-1/2 justify-center rounded-md text-stone-500 hover:bg-white hover:text-stone-900" :icon="passwordVisibility.confirm ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'" @mousedown.prevent @click="passwordVisibility.confirm = !passwordVisibility.confirm" />
											</div>
											<p v-if="passwordFieldErrorMessage('confirm')" class="mt-2 text-xs text-rose-600">
												{{ passwordFieldErrorMessage("confirm") }}
											</p>
										</div>
									</div>
								</div>

								<div class="grid gap-2 sm:grid-cols-2">
									<AppButton color="neutral" variant="soft" size="md" :block="true" @click="leaveAndLogout">
										ออกจากระบบ
									</AppButton>
									<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-arrow-right-20-solid" :loading="passwordPending" :spin-icon-on-loading="true" :block="true" @click="submitPasswordStep">
										ยืนยันรหัสผ่านใหม่
									</AppButton>
								</div>
							</div>

							<div v-else-if="currentStep === 2" class="space-y-5">
								<div v-if="storeError" class="rounded-md bg-error-50 px-4 py-3 text-sm text-error">
									{{ storeError }}
								</div>

								<div class="rounded-md bg-[var(--pos-surface-soft)] p-4">
									<p class="text-sm font-semibold text-stone-900">สร้างร้านแรกของคุณ</p>
									<p class="mt-1 text-sm leading-6 text-stone-500">เริ่มจากข้อมูลสำคัญก่อน แล้วค่อยกลับมาเติมโลโก้หรือรายละเอียดเชิงลึกทีหลังได้</p>
									<div class="mt-4 grid gap-4">
										<div>
											<label class="mb-2 block text-xs font-medium text-stone-500">ชื่อร้าน</label>
											<UInput v-model="storeForm.name" size="lg" color="neutral" placeholder="เช่น Codesabai Mart" class="w-full [&_input]:rounded-md [&_input]:border-[#e7e4dd] [&_input]:bg-white [&_input]:py-3" />
										</div>
										<div class="grid gap-4 sm:grid-cols-2">
											<div>
												<label class="mb-2 block text-xs font-medium text-stone-500">ประเภทร้าน</label>
												<select v-model="storeForm.store_type" class="w-full rounded-md border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
													<option value="RETAIL">Retail</option>
													<option value="CAFE">Cafe</option>
													<option value="RESTAURANT">Restaurant</option>
													<option value="BEAUTY">Beauty</option>
													<option value="SERVICE">Service</option>
													<option value="OTHER">Other</option>
												</select>
											</div>
											<div>
												<label class="mb-2 block text-xs font-medium text-stone-500">สกุลเงินหลัก</label>
												<select v-model="storeForm.currency" class="w-full rounded-md border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
													<option value="LAK">LAK</option>
													<option value="THB">THB</option>
													<option value="USD">USD</option>
												</select>
											</div>
										</div>
										<div class="grid gap-4 sm:grid-cols-2">
											<div>
												<label class="mb-2 block text-xs font-medium text-stone-500">เบอร์โทรร้าน</label>
												<UInput v-model="storeForm.phone_number" size="lg" color="neutral" placeholder="020xxxxxxx" class="w-full [&_input]:rounded-md [&_input]:border-[#e7e4dd] [&_input]:bg-white [&_input]:py-3" />
											</div>
											<div>
												<label class="mb-2 block text-xs font-medium text-stone-500">VAT %</label>
												<UInput v-model="storeForm.vat_rate" size="lg" color="neutral" type="number" class="w-full [&_input]:rounded-md [&_input]:border-[#e7e4dd] [&_input]:bg-white [&_input]:py-3" />
											</div>
										</div>
										<div>
											<label class="mb-2 block text-xs font-medium text-stone-500">ที่อยู่ร้าน</label>
											<textarea v-model="storeForm.address" rows="3" class="w-full rounded-md border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200" placeholder="ถนน / แขวง / เมือง / แขวง" />
										</div>
									</div>
								</div>

								<div class="rounded-md bg-[var(--pos-surface-soft)] p-4">
									<p class="text-sm font-semibold text-stone-900">เลือกโทนสีร้าน</p>
									<p class="mt-1 text-sm leading-6 text-stone-500">สีนี้จะถูกใช้เป็นโทนเริ่มต้นของเอกสารร้านและภาพรวมแบรนด์เบื้องต้น</p>
									<div class="mt-4 grid gap-3 sm:grid-cols-4">
										<button
											v-for="preset in themePresets"
											:key="preset.value"
											type="button"
											class="rounded-md border px-3 py-3 text-left transition"
											:class="storeForm.pdf_header_color === preset.value ? 'border-primary-300 bg-primary-50' : 'border-neutral-200 bg-white hover:border-primary-200 hover:bg-primary-50/50'"
											@click="storeForm.pdf_header_color = preset.value"
										>
											<div class="h-8 rounded-md" :style="{ backgroundColor: preset.value }" />
											<p class="mt-2 text-sm font-medium text-stone-900">{{ preset.name }}</p>
										</button>
									</div>
								</div>

								<div class="grid gap-2 sm:grid-cols-2">
									<AppButton v-if="currentUser?.mustChangePassword" color="neutral" variant="soft" size="md" :block="true" @click="currentStep = 1">
										ย้อนกลับ
									</AppButton>
									<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-arrow-right-20-solid" :block="true" @click="goToReview">
										ตรวจสอบก่อนสร้างร้าน
									</AppButton>
								</div>
							</div>

							<div v-else class="space-y-5">
								<div v-if="storeError" class="rounded-md bg-error-50 px-4 py-3 text-sm text-error">
									{{ storeError }}
								</div>

								<div class="grid gap-4 sm:grid-cols-2">
									<UCard class="border-0 bg-[var(--pos-surface-soft)] shadow-none">
										<p class="text-xs uppercase tracking-[0.16em] text-stone-400">Account</p>
										<p class="mt-3 text-lg font-semibold text-stone-950">{{ currentUser?.name || "-" }}</p>
										<p class="mt-1 text-sm text-stone-500">{{ currentUser?.email || "-" }}</p>
									</UCard>
									<UCard class="border-0 bg-[var(--pos-surface-soft)] shadow-none">
										<p class="text-xs uppercase tracking-[0.16em] text-stone-400">Store</p>
										<p class="mt-3 text-lg font-semibold text-stone-950">{{ storeForm.name || "-" }}</p>
										<p class="mt-1 text-sm text-stone-500">{{ storeForm.store_type }} · {{ storeForm.currency }}</p>
									</UCard>
								</div>

								<div class="rounded-md bg-[var(--pos-surface-soft)] p-4">
									<p class="text-sm font-semibold text-stone-900">สรุปก่อนเริ่มใช้งาน</p>
									<dl class="mt-4 space-y-3 text-sm">
										<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
											<dt class="text-stone-500">ชื่อร้าน</dt>
											<dd class="text-right font-medium text-stone-900">{{ storeForm.name }}</dd>
										</div>
										<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
											<dt class="text-stone-500">ประเภทร้าน</dt>
											<dd class="text-right font-medium text-stone-900">{{ storeForm.store_type }}</dd>
										</div>
										<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
											<dt class="text-stone-500">สกุลเงิน</dt>
											<dd class="text-right font-medium text-stone-900">{{ storeForm.currency }}</dd>
										</div>
										<div class="flex items-start justify-between gap-4">
											<dt class="text-stone-500">สีแบรนด์เริ่มต้น</dt>
											<dd class="flex items-center gap-2 text-right font-medium text-stone-900">
												<span class="inline-block h-4 w-4 rounded-full ring-1 ring-black/10" :style="{ backgroundColor: storeForm.pdf_header_color }" />
												{{ storeForm.pdf_header_color }}
											</dd>
										</div>
									</dl>
								</div>

								<div class="grid gap-2 sm:grid-cols-2">
									<AppButton color="neutral" variant="soft" size="md" :block="true" @click="currentStep = 2">
										ย้อนกลับ
									</AppButton>
									<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-check-20-solid" :loading="createStorePending" :spin-icon-on-loading="true" :block="true" @click="createFirstStore">
										สร้างร้านแรกและเริ่มใช้งาน
									</AppButton>
								</div>
							</div>
						</div>
					</UCard>
				</div>
			</section>
		</div>
	</main>
</template>
