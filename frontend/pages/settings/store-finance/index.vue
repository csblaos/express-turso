<script setup lang="ts">
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
	vat_enabled: number;
	vat_rate: number;
	vat_mode: string;
};

const CURRENCY_OPTIONS: Array<{ code: CurrencyCode; label: string; hint: string }> = [
	{ code: "LAK", label: "LAK", hint: "กีบ (Lao Kip)" },
	{ code: "THB", label: "THB", hint: "บาท (Thai Baht)" },
	{ code: "USD", label: "USD", hint: "ดอลลาร์ (US Dollar)" },
];

const { apiFetch } = useApiClient();
const { currentUser, currentAccess, currentStoreId, can } = useAuthSession();
const appToast = useAppToast();

const storesPending = ref(true);
const storePending = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);

const stores = ref<StoreRecord[]>([]);
const selectedStoreId = ref("");
const authPermissionReady = ref(false);
const reloading = computed(() => storesPending.value || storePending.value);

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

const canUpdateStoreFinance = computed(() => isElevatedStoreManager.value || can("settings.store.update"));

const baseCurrency = ref<CurrencyCode>("LAK");
const supportedCurrencies = reactive<Record<CurrencyCode, boolean>>({
	LAK: true,
	THB: false,
	USD: false,
});

const initialSnapshot = ref<{
	storeId: string;
	baseCurrency: CurrencyCode;
	supported: Record<CurrencyCode, boolean>;
} | null>(null);

function resolveApiErrorMessage(errorValue: unknown, fallback = "โปรดลองอีกครั้ง") {
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
	const enabled = CURRENCY_OPTIONS
		.map((item) => item.code)
		.filter((code) => value[code] || code === base);
	const unique = Array.from(new Set([ base, ...enabled ]));
	return unique.join(",");
}

const enabledCurrencies = computed(() => {
	const list = CURRENCY_OPTIONS.map((item) => item.code).filter((code) => supportedCurrencies[code] || code === baseCurrency.value);
	return Array.from(new Set([ baseCurrency.value, ...list ])) as CurrencyCode[];
});

const hasChanges = computed(() => {
	if (!initialSnapshot.value) return false;
	if (initialSnapshot.value.storeId !== effectiveStoreId.value) return true;
	if (initialSnapshot.value.baseCurrency !== baseCurrency.value) return true;
	for (const option of CURRENCY_OPTIONS) {
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
	for (const option of CURRENCY_OPTIONS) {
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
			const storeResponse = await apiFetch<ApiEnvelope<StoreRecord>>(`/stores/${encodeURIComponent(effectiveStoreId.value)}`);
			const store = storeResponse.data;
			baseCurrency.value = normalizeCurrencyCode(store.currency) || "LAK";

		const supported = parseSupportedCurrencies(store.supported_currencies);
		for (const option of CURRENCY_OPTIONS) {
			supportedCurrencies[option.code] = supported.includes(option.code) || option.code === baseCurrency.value;
		}
		ensureBaseCurrencySelected();

		initialSnapshot.value = {
			storeId: effectiveStoreId.value,
			baseCurrency: baseCurrency.value,
			supported: { ...supportedCurrencies },
		};
	} catch (err) {
		error.value = resolveApiErrorMessage(err, "โหลดข้อมูล Store Finance ไม่สำเร็จ");
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

async function saveStoreFinance() {
	if (!selectedStore.value || !canSave.value || saving.value) return;
	saving.value = true;
	error.value = null;
	try {
		ensureBaseCurrencySelected();
		const supportedCsv = stringifySupportedCurrencies(supportedCurrencies, baseCurrency.value);

		await apiFetch<ApiEnvelope<StoreRecord>>(`/stores/${encodeURIComponent(selectedStore.value.id)}`, {
			method: "PUT",
			body: {
				currency: baseCurrency.value,
				supported_currencies: supportedCsv,
			},
		});

		appToast.success({
			title: "บันทึก Store Finance แล้ว",
			description: `${selectedStore.value.name} • base ${baseCurrency.value}`,
		});

		await hydrateFromStore();
	} catch (err) {
		const message = resolveApiErrorMessage(err);
		appToast.error({ title: "บันทึกไม่สำเร็จ", description: message, timeout: 3200 });
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
		error.value = resolveApiErrorMessage(err, "โหลดร้านไม่สำเร็จ");
	} finally {
		storesPending.value = false;
	}
});
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['settings']"
		sidebar-eyebrow="Settings"
		sidebar-title="Store Finance"
		sidebar-compact-title="FIN"
		sidebar-description="ตั้งค่า base currency และสกุลเงินที่รองรับสำหรับ POS"
	>
		<template #default="{ openSidebar }">
			<div class="grid gap-3 pb-3 lg:gap-4">
					<AppPageHeader
						title="Store Finance"
						description="กำหนดสกุลเงินหลักของร้าน และเปิดรับเงินหลายสกุลใน POS"
						@menu="openSidebar"
					>
						<div class="ml-auto flex w-full flex-wrap justify-end gap-2 pt-2 md:w-auto">
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
									{{ reloading ? "กำลังโหลด" : "รีโหลด" }}
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
							บันทึก
						</AppButton>
					</div>
				</AppPageHeader>

				<div class="grid gap-3 lg:pr-1">
					<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
						<div class="grid grid-cols-4 gap-2 p-0">
							<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">ร้าน</p>
								<p class="mt-1 truncate text-base font-semibold text-stone-950" :title="selectedStore?.name || ''">
									{{ selectedStore?.name || "-" }}
								</p>
							</div>
							<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Base</p>
								<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">{{ baseCurrency }}</p>
							</div>
							<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">รองรับ</p>
								<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">{{ enabledCurrencies.length }}</p>
							</div>
							<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Rates</p>
								<p class="mt-1 truncate text-base font-semibold text-stone-950" title="แยกหน้า">แยกหน้า</p>
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
									<p class="text-sm font-semibold text-stone-950">อัตราแลกเปลี่ยน</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">แยกหน้าเพื่ออัปเดตเรทรายวันได้สะดวก และลดความสับสนในหน้าตั้งค่าร้าน</p>
									</div>
									<AppButton
										color="neutral"
										variant="soft"
										size="md"
										icon="i-heroicons-arrows-right-left-20-solid"
										class="rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 hover:text-emerald-800"
										:disabled="!effectiveStoreId"
										to="/settings/store-finance/rates"
									>
										จัดการเรท
									</AppButton>
							</div>
							<div class="space-y-3 px-4 py-4">
								<div class="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-stone-700">
									ไปหน้า “จัดการเรท” เพื่อกำหนดอัตราแลกเปลี่ยนของสกุลเงินที่เปิดใช้งานไว้
								</div>
							</div>
						</div>
					</div>

						<div class="rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
							<div class="flex flex-col">
								<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
									<div>
										<p class="text-sm font-semibold text-stone-950">สกุลเงินหลัก (Base currency)</p>
										<p class="mt-1 hidden text-xs text-stone-500 lg:block">ใช้เป็นสกุลเงินหลักในการคิดยอดขายและรายงาน</p>
									</div>
									<UBadge color="neutral" variant="soft" label="เลือกได้ 1" />
								</div>

									<div class="space-y-4 px-4 py-4">
										<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
											<button
												v-for="option in CURRENCY_OPTIONS"
												:key="option.code"
											type="button"
											class="group flex w-full items-start justify-between gap-4 rounded-md border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-70"
											:class="baseCurrency === option.code
												? 'border-primary-300 bg-primary-50'
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
												<span class="text-xs font-semibold text-stone-500 tabular-nums">Base</span>
												<span
													class="relative inline-flex h-6 w-6 items-center justify-center rounded-full border transition"
													:class="baseCurrency === option.code
														? 'border-primary-400 bg-primary-600'
														: 'border-neutral-300 bg-white group-hover:border-neutral-400'"
												>
													<span v-if="baseCurrency === option.code" class="h-3.5 w-3.5 text-white i-heroicons-check-20-solid" />
												</span>
											</div>
										</button>
									</div>
									<p class="text-xs leading-5 text-stone-500">
										แนะนำให้ตั้ง Base เป็นสกุลเงินที่ใช้ทำบัญชีหลักของร้าน (เช่น LAK สำหรับร้านในลาว)
									</p>
								</div>
							</div>
						</div>

					<div class="rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">รองรับหลายสกุลเงิน</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">เปิด/ปิดสกุลเงินที่อนุญาตให้รับเงินใน POS</p>
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
										<label class="relative inline-flex shrink-0 cursor-pointer items-center">
											<input
												:checked="supportedCurrencies[option.code] || option.code === baseCurrency"
												type="checkbox"
												class="peer sr-only"
												:disabled="option.code === baseCurrency || !canUpdateStoreFinance"
												@change="toggleSupportedCurrency(option.code)"
											>
											<span class="h-6 w-11 rounded-full bg-stone-200 transition peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-200 peer-checked:bg-primary-600 peer-disabled:opacity-70" />
											<span class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5 peer-disabled:opacity-80" />
										</label>
									</div>
								</div>
								<p class="text-xs leading-5 text-stone-500">
									หมายเหตุ: Base currency จะถูกเปิดไว้เสมอ และไม่สามารถปิดได้
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</template>
	</AppSidebarShell>
</template>
