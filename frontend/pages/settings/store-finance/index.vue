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

const CURRENCY_OPTIONS: Array<{ code: CurrencyCode; label: string; hint: string }> = [
	{ code: "LAK", label: "LAK", hint: "กีบ (Lao Kip)" },
	{ code: "THB", label: "THB", hint: "บาท (Thai Baht)" },
	{ code: "USD", label: "USD", hint: "ดอลลาร์ (US Dollar)" },
];

const COST_METHOD_OPTIONS = [
	{ id: "average", label: "ต้นทุนเฉลี่ย", hint: "ใช้งานง่าย เหมาะกับ POS และรายงานทั่วไป" },
	{ id: "fifo", label: "FIFO", hint: "ตัดสินค้าตามลำดับซื้อก่อน-หลัง เหมาะกับการคุมต้นทุนละเอียด" },
] as const;

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
const dateTimeFormatter = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" });

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
const costMethod = ref<(typeof COST_METHOD_OPTIONS)[number]["id"]>("average");
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
	costMethod: (typeof COST_METHOD_OPTIONS)[number]["id"];
	vatEnabled: boolean;
	vatRate: string;
	vatMode: "EXCLUSIVE" | "INCLUSIVE";
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
	const list = CURRENCY_OPTIONS.map((item) => item.code).filter((code) => supportedCurrencies[code] || code === baseCurrency.value);
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
		for (const option of CURRENCY_OPTIONS) {
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

function selectCostMethod(method: (typeof COST_METHOD_OPTIONS)[number]["id"]) {
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
			title: "บันทึกการตั้งค่าร้านแล้ว",
			description: `${selectedStore.value.name} • สกุลเงินหลัก ${baseCurrency.value}`,
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
		sidebar-eyebrow="ตั้งค่า"
		sidebar-title="การเงินร้าน"
		sidebar-compact-title="FIN"
		sidebar-description="ตั้งค่าสกุลเงินหลัก ภาษีมูลค่าเพิ่ม และสกุลเงินที่รองรับสำหรับ POS"
	>
	<template #default="{ openSidebar }">
			<div class="grid gap-3 pb-3 lg:gap-4">
				<AppPageHeader
					title="การเงินร้าน"
					description="กำหนดสกุลเงินหลัก ภาษีมูลค่าเพิ่ม และสกุลเงินที่เปิดรับใน POS"
					title-tone="success"
					@menu="openSidebar"
				>
					<template #actions>
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
							{{ reloading ? "กำลังโหลด" : "รีเฟรช" }}
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
					</template>
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
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">ต้นทุน</p>
								<p class="mt-1 truncate text-base font-semibold text-stone-950" :title="costMethod === 'fifo' ? 'FIFO' : 'ต้นทุนเฉลี่ย'">
									{{ costMethod === 'fifo' ? 'FIFO' : 'เฉลี่ย' }}
								</p>
							</div>
						</div>
					</UCard>

					<div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
						{{ error }}
					</div>

					<div class="rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex flex-col">
							<div class="flex shrink-0 flex-col gap-3 border-b border-[#ece6dc] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
								<div class="flex items-start gap-3">
									<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200">
										<CircleDollarSign class="h-5 w-5" />
									</div>
									<div>
										<p class="text-sm font-semibold text-stone-950 dark:text-stone-50">อัตราแลกเปลี่ยน</p>
										<p class="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
											ตั้งค่าเรท THB และ USD สำหรับร้านนี้ได้จากหน้าถัดไป
										</p>
									</div>
								</div>
								<AppButton
									color="primary"
									variant="solid"
									size="md"
									class="rounded-md"
									:disabled="!effectiveStoreId"
									to="/settings/store-finance/rates"
								>
									<span class="inline-flex items-center gap-2">
										<CircleDollarSign class="h-4 w-4" />
										<span>จัดการอัตราแลกเปลี่ยน</span>
									</span>
								</AppButton>
							</div>
							<div class="space-y-3 px-4 py-4">
								<div class="rounded-md border border-dashed border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-stone-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-stone-200">
									ปุ่มนี้จะพาไปหน้าแก้เรทโดยตรง เหมาะสำหรับอัปเดตอัตราแลกเปลี่ยนประจำวัน
								</div>
							</div>
						</div>
					</div>

					<div class="rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">VAT / ภาษีมูลค่าเพิ่ม</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">ตั้งค่า VAT ให้ใช้กับ POS และเอกสารการขายของร้านนี้</p>
								</div>
								<UBadge color="neutral" variant="soft" :label="vatEnabled ? 'เปิดใช้งาน' : 'ปิด'" />
							</div>

							<div class="space-y-4 px-4 py-4">
								<div class="grid gap-3 lg:grid-cols-3">
									<div class="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 lg:col-span-1">
										<div class="flex items-center justify-between gap-4">
										<div class="min-w-0">
											<p class="text-sm font-semibold text-stone-900">เปิดใช้งาน VAT</p>
											<p class="mt-1 text-xs leading-5 text-stone-500">เปิดเมื่อร้านต้องคิดภาษีมูลค่าเพิ่ม</p>
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
												<p class="text-sm font-semibold text-stone-900">อัตรา VAT</p>
												<p class="mt-1 text-xs leading-5 text-stone-500">กรอกเป็นเปอร์เซ็นต์ เช่น 7 เท่ากับ 7%</p>
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
												<p class="text-sm font-semibold text-stone-900">รูปแบบ VAT</p>
												<p class="mt-1 text-xs leading-5 text-stone-500">เลือกแบบบวกเพิ่ม หรือรวม VAT ไว้ในราคาสินค้า</p>
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
												แยกภาษี
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
												รวมภาษี
											</button>
										</div>
									</div>
								</div>

								<div class="rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-4 py-3 text-xs leading-5 text-stone-500">
									<b class="text-stone-700">หมายเหตุ:</b> POS จะอ่านค่าจากร้านนี้โดยตรง ถ้าค่าเดิมในฐานข้อมูลเป็น 700 ระบบจะแสดงเป็น 7% ให้อัตโนมัติ
								</div>
							</div>
						</div>
					</div>

					<div class="rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">วิธีคำนวณต้นทุน</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">เลือกวิธีคำนวณต้นทุนสำหรับรายงานกำไรและมูลค่าสต็อก</p>
								</div>
								<UBadge color="neutral" variant="soft" :label="costMethod === 'fifo' ? 'FIFO' : 'เฉลี่ย'" />
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
								แนะนำให้ใช้ต้นทุนเฉลี่ยเป็นค่าเริ่มต้น ถ้าต้องการคุมล็อตสินค้าแม่นขึ้นค่อยเปลี่ยนเป็น FIFO
							</p>

							<div class="rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-4 py-3">
								<div class="flex items-center justify-between gap-2">
									<h4 class="text-sm font-semibold text-stone-950">ประวัติการเปลี่ยน</h4>
									<UBadge color="neutral" variant="soft" :label="`${costMethodHistory.length} รายการ`" />
								</div>
								<div v-if="costMethodHistory.length" class="mt-3 space-y-2">
									<div v-for="item in costMethodHistory" :key="item.id" class="rounded-md bg-white px-3 py-2 ring-1 ring-neutral-200">
										<div class="flex items-center justify-between gap-3">
											<div>
												<p class="text-sm font-medium text-stone-900">{{ item.cost_method === 'fifo' ? 'FIFO' : 'ต้นทุนเฉลี่ย' }}</p>
												<p class="mt-0.5 text-xs text-stone-500">{{ item.actor_user_id || 'system' }} · {{ dateTimeFormatter.format(new Date(item.occurred_at)) }}</p>
											</div>
										</div>
									</div>
								</div>
								<div v-else class="mt-3 text-sm text-stone-500">ยังไม่มีประวัติการเปลี่ยนวิธีต้นทุน</div>
							</div>
						</div>
					</div>
				</div>

					<div class="rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">สกุลเงินหลัก (Base currency)</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">ใช้เป็นสกุลเงินหลักในการคิดยอดขายและสรุปรายงาน</p>
								</div>
								<UBadge color="neutral" variant="soft" label="เลือก 1 สกุล" />
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
											<span class="text-xs font-semibold text-stone-500 tabular-nums">หลัก</span>
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
										แนะนำให้ตั้งสกุลเงินหลักเป็นสกุลที่ใช้ทำบัญชีหลักของร้าน เช่น LAK สำหรับร้านในลาว
									</p>
								</div>
							</div>
						</div>

					<div class="rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">รองรับหลายสกุลเงิน</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">เปิดหรือปิดสกุลเงินที่รับชำระได้ใน POS</p>
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
											:class="option.code === baseCurrency || !canUpdateStoreFinance || storePending || storesPending ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'"
											:disabled="option.code === baseCurrency || !canUpdateStoreFinance || storePending || storesPending"
											:aria-pressed="supportedCurrencies[option.code] || option.code === baseCurrency"
											@click="toggleSupportedCurrency(option.code)"
										>
											<span
												class="h-6 w-11 rounded-full bg-stone-200 transition"
												:class="supportedCurrencies[option.code] || option.code === baseCurrency ? 'bg-primary-600 dark:bg-emerald-500' : 'bg-stone-200'"
											/>
											<span
												class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition"
												:class="supportedCurrencies[option.code] || option.code === baseCurrency ? 'translate-x-5' : 'translate-x-0'"
											/>
										</button>
									</div>
								</div>
								<p class="text-xs leading-5 text-stone-500">
									หมายเหตุ: สกุลเงินหลักจะเปิดไว้เสมอ และไม่สามารถปิดได้
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</template>
	</AppSidebarShell>
</template>
