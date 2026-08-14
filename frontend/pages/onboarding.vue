<script setup lang="ts">
import { isOnboardingBlocked, needsAuthOnboarding } from "~/utils/auth-onboarding";

const { t } = useI18n();

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

const STORE_TYPE = "RESTAURANT";
const STORE_HEADER_COLOR = "#22c55e";

const storeForm = reactive({
	name: "",
	currency: "LAK",
});

const stepItems = computed(() => ([
	{
		id: 1,
		label: "Security",
		title: t("onboardingPage.stepSecurityTitle"),
		complete: !currentUser.value?.mustChangePassword,
	},
	{
		id: 2,
		label: "Store",
		title: t("onboardingPage.stepStoreTitle"),
		complete: Number(currentUser.value?.ownedStoresCount || 0) > 0,
	},
	{
		id: 3,
		label: "Review",
		title: t("onboardingPage.stepReviewTitle"),
		complete: false,
	},
]));

const canGoToReview = computed(() => (
	storeForm.name.trim().length > 0
));

const onboardingIsBlocked = computed(() => isOnboardingBlocked(currentUser.value));
const onboardingDone = computed(() => !needsAuthOnboarding(currentUser.value));

function getDefaultAuthedPath() {
	return currentUser.value?.systemRole === "system_admin" ? "/system-admin/dashboard" : "/";
}

const onboardingIntro = computed(() => {
	if (currentUser.value?.mustChangePassword) {
		return t("onboardingPage.introMustChangePassword");
	}

	return t("onboardingPage.introDefault");
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
		return t("onboardingPage.errorCurrentWrong");
	}
	if (lower.includes("new password must be different")) {
		return t("onboardingPage.errorSameAsCurrent");
	}
	if (lower.includes("confirmpassword") && lower.includes("at least 6")) {
		return t("onboardingPage.errorConfirmTooShort");
	}
	if (lower.includes("newpassword") && lower.includes("at least 6")) {
		return t("onboardingPage.errorNextTooShort");
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
		errors.current = t("onboardingPage.errorCurrentRequired");
	}

	if (!passwordForm.newPassword.trim()) {
		errors.next = t("onboardingPage.errorNextRequired");
	} else if (passwordForm.newPassword.length < 6) {
		errors.next = t("onboardingPage.errorNextTooShort");
	}

	if (!passwordForm.confirmPassword.trim()) {
		errors.confirm = t("onboardingPage.errorConfirmRequired");
	} else if (passwordForm.confirmPassword.length < 6) {
		errors.confirm = t("onboardingPage.errorConfirmTooShort");
	} else if (passwordForm.confirmPassword !== passwordForm.newPassword) {
		errors.confirm = t("onboardingPage.errorConfirmMismatch");
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
			await navigateTo(getDefaultAuthedPath());
			return;
		}
		currentStep.value = currentUser.value?.mustChangePassword ? 1 : 2;
	} catch (error) {
		pageError.value = extractErrorMessage(error, t("onboardingPage.loadFailed"));
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
			title: t("onboardingPage.passwordChanged"),
			description: t("onboardingPage.passwordChangedDescription"),
		});
	} catch (error) {
		const rawMessage = extractErrorMessage(error, t("onboardingPage.passwordChangeFailed"));
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
		storeError.value = t("onboardingPage.storeNameRequired");
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
					store_type: STORE_TYPE,
					currency: storeForm.currency,
					supported_currencies: storeForm.currency,
					pdf_header_color: STORE_HEADER_COLOR,
					pdf_company_name: storeForm.name.trim(),
				},
		});
		await fetchMe();
			appToast.success({
				title: t("onboardingPage.storeCreated"),
				description: t("onboardingPage.storeCreatedDescription", { name: response.data.name }),
			});
			await navigateTo(getDefaultAuthedPath());
		} catch (error) {
		storeError.value = extractErrorMessage(error, t("onboardingPage.storeCreateFailed"));
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
								{{ t('onboardingPage.heroTitle') }}
							</h2>
							<p class="max-w-xl text-base leading-7 text-stone-500">
								{{ t('onboardingPage.heroDescription') }}
							</p>
						</div>

						<div class="grid gap-4 sm:grid-cols-3">
							<UCard class="border-0 bg-[#fffefd] shadow-sm ring-1 ring-[#e7e4dd]">
								<p class="text-xs uppercase tracking-[0.18em] text-stone-400">Step 1</p>
								<p class="mt-3 text-2xl font-semibold text-stone-950">Security</p>
								<p class="mt-2 text-sm leading-6 text-stone-500">{{ t('onboardingPage.stepSecurityDescription') }}</p>
							</UCard>
							<UCard class="border-0 bg-[#fffefd] shadow-sm ring-1 ring-[#e7e4dd]">
								<p class="text-xs uppercase tracking-[0.18em] text-stone-400">Step 2</p>
								<p class="mt-3 text-2xl font-semibold text-stone-950">Store</p>
								<p class="mt-2 text-sm leading-6 text-stone-500">{{ t('onboardingPage.stepStoreDescription') }}</p>
							</UCard>
							<UCard class="border-0 bg-[#fffefd] shadow-sm ring-1 ring-[#e7e4dd]">
								<p class="text-xs uppercase tracking-[0.18em] text-stone-400">Step 3</p>
								<p class="mt-3 text-2xl font-semibold text-stone-950">Review</p>
								<p class="mt-2 text-sm leading-6 text-stone-500">{{ t('onboardingPage.stepReviewDescription') }}</p>
							</UCard>
						</div>
					</div>

					<div class="flex items-center justify-between text-sm text-stone-400">
						<p>Client onboarding</p>
						<p>{{ t('onboardingPage.footerNote') }}</p>
					</div>
				</div>
			</section>

			<section class="flex min-h-[100dvh] items-center justify-center px-0 py-4 sm:px-6 sm:py-6 lg:px-8">
				<div class="w-full max-w-[560px]">
						<UCard class="border-0 rounded-none bg-[#fffefd] shadow-xl ring-1 ring-[#e7e4dd] sm:rounded-md">
							<div v-if="pending" class="space-y-5 px-4 py-4 sm:px-1 sm:py-1">
								<AppInlineLoadingBar :label="t('onboardingPage.loading')" />
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
								{{ t('onboardingPage.tryAgain') }}
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
										<h2 class="mt-3 text-3xl font-semibold tracking-[-0.04em] text-stone-950">{{ t('onboardingPage.welcome', { name: currentUser?.name || "" }) }}</h2>
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
									<p class="text-sm font-semibold text-stone-950">{{ t('onboardingPage.blockedTitle') }}</p>
									<p class="mt-1 text-sm leading-6 text-stone-600">{{ t('onboardingPage.blockedDescription') }}</p>
								</div>
								<div class="grid gap-2 sm:grid-cols-2">
									<AppButton color="neutral" variant="soft" size="md" :block="true" @click="bootstrap">
										{{ t('onboardingPage.reloadStatus') }}
									</AppButton>
									<AppButton color="primary" variant="solid" size="md" :block="true" @click="leaveAndLogout">
										{{ t('onboardingPage.signOut') }}
									</AppButton>
								</div>
							</div>

							<div v-else-if="currentStep === 1" class="space-y-5">
								<div v-if="passwordError" class="rounded-md bg-error-50 px-4 py-3 text-sm text-error">
									{{ passwordError }}
								</div>

								<div class="rounded-md bg-[var(--pos-surface-soft)] p-4">
									<p class="text-sm font-semibold text-stone-900">{{ t('onboardingPage.passwordTitle') }}</p>
									<p class="mt-1 text-sm leading-6 text-stone-500">{{ t('onboardingPage.passwordDescription') }}</p>
									<div class="mt-4 grid gap-4">
										<div>
											<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('onboardingPage.accountEmail') }}</label>
											<UInput :model-value="currentUser?.email || ''" disabled size="lg" color="neutral" class="w-full [&_input]:rounded-md [&_input]:border-[#e7e4dd] [&_input]:bg-white [&_input]:py-3" />
										</div>
										<div>
											<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('onboardingPage.currentPassword') }}</label>
											<div class="relative">
												<UInput
													v-model="passwordForm.currentPassword"
													:type="passwordVisibility.current ? 'text' : 'password'"
													size="lg"
													color="neutral"
													:class="passwordInputClass('current')"
													@blur="passwordTouched.current = true"
												/>
												<AppButton color="neutral" variant="ghost" size="xs" type="button" tabindex="-1" :aria-label="t('onboardingPage.toggleCurrentPassword')" class="absolute top-1/2 right-2 h-8 w-8 -translate-y-1/2 justify-center rounded-md text-stone-500 hover:bg-white hover:text-stone-900" :icon="passwordVisibility.current ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'" @mousedown.prevent @click="passwordVisibility.current = !passwordVisibility.current" />
											</div>
											<p v-if="passwordFieldErrorMessage('current')" class="mt-2 text-xs text-rose-600">
												{{ passwordFieldErrorMessage("current") }}
											</p>
										</div>
										<div>
											<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('onboardingPage.newPassword') }}</label>
											<div class="relative">
												<UInput
													v-model="passwordForm.newPassword"
													:type="passwordVisibility.next ? 'text' : 'password'"
													size="lg"
													color="neutral"
													:class="passwordInputClass('next')"
													@blur="passwordTouched.next = true"
												/>
												<AppButton color="neutral" variant="ghost" size="xs" type="button" tabindex="-1" :aria-label="t('onboardingPage.toggleNewPassword')" class="absolute top-1/2 right-2 h-8 w-8 -translate-y-1/2 justify-center rounded-md text-stone-500 hover:bg-white hover:text-stone-900" :icon="passwordVisibility.next ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'" @mousedown.prevent @click="passwordVisibility.next = !passwordVisibility.next" />
											</div>
											<p v-if="passwordFieldErrorMessage('next')" class="mt-2 text-xs text-rose-600">
												{{ passwordFieldErrorMessage("next") }}
											</p>
										</div>
										<div>
											<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('onboardingPage.confirmPassword') }}</label>
											<div class="relative">
												<UInput
													v-model="passwordForm.confirmPassword"
													:type="passwordVisibility.confirm ? 'text' : 'password'"
													size="lg"
													color="neutral"
													:class="passwordInputClass('confirm')"
													@blur="passwordTouched.confirm = true"
												/>
												<AppButton color="neutral" variant="ghost" size="xs" type="button" tabindex="-1" :aria-label="t('onboardingPage.toggleConfirmPassword')" class="absolute top-1/2 right-2 h-8 w-8 -translate-y-1/2 justify-center rounded-md text-stone-500 hover:bg-white hover:text-stone-900" :icon="passwordVisibility.confirm ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'" @mousedown.prevent @click="passwordVisibility.confirm = !passwordVisibility.confirm" />
											</div>
											<p v-if="passwordFieldErrorMessage('confirm')" class="mt-2 text-xs text-rose-600">
												{{ passwordFieldErrorMessage("confirm") }}
											</p>
										</div>
									</div>
								</div>

								<div class="grid gap-2 sm:grid-cols-2">
									<AppButton color="neutral" variant="soft" size="md" :block="true" @click="leaveAndLogout">
										{{ t('onboardingPage.signOut') }}
									</AppButton>
									<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-arrow-right-20-solid" :loading="passwordPending" :spin-icon-on-loading="true" :block="true" @click="submitPasswordStep">
										{{ t('onboardingPage.confirmNewPassword') }}
									</AppButton>
								</div>
							</div>

							<div v-else-if="currentStep === 2" class="space-y-5">
								<div v-if="storeError" class="rounded-md bg-error-50 px-4 py-3 text-sm text-error">
									{{ storeError }}
								</div>

								<div class="rounded-md bg-[var(--pos-surface-soft)] p-4">
									<p class="text-sm font-semibold text-stone-900">{{ t('onboardingPage.storeTitle') }}</p>
									<p class="mt-1 text-sm leading-6 text-stone-500">{{ t('onboardingPage.storeDescription') }}</p>
									<div class="mt-4 grid gap-4">
										<div>
											<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('onboardingPage.storeName') }}</label>
											<UInput v-model="storeForm.name" size="lg" color="neutral" :placeholder="t('onboardingPage.storeNamePlaceholder')" class="w-full [&_input]:rounded-md [&_input]:border-[#e7e4dd] [&_input]:bg-white [&_input]:py-3" />
										</div>
										<div class="grid gap-4 sm:grid-cols-2">
											<div>
												<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('onboardingPage.storeType') }}</label>
												<div class="w-full rounded-md border border-[#e7e4dd] bg-neutral-50 px-4 py-3 text-sm font-medium text-stone-700">
													{{ t('onboardingPage.storeTypeRestaurant') }}
												</div>
												<p class="mt-2 text-xs leading-5 text-stone-400">{{ t('onboardingPage.storeTypeHint') }}</p>
											</div>
											<div>
												<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('onboardingPage.currency') }}</label>
												<select v-model="storeForm.currency" class="w-full rounded-md border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
													<option value="LAK">LAK</option>
													<option value="THB">THB</option>
													<option value="USD">USD</option>
												</select>
											</div>
										</div>
										<p class="text-xs leading-5 text-stone-400">{{ t('onboardingPage.laterInSettings') }}</p>
									</div>
								</div>

								<div class="grid gap-2" :class="currentUser?.mustChangePassword ? 'sm:grid-cols-2' : ''">
									<AppButton v-if="currentUser?.mustChangePassword" color="neutral" variant="soft" size="md" :block="true" @click="currentStep = 1">
										{{ t('onboardingPage.back') }}
									</AppButton>
									<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-arrow-right-20-solid" :block="true" @click="goToReview">
										{{ t('onboardingPage.goReview') }}
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
										<p class="mt-1 text-sm text-stone-500">{{ t('onboardingPage.storeTypeRestaurant') }} · {{ storeForm.currency }}</p>
									</UCard>
								</div>

								<div class="rounded-md bg-[var(--pos-surface-soft)] p-4">
									<p class="text-sm font-semibold text-stone-900">{{ t('onboardingPage.reviewTitle') }}</p>
									<dl class="mt-4 space-y-3 text-sm">
										<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
											<dt class="text-stone-500">{{ t('onboardingPage.storeName') }}</dt>
											<dd class="text-right font-medium text-stone-900">{{ storeForm.name }}</dd>
										</div>
										<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
											<dt class="text-stone-500">{{ t('onboardingPage.storeType') }}</dt>
											<dd class="text-right font-medium text-stone-900">{{ t('onboardingPage.storeTypeRestaurant') }}</dd>
										</div>
										<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
											<dt class="text-stone-500">{{ t('onboardingPage.currency') }}</dt>
											<dd class="text-right font-medium text-stone-900">{{ storeForm.currency }}</dd>
										</div>
									</dl>
								</div>

								<div class="grid gap-2 sm:grid-cols-2">
									<AppButton color="neutral" variant="soft" size="md" :block="true" @click="currentStep = 2">
										{{ t('onboardingPage.back') }}
									</AppButton>
									<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-check-20-solid" :loading="createStorePending" :spin-icon-on-loading="true" :block="true" @click="createFirstStore">
										{{ t('onboardingPage.createStore') }}
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
