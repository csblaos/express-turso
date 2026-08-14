<script setup lang="ts">
import { CircleDollarSign } from "@lucide/vue";
import { appNavItems } from "~/utils/app-nav";
import { getCurrencySymbol, normalizeCurrencyCode, type CurrencyCode } from "~/utils/currency";

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type StoreRecord = {
	id: string;
	name: string;
	currency: string;
	supported_currencies: string;
	cost_method: string;
	vat_enabled: number;
	vat_rate: number;
	vat_mode: string;
};

type StoreCostMethodHistoryItem = {
	id: string;
	store_id: string;
	cost_method: string;
	actor_user_id: string | null;
	occurred_at: string;
};

const { apiFetch } = useApiClient();
const { t, locale } = useI18n();
const { currentUser, currentAccess, currentStoreId, can } = useAuthSession();
const appToast = useAppToast();

const CURRENCY_OPTIONS = computed<Array<{ code: CurrencyCode; label: string; hint: string }>>(() => [
	{ code: "LAK", label: "LAK", hint: t("storeFinancePage.currency.lak") },
	{ code: "THB", label: "THB", hint: t("storeFinancePage.currency.thb") },
	{ code: "USD", label: "USD", hint: t("storeFinancePage.currency.usd") },
]);
const COST_METHOD_OPTIONS = computed(() => [
	{ id: "average" as const, label: t("storeFinancePage.finance.average"), hint: t("storeFinancePage.finance.averageHint") },
	{ id: "fifo" as const, label: "FIFO", hint: t("storeFinancePage.finance.fifoHint") },
]);

const storesPending = ref(true);
const storePending = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);

const stores = ref<StoreRecord[]>([]);
const selectedStoreId = ref("");
const authPermissionReady = ref(false);
const reloading = computed(() => storesPending.value || storePending.value);
const dateTimeFormatter = computed(() => new Intl.DateTimeFormat(locale.value === "lo" ? "lo-LA" : locale.value === "en" ? "en-US" : "th-TH", { dateStyle: "medium", timeStyle: "short" }));

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

const selectedStore = computed(() => stores.value.find((store) => store.id === effectiveStoreId.value) || null);

const isElevatedStoreManager = computed(() => (
	currentUser.value?.systemRole === "superadmin"
	|| currentUser.value?.systemRole === "system_admin"
));

const canUpdateStoreFinance = computed(() => isElevatedStoreManager.value || can("settings.finance.update"));

const baseCurrency = ref<CurrencyCode>("LAK");
const costMethod = ref<"average" | "fifo">("average");
const vatEnabled = ref(false);
const vatRate = ref("7");
const vatMode = ref<"EXCLUSIVE" | "INCLUSIVE">("EXCLUSIVE");
const supportedCurrencies = reactive<Record<CurrencyCode, boolean>>({
	LAK: true,
	THB: false,
	USD: false,
});
const costMethodHistory = ref<StoreCostMethodHistoryItem[]>([]);

const initialSnapshot = ref<{
	storeId: string;
	baseCurrency: CurrencyCode;
	costMethod: "average" | "fifo";
	vatEnabled: boolean;
	vatRate: string;
	vatMode: "EXCLUSIVE" | "INCLUSIVE";
	supported: Record<CurrencyCode, boolean>;
} | null>(null);

function resolveApiErrorMessage(errorValue: unknown, fallback = t("storeFinancePage.rates.tryAgain")) {
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

function parseSupportedCurrencies(raw: string): CurrencyCode[] {
	const input = String(raw || "").trim();
	if (!input) return [];
	return input
		.split(",")
		.map((part) => part.trim().toUpperCase())
		.filter(Boolean)
		.filter((code): code is CurrencyCode => code === "LAK" || code === "THB" || code === "USD");
}

function stringifySupportedCurrencies(value: Record<CurrencyCode, boolean>, base: CurrencyCode): string {
	const enabled = CURRENCY_OPTIONS.value
		.map((item) => item.code)
		.filter((code) => value[code] || code === base);
	const unique = Array.from(new Set([ base, ...enabled ]));
	return unique.join(",");
}

function normalizeVatRateInput(raw: string) {
	const input = String(raw ?? "").trim();
	if (!input) return "";

	let normalized = input.replace(/\s+/g, "");
	normalized = normalized.replace(/,/g, "");
	normalized = normalized.replace(/[^0-9.]/g, "");

	const firstDot = normalized.indexOf(".");
	if (firstDot !== -1) {
		normalized = normalized.slice(0, firstDot + 1) + normalized.slice(firstDot + 1).replace(/\./g, "");
	}

	return normalized;
}

function vatRateToNumber(raw: string) {
	const normalized = normalizeVatRateInput(raw);
	if (!normalized) return 0;
	const value = Number(normalized);
	return Number.isFinite(value) ? value : 0;
}

function formatVatRateForInput(value: number) {
	if (!Number.isFinite(value)) return "0";
	const normalized = value > 100 ? value / 100 : value;
	return String(normalized);
}

const enabledCurrencies = computed(() => {
	const list = CURRENCY_OPTIONS.value.map((item) => item.code).filter((code) => supportedCurrencies[code] || code === baseCurrency.value);
	return Array.from(new Set([ baseCurrency.value, ...list ])) as CurrencyCode[];
});

const hasChanges = computed(() => {
	if (!initialSnapshot.value) return false;
	if (initialSnapshot.value.storeId !== effectiveStoreId.value) return true;
	if (initialSnapshot.value.baseCurrency !== baseCurrency.value) return true;
	if (initialSnapshot.value.costMethod !== costMethod.value) return true;
	if (initialSnapshot.value.vatEnabled !== vatEnabled.value) return true;
	if (initialSnapshot.value.vatMode !== vatMode.value) return true;
	if (vatRateToNumber(initialSnapshot.value.vatRate) !== vatRateToNumber(vatRate.value)) return true;
	for (const option of CURRENCY_OPTIONS.value) {
		const code = option.code;
		if (initialSnapshot.value.supported[code] !== supportedCurrencies[code]) return true;
	}
	return false;
});

const canSave = computed(() => (
	authPermissionReady.value
	&& canUpdateStoreFinance.value
	&& Boolean(effectiveStoreId.value)
	&& hasChanges.value
));

function ensureBaseCurrencySelected() {
	for (const option of CURRENCY_OPTIONS.value) {
		supportedCurrencies[option.code] = supportedCurrencies[option.code] || option.code === baseCurrency.value;
	}
}

async function fetchStores() {
	storesPending.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<StoreRecord[]>>("/stores");
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
		const [ storeResponse, historyResponse ] = await Promise.all([
			apiFetch<ApiEnvelope<StoreRecord>>(`/stores/${encodeURIComponent(effectiveStoreId.value)}`),
			apiFetch<ApiEnvelope<StoreCostMethodHistoryItem[]>>(`/stores/${encodeURIComponent(effectiveStoreId.value)}/cost-method/history?limit=10`).catch(() => null),
		]);
		const store = storeResponse.data;
		baseCurrency.value = normalizeCurrencyCode(store.currency) || "LAK";
		costMethod.value = store.cost_method === "fifo" ? "fifo" : "average";
		vatEnabled.value = Boolean(store.vat_enabled);
		vatRate.value = formatVatRateForInput(Number(store.vat_rate || 0));
		vatMode.value = String(store.vat_mode || "EXCLUSIVE").toUpperCase() === "INCLUSIVE"
			? "INCLUSIVE"
			: "EXCLUSIVE";

		const supported = parseSupportedCurrencies(store.supported_currencies);
		for (const option of CURRENCY_OPTIONS.value) {
			supportedCurrencies[option.code] = supported.includes(option.code) || option.code === baseCurrency.value;
		}
		ensureBaseCurrencySelected();

		costMethodHistory.value = historyResponse?.data && Array.isArray(historyResponse.data) ? historyResponse.data : [];

		initialSnapshot.value = {
			storeId: effectiveStoreId.value,
			baseCurrency: baseCurrency.value,
			costMethod: costMethod.value,
			vatEnabled: vatEnabled.value,
			vatRate: vatRate.value,
			vatMode: vatMode.value,
			supported: { ...supportedCurrencies },
		};
	} catch (err) {
		error.value = resolveApiErrorMessage(err, t("storeFinancePage.finance.loadFailed"));
	} finally {
		storePending.value = false;
	}
}

function toggleSupportedCurrency(code: CurrencyCode) {
	if (code === baseCurrency.value) return;
	supportedCurrencies[code] = !supportedCurrencies[code];
}

function selectBaseCurrency(code: CurrencyCode) {
	if (baseCurrency.value === code) return;
	baseCurrency.value = code;
	ensureBaseCurrencySelected();
}

function selectCostMethod(method: "average" | "fifo") {
	costMethod.value = method;
}

async function saveStoreFinance() {
	if (!selectedStore.value || !canSave.value || saving.value) return;
	saving.value = true;
	error.value = null;
	try {
		ensureBaseCurrencySelected();
		const supportedCsv = stringifySupportedCurrencies(supportedCurrencies, baseCurrency.value);
		const normalizedVatRate = vatRateToNumber(vatRate.value);

		await apiFetch<ApiEnvelope<StoreRecord>>(`/stores/${encodeURIComponent(selectedStore.value.id)}`, {
			method: "PUT",
			body: {
				currency: baseCurrency.value,
				cost_method: costMethod.value,
				supported_currencies: supportedCsv,
				vat_enabled: vatEnabled.value ? 1 : 0,
				vat_rate: Number(normalizedVatRate || 0),
				vat_mode: vatMode.value,
			},
		});

		appToast.success({
			title: t("storeFinancePage.finance.saved"),
			description: t("storeFinancePage.rates.savedDescription", { store: selectedStore.value.name, currency: baseCurrency.value }),
		});

		await hydrateFromStore();
	} catch (err) {
		const message = resolveApiErrorMessage(err);
		appToast.error({ title: t("storeFinancePage.rates.saveFailed"), description: message, timeout: 3200 });
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
		await fetchStores();
	} catch (err) {
		error.value = resolveApiErrorMessage(err, t("storeFinancePage.rates.loadStoresFailed"));
	} finally {
		storesPending.value = false;
	}
});
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['settings']"
		:sidebar-eyebrow="t('storeFinancePage.rates.settings')"
		:sidebar-title="t('storeFinancePage.finance.title')"
		:sidebar-compact-title="t('storeFinancePage.finance.compactTitle')"
		:sidebar-description="t('storeFinancePage.finance.sidebarDescription')"
	>
		<template #default="{ openSidebar }">
			<div class="grid gap-3 pb-[calc(5.75rem+env(safe-area-inset-bottom))] lg:gap-4 lg:pb-3">
				<div class="hidden md:block">
					<AppPageHeader
						title=""
						:description="t('storeFinancePage.finance.headerDescription')"
						:title-badge="false"
						compact
						@menu="openSidebar"
						>
							<template #actions>
								<div class="ml-auto hidden w-full flex-wrap justify-end gap-2 pt-0.5 md:flex md:w-auto">
									<AppButton
										color="neutral"
										variant="soft"
										size="md"
										icon="i-heroicons-arrow-path-20-solid"
										:loading="reloading"
										:spin-icon-on-loading="true"
										:disabled="saving || reloading"
										@click="hydrateFromStore"
									>
										{{ reloading ? t('storeFinancePage.rates.loading') : t('storeFinancePage.finance.refresh') }}
									</AppButton>
									<AppButton
										color="primary"
										variant="solid"
										size="md"
										icon="i-heroicons-check-20-solid"
										class="rounded-md"
										:loading="saving"
										:spin-icon-on-loading="true"
										:disabled="!canSave"
										@click="saveStoreFinance"
									>
										{{ t('storeFinancePage.rates.save') }}
									</AppButton>
								</div>
							</template>
						</AppPageHeader>
				</div>

				<div class="grid gap-3 lg:pr-1">
					<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
						<div class="grid grid-cols-4 gap-2 p-0">
							<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{{ t('storeFinancePage.rates.store') }}</p>
								<p class="mt-1 truncate text-base font-semibold text-stone-950" :title="selectedStore?.name || ''">
									{{ selectedStore?.name || "-" }}
								</p>
							</div>
							<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{{ t('storeFinancePage.rates.base') }}</p>
								<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">{{ baseCurrency }}</p>
							</div>
							<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{{ t('storeFinancePage.rates.supported') }}</p>
								<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">{{ enabledCurrencies.length }}</p>
							</div>
							<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{{ t('storeFinancePage.finance.cost') }}</p>
								<p class="mt-1 truncate text-base font-semibold text-stone-950" :title="costMethod === 'fifo' ? 'FIFO' : t('storeFinancePage.finance.average')">
									{{ costMethod === 'fifo' ? 'FIFO' : t('storeFinancePage.finance.averageShort') }}
								</p>
							</div>
						</div>
					</UCard>

					<div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
						{{ error }}
					</div>

					<div class="rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex flex-col">
							<div class="flex shrink-0 flex-col gap-3 border-b border-[#ece6dc] px-4 py-3 md:flex-row md:items-center md:justify-between lg:flex-row lg:items-center lg:justify-between">
								<div class="flex items-start gap-3">
									<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200">
										<CircleDollarSign class="h-5 w-5" />
									</div>
									<div>
										<p class="text-sm font-semibold text-stone-950 dark:text-stone-50">{{ t('storeFinancePage.rates.title') }}</p>
										<p class="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
											{{ t('storeFinancePage.finance.ratesDescription') }}
										</p>
									</div>
								</div>
								<AppButton
									color="primary"
									variant="solid"
									size="md"
									class="rounded-md justify-center"
									:disabled="!effectiveStoreId"
									to="/settings/store-finance/rates"
								>
									<span class="inline-flex items-center justify-center gap-2">
										<CircleDollarSign class="h-4 w-4" />
										<span>{{ t('storeFinancePage.finance.manageRates') }}</span>
									</span>
								</AppButton>
							</div>
							<div class="space-y-3 px-4 py-4">
								<div class="rounded-md border border-dashed border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-stone-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-stone-200">
									{{ t('storeFinancePage.finance.ratesHint') }}
								</div>
							</div>
						</div>
					</div>

					<div class="rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">{{ t('storeFinancePage.finance.vatTitle') }}</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">{{ t('storeFinancePage.finance.vatDescription') }}</p>
								</div>
								<UBadge color="neutral" variant="soft" :label="vatEnabled ? t('storeFinancePage.finance.enabled') : t('storeFinancePage.finance.disabled')" />
							</div>

							<div class="space-y-4 px-4 py-4">
								<div class="grid gap-3 lg:grid-cols-3">
									<div class="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 lg:col-span-1">
										<div class="flex items-center justify-between gap-4">
										<div class="min-w-0">
											<p class="text-sm font-semibold text-stone-900">{{ t('storeFinancePage.finance.enableVat') }}</p>
											<p class="mt-1 text-xs leading-5 text-stone-500">{{ t('storeFinancePage.finance.enableVatHint') }}</p>
										</div>
											<button
												type="button"
												class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition"
												:class="vatEnabled ? 'bg-primary-600' : 'bg-stone-200'"
												:disabled="!canUpdateStoreFinance || storePending || storesPending"
												@click="vatEnabled = !vatEnabled"
											>
												<span
													class="inline-block h-5 w-5 rounded-full bg-white shadow-sm transition"
													:class="vatEnabled ? 'translate-x-5' : 'translate-x-0.5'"
												/>
											</button>
										</div>
									</div>

									<div class="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 lg:col-span-1">
										<div class="flex items-start justify-between gap-4">
											<div class="min-w-0">
												<p class="text-sm font-semibold text-stone-900">{{ t('storeFinancePage.finance.vatRate') }}</p>
												<p class="mt-1 text-xs leading-5 text-stone-500">{{ t('storeFinancePage.finance.vatRateHint') }}</p>
											</div>
										</div>
										<div class="mt-3">
											<UInput
												v-model="vatRate"
												size="lg"
												color="neutral"
												type="text"
												inputmode="decimal"
												placeholder="7"
												class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
											/>
										</div>
									</div>

									<div class="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 lg:col-span-1">
										<div class="flex items-start justify-between gap-4">
											<div class="min-w-0">
												<p class="text-sm font-semibold text-stone-900">{{ t('storeFinancePage.finance.vatMode') }}</p>
												<p class="mt-1 text-xs leading-5 text-stone-500">{{ t('storeFinancePage.finance.vatModeHint') }}</p>
											</div>
										</div>
										<div class="mt-3 grid grid-cols-2 gap-2">
											<button
												type="button"
												class="rounded-md border px-3 py-2 text-sm font-semibold transition"
												:class="vatMode === 'EXCLUSIVE'
													? 'border-primary-300 bg-primary-50 text-primary-700 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-100'
													: 'border-neutral-200 bg-white text-stone-600 hover:bg-neutral-50'"
												:disabled="!canUpdateStoreFinance || storePending || storesPending"
												@click="vatMode = 'EXCLUSIVE'"
											>
												{{ t('storeFinancePage.finance.exclusiveVat') }}
											</button>
											<button
												type="button"
												class="rounded-md border px-3 py-2 text-sm font-semibold transition"
												:class="vatMode === 'INCLUSIVE'
													? 'border-primary-300 bg-primary-50 text-primary-700 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-100'
													: 'border-neutral-200 bg-white text-stone-600 hover:bg-neutral-50'"
												:disabled="!canUpdateStoreFinance || storePending || storesPending"
												@click="vatMode = 'INCLUSIVE'"
											>
												{{ t('storeFinancePage.finance.inclusiveVat') }}
											</button>
										</div>
									</div>
								</div>

								<div class="rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-4 py-3 text-xs leading-5 text-stone-500">
									{{ t('storeFinancePage.finance.vatNote') }}
								</div>
							</div>
						</div>
					</div>

					<div class="rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">{{ t('storeFinancePage.finance.costMethod') }}</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">{{ t('storeFinancePage.finance.costMethodDescription') }}</p>
								</div>
								<UBadge color="neutral" variant="soft" :label="costMethod === 'fifo' ? 'FIFO' : t('storeFinancePage.finance.averageShort')" />
							</div>

						<div class="space-y-3 px-4 py-4">
							<div class="grid gap-2 sm:grid-cols-2">
								<button
									v-for="option in COST_METHOD_OPTIONS"
									:key="option.id"
									type="button"
									class="group rounded-md border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-70"
									:class="costMethod === option.id
										? 'border-primary-300 bg-primary-50 ring-1 ring-primary-200 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:ring-emerald-400/30'
										: 'border-neutral-200 bg-neutral-50 hover:border-neutral-300 hover:bg-neutral-100/70'"
									:disabled="!canUpdateStoreFinance || storePending || storesPending"
									@click="selectCostMethod(option.id)"
								>
									<div class="flex items-start justify-between gap-4">
										<div class="min-w-0">
											<p class="text-sm font-semibold text-stone-900">{{ option.label }}</p>
											<p class="mt-1 text-xs leading-5 text-stone-500">{{ option.hint }}</p>
										</div>
										<div
											class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition"
											:class="costMethod === option.id
												? 'border-primary-500 bg-primary-600 text-white dark:border-emerald-400 dark:bg-emerald-500 dark:text-emerald-950'
												: 'border-neutral-300 bg-white group-hover:border-neutral-400'"
										>
											<UIcon v-if="costMethod === option.id" name="i-heroicons-check-20-solid" class="h-3.5 w-3.5" />
										</div>
									</div>
								</button>
							</div>
							<p class="text-xs leading-5 text-stone-500">
								{{ t('storeFinancePage.finance.costRecommendation') }}
							</p>

							<div class="rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-4 py-3">
								<div class="flex items-center justify-between gap-2">
									<h4 class="text-sm font-semibold text-stone-950">{{ t('storeFinancePage.finance.history') }}</h4>
									<UBadge color="neutral" variant="soft" :label="t('storeFinancePage.rates.itemCount', { count: costMethodHistory.length })" />
								</div>
								<div v-if="costMethodHistory.length" class="mt-3 space-y-2">
									<div v-for="item in costMethodHistory" :key="item.id" class="rounded-md bg-white px-3 py-2 ring-1 ring-neutral-200">
										<div class="flex items-center justify-between gap-3">
											<div>
												<p class="text-sm font-medium text-stone-900">{{ item.cost_method === 'fifo' ? 'FIFO' : t('storeFinancePage.finance.average') }}</p>
												<p class="mt-0.5 text-xs text-stone-500">{{ item.actor_user_id || t('storeFinancePage.finance.system') }} · {{ dateTimeFormatter.format(new Date(item.occurred_at)) }}</p>
											</div>
										</div>
									</div>
								</div>
								<div v-else class="mt-3 text-sm text-stone-500">{{ t('storeFinancePage.finance.noHistory') }}</div>
							</div>
						</div>
					</div>
				</div>

					<div class="rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">{{ t('storeFinancePage.finance.baseCurrency') }}</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">{{ t('storeFinancePage.finance.baseCurrencyDescription') }}</p>
								</div>
								<UBadge color="neutral" variant="soft" :label="t('storeFinancePage.finance.selectOne')" />
							</div>

									<div class="space-y-4 px-4 py-4">
										<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
											<button
												v-for="option in CURRENCY_OPTIONS"
												:key="option.code"
											type="button"
											class="group flex w-full items-start justify-between gap-4 rounded-md border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-70"
											:class="baseCurrency === option.code
												? 'border-primary-300 bg-primary-50 dark:border-emerald-400/40 dark:bg-emerald-500/15'
												: 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100/70'"
											:disabled="!canUpdateStoreFinance || storePending || storesPending"
											@click="selectBaseCurrency(option.code)"
											>
												<div class="min-w-0">
													<p class="text-sm font-semibold text-stone-900">
														{{ option.label }}
														<span class="ml-1 text-stone-400">{{ getCurrencySymbol(option.code) }}</span>
													</p>
													<p class="mt-1 text-xs leading-5 text-stone-500">{{ option.hint }}</p>
												</div>

										<div class="mt-0.5 flex shrink-0 items-center gap-2">
											<span class="text-xs font-semibold text-stone-500 tabular-nums">{{ t('storeFinancePage.rates.base') }}</span>
											<span
												class="relative inline-flex h-6 w-6 items-center justify-center rounded-full border transition"
												:class="baseCurrency === option.code
													? 'border-primary-400 bg-primary-600 dark:border-emerald-400 dark:bg-emerald-500'
													: 'border-neutral-300 bg-white group-hover:border-neutral-400'"
											>
													<span v-if="baseCurrency === option.code" class="h-3.5 w-3.5 text-white i-heroicons-check-20-solid" />
												</span>
											</div>
										</button>
									</div>
									<p class="text-xs leading-5 text-stone-500">
									{{ t('storeFinancePage.finance.baseCurrencyHint') }}
									</p>
								</div>
							</div>
						</div>

					<div class="rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">{{ t('storeFinancePage.finance.supportedCurrencies') }}</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">{{ t('storeFinancePage.finance.supportedCurrenciesDescription') }}</p>
								</div>
							</div>

							<div class="space-y-2 px-4 py-4">
								<div
									v-for="option in CURRENCY_OPTIONS"
									:key="option.code"
									class="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3"
								>
										<div class="flex items-start justify-between gap-4">
											<div class="min-w-0">
												<p class="text-sm font-semibold text-stone-900">
													{{ option.label }}
													<span class="ml-1 text-stone-400">{{ getCurrencySymbol(option.code) }}</span>
												</p>
												<p class="mt-1 text-xs leading-5 text-stone-500">{{ option.hint }}</p>
											</div>
										<button
											type="button"
											class="relative inline-flex shrink-0 items-center"
											:class="option.code === baseCurrency || !canUpdateStoreFinance || storePending || storesPending ? 'cursor-not-allowed' : 'cursor-pointer'"
											:disabled="option.code === baseCurrency || !canUpdateStoreFinance || storePending || storesPending"
											:aria-pressed="supportedCurrencies[option.code] || option.code === baseCurrency"
											@click="toggleSupportedCurrency(option.code)"
										>
											<span
												class="h-6 w-11 rounded-full transition"
												:class="supportedCurrencies[option.code] || option.code === baseCurrency ? 'bg-emerald-500 shadow-inner ring-1 ring-emerald-600/20' : 'bg-stone-200 ring-1 ring-stone-300/70'"
											/>
											<span
												class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition"
												:class="supportedCurrencies[option.code] || option.code === baseCurrency ? 'translate-x-5' : 'translate-x-0'"
											/>
										</button>
									</div>
								</div>
								<p class="text-xs leading-5 text-stone-500">
									{{ t('storeFinancePage.finance.supportedCurrenciesNote') }}
								</p>
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
						:spin-icon-on-loading="true"
						:disabled="saving || reloading"
						:block="true"
						@click="hydrateFromStore"
					>
						{{ reloading ? t('storeFinancePage.rates.loading') : t('storeFinancePage.finance.refresh') }}
					</AppButton>
					<AppButton
						color="primary"
						variant="solid"
						size="md"
						icon="i-heroicons-check-20-solid"
						:loading="saving"
						:spin-icon-on-loading="true"
						:disabled="!canSave"
						:block="true"
						@click="saveStoreFinance"
					>
						{{ t('storeFinancePage.rates.save') }}
					</AppButton>
				</div>
			</div>
		</template>
	</AppSidebarShell>
</template>
