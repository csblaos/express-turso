<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type StoreRecord = {
	id: string;
	name: string;
	allow_negative_stock: number;
};

const { apiFetch } = useApiClient();
const { t } = useI18n();
const { currentUser, currentAccess, currentStoreId, can } = useAuthSession();
const appToast = useAppToast();

const storesPending = ref(true);
const storePending = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);

const stores = ref<Array<{ id: string; name: string }>>([]);
const selectedStoreId = ref("");
const storeName = ref("");
const authPermissionReady = ref(false);

const lockedStoreId = computed(() => (
	currentStoreId.value
	|| currentAccess.value?.store_id
	|| currentAccess.value?.memberships?.[0]?.store_id
	|| ""
));

const effectiveStoreId = computed(() => (
	selectedStoreId.value
	|| lockedStoreId.value
	|| stores.value[0]?.id
	|| ""
));

const isElevatedStoreManager = computed(() => (
	currentUser.value?.systemRole === "superadmin"
	|| currentUser.value?.systemRole === "system_admin"
));

const canUpdateStorePolicy = computed(() => isElevatedStoreManager.value || can("settings.stock_policy.update"));

const reloading = computed(() => storesPending.value || storePending.value);

const allowNegativeStock = ref(false);
const initialSnapshot = ref<{ storeId: string; allowNegativeStock: boolean } | null>(null);

const hasChanges = computed(() => (
	Boolean(initialSnapshot.value)
	&& (
		initialSnapshot.value!.storeId !== effectiveStoreId.value
		|| initialSnapshot.value!.allowNegativeStock !== allowNegativeStock.value
	)
));

const canSave = computed(() => (
	authPermissionReady.value
	&& canUpdateStorePolicy.value
	&& Boolean(effectiveStoreId.value)
	&& hasChanges.value
));

async function fetchStores() {
	storesPending.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<Array<{ id: string; name: string }>>>("/stores");
		stores.value = response.data;
		const nextLockedStoreId = lockedStoreId.value || stores.value[0]?.id || "";
		if (nextLockedStoreId) selectedStoreId.value = nextLockedStoreId;
	} finally {
		storesPending.value = false;
	}
}

async function hydrateFromStore() {
	if (!effectiveStoreId.value) return;
	storePending.value = true;
	error.value = null;
	try {
		const storeResponse = await apiFetch<ApiEnvelope<StoreRecord>>(`/stores/${encodeURIComponent(effectiveStoreId.value)}`);
		const store = storeResponse.data;
		storeName.value = store.name || "";
		allowNegativeStock.value = Boolean(Number(store.allow_negative_stock || 0));
		initialSnapshot.value = {
			storeId: effectiveStoreId.value,
			allowNegativeStock: allowNegativeStock.value,
		};
	} catch (err) {
		error.value = resolveApiErrorMessage(err, t("stockPolicyPage.loadFailed"));
	} finally {
		storePending.value = false;
	}
}

async function reloadAll() {
	error.value = null;
	await fetchStores();
	await hydrateFromStore();
}

async function savePolicy() {
	if (!canSave.value || saving.value) return;
	saving.value = true;
	error.value = null;
	try {
		await apiFetch<ApiEnvelope<StoreRecord>>(`/stores/${encodeURIComponent(effectiveStoreId.value)}`, {
			method: "PUT",
			body: {
				allow_negative_stock: allowNegativeStock.value ? 1 : 0,
			},
		});

		appToast.success({
			title: t("stockPolicyPage.saved"),
			description: allowNegativeStock.value ? t("stockPolicyPage.allowNegative") : t("stockPolicyPage.preventNegative"),
		});

		await hydrateFromStore();
	} catch (err) {
		const message = resolveApiErrorMessage(err, t("stockPolicyPage.saveFailed"));
		appToast.error({ title: t("stockPolicyPage.saveFailed"), description: message, timeout: 3200 });
		error.value = message;
	} finally {
		saving.value = false;
	}
}

watch([lockedStoreId, stores], () => {
	const nextStoreId = lockedStoreId.value || stores.value[0]?.id || "";
	if (nextStoreId && selectedStoreId.value !== nextStoreId) {
		selectedStoreId.value = nextStoreId;
	}
}, { immediate: true });

watch(effectiveStoreId, async (value) => {
	if (!value) return;
	await hydrateFromStore();
}, { immediate: true });

onMounted(async () => {
	authPermissionReady.value = true;
	try {
		await reloadAll();
	} catch (err) {
			error.value = resolveApiErrorMessage(err, t("stockPolicyPage.loadStoresFailed"));
	} finally {
		storesPending.value = false;
	}
});
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['settings']"
		:sidebar-eyebrow="t('stockPolicyPage.settings')"
		:sidebar-title="t('stockPolicyPage.title')"
		sidebar-compact-title="STK"
		:sidebar-description="t('stockPolicyPage.sidebarDescription')"
	>
		<template #default="{ openSidebar }">
			<div class="grid gap-3 pb-[calc(5.75rem+env(safe-area-inset-bottom))] lg:gap-4 lg:pb-3">
				<AppPageHeader
					class="hidden md:block"
					:description="t('stockPolicyPage.headerDescription')"
					:title-badge="false"
					compact
					@menu="openSidebar"
				>
					<div class="ml-auto hidden w-full flex-wrap justify-end gap-2 pt-0.5 md:w-auto md:flex">
						<AppButton
							color="neutral"
							variant="soft"
							size="md"
							icon="i-heroicons-arrow-path-20-solid"
							class="rounded-md"
							:aria-label="t('stockPolicyPage.reload')"
							:title="t('stockPolicyPage.reload')"
							:loading="reloading"
							:disabled="reloading"
							:spin-icon-on-loading="true"
							@click="reloadAll"
						>
							{{ reloading ? t('stockPolicyPage.loading') : t('stockPolicyPage.reload') }}
						</AppButton>
						<AppButton
							color="primary"
							variant="solid"
							size="md"
							icon="i-heroicons-check-20-solid"
							class="rounded-md"
							:loading="saving"
							:disabled="!canSave"
							:spin-icon-on-loading="true"
							@click="savePolicy"
						>
							{{ t('stockPolicyPage.save') }}
						</AppButton>
					</div>
				</AppPageHeader>

				<div class="grid gap-3 lg:pr-1">
					<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
						<div class="grid grid-cols-4 gap-2 p-0">
							<div class="col-span-2 min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center sm:col-span-1">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{{ t('stockPolicyPage.store') }}</p>
								<p class="mt-1 truncate text-base font-semibold text-stone-950" :title="storeName || ''">
									{{ storeName || "-" }}
								</p>
							</div>
							<div class="col-span-2 min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center sm:col-span-1">
								<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">
									{{ allowNegativeStock ? t('stockPolicyPage.allow') : t('stockPolicyPage.prevent') }}
								</p>
							</div>
							<div class="col-span-2 min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center sm:col-span-1">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{{ t('stockPolicyPage.affects') }}</p>
								<p class="mt-1 truncate text-base font-semibold text-stone-950 dark:text-stone-100" :title="t('stockPolicyPage.stockAdjustment')">
									{{ t('stockPolicyPage.stockAdjustment') }}
								</p>
							</div>
							<div class="col-span-2 min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center sm:col-span-1">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{{ t('stockPolicyPage.status') }}</p>
								<p class="mt-1 truncate text-base font-semibold text-stone-950 dark:text-stone-100" :title="t('stockPolicyPage.ready')">
									{{ t('stockPolicyPage.ready') }}
								</p>
							</div>
						</div>
					</UCard>

					<div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
						{{ error }}
					</div>

					<div class="rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">{{ t('stockPolicyPage.negativePolicy') }}</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">{{ t('stockPolicyPage.negativePolicyDescription') }}</p>
								</div>
								<UBadge
									:color="allowNegativeStock ? 'warning' : 'success'"
									variant="soft"
									:label="allowNegativeStock ? t('stockPolicyPage.allowNegative') : t('stockPolicyPage.preventNegative')"
								/>
							</div>

							<div class="space-y-4 px-4 py-4">
								<div class="grid gap-2 sm:grid-cols-2">
										<button
											type="button"
											class="group rounded-md border px-4 py-3 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-primary-200"
											:class="[
												!allowNegativeStock ? 'border-primary-400 bg-primary-50 dark:border-emerald-500/60 dark:bg-emerald-500/15' : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100/70 dark:border-stone-700 dark:bg-stone-800 dark:hover:bg-stone-700',
												(!canUpdateStorePolicy || storePending) ? 'opacity-60' : '',
											]"
										:disabled="!canUpdateStorePolicy || storePending"
										@click="allowNegativeStock = false"
										>
											<div class="flex items-start justify-between gap-3">
												<div>
													<p class="text-sm font-semibold text-stone-950">{{ t('stockPolicyPage.preventNegative') }}</p>
													<p class="mt-1 text-xs leading-5 text-stone-500">{{ t('stockPolicyPage.preventNegativeHint') }}</p>
												</div>
												<div class="mt-0.5 flex shrink-0 items-center gap-3">
													<span
														class="relative inline-flex h-6 w-6 items-center justify-center rounded-full border transition"
														:class="!allowNegativeStock
															? 'border-primary-400 bg-primary-600'
															: 'border-neutral-300 bg-white group-hover:border-neutral-400'"
													>
														<span v-if="!allowNegativeStock" class="h-3.5 w-3.5 text-white i-heroicons-check-20-solid" />
													</span>
													<UIcon name="i-heroicons-lock-closed-20-solid" class="h-5 w-5 text-stone-500" />
												</div>
											</div>
										</button>

										<button
											type="button"
											class="group rounded-md border px-4 py-3 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-primary-200"
											:class="[
												allowNegativeStock ? 'border-amber-400 bg-amber-50 dark:border-amber-500/60 dark:bg-amber-500/15' : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100/70 dark:border-stone-700 dark:bg-stone-800 dark:hover:bg-stone-700',
												(!canUpdateStorePolicy || storePending) ? 'opacity-60' : '',
											]"
										:disabled="!canUpdateStorePolicy || storePending"
										@click="allowNegativeStock = true"
										>
											<div class="flex items-start justify-between gap-3">
												<div>
													<p class="text-sm font-semibold text-stone-950">{{ t('stockPolicyPage.allowNegative') }}</p>
													<p class="mt-1 text-xs leading-5 text-stone-500">{{ t('stockPolicyPage.allowNegativeHint') }}</p>
												</div>
												<div class="mt-0.5 flex shrink-0 items-center gap-3">
													<span
														class="relative inline-flex h-6 w-6 items-center justify-center rounded-full border transition"
														:class="allowNegativeStock
															? 'border-amber-500 bg-amber-500'
															: 'border-neutral-300 bg-white group-hover:border-neutral-400'"
													>
														<span v-if="allowNegativeStock" class="h-3.5 w-3.5 text-white i-heroicons-check-20-solid" />
													</span>
													<UIcon name="i-heroicons-exclamation-triangle-20-solid" class="h-5 w-5 text-amber-700" />
												</div>
											</div>
										</button>
									</div>

								<div class="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
									<p class="font-semibold dark:text-amber-100">{{ t('stockPolicyPage.recommendation') }}</p>
									<p class="mt-1 text-xs leading-5 text-amber-900/90 dark:text-amber-200">{{ t('stockPolicyPage.recommendationHint') }}</p>
								</div>

								<div class="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-stone-700">
									{{ t('stockPolicyPage.preventNegativeNote') }}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div class="fixed inset-x-0 bottom-0 z-[70] border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.08)] backdrop-blur-sm md:hidden">
				<div class="mx-auto grid max-w-3xl grid-cols-2 gap-2">
					<AppButton
						color="neutral"
						variant="soft"
						size="md"
						icon="i-heroicons-arrow-path-20-solid"
						:loading="reloading"
						:disabled="saving || reloading"
						:spin-icon-on-loading="true"
						:block="true"
						@click="reloadAll"
					>
						{{ reloading ? t('stockPolicyPage.loading') : t('stockPolicyPage.reload') }}
					</AppButton>
					<AppButton
						color="primary"
						variant="solid"
						size="md"
						icon="i-heroicons-check-20-solid"
						:loading="saving"
						:disabled="!canSave"
						:spin-icon-on-loading="true"
						:block="true"
						@click="savePolicy"
					>
						{{ t('stockPolicyPage.save') }}
					</AppButton>
				</div>
			</div>
		</template>
	</AppSidebarShell>
</template>
