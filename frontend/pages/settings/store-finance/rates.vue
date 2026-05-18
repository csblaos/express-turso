<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { formatMoneyWithSymbol, getCurrencySymbol, normalizeCurrencyCode, type CurrencyCode } from "~/utils/currency";

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
	const historyPending = ref(false);
	const reloading = computed(() => storesPending.value || storePending.value || historyPending.value);

const stores = ref<StoreRecord[]>([]);
const selectedStoreId = ref("");
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
	const exchangeRates = reactive<Record<CurrencyCode, string>>({
		LAK: "1",
		THB: "",
		USD: "",
	});
	const historyItems = ref<Array<{
		id: string;
		base_currency: string;
		currency: string;
		rate_to_base: number;
		actor_user_id: string | null;
		occurred_at: string;
	}>>([]);

const initialSnapshot = ref<{
	storeId: string;
	baseCurrency: CurrencyCode;
	enabledCurrencies: CurrencyCode[];
	rates: Record<CurrencyCode, string>;
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

function parseLocaleNumber(raw: string) {
	const input = String(raw ?? "").trim();
	if (!input) return Number.NaN;

	let normalized = input.replace(/\s+/g, "");
	normalized = normalized.replace(/,/g, "");
	normalized = normalized.replace(/[^0-9.]/g, "");

	const firstDot = normalized.indexOf(".");
	if (firstDot !== -1) {
		normalized = normalized.slice(0, firstDot + 1) + normalized.slice(firstDot + 1).replace(/\./g, "");
	}

	return Number(normalized);
}

	function normalizeRateTyping(raw: string) {
		const input = String(raw ?? "");
		let normalized = input.replace(/\s+/g, "");
		normalized = normalized.replace(/,/g, "");
		normalized = normalized.replace(/[^0-9.]/g, "");

		const firstDot = normalized.indexOf(".");
		if (firstDot !== -1) {
			normalized = normalized.slice(0, firstDot + 1) + normalized.slice(firstDot + 1).replace(/\./g, "");
		}
		return normalized;
	}

	function formatThousands(value: string) {
		const normalized = normalizeRateTyping(value);
		if (!normalized) return "";

		const [ intPartRaw, fracPartRaw ] = normalized.split(".", 2);
		const intPart = intPartRaw.replace(/^0+(?=\d)/, "");
		const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		if (typeof fracPartRaw === "string") {
			return `${withCommas}.${fracPartRaw}`;
		}
		return withCommas;
	}

	function findFormattedCaretIndex(formatted: string, normalizedIndex: number) {
		if (normalizedIndex <= 0) return 0;
		let count = 0;
		for (let i = 0; i < formatted.length; i++) {
			const ch = formatted[i];
			if (ch === "," ) continue;
			count += 1;
			if (count >= normalizedIndex) return i + 1;
		}
		return formatted.length;
	}

	const enabledCurrencies = computed(() => {
		const list = CURRENCY_OPTIONS.map((item) => item.code).filter((code) => supportedCurrencies[code] || code === baseCurrency.value);
		return Array.from(new Set([ baseCurrency.value, ...list ])) as CurrencyCode[];
	});

	const rateFields = computed(() => enabledCurrencies.value.filter((code) => code !== baseCurrency.value));
	const rateRows = computed(() => (
		rateFields.value.map((code) => {
			const meta = CURRENCY_OPTIONS.find((item) => item.code === code);
			return {
				code,
				hint: meta?.hint || "",
			};
		})
	));

const hasChanges = computed(() => {
	if (!initialSnapshot.value) return false;
	if (initialSnapshot.value.storeId !== effectiveStoreId.value) return true;
	if (initialSnapshot.value.baseCurrency !== baseCurrency.value) return true;
	if (initialSnapshot.value.enabledCurrencies.join(",") !== enabledCurrencies.value.join(",")) return true;
	for (const option of CURRENCY_OPTIONS) {
		const code = option.code;
		if (normalizeRateTyping(initialSnapshot.value.rates[code]) !== normalizeRateTyping(exchangeRates[code])) return true;
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
	exchangeRates[baseCurrency.value] = "1";
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
		historyPending.value = true;
		error.value = null;
		try {
			const storeId = effectiveStoreId.value;
			const storePromise = apiFetch<ApiEnvelope<StoreRecord>>(`/stores/${encodeURIComponent(storeId)}`);
			const ratesPromise = apiFetch<ApiEnvelope<Record<string, number>>>(`/stores/${encodeURIComponent(storeId)}/currency-rates`);
			const historyPromise = apiFetch<ApiEnvelope<typeof historyItems.value>>(
				`/stores/${encodeURIComponent(storeId)}/currency-rates/history?limit=50`,
			);

			const [ storeResponse, ratesResponse, historyResponse ] = await Promise.all([
				storePromise,
				ratesPromise,
				historyPromise.catch(() => null),
			]);

			const store = storeResponse.data;
			baseCurrency.value = normalizeCurrencyCode(store.currency) || "LAK";

			const supported = parseSupportedCurrencies(store.supported_currencies);
			for (const option of CURRENCY_OPTIONS) {
				supportedCurrencies[option.code] = supported.includes(option.code) || option.code === baseCurrency.value;
			}
			ensureBaseCurrencySelected();

			const rates = ratesResponse.data || {};
			for (const option of CURRENCY_OPTIONS) {
				const code = option.code;
				if (code === baseCurrency.value) {
					exchangeRates[code] = "1";
					continue;
				}
				const value = rates[code];
				exchangeRates[code] = typeof value === "number" && Number.isFinite(value) && value > 0 ? formatThousands(String(value)) : "";
			}

			if (historyResponse?.data && Array.isArray(historyResponse.data)) {
				historyItems.value = historyResponse.data;
			}

			initialSnapshot.value = {
				storeId,
				baseCurrency: baseCurrency.value,
				enabledCurrencies: enabledCurrencies.value,
				rates: { ...exchangeRates },
			};
		} catch (err) {
			error.value = resolveApiErrorMessage(err, "โหลดข้อมูลอัตราแลกเปลี่ยนไม่สำเร็จ");
		} finally {
			storePending.value = false;
			historyPending.value = false;
		}
	}

	async function fetchHistory() {
		if (!effectiveStoreId.value) return;
		historyPending.value = true;
		try {
			const response = await apiFetch<ApiEnvelope<typeof historyItems.value>>(
				`/stores/${encodeURIComponent(effectiveStoreId.value)}/currency-rates/history?limit=50`,
			);
			historyItems.value = Array.isArray(response.data) ? response.data : [];
		} catch {
			// ignore history errors for now (doesn't block editing)
		} finally {
			historyPending.value = false;
		}
	}

	function updateRate(code: CurrencyCode, value: string) {
		exchangeRates[code] = formatThousands(value);
	}

	function onRateInput(code: CurrencyCode, event: Event) {
		const input = event.target as HTMLInputElement | null;
		if (!input) return;
		const caret = input.selectionStart ?? input.value.length;
		const normalizedBeforeCaret = normalizeRateTyping(input.value.slice(0, caret));
		const normalizedIndex = normalizedBeforeCaret.length;

		const formatted = formatThousands(input.value);
		exchangeRates[code] = formatted;

		requestAnimationFrame(() => {
			try {
				const nextCaret = findFormattedCaretIndex(formatted, normalizedIndex);
				input.setSelectionRange(nextCaret, nextCaret);
			} catch {
				// ignore selection issues (e.g. input type doesn't support)
			}
		});
	}

async function saveRates() {
	if (!selectedStore.value || !canSave.value || saving.value) return;
	saving.value = true;
	error.value = null;
	try {
		ensureBaseCurrencySelected();

		for (const code of rateFields.value) {
			const parsed = parseLocaleNumber(exchangeRates[code]);
			if (!Number.isFinite(parsed) || parsed <= 0) {
				throw new Error(`กรุณากรอกอัตราแลกเปลี่ยนของ ${code}`);
			}
		}

		const payloadRates: Record<string, number> = {};
		for (const code of enabledCurrencies.value) {
			payloadRates[code] = code === baseCurrency.value ? 1 : parseLocaleNumber(exchangeRates[code]);
		}

		await apiFetch<ApiEnvelope<Record<string, number>>>(`/stores/${encodeURIComponent(selectedStore.value.id)}/currency-rates`, {
			method: "PUT",
			body: {
				base_currency: baseCurrency.value,
				supported_currencies: enabledCurrencies.value,
				rates: payloadRates,
			},
		});

		appToast.success({
			title: "บันทึกอัตราแลกเปลี่ยนแล้ว",
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
		sidebar-title="Exchange Rates"
		sidebar-compact-title="RATE"
		sidebar-description="จัดการอัตราแลกเปลี่ยนสำหรับร้านที่กำลังใช้งาน"
	>
			<template #default="{ openSidebar }">
				<div class="grid gap-3 pb-3 lg:gap-4">
					<AppPageHeader title="อัตราแลกเปลี่ยน" description="อัปเดตเรทสำหรับ POS (แยกจากหน้าตั้งค่า Store Finance)" @menu="openSidebar">
						<div class="ml-auto flex w-full flex-wrap justify-end gap-2 pt-2 md:w-auto">
							<AppButton
								color="neutral"
								variant="soft"
								size="md"
								icon="i-heroicons-arrow-left-20-solid"
								to="/settings/store-finance"
							>
								กลับ
							</AppButton>
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
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">อัตรา</p>
								<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">{{ rateFields.length }}</p>
							</div>
						</div>
					</UCard>

						<div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
							{{ error }}
						</div>

							<div class="rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
								<div class="flex flex-col">
									<div class="border-b border-[#ece6dc]">
										<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-2.5">
											<div>
												<p class="text-sm font-semibold text-stone-950">กำหนดอัตราแลกเปลี่ยน</p>
												<p class="mt-1 hidden text-xs text-stone-500 lg:block">ระบบจะใช้เรทนี้ตอนรับเงินต่างสกุล แล้วบันทึกยอดเป็น Base currency</p>
											</div>
											<div class="flex flex-wrap items-center justify-end gap-2">
												<UBadge color="neutral" variant="soft" :label="`${rateFields.length} สกุล`" />
												<AppButton
													color="neutral"
													variant="soft"
													size="md"
													:disabled="saving || !hasChanges"
													@click="hydrateFromStore"
												>
													รีเซ็ต
												</AppButton>
												<AppButton
													color="primary"
													variant="solid"
													size="md"
													icon="i-heroicons-check-20-solid"
													:loading="saving"
													:spin-icon-on-loading="true"
													:disabled="!canSave"
													@click="saveRates"
												>
													บันทึก
												</AppButton>
											</div>
										</div>
										<AppInlineLoadingBar
											v-if="storePending || storesPending"
											minimal
											container-class="bg-neutral-100"
										/>
									</div>

									<div class="space-y-3 px-4 py-4">
										<div v-if="!rateFields.length && !(storePending || storesPending)" class="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-stone-600">
											ยังไม่มีสกุลเงินอื่นที่เปิดใช้งาน (นอกจาก {{ baseCurrency }}) — ไปเปิดสกุลเงินได้ที่ Store Finance
										</div>
										<div v-else-if="!(storePending || storesPending)" class="divide-y divide-neutral-200 overflow-hidden rounded-md border border-neutral-200 bg-white">
											<div
												v-for="row in rateRows"
												:key="row.code"
											class="grid grid-cols-12 gap-2 px-3 py-2.5"
										>
											<div class="col-span-12 min-w-0 sm:col-span-5">
												<p class="truncate text-sm font-semibold text-stone-900">{{ row.code }}</p>
												<p v-if="row.hint" class="mt-0.5 truncate text-xs text-stone-500">{{ row.hint }}</p>
											</div>
											<div class="col-span-6 flex items-center text-xs text-stone-600 sm:col-span-3 sm:text-sm">
												<span class="font-medium tabular-nums">1{{ getCurrencySymbol(row.code) }}</span>
												<span class="mx-1 text-stone-400">=</span>
												<span class="font-medium tabular-nums">{{ getCurrencySymbol(baseCurrency) }}</span>
											</div>
											<div class="col-span-6 sm:col-span-4">
												<UInput
													:model-value="exchangeRates[row.code]"
													type="text"
													inputmode="decimal"
													pattern="[0-9.,]*"
													size="md"
													color="neutral"
													placeholder="เช่น 25,000"
													class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2 [&_input]:text-right [&_input]:tabular-nums"
													:disabled="!canUpdateStoreFinance"
													@update:model-value="(value) => updateRate(row.code, String(value || ''))"
													@input="(event) => onRateInput(row.code, event)"
												/>
											</div>
										</div>
									</div>

										<p class="text-xs leading-5 text-stone-500">
											หมายเหตุ: ระบบจะบันทึกยอดเป็น {{ baseCurrency }} เสมอ โดยใช้เรทนี้ตอนรับเงินต่างสกุลใน POS
										</p>
									</div>
								</div>
							</div>

							<div class="rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
								<div class="flex flex-col">
									<div class="border-b border-[#ece6dc]">
										<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-2.5">
											<div>
												<p class="text-sm font-semibold text-stone-950">ประวัติการอัปเดตเรท</p>
												<p class="mt-1 hidden text-xs text-stone-500 lg:block">เก็บไว้สำหรับตรวจสอบย้อนหลัง (ล่าสุดก่อน)</p>
											</div>
											<UBadge color="neutral" variant="soft" :label="`${historyItems.length} รายการ`" />
										</div>
										<AppInlineLoadingBar
											v-if="historyPending"
											minimal
											container-class="bg-neutral-100"
										/>
									</div>

									<div class="px-4 py-4">
										<div v-if="historyItems.length === 0 && !historyPending" class="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-stone-600">
											ยังไม่มีประวัติการอัปเดตเรท
										</div>
										<div v-else-if="!historyPending" class="overflow-x-auto">
											<table class="min-w-full table-fixed border-separate border-spacing-0 text-sm">
												<thead class="sticky top-0 z-10 bg-white">
													<tr class="text-xs font-semibold text-stone-500">
													<th class="w-[34%] border-b border-neutral-200 px-3 py-2 text-left">เวลา</th>
													<th class="w-[16%] border-b border-neutral-200 px-3 py-2 text-left">สกุล</th>
													<th class="w-[30%] border-b border-neutral-200 px-3 py-2 text-right">เรท</th>
													<th class="w-[20%] border-b border-neutral-200 px-3 py-2 text-right">ผู้แก้ไข</th>
												</tr>
											</thead>
											<tbody>
												<tr
													v-for="item in historyItems"
													:key="item.id"
													class="odd:bg-white even:bg-neutral-50/40"
												>
													<td class="border-b border-neutral-200 px-3 py-2 text-stone-700 tabular-nums">
														{{ item.occurred_at }}
													</td>
													<td class="border-b border-neutral-200 px-3 py-2 font-semibold text-stone-900">
														{{ item.currency }}
													</td>
													<td class="border-b border-neutral-200 px-3 py-2 text-right text-stone-700 tabular-nums">
														1{{ getCurrencySymbol(item.currency) }} = {{ formatMoneyWithSymbol(item.rate_to_base, item.base_currency, { maximumFractionDigits: 6 }) }}
													</td>
													<td class="border-b border-neutral-200 px-3 py-2 text-right text-xs text-stone-500 tabular-nums">
														{{ item.actor_user_id || "-" }}
													</td>
												</tr>
											</tbody>
										</table>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</template>
		</AppSidebarShell>
</template>
