<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { formatAppDateTime } from "~/utils/date-format";

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
		username: string;
		systemRole: string;
		mustChangePassword: boolean;
		uiLocale: string;
	};
};

type PasswordChangeResponse = ProfileUpdateResponse & {
	passwordChanged: true;
};

type AccessibleStoreRecord = {
	id: string;
	name: string;
	currency?: string;
};

const { apiFetch } = useApiClient();
const { t, locale } = useI18n();
const { currentUser, currentSession, currentAccess, currentStoreId, fetchMe } = useAuthSession();
const appToast = useAppToast();
const accessibleStores = useState<AccessibleStoreRecord[]>("auth-accessible-stores", () => []);

const profileForm = reactive({
	name: "",
	username: "",
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
const profileNameFieldRef = ref<HTMLElement | null>(null);
const passwordCurrentFieldRef = ref<HTMLElement | null>(null);
const passwordVisibility = reactive({
	current: false,
	next: false,
	confirm: false,
});

const primaryMembership = computed(() => (
	currentAccess.value?.memberships?.find((membership) => membership.store_id === currentStoreId.value)
	|| currentAccess.value?.memberships?.[0]
	|| null
));
const currentStoreName = computed(() => (
	accessibleStores.value.find((store) => store.id === currentStoreId.value)?.name
	|| t("profilePage.unknownStore")
));
const permissionCount = computed(() => currentAccess.value?.permissions?.length ?? 0);
const membershipCount = computed(() => currentAccess.value?.memberships?.length ?? 0);

function abbreviateId(value?: string | null) {
	if (!value) return "-";
	return value.length > 17 ? `${value.slice(0, 8)}…${value.slice(-8)}` : value;
}

async function copyTechnicalId(value?: string | null) {
	if (!value || !import.meta.client || !navigator.clipboard?.writeText) {
		appToast.error({ title: t("profilePage.copyFailed") });
		return;
	}
	try {
		await navigator.clipboard.writeText(value);
		appToast.success({ title: t("profilePage.copied") });
	} catch {
		appToast.error({ title: t("profilePage.copyFailed") });
	}
}

function shouldAutoFocusProfileModalInput() {
	if (!import.meta.client) return false;
	return window.matchMedia("(min-width: 1024px)").matches;
}

function formatDateTime(value?: string | null) {
	if (!value) return "-";
	return formatAppDateTime(value, locale.value as "th" | "lo" | "en");
}

watch(currentUser, (value) => {
	profileForm.name = value?.name || "";
	profileForm.username = value?.username || "";
}, { immediate: true });

watch(profileModalOpen, async (opened) => {
	if (!opened) return;
	if (!shouldAutoFocusProfileModalInput()) return;
	await nextTick();
	profileNameFieldRef.value?.querySelector<HTMLInputElement>("input:not([disabled])")?.focus();
});

watch(passwordModalOpen, async (opened) => {
	if (!opened) return;
	if (!shouldAutoFocusProfileModalInput()) return;
	await nextTick();
	passwordCurrentFieldRef.value?.querySelector<HTMLInputElement>("input:not([disabled])")?.focus();
});

	function extractErrorMessage(error: unknown, fallback: string) {
		if (typeof error === "object" && error && "data" in error) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const data = (error as any).data as { message?: string } | undefined;
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
		const message = extractErrorMessage(error, t("profilePage.loadFailed"));
		profileError.value = message;
		appToast.error({
			title: t("profilePage.loadFailed"),
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
				username: profileForm.username,
			},
		});

		await refreshProfile();
		profileSuccess.value = t("profilePage.usernameUpdated");
		appToast.success({
			title: t("profilePage.profileUpdated"),
			description: t("profilePage.profileUpdatedDescription"),
		});
		profileModalOpen.value = false;
	} catch (error) {
		profileError.value = extractErrorMessage(error, t("profilePage.profileUpdateFailed"));
		appToast.error({
			title: t("profilePage.profileUpdateFailed"),
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
		passwordSuccess.value = t("profilePage.passwordUpdated");
		appToast.success({
			title: t("profilePage.passwordChanged"),
			description: t("profilePage.passwordChangedDescription"),
		});
		passwordModalOpen.value = false;
	} catch (error) {
		passwordError.value = extractErrorMessage(error, t("profilePage.passwordChangeFailed"));
		appToast.error({
			title: t("profilePage.passwordChangeFailed"),
			description: passwordError.value || undefined,
		});
	} finally {
		passwordPending.value = false;
	}
}

onMounted(async () => {
	if (!currentUser.value || !currentSession.value) {
		await refreshProfile();
	}
});
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['settings']"
		:sidebar-eyebrow="t('profilePage.profile')"
		:sidebar-title="t('profilePage.title')"
		sidebar-compact-title="ME"
		:sidebar-description="t('profilePage.sidebarDescription')"
	>
		<template #default>
			<div class="space-y-4 lg:grid lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-5 lg:space-y-0">
				<div class="space-y-4 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
					<UCard class="border-0 rounded-none bg-white shadow-[0_10px_30px_rgba(31,28,24,0.06)] dark:bg-[#221d18] sm:rounded-md">
						<div class="space-y-5">
							<div class="flex items-start gap-3">
								<div class="flex h-14 w-14 items-center justify-center rounded-md bg-primary-50 text-lg font-semibold text-primary-700">
									{{ (currentUser?.name || "U").slice(0, 1).toUpperCase() }}
								</div>
								<div class="min-w-0 flex-1">
									<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{{ t('profilePage.accountSummary') }}</p>
									<h2 class="mt-2 truncate text-xl font-semibold text-stone-950">{{ currentUser?.name || "-" }}</h2>
									<p class="mt-1 truncate text-sm text-stone-500">{{ currentUser?.email || "-" }}</p>
									<p class="mt-1 truncate text-sm text-stone-500">Username: {{ currentUser?.username || "-" }}</p>
								</div>
							</div>

							<div class="grid grid-cols-2 gap-3 text-xs text-stone-500">
								<div class="rounded-md bg-[var(--pos-surface-soft)] px-3 py-3.5">
									<p>{{ t('profilePage.systemRole') }}</p>
									<p class="mt-1 text-sm font-semibold text-stone-900">{{ currentUser?.systemRole || "-" }}</p>
								</div>
								<div class="rounded-md bg-[var(--pos-surface-soft)] px-3 py-3.5">
									<p>{{ t('profilePage.uiLocale') }}</p>
									<p class="mt-1 text-sm font-semibold text-stone-900">{{ currentUser?.uiLocale || "-" }}</p>
								</div>
								<div class="rounded-md bg-[var(--pos-surface-soft)] px-3 py-3.5">
									<p>{{ t('profilePage.permissions') }}</p>
									<p class="mt-1 text-sm font-semibold text-stone-900">{{ permissionCount }}</p>
								</div>
								<div class="rounded-md bg-[var(--pos-surface-soft)] px-3 py-3.5">
									<p>{{ t('profilePage.memberships') }}</p>
									<p class="mt-1 text-sm font-semibold text-stone-900">{{ membershipCount }}</p>
								</div>
							</div>

							<dl class="space-y-3 text-sm">
								<div class="flex items-start justify-between gap-4 border-b border-[#f0ece5] pb-3 dark:border-[#3a332a]">
									<dt class="text-stone-500">{{ t('profilePage.primaryStoreRole') }}</dt>
									<dd class="text-right font-medium text-stone-900">{{ primaryMembership?.role_name || "-" }}</dd>
								</div>
								<div class="flex items-start justify-between gap-4 border-b border-[#f0ece5] pb-3 dark:border-[#3a332a]">
									<dt class="text-stone-500">{{ t('profilePage.currentStore') }}</dt>
									<dd class="max-w-[240px] truncate text-right font-medium text-stone-900" :title="currentStoreName">{{ currentStoreName }}</dd>
								</div>
								<div class="flex items-start justify-between gap-4 border-b border-[#f0ece5] pb-3 dark:border-[#3a332a]">
									<dt class="text-stone-500">{{ t('profilePage.rememberMe') }}</dt>
									<dd class="text-right font-medium text-stone-900">{{ currentSession?.rememberMe ? t('profilePage.on') : t('profilePage.off') }}</dd>
								</div>
								<div class="flex items-start justify-between gap-4">
									<dt class="text-stone-500">{{ t('profilePage.refreshExpiresAt') }}</dt>
									<dd class="text-right font-medium text-stone-900">{{ formatDateTime(currentSession?.refreshExpiresAt) }}</dd>
								</div>
							</dl>

							<details class="group rounded-md bg-[var(--pos-surface-soft)]">
								<summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-sm font-medium text-stone-700">
									<span>{{ t('profilePage.technicalDetails') }}</span>
									<UIcon name="i-heroicons-chevron-down-20-solid" class="h-4 w-4 transition group-open:rotate-180" />
								</summary>
								<dl class="space-y-2 border-t border-[#ece6dc] px-3 py-3 text-xs dark:border-[#3a332a]">
									<div class="flex items-center justify-between gap-3">
										<dt class="text-stone-500">{{ t('profilePage.storeId') }}</dt>
										<dd class="flex min-w-0 items-center gap-1.5">
											<code class="truncate text-stone-700">{{ abbreviateId(currentStoreId) }}</code>
											<AppButton v-if="currentStoreId" color="neutral" variant="ghost" size="xs" icon="i-heroicons-clipboard-document-20-solid" :aria-label="t('profilePage.copyStoreId')" :title="t('profilePage.copyStoreId')" @click="copyTechnicalId(currentStoreId)" />
										</dd>
									</div>
									<div class="flex items-center justify-between gap-3">
										<dt class="text-stone-500">{{ t('profilePage.sessionId') }}</dt>
										<dd class="flex min-w-0 items-center gap-1.5">
											<code class="truncate text-stone-700">{{ abbreviateId(currentSession?.id) }}</code>
											<AppButton v-if="currentSession?.id" color="neutral" variant="ghost" size="xs" icon="i-heroicons-clipboard-document-20-solid" :aria-label="t('profilePage.copySessionId')" :title="t('profilePage.copySessionId')" @click="copyTechnicalId(currentSession.id)" />
										</dd>
									</div>
								</dl>
							</details>
						</div>
					</UCard>
				</div>

				<div class="space-y-4 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
					<UCard class="border-0 rounded-none bg-white shadow-[0_10px_30px_rgba(31,28,24,0.06)] dark:bg-[#221d18] sm:rounded-md">
						<div class="space-y-5">
							<div>
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{{ t('profilePage.actions') }}</p>
								<h2 class="mt-2 text-xl font-semibold text-stone-950">{{ t('profilePage.manageAccount') }}</h2>
								<p class="mt-2 text-sm leading-6 text-stone-500">{{ t('profilePage.manageAccountDescription') }}</p>
							</div>

							<div v-if="profileSuccess" class="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
								{{ profileSuccess }}
							</div>

							<div class="rounded-md bg-[var(--pos-surface-soft)] p-4 sm:p-5">
								<div class="min-w-0">
									<p class="text-sm font-semibold text-stone-900">{{ t('profilePage.accountInformation') }}</p>
									<p class="mt-1 text-sm leading-6 text-stone-500">{{ t('profilePage.accountInformationDescription') }}</p>
										<AppButton
											color="primary"
											variant="soft"
											size="md"
											trailing-icon="i-heroicons-arrow-right-20-solid"
											class="mt-3"
											@click="openProfileModal"
									>
										{{ t('profilePage.editAccount') }}
									</AppButton>
								</div>
								<dl class="mt-4 space-y-3 text-sm">
									<div class="flex items-center justify-between gap-4 rounded-md bg-white px-3 py-3 dark:bg-[#191613]">
										<dt class="text-stone-500">{{ t('profilePage.currentName') }}</dt>
										<dd class="font-medium text-stone-900">{{ currentUser?.name || "-" }}</dd>
									</div>
									<div class="flex items-center justify-between gap-4 rounded-md bg-white px-3 py-3 dark:bg-[#191613]">
										<dt class="text-stone-500">Username</dt>
										<dd class="font-medium text-stone-900">{{ currentUser?.username || "-" }}</dd>
									</div>
									<div class="flex items-center justify-between gap-4 rounded-md bg-white px-3 py-3 dark:bg-[#191613]">
										<dt class="text-stone-500">{{ t('profilePage.email') }}</dt>
										<dd class="max-w-[220px] truncate font-medium text-stone-900">{{ currentUser?.email || "-" }}</dd>
									</div>
								</dl>
							</div>

							<div v-if="passwordSuccess" class="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
								{{ passwordSuccess }}
							</div>

							<div class="rounded-md bg-[var(--pos-surface-soft)] p-4 sm:p-5">
								<div class="min-w-0">
									<p class="text-sm font-semibold text-stone-900">{{ t('profilePage.changePassword') }}</p>
									<p class="mt-1 text-sm leading-6 text-stone-500">{{ t('profilePage.passwordCardDescription') }}</p>
										<AppButton
											color="primary"
											variant="soft"
											size="md"
											trailing-icon="i-heroicons-arrow-right-20-solid"
											class="mt-3"
											@click="openPasswordModal"
									>
										{{ t('profilePage.changePassword') }}
									</AppButton>
								</div>
								<div class="mt-4 rounded-md bg-white px-4 py-3 text-sm text-stone-500 dark:bg-[#191613] dark:text-stone-300">
								{{ t('profilePage.passwordCardHint') }}
								</div>
							</div>
						</div>
					</UCard>
				</div>
			</div>

				<AppResponsivePanel
					:model-value="profileModalOpen"
					:title="t('profilePage.editAccount')"
					:description="t('profilePage.editAccountDescription')"
					desktop-width="680px"
					close-button-size="md"
					compact-header
					panel-class="lg:rounded-md"
					content-class="flex h-full flex-col overflow-hidden px-0 py-0"
					@update:model-value="profileModalOpen = $event"
				>
					<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
						<div class="scrollbar-soft min-h-0 space-y-5 overflow-y-auto px-5 py-4">
							<div v-if="profileError" class="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-600">
								{{ profileError }}
							</div>

							<div class="rounded-md bg-[var(--pos-surface-soft)] p-4">
								<p class="text-sm font-semibold text-stone-900">{{ t('profilePage.currentAccountInformation') }}</p>
								<p class="mt-1 text-sm leading-6 text-stone-500">{{ t('profilePage.currentAccountInformationDescription') }}</p>
								<div class="mt-4 grid gap-4">
									<div>
										<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('profilePage.email') }}</label>
										<UInput :model-value="currentUser?.email || ''" disabled size="lg" color="neutral" class="w-full [&_input]:rounded-md [&_input]:border-[#e7e4dd] [&_input]:bg-white [&_input]:py-3 dark:[&_input]:border-[#3a332a] dark:[&_input]:bg-[#191613] dark:[&_input]:text-stone-200" />
									</div>
									<div ref="profileNameFieldRef">
										<label class="mb-2 block text-xs font-medium text-stone-500">Username</label>
										<UInput v-model="profileForm.username" autocomplete="username" placeholder="somchai" size="lg" color="neutral" class="mb-4 w-full [&_input]:rounded-md [&_input]:border-[#e7e4dd] [&_input]:bg-white [&_input]:py-3 dark:[&_input]:border-[#3a332a] dark:[&_input]:bg-[#191613] dark:[&_input]:text-stone-100" />
										<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('profilePage.currentName') }}</label>
										<UInput v-model="profileForm.name" size="lg" color="neutral" class="w-full [&_input]:rounded-md [&_input]:border-[#e7e4dd] [&_input]:bg-white [&_input]:py-3 dark:[&_input]:border-[#3a332a] dark:[&_input]:bg-[#191613] dark:[&_input]:text-stone-100" />
									</div>
								</div>
							</div>
						</div>

						<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm dark:border-[#3a332a] dark:bg-[rgba(34,29,24,0.98)]">
							<div class="grid w-full grid-cols-2 gap-2">
								<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-check-20-solid" :loading="profilePending" :spin-icon-on-loading="true" :block="true" class="order-2" @click="submitProfile">
									{{ t('profilePage.saveUsername') }}
								</AppButton>
								<AppButton color="neutral" variant="soft" size="md" :block="true" class="order-1" @click="profileModalOpen = false">
									{{ t('profilePage.cancel') }}
								</AppButton>
							</div>
						</div>
					</div>
				</AppResponsivePanel>

				<AppResponsivePanel
					:model-value="passwordModalOpen"
					:title="t('profilePage.changePassword')"
					:description="t('profilePage.changePasswordDescription')"
					desktop-width="680px"
					close-button-size="md"
					compact-header
					panel-class="lg:rounded-md"
					content-class="flex h-full flex-col overflow-hidden px-0 py-0"
					@update:model-value="passwordModalOpen = $event"
				>
					<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
						<div class="scrollbar-soft min-h-0 space-y-5 overflow-y-auto px-5 py-4">
							<div v-if="passwordError" class="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-600">
								{{ passwordError }}
							</div>

							<div class="rounded-md bg-[var(--pos-surface-soft)] p-4">
								<p class="text-sm font-semibold text-stone-900">{{ t('profilePage.setNewPassword') }}</p>
								<p class="mt-1 text-sm leading-6 text-stone-500">{{ t('profilePage.setNewPasswordDescription') }}</p>
								<div class="mt-4 grid gap-4">
									<div ref="passwordCurrentFieldRef">
										<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('profilePage.currentPassword') }}</label>
										<div class="relative">
											<UInput
												v-model="passwordForm.currentPassword"
												:type="passwordVisibility.current ? 'text' : 'password'"
												size="lg"
												color="neutral"
												class="w-full [&_input]:rounded-md [&_input]:border-[#e7e4dd] [&_input]:bg-white [&_input]:py-3 [&_input]:pr-11 dark:[&_input]:border-[#3a332a] dark:[&_input]:bg-[#191613] dark:[&_input]:text-stone-100"
											/>
											<AppButton
												color="neutral"
												variant="ghost"
												size="xs"
												tabindex="-1"
												class="absolute top-1/2 right-2 h-8 w-8 -translate-y-1/2 justify-center rounded-md text-stone-500 hover:bg-white hover:text-stone-900 dark:hover:bg-[#2a241e] dark:hover:text-stone-100"
												:icon="passwordVisibility.current ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'"
												:aria-label="passwordVisibility.current ? t('profilePage.hidePassword') : t('profilePage.showPassword')"
												:title="passwordVisibility.current ? t('profilePage.hidePassword') : t('profilePage.showPassword')"
												@click="passwordVisibility.current = !passwordVisibility.current"
											/>
										</div>
									</div>
									<div>
										<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('profilePage.newPassword') }}</label>
										<div class="relative">
											<UInput
												v-model="passwordForm.newPassword"
												:type="passwordVisibility.next ? 'text' : 'password'"
												size="lg"
												color="neutral"
												class="w-full [&_input]:rounded-md [&_input]:border-[#e7e4dd] [&_input]:bg-white [&_input]:py-3 [&_input]:pr-11 dark:[&_input]:border-[#3a332a] dark:[&_input]:bg-[#191613] dark:[&_input]:text-stone-100"
											/>
											<AppButton
												color="neutral"
												variant="ghost"
												size="xs"
												tabindex="-1"
												class="absolute top-1/2 right-2 h-8 w-8 -translate-y-1/2 justify-center rounded-md text-stone-500 hover:bg-white hover:text-stone-900 dark:hover:bg-[#2a241e] dark:hover:text-stone-100"
												:icon="passwordVisibility.next ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'"
												:aria-label="passwordVisibility.next ? t('profilePage.hidePassword') : t('profilePage.showPassword')"
												:title="passwordVisibility.next ? t('profilePage.hidePassword') : t('profilePage.showPassword')"
												@click="passwordVisibility.next = !passwordVisibility.next"
											/>
										</div>
									</div>
									<div>
										<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('profilePage.confirmNewPassword') }}</label>
										<div class="relative">
											<UInput
												v-model="passwordForm.confirmPassword"
												:type="passwordVisibility.confirm ? 'text' : 'password'"
												size="lg"
												color="neutral"
												class="w-full [&_input]:rounded-md [&_input]:border-[#e7e4dd] [&_input]:bg-white [&_input]:py-3 [&_input]:pr-11 dark:[&_input]:border-[#3a332a] dark:[&_input]:bg-[#191613] dark:[&_input]:text-stone-100"
											/>
											<AppButton
												color="neutral"
												variant="ghost"
												size="xs"
												tabindex="-1"
												class="absolute top-1/2 right-2 h-8 w-8 -translate-y-1/2 justify-center rounded-md text-stone-500 hover:bg-white hover:text-stone-900 dark:hover:bg-[#2a241e] dark:hover:text-stone-100"
												:icon="passwordVisibility.confirm ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'"
												:aria-label="passwordVisibility.confirm ? t('profilePage.hidePassword') : t('profilePage.showPassword')"
												:title="passwordVisibility.confirm ? t('profilePage.hidePassword') : t('profilePage.showPassword')"
												@click="passwordVisibility.confirm = !passwordVisibility.confirm"
											/>
										</div>
									</div>
								</div>
							</div>
						</div>

						<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm dark:border-[#3a332a] dark:bg-[rgba(34,29,24,0.98)]">
							<div class="grid w-full grid-cols-2 gap-2">
								<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-key-20-solid" :loading="passwordPending" :spin-icon-on-loading="true" :block="true" class="order-2" @click="submitPassword">
									{{ t('profilePage.changePassword') }}
								</AppButton>
								<AppButton color="neutral" variant="soft" size="md" :block="true" class="order-1" @click="passwordModalOpen = false">
									{{ t('profilePage.cancel') }}
								</AppButton>
							</div>
						</div>
					</div>
				</AppResponsivePanel>
		</template>
	</AppSidebarShell>
</template>
