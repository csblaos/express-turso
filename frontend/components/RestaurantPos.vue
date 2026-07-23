<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";
import { formatMoneyWithSymbol } from "~/utils/currency";

type Envelope<T> = { data: T };
type PosView = "quick" | "tables" | "open";
type Zone = { id: string; name: string; sort_order: number; is_active: number };
type DiningTable = { id: string; zone_id: string; zone_name: string; name: string; capacity: number; is_active: number; order_id?: string | null; order_status?: string | null; total?: number; guest_count?: number; opened_at?: string; draft_count?: number };
type Product = { id: string; name: string; sku: string; price_base: number; inventory_mode: "tracked" | "untracked"; manual_sold_out: number; stock_state: string; available_base: number };
type OrderItem = { id: string; product_id: string; name: string; sku: string; qty: number; line_total: number; line_status: "draft" | "sent" | "cancelled"; is_gift: number; note?: string | null; round_no?: number | null };
type Promotion = { promotion_id: string; name: string; apply_mode: "automatic" | "manual"; gift_product_name: string; gift_qty: number; eligible: boolean; remaining_qty: number; remaining_amount: number };
type Round = { id: string; round_no: number; dispatch_mode: "kitchen" | "direct"; sent_at: string };
type Order = { id: string; order_no: string; status: string; version: number; service_mode: "pickup" | "dine-in"; queue_no?: string | null; table_name?: string | null; zone_name?: string | null; guest_count: number; opened_at: string; subtotal: number; vat_amount: number; total: number; payment_method?: string; amount_tendered?: number; change_amount?: number; items: OrderItem[]; rounds: Round[]; promotions: Promotion[] };
type OpenOrder = Pick<Order, "id" | "order_no" | "service_mode" | "queue_no" | "status" | "total" | "guest_count" | "opened_at" | "version" | "table_name" | "zone_name"> & { draft_count: number; sent_count: number };
type LocalCartEntry = { product_id: string; qty: number; note?: string | null };
type TableDraftEntry = { product_id: string; qty: number; note?: string | null };
type PaymentAccount = { id: string; display_name: string; is_active: number };
type AvailablePromotion = { promotion_id: string; name: string; applications: number; gift_product_id: string; gift_qty: number };
type CheckoutResult = {
	order_id: string; order_no: string; queue_no: string | null; queue_date: string | null; subtotal: number; vat_amount: number; total: number;
	payment_method: "cash" | "qr_transfer" | "credit_card"; amount_tendered: number; change_amount: number; completed_at: string;
	receipt: { lines: Array<{ product_id: string; name: string; sku: string; qty: number; unit_price: number; line_total: number; is_gift: boolean; promotion_id: string | null }> };
};

const props = defineProps<{ storeId: string }>();
const { apiFetch } = useApiClient();
const toast = useAppToast();
const { locale, t } = useI18n();
const { can } = useAuthSession();

const view = ref<PosView>("quick");
const mobileTicketOpen = ref(false);
const moreActionsOpen = ref(false);
const showAllPromotions = ref(false);
const expandedRounds = ref<number[]>([]);
const zones = ref<Zone[]>([]);
const tables = ref<DiningTable[]>([]);
const products = ref<Product[]>([]);
const openOrders = ref<OpenOrder[]>([]);
const order = ref<Order | null>(null);
const localCart = ref<LocalCartEntry[]>([]);
const tableDraft = ref<TableDraftEntry[]>([]);
const checkoutReceipt = ref<CheckoutResult | null>(null);
const availablePromotions = ref<AvailablePromotion[]>([]);
const selectedPromotionIds = ref<string[]>([]);
const activeZone = ref("");
const search = ref("");
const currency = ref("LAK");
const vatEnabled = ref(false);
const vatRate = ref(0);
const vatMode = ref("EXCLUSIVE");
const pending = ref(false);
const actionPending = ref(false);
const pendingItemIds = ref<string[]>([]);
const loadError = ref("");
const guestPanel = ref(false);
const selectedTable = ref<DiningTable | null>(null);
const guestCount = ref(2);
const checkoutPanel = ref(false);
const checkoutDispatch = ref<"existing" | "direct">("existing");
const paymentMethod = ref<"cash" | "qr_transfer" | "credit_card">("cash");
const cashTendered = ref(0);
const paymentAccounts = ref<PaymentAccount[]>([]);
const paymentAccountId = ref("");
const paymentSlipUrl = ref("");
const cancelPanel = ref(false);
const cancelReason = ref("");
const sentItemPanel = ref(false);
const cancellingItem = ref<OrderItem | null>(null);
const printKind = ref<"kitchen" | "check" | "receipt">("kitchen");
const printRound = ref<number | null>(null);
let sendKey = "";
let checkoutKey = "";
let desktopMedia: MediaQueryList | null = null;
let promotionTimer: ReturnType<typeof setTimeout> | null = null;

const filteredProducts = computed(() => {
	const query = search.value.trim().toLowerCase();
	return products.value.filter((product) => !query || product.name.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query));
});
const zoneTables = computed(() => tables.value.filter((table) => table.is_active && (!activeZone.value || table.zone_id === activeZone.value)));
const localItems = computed<OrderItem[]>(() => localCart.value.flatMap((entry) => {
	const product = products.value.find((candidate) => candidate.id === entry.product_id);
	return product ? [{ id: `local:${product.id}`, product_id: product.id, name: product.name, sku: product.sku, qty: entry.qty, line_total: product.price_base * entry.qty, line_status: "draft", is_gift: 0, note: entry.note }] : [];
}));
const tableDraftItems = computed<OrderItem[]>(() => tableDraft.value.flatMap((entry) => {
	const product = products.value.find((candidate) => candidate.id === entry.product_id);
	return product ? [{ id: `table:${product.id}:${entry.note || ""}`, product_id: product.id, name: product.name, sku: product.sku, qty: entry.qty, line_total: product.price_base * entry.qty, line_status: "draft", is_gift: 0, note: entry.note }] : [];
}));
const serverDraftItems = computed(() => order.value?.items.filter((item) => item.line_status === "draft") || []);
const draftItems = computed(() => order.value ? [ ...serverDraftItems.value, ...tableDraftItems.value ] : localItems.value);
const cartItemCount = computed(() => (order.value ? [ ...(order.value.items || []), ...tableDraftItems.value ] : localItems.value)
	.filter((item) => item.line_status !== "cancelled")
	.reduce((total, item) => total + Number(item.qty || 0), 0));
const localSubtotal = computed(() => localItems.value.reduce((total, item) => total + Number(item.line_total || 0), 0));
const localVat = computed(() => {
	if (!vatEnabled.value) return 0;
	const rate = vatRate.value > 100 ? vatRate.value / 100 : vatRate.value;
	return Math.round(vatMode.value === "INCLUSIVE" ? localSubtotal.value * rate / (100 + rate) : localSubtotal.value * rate / 100);
});
const localTotal = computed(() => vatEnabled.value && vatMode.value !== "INCLUSIVE" ? localSubtotal.value + localVat.value : localSubtotal.value);
const tableDraftSubtotal = computed(() => tableDraftItems.value.reduce((total, item) => total + Number(item.line_total || 0), 0));
const displayTotal = computed(() => {
	if (!order.value) return localTotal.value;
	const subtotal = Number(order.value.subtotal || 0) + tableDraftSubtotal.value;
	const rate = vatRate.value > 100 ? vatRate.value / 100 : vatRate.value;
	const vat = vatEnabled.value ? Math.round(vatMode.value === "INCLUSIVE" ? subtotal * rate / (100 + rate) : subtotal * rate / 100) : 0;
	return vatMode.value === "INCLUSIVE" ? subtotal : subtotal + vat;
});
const hasLocalTableDraft = computed(() => Boolean(order.value) && tableDraft.value.length > 0);
const sentGroups = computed(() => {
	const groups = new Map<number, OrderItem[]>();
	for (const item of order.value?.items || []) {
		if (item.line_status !== "sent") continue;
		const round = Number(item.round_no || 0);
		groups.set(round, [ ...(groups.get(round) || []), item ]);
	}
	return [ ...groups.entries() ].sort((a, b) => b[0] - a[0]);
});
const visiblePromotions = computed(() => {
	const promotions = order.value?.promotions
		.filter((promotion) => promotion.apply_mode === "manual" && (promotion.eligible || promotion.remaining_qty || promotion.remaining_amount)) || [];
	const sorted = [ ...promotions ].sort((a, b) => {
		if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
		return (a.remaining_qty || Number.MAX_SAFE_INTEGER) - (b.remaining_qty || Number.MAX_SAFE_INTEGER)
			|| (a.remaining_amount || Number.MAX_SAFE_INTEGER) - (b.remaining_amount || Number.MAX_SAFE_INTEGER);
	});
	return showAllPromotions.value ? sorted : sorted.slice(0, 1);
});
const receiptItems = computed<OrderItem[]>(() => checkoutReceipt.value?.receipt.lines.map((item, index) => ({
	id: `receipt:${index}`, product_id: item.product_id, name: item.name, sku: item.sku, qty: item.qty,
	line_total: item.line_total, line_status: "sent", is_gift: item.is_gift ? 1 : 0,
})) || []);
const printItems = computed(() => checkoutReceipt.value
	? receiptItems.value
	: printKind.value === "kitchen"
		? order.value?.items.filter((item) => item.line_status === "sent" && Number(item.round_no) === printRound.value) || []
		: order.value?.items.filter((item) => item.line_status !== "cancelled") || []);
const orderLabel = computed(() => order.value?.service_mode === "pickup"
	? `คิว ${order.value.queue_no || "-"}`
	: `${order.value?.zone_name || ""} · ${order.value?.table_name || "โต๊ะ"}`);
const printLabel = computed(() => checkoutReceipt.value ? `คิว ${checkoutReceipt.value.queue_no || "-"} · ซื้อกลับบ้าน` : orderLabel.value);
const printOrderNo = computed(() => checkoutReceipt.value?.order_no || order.value?.order_no || "");
const printSubtotal = computed(() => checkoutReceipt.value?.subtotal ?? order.value?.subtotal ?? 0);
const printVat = computed(() => checkoutReceipt.value?.vat_amount ?? order.value?.vat_amount ?? 0);
const printTotal = computed(() => checkoutReceipt.value?.total ?? order.value?.total ?? 0);
const printPaymentMethod = computed(() => checkoutReceipt.value?.payment_method || order.value?.payment_method || "");
const printTendered = computed(() => checkoutReceipt.value?.amount_tendered ?? order.value?.amount_tendered ?? 0);
const printChange = computed(() => checkoutReceipt.value?.change_amount ?? order.value?.change_amount ?? 0);

function money(value: number) { return formatMoneyWithSymbol(value, currency.value, locale.value); }
function localizedApiError(error: unknown) {
	return resolveApiErrorMessage(error, t("validation.generic"), {
		networkMessage: t("validation.network"),
	});
}
function elapsed(value?: string) {
	if (!value) return "";
	const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
	return minutes < 60 ? `${minutes} นาที` : `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที`;
}
function tableTone(table: DiningTable) {
	if (table.order_status === "ready_to_pay") return "border-amber-300 bg-amber-50";
	if (table.order_id && table.draft_count) return "border-orange-300 bg-orange-50";
	if (table.order_id) return "border-blue-300 bg-blue-50";
	return "border-emerald-200 bg-emerald-50/60";
}
function roundMode(roundNo: number) { return order.value?.rounds.find((round) => Number(round.round_no) === roundNo)?.dispatch_mode || "kitchen"; }
function isItemPending(itemId: string) { return pendingItemIds.value.includes(itemId); }
function cloneOrder(value: Order): Order { return JSON.parse(JSON.stringify(value)) as Order; }
function recalculateOptimisticOrder(value: Order) {
	const subtotal = value.items.filter((item) => item.line_status !== "cancelled").reduce((total, item) => total + Number(item.line_total || 0), 0);
	const rate = vatRate.value > 100 ? vatRate.value / 100 : vatRate.value;
	const vat = vatEnabled.value ? Math.round(vatMode.value === "INCLUSIVE" ? subtotal * rate / (100 + rate) : subtotal * rate / 100) : 0;
	value.subtotal = subtotal;
	value.vat_amount = vat;
	value.total = vatMode.value === "INCLUSIVE" ? subtotal : subtotal + vat;
}
function beginItemMutation(itemId: string): boolean {
	if (actionPending.value || isItemPending(itemId)) return false;
	pendingItemIds.value = [ ...pendingItemIds.value, itemId ];
	return true;
}
function endItemMutation(itemId: string) { pendingItemIds.value = pendingItemIds.value.filter((id) => id !== itemId); }
function isRoundExpanded(roundNo: number, index: number) { return index === 0 || expandedRounds.value.includes(roundNo); }
function toggleRound(roundNo: number) {
	expandedRounds.value = expandedRounds.value.includes(roundNo)
		? expandedRounds.value.filter((value) => value !== roundNo)
		: [ ...expandedRounds.value, roundNo ];
}

async function loadDashboard() {
	pending.value = true;
	loadError.value = "";
	try {
		const [ dashboard, catalog, opened ] = await Promise.all([
			apiFetch<Envelope<{ zones: Zone[]; tables: DiningTable[] }>>(`/pos/restaurant/tables?store_id=${encodeURIComponent(props.storeId)}`),
			apiFetch<Envelope<any>>(`/pos/products?store_id=${encodeURIComponent(props.storeId)}`),
			apiFetch<Envelope<OpenOrder[]>>(`/pos/restaurant/orders/open?store_id=${encodeURIComponent(props.storeId)}`),
		]);
		zones.value = dashboard.data.zones.filter((zone) => zone.is_active);
		tables.value = dashboard.data.tables;
		products.value = catalog.data.items;
		openOrders.value = opened.data;
		currency.value = catalog.data.store.currency || "LAK";
		vatEnabled.value = Boolean(Number(catalog.data.store.vat_enabled));
		vatRate.value = Number(catalog.data.store.vat_rate || 0);
		vatMode.value = String(catalog.data.store.vat_mode || "EXCLUSIVE").toUpperCase();
		activeZone.value = zones.value.some((zone) => zone.id === activeZone.value) ? activeZone.value : (zones.value[0]?.id || "");
	} catch (error) {
		loadError.value = localizedApiError(error);
		toast.error({ title: t("restaurantPos.loadFailed"), description: loadError.value });
	} finally { pending.value = false; }
}

function cartStorageKey() { return `restaurant-pos:quick-cart:${props.storeId}`; }
function tableDraftStorageKey(orderId: string) { return `restaurant-pos:table-draft:${props.storeId}:${orderId}`; }
function restoreLocalCart() {
	if (!import.meta.client) return;
	try {
		const parsed = JSON.parse(sessionStorage.getItem(cartStorageKey()) || "[]");
		const items = Array.isArray(parsed) ? parsed : parsed?.items;
		localCart.value = Array.isArray(items) ? items.filter((item) => item && typeof item.product_id === "string" && Number.isInteger(item.qty) && item.qty > 0) : [];
		selectedPromotionIds.value = Array.isArray(parsed?.promotion_ids) ? parsed.promotion_ids.filter((id: unknown) => typeof id === "string") : [];
	} catch { localCart.value = []; }
}
function persistLocalCart() {
	if (!import.meta.client) return;
	if (localCart.value.length) sessionStorage.setItem(cartStorageKey(), JSON.stringify({ items: localCart.value, promotion_ids: selectedPromotionIds.value }));
	else sessionStorage.removeItem(cartStorageKey());
}
function restoreTableDraft(orderId: string) {
	if (!import.meta.client) return;
	try {
		const parsed = JSON.parse(sessionStorage.getItem(tableDraftStorageKey(orderId)) || "[]");
		tableDraft.value = Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.product_id === "string" && Number.isInteger(item.qty) && item.qty > 0) : [];
	} catch { tableDraft.value = []; }
}
function persistTableDraft() {
	if (!import.meta.client || !order.value) return;
	if (tableDraft.value.length) sessionStorage.setItem(tableDraftStorageKey(order.value.id), JSON.stringify(tableDraft.value));
	else sessionStorage.removeItem(tableDraftStorageKey(order.value.id));
}
function clearTableDraft(orderId = order.value?.id) {
	tableDraft.value = [];
	if (import.meta.client && orderId) sessionStorage.removeItem(tableDraftStorageKey(orderId));
}
async function evaluateLocalPromotions() {
	if (!localCart.value.length) { availablePromotions.value = []; selectedPromotionIds.value = []; return; }
	try {
		const response = await apiFetch<Envelope<AvailablePromotion[]>>("/promotions/evaluate", { method: "POST", body: { store_id: props.storeId, items: localCart.value.map(({ product_id, qty }) => ({ product_id, qty })) } });
		availablePromotions.value = response.data;
		selectedPromotionIds.value = selectedPromotionIds.value.filter((id) => response.data.some((promotion) => promotion.promotion_id === id));
	} catch { availablePromotions.value = []; }
}
async function loadPaymentAccounts() {
	try {
		const response = await apiFetch<Envelope<PaymentAccount[]>>(`/stores/${encodeURIComponent(props.storeId)}/payment-accounts`);
		paymentAccounts.value = response.data.filter((account) => Boolean(account.is_active));
		paymentAccountId.value = paymentAccounts.value[0]?.id || "";
	} catch { paymentAccounts.value = []; paymentAccountId.value = ""; }
}

async function loadOrder(id: string) {
	pending.value = true;
	try {
		const response = await apiFetch<Envelope<Order>>(`/pos/restaurant/orders/${id}?store_id=${encodeURIComponent(props.storeId)}`);
		order.value = response.data;
		restoreTableDraft(response.data.id);
		cashTendered.value = Number(response.data.total || 0);
		view.value = "quick";
		mobileTicketOpen.value = true;
	} catch (error) { toast.error({ title: t("restaurantPos.orderLoadFailed"), description: localizedApiError(error) }); }
	finally { pending.value = false; }
}

async function addProduct(product: Product) {
	if (product.stock_state === "inactive") return;
	if (!order.value) {
		const existing = localCart.value.find((item) => item.product_id === product.id);
		if (existing) existing.qty += 1;
		else localCart.value.unshift({ product_id: product.id, qty: 1 });
		return;
	}
	const localQty = tableDraft.value.filter((item) => item.product_id === product.id).reduce((total, item) => total + item.qty, 0);
	if (product.inventory_mode === "tracked" && localQty >= Number(product.available_base || 0)) {
		toast.error({ title: "สต็อกคงเหลือไม่พอ", description: "ระบบจะตรวจสต็อกล่าสุดอีกครั้งเมื่อส่งครัว" });
		return;
	}
	const existing = tableDraft.value.find((item) => item.product_id === product.id && !item.note);
	if (existing) existing.qty += 1;
	else tableDraft.value.unshift({ product_id: product.id, qty: 1 });
}

async function changeQty(item: OrderItem, delta: number) {
	if (!order.value) {
		const entry = localCart.value.find((candidate) => candidate.product_id === item.product_id);
		if (!entry) return;
		entry.qty += delta;
		if (entry.qty <= 0) localCart.value = localCart.value.filter((candidate) => candidate !== entry);
		return;
	}
	if (item.id.startsWith("table:")) {
		const entry = tableDraft.value.find((candidate) => candidate.product_id === item.product_id && (candidate.note || "") === (item.note || ""));
		if (!entry) return;
		entry.qty += delta;
		if (entry.qty <= 0) tableDraft.value = tableDraft.value.filter((candidate) => candidate !== entry);
		return;
	}
	if (!beginItemMutation(item.id)) return;
	const qty = item.qty + delta;
	if (qty <= 0) { endItemMutation(item.id); return removeItem(item); }
	const rollback = cloneOrder(order.value);
	const optimistic = order.value.items.find((candidate) => candidate.id === item.id);
	if (!optimistic) { endItemMutation(item.id); return; }
	optimistic.qty = qty;
	optimistic.line_total = Number(item.line_total || 0) / Math.max(1, Number(item.qty || 1)) * qty;
	recalculateOptimisticOrder(order.value);
	actionPending.value = true;
	try {
		const response = await apiFetch<Envelope<Order>>(`/pos/restaurant/orders/${order.value.id}/items/${item.id}`, {
			method: "PUT", body: { store_id: props.storeId, qty, expected_version: order.value.version },
		});
		order.value = response.data;
	} catch (error) { order.value = rollback; toast.error({ title: "แก้จำนวนไม่สำเร็จ", description: localizedApiError(error) }); await refreshOrder(); }
	finally { endItemMutation(item.id); actionPending.value = false; }
}

async function removeItem(item: OrderItem) {
	if (!order.value) { localCart.value = localCart.value.filter((entry) => entry.product_id !== item.product_id); return; }
	if (item.id.startsWith("table:")) {
		tableDraft.value = tableDraft.value.filter((entry) => !(entry.product_id === item.product_id && (entry.note || "") === (item.note || "")));
		return;
	}
	if (!beginItemMutation(item.id)) return;
	const rollback = cloneOrder(order.value);
	order.value.items = order.value.items.filter((candidate) => candidate.id !== item.id);
	recalculateOptimisticOrder(order.value);
	actionPending.value = true;
	try {
		const response = await apiFetch<Envelope<Order>>(`/pos/restaurant/orders/${order.value.id}/items/${item.id}`, {
			method: "DELETE", body: { store_id: props.storeId, expected_version: order.value.version },
		});
		order.value = response.data;
	} catch (error) { order.value = rollback; toast.error({ title: "ลบรายการไม่สำเร็จ", description: localizedApiError(error) }); await refreshOrder(); }
	finally { endItemMutation(item.id); actionPending.value = false; }
}

function chooseTable(table: DiningTable) {
	if (table.order_id) {
		if (order.value && table.order_id !== order.value.id) {
			toast.error({ title: "โต๊ะนี้มีออเดอร์แล้ว", description: "พักออเดอร์ปัจจุบันก่อนเปิดออเดอร์ของโต๊ะอื่น" });
			return;
		}
		void loadOrder(table.order_id);
		return;
	}
	selectedTable.value = table;
	guestCount.value = Math.max(1, order.value?.guest_count || table.capacity || 1);
	guestPanel.value = true;
}

async function confirmTable() {
	if (!selectedTable.value) return;
	actionPending.value = true;
	try {
		if (order.value) {
			const response = await apiFetch<Envelope<Order>>(`/pos/restaurant/orders/${order.value.id}/service-mode`, {
				method: "POST", body: { store_id: props.storeId, service_mode: "dine-in", table_id: selectedTable.value.id, guest_count: guestCount.value, expected_version: order.value.version },
			});
			order.value = response.data;
		} else {
			const cartSnapshot = [ ...localCart.value ];
			const response = await apiFetch<Envelope<Order>>("/pos/restaurant/orders", {
				method: "POST", body: { store_id: props.storeId, service_mode: "dine-in", table_id: selectedTable.value.id, guest_count: guestCount.value },
			});
			order.value = response.data;
			tableDraft.value = cartSnapshot;
			localCart.value = [];
		}
		guestPanel.value = false;
		view.value = "quick";
		await loadDashboard();
		toast.success({ title: `ผูกออเดอร์กับโต๊ะ ${selectedTable.value.name} แล้ว` });
	} catch (error) { toast.error({ title: "เลือกโต๊ะไม่สำเร็จ", description: localizedApiError(error) }); await refreshOrder(); }
	finally { actionPending.value = false; }
}

async function changeToPickup() {
	if (!order.value) return;
	actionPending.value = true;
	try {
		const response = await apiFetch<Envelope<Order>>(`/pos/restaurant/orders/${order.value.id}/service-mode`, {
			method: "POST", body: { store_id: props.storeId, service_mode: "pickup", expected_version: order.value.version },
		});
		order.value = response.data;
		await loadDashboard();
		toast.success({ title: `เปลี่ยนเป็นซื้อกลับบ้าน คิว ${response.data.queue_no}` });
	} catch (error) { toast.error({ title: "เปลี่ยนรูปแบบบริการไม่สำเร็จ", description: localizedApiError(error) }); }
	finally { actionPending.value = false; }
}

async function sendKitchen(options: { print: boolean; park: boolean; pay: boolean }) {
	if (!order.value || !draftItems.value.length) return;
	actionPending.value = true;
	try {
		sendKey ||= crypto.randomUUID();
		const response = await apiFetch<Envelope<Order>>(`/pos/restaurant/orders/${order.value.id}/send`, {
			method: "POST", headers: { "Idempotency-Key": sendKey }, body: { store_id: props.storeId, expected_version: order.value.version, items: tableDraft.value.map(({ product_id, qty, note }) => ({ product_id, qty, note: note || null })) },
		});
		order.value = response.data;
		clearTableDraft(response.data.id);
		sendKey = "";
		const round = Number(response.data.rounds.at(-1)?.round_no || 0);
		if (options.print) printDocument("kitchen", round);
		if (options.pay) openCheckout("existing");
		if (options.park) parkOrder();
		await loadDashboard();
		toast.success({ title: `ส่งครัวรอบ ${round} แล้ว` });
	} catch (error) { toast.error({ title: "ส่งครัวไม่สำเร็จ", description: `${localizedApiError(error)} · รายการที่แตะไว้ยังคงอยู่ สามารถโหลดออเดอร์ล่าสุดแล้วลองใหม่ได้` }); }
	finally { actionPending.value = false; }
}

function openCheckout(dispatch: "existing" | "direct") {
	if (!order.value && !localCart.value.length) return;
	if (hasLocalTableDraft.value) {
		toast.error({ title: "กรุณาส่งครัวก่อนชำระเงิน", description: "รายการที่ยังอยู่ในเครื่องต้องผ่านการตรวจสต็อกจาก server ก่อน" });
		return;
	}
	checkoutDispatch.value = dispatch;
	cashTendered.value = Number(displayTotal.value || 0);
	paymentSlipUrl.value = "";
	checkoutKey ||= crypto.randomUUID();
	checkoutPanel.value = true;
}

async function checkout() {
	if (!order.value && !localCart.value.length) return;
	actionPending.value = true;
	try {
		if (!order.value) {
			const response = await apiFetch<Envelope<CheckoutResult>>("/pos/checkout", {
				method: "POST", headers: { "Idempotency-Key": checkoutKey },
				body: { store_id: props.storeId, service_mode: "pickup", payment_method: paymentMethod.value, items: localCart.value.map(({ product_id, qty }) => ({ product_id, qty })), promotion_ids: selectedPromotionIds.value, amount_tendered: paymentMethod.value === "cash" ? cashTendered.value : null, payment_account_id: paymentMethod.value === "qr_transfer" ? paymentAccountId.value : null, payment_slip_url: paymentSlipUrl.value || null },
			});
			checkoutReceipt.value = response.data;
			checkoutPanel.value = false;
			checkoutKey = "";
			localCart.value = [];
			selectedPromotionIds.value = [];
			await nextTick();
			printDocument("receipt");
			toast.success({ title: `ชำระเงินสำเร็จ คิว ${response.data.queue_no || "-"}` });
			setTimeout(() => { checkoutReceipt.value = null; mobileTicketOpen.value = false; void loadDashboard(); }, 350);
			return;
		}
		const response = await apiFetch<Envelope<Order>>(`/pos/restaurant/orders/${order.value.id}/checkout`, {
			method: "POST", headers: { "Idempotency-Key": checkoutKey },
			body: { store_id: props.storeId, expected_version: order.value.version, payment_method: paymentMethod.value, amount_tendered: paymentMethod.value === "cash" ? cashTendered.value : null, dispatch_mode: checkoutDispatch.value },
		});
		order.value = response.data;
		checkoutKey = "";
		clearTableDraft(response.data.id);
		checkoutPanel.value = false;
		printDocument("receipt");
		toast.success({ title: "ชำระเงินและปิดออเดอร์แล้ว" });
		setTimeout(() => { order.value = null; mobileTicketOpen.value = false; void loadDashboard(); }, 350);
	} catch (error) {
		toast.error({ title: "ชำระเงินไม่สำเร็จ", description: localizedApiError(error) });
		if (!order.value) await loadDashboard();
	}
	finally { actionPending.value = false; }
}

function parkOrder() {
	order.value = null;
	mobileTicketOpen.value = false;
	view.value = "quick";
	void loadDashboard();
}

async function cancelOrder() {
	if (!order.value) return;
	const hasSent = order.value.items.some((item) => item.line_status === "sent");
	if (hasSent && !cancelReason.value.trim()) return;
	actionPending.value = true;
	try {
		await apiFetch(`/pos/restaurant/orders/${order.value.id}/${hasSent ? "cancel-sent" : "cancel"}`, {
			method: "POST", body: { store_id: props.storeId, expected_version: order.value.version, reason: cancelReason.value.trim() || undefined },
		});
		cancelPanel.value = false;
		clearTableDraft(order.value.id);
		order.value = null;
		mobileTicketOpen.value = false;
		await loadDashboard();
		toast.success({ title: "ยกเลิกออเดอร์แล้ว" });
	} catch (error) { toast.error({ title: "ยกเลิกออเดอร์ไม่สำเร็จ", description: localizedApiError(error) }); }
	finally { actionPending.value = false; }
}

async function toggleAvailability(product: Product) {
	actionPending.value = true;
	try {
		await apiFetch(`/pos/restaurant/products/${product.id}/availability`, { method: "PATCH", body: { store_id: props.storeId, sold_out: !Boolean(product.manual_sold_out) } });
		await loadDashboard();
	} catch (error) { toast.error({ title: "เปลี่ยนสถานะเมนูไม่สำเร็จ", description: localizedApiError(error) }); }
	finally { actionPending.value = false; }
}

async function applyPromotion(promotion: Promotion) {
	if (!order.value) return;
	actionPending.value = true;
	try {
		const response = await apiFetch<Envelope<Order>>(`/pos/restaurant/orders/${order.value.id}/promotions/${promotion.promotion_id}`, {
			method: "POST", body: { store_id: props.storeId, expected_version: order.value.version },
		});
		order.value = response.data;
	} catch (error) { toast.error({ title: "ใช้โปรโมชั่นไม่สำเร็จ", description: localizedApiError(error) }); }
	finally { actionPending.value = false; }
}

async function cancelSentItem() {
	if (!order.value || !cancellingItem.value || !cancelReason.value.trim()) return;
	actionPending.value = true;
	try {
		const response = await apiFetch<Envelope<Order>>(`/pos/restaurant/orders/${order.value.id}/items/${cancellingItem.value.id}/cancel`, {
			method: "POST", body: { store_id: props.storeId, expected_version: order.value.version, reason: cancelReason.value.trim() },
		});
		order.value = response.data;
		sentItemPanel.value = false;
	} catch (error) { toast.error({ title: "ยกเลิกรายการไม่สำเร็จ", description: localizedApiError(error) }); await refreshOrder(); }
	finally { actionPending.value = false; }
}

async function markReady() {
	if (!order.value || draftItems.value.length) return;
	actionPending.value = true;
	try {
		const response = await apiFetch<Envelope<Order>>(`/pos/restaurant/orders/${order.value.id}/ready`, { method: "POST", body: { store_id: props.storeId, expected_version: order.value.version } });
		order.value = response.data;
		printDocument("check");
	} catch (error) { toast.error({ title: "เช็กบิลไม่สำเร็จ", description: localizedApiError(error) }); }
	finally { actionPending.value = false; }
}

function refreshOrder() { if (order.value) return loadOrder(order.value.id); }
function printDocument(kind: "kitchen" | "check" | "receipt", round?: number) {
	if (!can("pos.restaurant.print")) return toast.error({ title: "ไม่มีสิทธิ์พิมพ์เอกสาร" });
	printKind.value = kind;
	printRound.value = round || null;
	nextTick(() => window.print());
}

watch(() => props.storeId, () => {
	order.value = null;
	mobileTicketOpen.value = false;
	view.value = "quick";
	restoreLocalCart();
	void loadPaymentAccounts();
	void loadDashboard();
}, { immediate: true });

watch(localCart, () => {
	persistLocalCart();
	if (promotionTimer) clearTimeout(promotionTimer);
	promotionTimer = setTimeout(() => void evaluateLocalPromotions(), 180);
}, { deep: true });
watch(selectedPromotionIds, persistLocalCart, { deep: true });
watch(tableDraft, persistTableDraft, { deep: true });

function syncTicketScrollLock() {
	if (!import.meta.client) return;
	document.body.style.overflow = mobileTicketOpen.value && !desktopMedia?.matches ? "hidden" : "";
}

watch(mobileTicketOpen, syncTicketScrollLock);
watch(view, (nextView) => {
	if (nextView !== "quick") mobileTicketOpen.value = false;
});

onMounted(() => {
	desktopMedia = window.matchMedia("(min-width: 1024px)");
	desktopMedia.addEventListener("change", syncTicketScrollLock);
	syncTicketScrollLock();
});

onBeforeUnmount(() => {
	if (promotionTimer) clearTimeout(promotionTimer);
	desktopMedia?.removeEventListener("change", syncTicketScrollLock);
	if (import.meta.client) document.body.style.overflow = "";
});
</script>

<template>
	<AppSidebarShell :nav-items="appNavItems" :active-ids="['pos']" sidebar-eyebrow="Restaurant POS" :sidebar-title="t('restaurantPos.sidebarTitle')" sidebar-compact-title="POS" :sidebar-description="t('restaurantPos.sidebarDescription')">
		<template #default="{ openSidebar }">
			<div class="flex h-full min-h-0 flex-col gap-3">
				<div class="flex items-center gap-2">
					<AppButton class="shrink-0 lg:hidden" size="sm" color="neutral" variant="soft" icon="i-heroicons-bars-3" :aria-label="t('restaurantPos.openMenu')" @click="openSidebar" />
					<div class="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
						<AppButton class="shrink-0" size="sm" :color="view === 'quick' ? 'primary' : 'neutral'" :variant="view === 'quick' ? 'solid' : 'soft'" icon="i-heroicons-bolt" @click="view = 'quick'">{{ t('restaurantPos.quickSale') }}</AppButton>
						<AppButton class="shrink-0" size="sm" :color="view === 'tables' ? 'primary' : 'neutral'" :variant="view === 'tables' ? 'solid' : 'soft'" icon="i-heroicons-table-cells" @click="view = 'tables'">{{ t('restaurantPos.selectTable') }}</AppButton>
						<AppButton class="shrink-0" size="sm" :color="view === 'open' ? 'primary' : 'neutral'" :variant="view === 'open' ? 'solid' : 'soft'" icon="i-heroicons-queue-list" @click="view = 'open'">{{ t('restaurantPos.openOrders') }} <span v-if="openOrders.length" class="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-current/10 px-1 text-xs">{{ openOrders.length }}</span></AppButton>
					</div>
					<AppButton class="shrink-0" size="sm" color="neutral" variant="soft" icon="i-heroicons-arrow-path" :loading="pending" :aria-label="t('restaurantPos.reload')" :title="t('restaurantPos.reload')" @click="loadDashboard" />
				</div>
				<AppInlineLoadingBar v-if="pending && products.length" />
				<div v-if="pending && !products.length" class="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_400px]">
					<section class="rounded-md border border-neutral-200 bg-white p-3"><USkeleton class="h-10 w-full rounded-md" /><div class="mt-3 grid content-start grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"><div v-for="index in 10" :key="index" class="min-h-[118px] rounded-md border border-neutral-100 p-2"><div class="flex gap-2"><USkeleton class="size-10 shrink-0 rounded-md" /><div class="flex-1 space-y-2"><USkeleton class="h-3.5 w-4/5" /><USkeleton class="h-2.5 w-2/5" /></div></div><USkeleton class="mt-5 h-3.5 w-2/5" /><USkeleton class="mt-1.5 h-3.5 w-3/5" /></div></div></section>
					<aside class="hidden rounded-md border border-neutral-200 bg-white p-3 lg:block"><USkeleton class="h-5 w-32" /><USkeleton class="mt-2 h-3 w-52" /><USkeleton class="mt-6 h-20 w-full rounded-md" /><USkeleton class="mt-3 h-11 w-full rounded-md" /></aside>
				</div>
				<div v-else-if="loadError && !products.length" class="flex min-h-72 flex-col items-center justify-center rounded-md border border-red-200 bg-red-50 p-8 text-center"><UIcon name="i-heroicons-exclamation-triangle" class="size-9 text-red-600" /><h2 class="mt-3 font-semibold text-red-950">{{ t('restaurantPos.loadFailed') }}</h2><p class="mt-1 text-sm text-red-700">{{ loadError }}</p><AppButton class="mt-4" color="error" variant="soft" @click="loadDashboard">{{ t('restaurantPos.retry') }}</AppButton></div>

				<div v-else-if="view === 'quick'" class="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_400px] lg:overflow-hidden">
					<section class="min-h-0 rounded-md border border-neutral-200 bg-white p-3 pb-24 lg:flex lg:flex-col lg:pb-3"><UInput v-model="search" class="w-full shrink-0" size="lg" icon="i-heroicons-magnifying-glass" :placeholder="t('restaurantPos.search')" /><div class="mt-3 grid content-start grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:min-h-0 lg:flex-1 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"><article v-for="product in filteredProducts" :key="product.id" class="min-h-[118px] self-start rounded-md border border-neutral-200 bg-white p-2 shadow-sm transition hover:border-primary-300 hover:shadow-md"><button class="flex min-h-[100px] w-full flex-col text-left disabled:cursor-not-allowed disabled:opacity-50" :disabled="(Boolean(order) && actionPending) || product.stock_state === 'inactive'" @click="addProduct(product)"><div class="flex min-w-0 items-start gap-2"><div class="flex size-10 shrink-0 items-center justify-center rounded-md bg-neutral-100"><UIcon name="i-heroicons-cube" class="size-5 text-stone-400" /></div><div class="min-w-0 flex-1"><p class="line-clamp-2 text-xs font-semibold leading-4 sm:text-sm">{{ product.name }}</p><p class="mt-0.5 truncate text-[9px] text-stone-400">{{ product.sku }}</p></div></div><div class="mt-auto pt-2"><p class="text-sm font-semibold tabular-nums">{{ money(product.price_base) }}</p><UBadge class="mt-1 text-[9px]" :color="product.inventory_mode === 'tracked' ? 'neutral' : product.manual_sold_out ? 'error' : 'primary'" variant="soft">{{ product.inventory_mode === 'tracked' ? t('restaurantPos.stock', { count: product.available_base }) : product.manual_sold_out ? t('restaurantPos.soldOut') : t('restaurantPos.foodMenu') }}</UBadge></div></button><AppButton v-if="product.inventory_mode === 'untracked' && can('products.update')" class="mt-1.5" block size="xs" :color="product.manual_sold_out ? 'success' : 'neutral'" variant="soft" @click="toggleAvailability(product)">{{ product.manual_sold_out ? t('restaurantPos.available') : t('restaurantPos.soldOut') }}</AppButton></article></div></section>

					<button class="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-neutral-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-left shadow-[0_-8px_24px_rgba(31,28,24,0.08)] backdrop-blur lg:hidden" @click="mobileTicketOpen = true"><div><p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">{{ t('restaurantPos.quickCart') }}</p><p class="mt-0.5 text-sm text-stone-600">{{ t('common.itemCount', { count: cartItemCount }) }}</p></div><div class="flex items-center gap-3"><strong class="text-lg tabular-nums">{{ money(displayTotal) }}</strong><span class="rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white">ดูบิล</span></div></button>

					<div class="fixed inset-0 z-50 items-end bg-black/45 p-3 lg:static lg:z-auto lg:contents lg:bg-transparent lg:p-0" :class="mobileTicketOpen ? 'flex' : 'hidden lg:contents'" @click.self="mobileTicketOpen = false">
					<aside class="flex max-h-[88dvh] w-full min-h-0 flex-col overflow-hidden rounded-md border border-neutral-200 bg-white shadow-2xl lg:max-h-none lg:shadow-none">
						<header class="border-b p-3"><div class="flex items-start justify-between gap-2"><template v-if="order"><div class="min-w-0"><h2 class="truncate font-semibold">{{ orderLabel }}</h2><p class="mt-0.5 truncate text-xs text-stone-500">{{ order.service_mode === 'pickup' ? t('restaurantPos.takeaway') : t('restaurantPos.dineIn') }} · {{ elapsed(order.opened_at) }}</p></div><div class="flex shrink-0 items-center gap-2"><UBadge :color="order.status === 'ready_to_pay' ? 'warning' : 'success'" variant="soft">{{ order.status === 'ready_to_pay' ? t('restaurantPos.readyToPay') : t('restaurantPos.open') }}</UBadge><AppButton class="lg:hidden" size="xs" color="neutral" variant="ghost" icon="i-heroicons-x-mark" aria-label="ปิดบิล" @click="mobileTicketOpen = false" /></div></template><template v-else><div><h2 class="font-semibold">{{ t('restaurantPos.quickCart') }}</h2><p class="text-xs text-stone-500">{{ t('restaurantPos.quickCartHint') }}</p></div><AppButton class="lg:hidden" size="xs" color="neutral" variant="ghost" icon="i-heroicons-x-mark" aria-label="ปิดบิล" @click="mobileTicketOpen = false" /></template></div></header>
						<div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
							<div v-if="!order && !localCart.length" class="flex min-h-56 flex-col items-center justify-center text-center"><UIcon name="i-heroicons-shopping-cart" class="size-10 text-stone-300" /><p class="mt-3 font-medium text-stone-700">{{ t('restaurantPos.noItems') }}</p><p class="mt-1 text-sm text-stone-500">{{ t('restaurantPos.selectProduct') }}</p></div>
							<section v-if="draftItems.length"><p class="mb-1.5 text-[11px] font-semibold uppercase text-orange-600">รายการร่าง · ยังไม่ส่งครัว</p><div class="divide-y divide-orange-100 rounded-md border border-orange-200 bg-orange-50/60"><div v-for="item in draftItems" :key="item.id" class="px-2.5 py-2"><div class="flex items-start justify-between gap-2"><div class="min-w-0 flex-1"><p class="truncate text-sm font-semibold">{{ item.name }} <span v-if="item.is_gift" class="text-emerald-600">· ฟรี</span></p><p v-if="item.note" class="mt-0.5 truncate text-[11px] text-stone-500">{{ item.note }}</p></div><p class="shrink-0 text-sm font-semibold tabular-nums">{{ money(item.line_total) }}</p></div><div class="mt-1.5 flex items-center justify-end gap-1"><template v-if="!item.is_gift"><AppButton size="xs" color="neutral" variant="ghost" :disabled="actionPending || isItemPending(item.id)" @click="changeQty(item, -1)">−</AppButton><span class="min-w-7 text-center text-sm font-semibold">{{ item.qty }}</span><AppButton size="xs" color="neutral" variant="ghost" :disabled="actionPending || isItemPending(item.id)" @click="changeQty(item, 1)">+</AppButton></template><span v-else class="text-sm">× {{ item.qty }}</span><AppButton size="xs" color="error" variant="ghost" icon="i-heroicons-trash" :disabled="actionPending || isItemPending(item.id)" :aria-label="`ลบ ${item.name}`" @click="removeItem(item)" /></div></div></div></section>
							<section v-for="([round, items], index) in sentGroups" :key="round" class="rounded-md border border-neutral-200"><button class="flex w-full items-center justify-between px-2.5 py-2 text-left" @click="toggleRound(round)"><span class="text-xs font-semibold text-stone-600">{{ roundMode(round) === 'direct' ? 'ขายตรง' : `ส่งครัวรอบ ${round}` }} · {{ items.length }} รายการ</span><UIcon :name="isRoundExpanded(round, index) ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="size-4 text-stone-400" /></button><div v-if="isRoundExpanded(round, index)" class="divide-y divide-neutral-100 border-t"><div v-for="item in items" :key="item.id" class="flex items-center justify-between gap-2 px-2.5 py-2 text-sm"><span class="min-w-0 flex-1 truncate">{{ item.name }} <em v-if="item.is_gift" class="text-emerald-600">ฟรี</em></span><span class="shrink-0">× {{ item.qty }}</span><AppButton v-if="can('pos.restaurant.cancel_sent')" size="xs" color="error" variant="ghost" icon="i-heroicons-x-mark" @click="cancellingItem = item; cancelReason = ''; sentItemPanel = true" /></div><AppButton v-if="roundMode(round) === 'kitchen'" class="m-2" size="xs" color="neutral" variant="soft" icon="i-heroicons-printer" @click="printDocument('kitchen', round)">พิมพ์ซ้ำ</AppButton></div></section>
							<label v-for="promotion in (!order ? availablePromotions : [])" :key="`local:${promotion.promotion_id}`" class="flex cursor-pointer items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2"><input v-model="selectedPromotionIds" type="checkbox" :value="promotion.promotion_id" class="accent-emerald-600"><span class="min-w-0 flex-1 truncate text-xs font-semibold text-emerald-900">🎁 {{ promotion.name }}</span><span class="text-[11px] text-emerald-700">ของแถม × {{ promotion.gift_qty }}</span></label><div v-for="promotion in visiblePromotions" :key="promotion.promotion_id" class="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2"><div class="min-w-0 flex-1"><p class="truncate text-xs font-semibold text-emerald-900">🎁 {{ promotion.name }}</p><p class="truncate text-[11px] text-emerald-700">{{ promotion.eligible ? `รับ ${promotion.gift_product_name} ฟรี ${promotion.gift_qty}` : promotion.remaining_qty ? `สั่งเพิ่มอีก ${promotion.remaining_qty} เพื่อรับของแถม` : `เพิ่มยอดอีก ${money(promotion.remaining_amount)} เพื่อรับของแถม` }}</p></div><AppButton v-if="promotion.eligible" size="xs" color="success" @click="applyPromotion(promotion)">เพิ่ม</AppButton></div><button v-if="(order?.promotions.filter((promotion) => promotion.apply_mode === 'manual' && (promotion.eligible || promotion.remaining_qty || promotion.remaining_amount)).length || 0) > 1" class="text-xs font-medium text-emerald-700" @click="showAllPromotions = !showAllPromotions">{{ showAllPromotions ? 'แสดงน้อยลง' : 'ดูโปรโมชั่นทั้งหมด' }}</button>
						</div>
						<footer v-if="order || localCart.length" class="relative space-y-2 border-t bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pb-3"><div class="flex items-center justify-between"><span class="text-sm text-stone-500">{{ t('restaurantPos.total') }}</span><strong class="text-xl tabular-nums">{{ money(displayTotal) }}</strong></div><template v-if="!order"><AppButton block color="primary" :loading="actionPending" @click="openCheckout('direct')">{{ t('restaurantPos.payDirect') }}</AppButton></template><template v-else-if="draftItems.length"><p v-if="hasLocalTableDraft" class="text-xs text-orange-700">รายการใหม่อยู่ในเครื่อง กรุณาส่งครัวเพื่อตรวจสต็อกก่อนชำระ</p><AppButton v-if="!hasLocalTableDraft" block color="primary" :loading="actionPending" @click="openCheckout('direct')">{{ t('restaurantPos.payDirect') }}</AppButton><div class="grid grid-cols-[minmax(0,1fr)_44px] gap-2"><AppButton color="neutral" variant="soft" :loading="actionPending" @click="sendKitchen({ print: true, park: false, pay: false })">ส่งครัว</AppButton><AppButton color="neutral" variant="soft" icon="i-heroicons-ellipsis-horizontal" aria-label="คำสั่งเพิ่มเติม" @click="moreActionsOpen = !moreActionsOpen" /></div></template><template v-else><div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] gap-2"><AppButton color="primary" :loading="actionPending" @click="openCheckout('existing')">{{ t('restaurantPos.pay') }}</AppButton><AppButton color="neutral" variant="soft" @click="markReady">{{ t('restaurantPos.checkBill') }}</AppButton><AppButton color="neutral" variant="soft" icon="i-heroicons-ellipsis-horizontal" aria-label="คำสั่งเพิ่มเติม" @click="moreActionsOpen = !moreActionsOpen" /></div></template><div v-if="moreActionsOpen" class="absolute inset-x-3 bottom-[calc(100%+0.25rem)] z-20 overflow-hidden rounded-md border border-neutral-200 bg-white p-1.5 shadow-xl"><button v-if="draftItems.length && !hasLocalTableDraft" class="w-full rounded px-3 py-2 text-left text-sm hover:bg-neutral-50" @click="moreActionsOpen = false; sendKitchen({ print: true, park: false, pay: true })">ส่งครัวและชำระ</button><button v-if="draftItems.length" class="w-full rounded px-3 py-2 text-left text-sm hover:bg-neutral-50" @click="moreActionsOpen = false; sendKitchen({ print: true, park: true, pay: false })">ส่งครัวและพักคิว</button><button class="w-full rounded px-3 py-2 text-left text-sm hover:bg-neutral-50" @click="moreActionsOpen = false; parkOrder()">{{ t('restaurantPos.parkOrder') }}</button><button class="w-full rounded px-3 py-2 text-left text-sm hover:bg-neutral-50" @click="moreActionsOpen = false; mobileTicketOpen = false; view = 'tables'">{{ order.service_mode === 'pickup' ? t('restaurantPos.selectTable') : t('restaurantPos.moveTable') }}</button><button v-if="order.service_mode === 'dine-in'" class="w-full rounded px-3 py-2 text-left text-sm hover:bg-neutral-50" @click="moreActionsOpen = false; changeToPickup()">{{ t('restaurantPos.changeToTakeaway') }}</button><button class="w-full rounded px-3 py-2 text-left text-sm hover:bg-neutral-50" @click="moreActionsOpen = false; refreshOrder()">{{ t('restaurantPos.reload') }}</button><button class="w-full rounded px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50" @click="moreActionsOpen = false; cancelReason = ''; cancelPanel = true">{{ t('restaurantPos.cancelOrder') }}</button></div></footer>
					</aside>
					</div>
				</div>

				<div v-else-if="view === 'tables'" class="space-y-3"><div v-if="order" class="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">กำลังเลือกโต๊ะให้ <strong>{{ orderLabel }}</strong> — รายการสินค้าและโปรโมชั่นเดิมจะไม่หาย</div><div v-if="zones.length" class="flex gap-2 overflow-x-auto"><AppButton v-for="zone in zones" :key="zone.id" :color="activeZone === zone.id ? 'primary' : 'neutral'" :variant="activeZone === zone.id ? 'solid' : 'soft'" @click="activeZone = zone.id">{{ zone.name }}</AppButton></div><div v-if="!zones.length" class="flex min-h-72 flex-col items-center justify-center rounded-md border border-dashed border-neutral-300 bg-white p-8 text-center"><UIcon name="i-heroicons-table-cells" class="size-10 text-stone-400" /><h2 class="mt-3 font-semibold">ยังไม่มีโซนและโต๊ะ</h2><p class="mt-1 text-sm text-stone-500">ยังขายด่วนและรับชำระได้ตามปกติ โดยไม่ต้องตั้งค่าโต๊ะ</p><div class="mt-4 flex gap-2"><AppButton color="neutral" variant="soft" @click="view = 'quick'">กลับไปขายด่วน</AppButton><AppButton v-if="can('settings.restaurant.update')" to="/settings/restaurant">ตั้งค่าโต๊ะ</AppButton></div></div><div v-else-if="!zoneTables.length" class="rounded-md border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-stone-500">โซนนี้ยังไม่มีโต๊ะที่เปิดใช้งาน</div><div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"><button v-for="table in zoneTables" :key="table.id" class="min-h-36 rounded-md border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md" :class="tableTone(table)" @click="chooseTable(table)"><div class="flex items-start justify-between"><div><p class="text-lg font-semibold">{{ table.name }}</p><p class="text-xs text-stone-500">{{ table.capacity }} ที่นั่ง</p></div><UIcon :name="table.order_id ? 'i-heroicons-user-group' : 'i-heroicons-check-circle'" class="size-5" /></div><div class="mt-5"><template v-if="table.order_id"><p class="font-semibold">{{ money(Number(table.total || 0)) }}</p><p class="mt-1 text-xs text-stone-500">{{ elapsed(table.opened_at) }} · {{ table.guest_count }} คน</p><UBadge v-if="table.draft_count" class="mt-2" color="warning" variant="soft">{{ table.draft_count }} รายการยังไม่ส่ง</UBadge><UBadge v-else-if="table.order_status === 'ready_to_pay'" class="mt-2" color="warning" variant="soft">ขอเช็กบิล</UBadge></template><p v-else class="text-sm font-medium text-emerald-700">ว่าง · เลือกโต๊ะ</p></div></button></div></div>

				<div v-else class="space-y-3"><div v-if="!openOrders.length" class="flex min-h-72 flex-col items-center justify-center rounded-md border border-dashed border-neutral-300 bg-white p-8 text-center"><UIcon name="i-heroicons-check-circle" class="size-10 text-emerald-500" /><h2 class="mt-3 font-semibold">ไม่มีออเดอร์ที่เปิด</h2><p class="mt-1 text-sm text-stone-500">ออเดอร์ที่พักไว้และโต๊ะที่ใช้งานจะแสดงที่นี่</p><AppButton class="mt-4" @click="view = 'quick'">เริ่มขายด่วน</AppButton></div><div v-else class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><button v-for="opened in openOrders" :key="opened.id" class="rounded-md border border-neutral-200 bg-white p-4 text-left shadow-sm hover:border-primary-300" @click="loadOrder(opened.id)"><div class="flex items-start justify-between"><div><p class="font-semibold">{{ opened.service_mode === 'pickup' ? `คิว ${opened.queue_no}` : `${opened.zone_name} · ${opened.table_name}` }}</p><p class="mt-1 text-xs text-stone-500">{{ opened.service_mode === 'pickup' ? 'ซื้อกลับบ้าน' : 'ทานที่ร้าน' }} · {{ elapsed(opened.opened_at) }}</p></div><UBadge :color="opened.status === 'ready_to_pay' ? 'warning' : 'primary'" variant="soft">{{ opened.status === 'ready_to_pay' ? 'ขอเช็กบิล' : 'เปิดอยู่' }}</UBadge></div><p class="mt-5 text-lg font-semibold">{{ money(opened.total) }}</p><p class="mt-1 text-xs text-stone-500">ร่าง {{ opened.draft_count }} · ส่งแล้ว {{ opened.sent_count }}</p></button></div></div>
			</div>
		</template>
	</AppSidebarShell>

	<AppResponsivePanel v-model="guestPanel" title="เลือกโต๊ะ" :description="selectedTable ? `${selectedTable.zone_name} · ${selectedTable.name}` : ''" desktop-width="520px"><div class="space-y-4"><UFormField label="จำนวนลูกค้า"><UInput v-model.number="guestCount" class="w-full" type="number" min="1" max="100" /></UFormField><div class="flex justify-end gap-2"><AppButton color="neutral" variant="soft" @click="guestPanel = false">ยกเลิก</AppButton><AppButton :loading="actionPending" @click="confirmTable">ยืนยันโต๊ะ</AppButton></div></div></AppResponsivePanel>
	<AppResponsivePanel v-model="checkoutPanel" title="ชำระเงิน" :description="order ? orderLabel : 'ขายด่วน · จะสร้างคิวเมื่อชำระสำเร็จ'" desktop-width="600px"><div class="space-y-4"><div v-if="checkoutDispatch === 'direct'" class="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">ระบบจะตรวจราคาและสต็อก สร้างคิว ตัดสต็อก และปิดการขายพร้อมกันเมื่อยืนยัน</div><div class="grid grid-cols-3 gap-2"><AppButton v-for="method in [{ id: 'cash', label: 'เงินสด' }, { id: 'qr_transfer', label: 'QR / โอน' }, { id: 'credit_card', label: 'บัตร' }]" :key="method.id" :color="paymentMethod === method.id ? 'primary' : 'neutral'" :variant="paymentMethod === method.id ? 'solid' : 'soft'" @click="paymentMethod = method.id as any">{{ method.label }}</AppButton></div><UFormField v-if="paymentMethod === 'cash'" label="รับเงิน"><UInput v-model.number="cashTendered" class="w-full" type="number" min="0" /></UFormField><template v-if="paymentMethod === 'qr_transfer' && !order"><UFormField label="บัญชีรับเงิน"><select v-model="paymentAccountId" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm"><option value="">เลือกบัญชี</option><option v-for="account in paymentAccounts" :key="account.id" :value="account.id">{{ account.display_name }}</option></select></UFormField><UFormField label="URL สลิป"><UInput v-model="paymentSlipUrl" class="w-full" type="url" placeholder="https://..." /></UFormField></template><div class="rounded-md bg-neutral-50 p-4"><div class="flex justify-between"><span>ยอดชำระ</span><strong>{{ money(displayTotal) }}</strong></div><div v-if="paymentMethod === 'cash'" class="mt-2 flex justify-between text-sm"><span>เงินทอน</span><span>{{ money(Math.max(0, cashTendered - displayTotal)) }}</span></div></div><AppButton block :loading="actionPending" :disabled="paymentMethod === 'cash' ? cashTendered < displayTotal : paymentMethod === 'qr_transfer' && !order ? !paymentAccountId || !paymentSlipUrl : false" @click="checkout">ยืนยันชำระเงิน</AppButton></div></AppResponsivePanel>
	<AppResponsivePanel v-model="cancelPanel" title="ยกเลิกออเดอร์" :description="orderLabel" desktop-width="520px"><div class="space-y-4"><div v-if="order?.items.some((item) => item.line_status === 'sent')" class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">ออเดอร์นี้ส่งครัวแล้ว ต้องใช้สิทธิ์ Manager และระบุเหตุผล ระบบจะไม่คืนสต็อกอัตโนมัติ</div><UFormField label="เหตุผล"><UTextarea v-model="cancelReason" class="w-full" :rows="3" maxlength="280" /></UFormField><div class="flex justify-end gap-2"><AppButton color="neutral" variant="soft" @click="cancelPanel = false">กลับ</AppButton><AppButton color="error" :loading="actionPending" :disabled="Boolean(order?.items.some((item) => item.line_status === 'sent')) && !cancelReason.trim()" @click="cancelOrder">ยืนยันยกเลิก</AppButton></div></div></AppResponsivePanel>
	<AppResponsivePanel v-model="sentItemPanel" title="ยกเลิกรายการที่ส่งแล้ว" :description="cancellingItem?.name || ''" desktop-width="520px"><div class="space-y-4"><div class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">ระบบจะบันทึกผู้ยกเลิกและไม่คืนสต็อกอัตโนมัติ</div><UFormField label="เหตุผล (บังคับ)"><UTextarea v-model="cancelReason" class="w-full" :rows="3" maxlength="280" /></UFormField><div class="flex justify-end gap-2"><AppButton color="neutral" variant="soft" @click="sentItemPanel = false">กลับ</AppButton><AppButton color="error" :loading="actionPending" :disabled="!cancelReason.trim()" @click="cancelSentItem">ยืนยัน</AppButton></div></div></AppResponsivePanel>

	<div class="restaurant-print-root"><div class="print-sheet"><h1>{{ printKind === 'kitchen' ? 'ใบสั่งครัว' : printKind === 'check' ? 'ใบเช็กบิล' : 'ใบเสร็จรับเงิน' }}</h1><p v-if="printKind === 'check'" class="print-unpaid">ยังไม่ชำระ</p><p>{{ printLabel }}</p><p>{{ printOrderNo }}<template v-if="printRound"> · รอบ {{ printRound }}</template></p><hr><div v-for="item in printItems" :key="item.id"><div class="print-line"><span>{{ item.name }} <b v-if="item.is_gift">(ฟรี)</b></span><span>× {{ item.qty }}<template v-if="printKind !== 'kitchen'"> · {{ money(item.line_total) }}</template></span></div><p v-if="item.note" class="print-note">หมายเหตุ: {{ item.note }}</p></div><template v-if="printKind !== 'kitchen'"><hr><div class="print-line"><span>ยอดก่อนภาษี</span><span>{{ money(printSubtotal) }}</span></div><div v-if="printVat" class="print-line"><span>ภาษี</span><span>{{ money(printVat) }}</span></div><div class="print-total"><strong>รวม</strong><strong>{{ money(printTotal) }}</strong></div><template v-if="printKind === 'receipt'"><div class="print-line"><span>วิธีชำระ</span><span>{{ printPaymentMethod }}</span></div><div class="print-line"><span>รับเงิน</span><span>{{ money(printTendered) }}</span></div><div class="print-line"><span>เงินทอน</span><span>{{ money(printChange) }}</span></div></template></template><p class="print-time">{{ new Date().toLocaleString('th-TH') }}</p></div></div>
</template>

<style scoped>
.restaurant-print-root{display:none}.print-line,.print-total{display:flex;justify-content:space-between;gap:12px;margin:7px 0}.print-sheet h1{text-align:center;font-size:18px}.print-time,.print-unpaid{text-align:center;margin-top:16px;font-size:11px}.print-unpaid{font-size:14px;font-weight:700}.print-note{margin:-4px 0 7px 12px;font-size:11px}
@media print{body *{visibility:hidden!important}.restaurant-print-root,.restaurant-print-root *{visibility:visible!important}.restaurant-print-root{display:block!important;position:fixed;inset:0;background:#fff;color:#000;padding:8mm;font-family:ui-monospace,monospace}.print-sheet{width:72mm;margin:0 auto;font-size:12px}.print-sheet hr{border:0;border-top:1px dashed #000;margin:10px 0}}
</style>
