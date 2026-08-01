<script setup lang="ts">
import { Banknote, Loader } from "@lucide/vue";
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";
import { formatMoneyWithSymbol } from "~/utils/currency";

type Envelope<T> = { data: T };
type PosView = "quick" | "tables" | "open" | "pickupQueue";
type Zone = { id: string; name: string; sort_order: number; is_active: number };
type DiningTable = { id: string; zone_id: string; zone_name: string; name: string; capacity: number; is_active: number; order_id?: string | null; order_status?: string | null; total?: number; guest_count?: number; guest_count_specified?: number; opened_at?: string; draft_count?: number };
type Product = { id: string; name: string; sku: string; price_base: number; inventory_mode: "tracked" | "untracked"; manual_sold_out: number; stock_state: string; available_base: number; image_url?: string | null };
type PosCatalog = { store: Record<string, unknown>; items: Product[] };
type OrderItem = { id: string; product_id: string; name: string; sku: string; qty: number; line_total: number; line_status: "draft" | "sent" | "cancelled"; is_gift: number; promotion_id?: string | null; note?: string | null; round_no?: number | null };
type PromotionType = "buy_x_get_y" | "cart_total_gift" | "cart_discount" | "cart_threshold_discount";
type Promotion = { promotion_id: string; name: string; type?: PromotionType; apply_mode: "automatic" | "manual"; qualifying_product_id?: string | null; qualifying_qty?: number | null; gift_product_id?: string | null; gift_product_name: string; gift_qty: number; discount_amount?: number; eligible: boolean; remaining_qty: number; remaining_amount: number };
type Round = { id: string; round_no: number; dispatch_mode: "kitchen" | "direct"; sent_at: string };
type Order = { id: string; order_no: string; status: string; version: number; service_mode: "pickup" | "dine-in"; queue_no?: string | null; table_name?: string | null; zone_name?: string | null; guest_count: number; guest_count_specified?: number; opened_at: string; subtotal: number; discount?: number; vat_amount: number; total: number; payment_method?: string; amount_tendered?: number; change_amount?: number; items: OrderItem[]; rounds: Round[]; promotions: Promotion[] };
type OpenOrder = Pick<Order, "id" | "order_no" | "service_mode" | "queue_no" | "status" | "total" | "guest_count" | "guest_count_specified" | "opened_at" | "version" | "table_name" | "zone_name"> & { draft_count: number; sent_count: number };
type PickupQueueOrder = { id:string;order_no:string;queue_no:string|null;total:number;payment_method:string;paid_at:string;created_at:string;collected_at?:string|null;collected_by?:string|null;collected_by_name?:string|null;items:Array<{product_id:string;name:string;qty:number;line_total:number;is_gift:number}> };
type LocalCartEntry = { product_id: string; qty: number; note?: string | null };
type TableDraftEntry = { product_id: string; qty: number; note?: string | null; is_gift?: boolean; promotion_id?: string | null };
type PaymentAccount = { id: string; display_name: string; is_active: number };
type AvailablePromotion = { promotion_id: string; name: string; type?: PromotionType; apply_mode?: "automatic" | "manual"; applications: number; qualifying_product_id?: string | null; qualifying_qty?: number | null; gift_product_id: string | null; gift_product_name?: string; gift_qty: number; discount_method?: "percent" | "fixed" | null; discount_value?: number; discount_amount?: number; eligible?: boolean; remaining_qty?: number; remaining_amount?: number };
type PromotionRecord = { id: string; name: string; type: PromotionType; apply_mode: "automatic" | "manual"; qualifying_product_id?: string | null; qualifying_qty?: number | null; minimum_subtotal?: number | null; gift_product_id: string | null; gift_product_name?: string | null; gift_qty: number; discount_method?: "percent" | "fixed" | null; discount_value?: number | null; starts_at?: string | null; ends_at?: string | null; is_active: number };
type CheckoutResult = {
	order_id: string; order_no: string; queue_no: string | null; queue_date: string | null; subtotal: number; vat_amount: number; total: number;
	payment_method: "cash" | "qr_transfer" | "credit_card"; amount_tendered: number; change_amount: number; completed_at: string;
	receipt: { lines: Array<{ product_id: string; name: string; sku: string; qty: number; unit_price: number; line_total: number; is_gift: boolean; promotion_id: string | null }> };
};

const props = defineProps<{ storeId: string; initialCatalog?: PosCatalog | null }>();
const { apiFetch } = useApiClient();
const toast = useAppToast();
const { locale, t } = useI18n();
const { can } = useAuthSession();
const runtimeConfig = useRuntimeConfig();

const view = ref<PosView>("quick");
const pickupQueueEnabled = ref(false);
const pickupQueue = ref<PickupQueueOrder[]>([]);
const pickupQueueHistory = ref<PickupQueueOrder[]>([]);
const pickupQueueDetail = ref<PickupQueueOrder | null>(null);
const pickupQueueDetailOpen = ref(false);
const pickupQueueHistoryOpen = ref(false);
const pickupQueueHistoryPending = ref(false);
const collectingOrderId = ref("");
const mobileTicketOpen = ref(false);
const moreActionsOpen = ref(false);
const tableActionsOpen = ref(false);
const promotionPanelOpen = ref(false);
const menuAvailabilityOpen = ref(false);
const menuAvailabilityPendingId = ref("");
const menuAvailabilitySearch = ref("");
const catalogLoadedOnce = ref(false);
const zones = ref<Zone[]>([]);
const tables = ref<DiningTable[]>([]);
const products = ref<Product[]>([]);
const openOrders = ref<OpenOrder[]>([]);
const order = ref<Order | null>(null);
const completedOrder = ref<Order | null>(null);
const localCart = ref<LocalCartEntry[]>([]);
const tableDraft = ref<TableDraftEntry[]>([]);
const checkoutReceipt = ref<CheckoutResult | null>(null);
const availablePromotions = ref<AvailablePromotion[]>([]);
const selectedPromotionIds = ref<string[]>([]);
const selectedPromotionCounts = ref<Record<string, number>>({});
const activeZone = ref("");
const search = ref("");
const storeName = ref("ร้านค้า");
const storeLogo = ref("");
const storeAddress = ref("");
const storePhone = ref("");
const receiptShowStoreName = ref(true);
const receiptShowStoreLogo = ref(false);
const receiptShowStoreAddress = ref(true);
const receiptShowStorePhone = ref(true);
const receiptShowTendered = ref(true);
const receiptShowChange = ref(true);
const receiptShowPaymentMethod = ref(true);
const receiptShowQueue = ref(true);
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
const tableSelectionMode = ref<"browse" | "move" | "cart">("browse");
const guestCount = ref<number | null>(null);
const checkoutPanel = ref(false);
const checkoutStep = ref<"payment" | "processing" | "success" | "receipt">("payment");
const checkoutDispatch = ref<"existing" | "direct">("existing");
const paymentMethod = ref<"cash" | "qr_transfer" | "credit_card">("cash");
const cashTendered = ref(0);
const cashTenderedHistory = ref<number[]>([]);
const paymentAccounts = ref<PaymentAccount[]>([]);
const paymentAccountId = ref("");
const cancelPanel = ref(false);
const cancelReason = ref("");
const clearCartPanel = ref(false);
const sentItemPanel = ref(false);
const cancellingItem = ref<OrderItem | null>(null);
const sentItemQty = ref(0);
const sentItemReasonPreset = ref("");
const printKind = ref<"kitchen" | "check" | "estimate" | "receipt">("kitchen");
const printRound = ref<number | null>(null);
const printPreviewOpen = ref(false);
let sendKey = "";
let checkoutKey = "";
let desktopMedia: MediaQueryList | null = null;
let promotionTimer: ReturnType<typeof setTimeout> | null = null;
let checkoutSuccessTimer: ReturnType<typeof setTimeout> | null = null;
const paymentMethodOptions = computed(() => [
	{ id: "cash" as const, label: t("pos.cash"), icon: "i-heroicons-banknotes" },
	{ id: "qr_transfer" as const, label: t("pos.qr"), icon: "i-heroicons-qr-code" },
	{ id: "credit_card" as const, label: t("pos.card"), icon: "i-heroicons-credit-card" },
]);
const sentItemReasonPresets = computed(() => [
	t("posPanels.reasonSoldOut"),
	t("posPanels.reasonChangedMind"),
	t("posPanels.reasonMistake"),
	t("posPanels.reasonOther"),
]);

const filteredProducts = computed(() => {
	const query = search.value.trim().toLowerCase();
	return products.value.filter((product) => !query || product.name.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query));
});
// A store with nothing in its catalog needs different wording from a search
// that matched nothing, so the two empty states are tracked separately.
const hasEmptyCatalog = computed(() => !pending.value && !loadError.value && products.value.length === 0);
const hasNoSearchMatch = computed(() => (
	!pending.value && !loadError.value && products.value.length > 0 && filteredProducts.value.length === 0
));
const canCreateProduct = computed(() => can("products.create"));
const zoneTables = computed(() => tables.value.filter((table) => table.is_active && (!activeZone.value || table.zone_id === activeZone.value)));
function giftLineForPromotion(promotion: AvailablePromotion, count: number): OrderItem[] {
	if (promotion.eligible === false || !promotion.gift_product_id || promotion.gift_qty <= 0 || count <= 0) return [];
	const product = products.value.find((candidate) => candidate.id === promotion.gift_product_id);
	const giftPerApplication = Math.max(1, Math.round(Number(promotion.gift_qty || 0) / Math.max(1, Number(promotion.applications || 1))));
	return [{
		id: `gift:${promotion.promotion_id}`,
		product_id: promotion.gift_product_id,
		name: product?.name || promotion.gift_product_name || promotion.name,
		sku: product?.sku || "",
		qty: giftPerApplication * count,
		line_total: 0,
		line_status: "draft" as const,
		is_gift: 1,
		promotion_id: promotion.promotion_id,
		note: promotion.name,
	}];
}
const localItems = computed<OrderItem[]>(() => {
	const paidItems = localCart.value.flatMap((entry) => {
		const product = products.value.find((candidate) => candidate.id === entry.product_id);
		return product ? [{ id: `local:${product.id}`, product_id: product.id, name: product.name, sku: product.sku, qty: entry.qty, line_total: product.price_base * entry.qty, line_status: "draft" as const, is_gift: 0, note: entry.note }] : [];
	});
	const manualGiftItems = selectedPromotionIds.value.flatMap((promotionId) => {
		const promotion = availablePromotions.value.find((candidate) => candidate.promotion_id === promotionId);
		return promotion ? giftLineForPromotion(promotion, Math.max(1, selectedPromotionCounts.value[promotionId] || 1)) : [];
	});
	const automaticGiftItems = availablePromotions.value.flatMap((promotion) => {
		if (!isAutomaticPromotion(promotion) || selectedPromotionIds.value.includes(promotion.promotion_id) || promotionBlockedReason(promotion)) return [];
		return giftLineForPromotion(promotion, Math.max(0, Number(promotion.applications || 0)));
	});
	return [ ...paidItems, ...manualGiftItems, ...automaticGiftItems ];
});
const tableDraftItems = computed<OrderItem[]>(() => tableDraft.value.flatMap((entry) => {
	const product = products.value.find((candidate) => candidate.id === entry.product_id);
	return product ? [{ id: `table:${product.id}:${entry.note || ""}:${entry.is_gift ? "gift" : "paid"}`, product_id: product.id, name: product.name, sku: product.sku, qty: entry.qty, line_total: entry.is_gift ? 0 : product.price_base * entry.qty, line_status: "draft", is_gift: entry.is_gift ? 1 : 0, promotion_id: entry.promotion_id || null, note: entry.note }] : [];
}));
const serverDraftItems = computed(() => order.value?.items.filter((item) => item.line_status === "draft") || []);
const draftItems = computed(() => order.value ? [ ...serverDraftItems.value, ...tableDraftItems.value ] : localItems.value);
const cartItemCount = computed(() => (order.value ? [ ...(order.value.items || []), ...tableDraftItems.value ] : localItems.value)
	.filter((item) => item.line_status !== "cancelled")
	.reduce((total, item) => total + Number(item.qty || 0), 0));
const localSubtotal = computed(() => localItems.value.reduce((total, item) => total + Number(item.line_total || 0), 0));
const localPromotionIds = computed(() => [ ...new Set([
	...selectedPromotionIds.value,
	...availablePromotions.value
		.filter((promotion) => isAutomaticPromotion(promotion) && promotion.eligible !== false && Number(promotion.applications || 0) > 0 && !promotionBlockedReason(promotion))
		.map((promotion) => promotion.promotion_id),
]) ]);
const localDiscount = computed(() => Math.min(localSubtotal.value, availablePromotions.value
	.filter((promotion) => localPromotionIds.value.includes(promotion.promotion_id))
	.reduce((total, promotion) => total + Math.max(0, Number(promotion.discount_amount || 0)), 0)));
const localDiscountedSubtotal = computed(() => Math.max(0, localSubtotal.value - localDiscount.value));
const localVat = computed(() => {
	if (!vatEnabled.value) return 0;
	const rate = vatRate.value > 100 ? vatRate.value / 100 : vatRate.value;
	return Math.round(vatMode.value === "INCLUSIVE" ? localDiscountedSubtotal.value * rate / (100 + rate) : localDiscountedSubtotal.value * rate / 100);
});
const localTotal = computed(() => vatEnabled.value && vatMode.value !== "INCLUSIVE" ? localDiscountedSubtotal.value + localVat.value : localDiscountedSubtotal.value);
const tableDraftSubtotal = computed(() => tableDraftItems.value.reduce((total, item) => total + Number(item.line_total || 0), 0));
const billingSubtotal = computed(() => order.value ? Number(order.value.subtotal || 0) + tableDraftSubtotal.value : localSubtotal.value);
const billingDiscount = computed(() => order.value ? Math.max(0, Number(order.value.discount || 0)) : localDiscount.value);
const billingDiscountedSubtotal = computed(() => Math.max(0, billingSubtotal.value - billingDiscount.value));
const billingVat = computed(() => {
	if (!vatEnabled.value) return 0;
	const rate = vatRate.value > 100 ? vatRate.value / 100 : vatRate.value;
	return Math.round(vatMode.value === "INCLUSIVE" ? billingDiscountedSubtotal.value * rate / (100 + rate) : billingDiscountedSubtotal.value * rate / 100);
});
const billingNetSubtotal = computed(() => vatMode.value === "INCLUSIVE" ? Math.max(0, billingDiscountedSubtotal.value - billingVat.value) : billingDiscountedSubtotal.value);
const vatRateLabel = computed(() => {
	const rate = vatRate.value > 100 ? vatRate.value / 100 : vatRate.value;
	return Number.isInteger(rate) ? String(rate) : rate.toFixed(2).replace(/\.?0+$/, "");
});
const displayTotal = computed(() => {
	if (!order.value) return localTotal.value;
	const subtotal = Math.max(0, Number(order.value.subtotal || 0) + tableDraftSubtotal.value - Number(order.value.discount || 0));
	const rate = vatRate.value > 100 ? vatRate.value / 100 : vatRate.value;
	const vat = vatEnabled.value ? Math.round(vatMode.value === "INCLUSIVE" ? subtotal * rate / (100 + rate) : subtotal * rate / 100) : 0;
	return vatMode.value === "INCLUSIVE" ? subtotal : subtotal + vat;
});
const cashQuickAmounts = [10_000, 20_000, 50_000, 100_000];
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
function displayQueueNo(queueNo: string | null | undefined) {
	const normalized = String(queueNo || "").trim();
	if (!normalized) return "-";
	const numeric = normalized.replace(/^[A-Za-z]+/, "");
	return /^\d+$/.test(numeric) ? numeric.padStart(3, "0") : normalized;
}
function displayGuestCount(value: number | null | undefined, specified: number | null | undefined) {
	return specified ? t("restaurantPos.people", { count: Math.max(1, Math.round(Number(value || 1))) }) : t("restaurantPos.unspecified");
}
function setGuestCount(value: number | null) {
	guestCount.value = value === null ? null : Math.min(100, Math.max(1, Math.round(Number(value || 1))));
}
const manualPromotions = computed(() => {
	const promotions = order.value?.promotions
		.filter((promotion) => promotion.apply_mode === "manual" && (promotion.eligible || promotion.remaining_qty || promotion.remaining_amount)) || [];
	return [ ...promotions ].sort((a, b) => {
		if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
		return (a.remaining_qty || Number.MAX_SAFE_INTEGER) - (b.remaining_qty || Number.MAX_SAFE_INTEGER)
			|| (a.remaining_amount || Number.MAX_SAFE_INTEGER) - (b.remaining_amount || Number.MAX_SAFE_INTEGER);
	});
});
const promotionOptions = computed(() => availablePromotions.value.filter(isManualPromotion));
const promotionOptionCount = computed(() => promotionOptions.value.length);
// Only untracked menu items have a sold-out switch; stocked products are
// governed by their stock balance instead.
const menuAvailabilityItems = computed(() => products.value.filter((product) => product.inventory_mode === "untracked"));
// Sold-out items float to the top: the usual reason for opening this panel is
// to put something back on sale once the kitchen restocks.
const menuAvailabilityVisible = computed(() => {
	const keyword = menuAvailabilitySearch.value.trim().toLowerCase();
	const matched = keyword
		? menuAvailabilityItems.value.filter((product) => (
			product.name.toLowerCase().includes(keyword)
			|| String(product.sku || "").toLowerCase().includes(keyword)
		))
		: menuAvailabilityItems.value.slice();

	return matched.sort((a, b) => {
		const soldOut = Number(Boolean(b.manual_sold_out)) - Number(Boolean(a.manual_sold_out));
		return soldOut !== 0 ? soldOut : a.name.localeCompare(b.name);
	});
});
const menuAvailabilitySearchable = computed(() => menuAvailabilityItems.value.length > 8);
const menuSoldOutCount = computed(() => menuAvailabilityItems.value.filter((product) => Boolean(product.manual_sold_out)).length);
const canManageMenuAvailability = computed(() => can("products.update"));
const selectedPromotionTotal = computed(() => selectedPromotionIds.value.reduce((total, id) => total + Math.max(1, selectedPromotionCounts.value[id] || 1), 0));
const canClearCartDraft = computed(() => order.value ? tableDraft.value.length > 0 : localCart.value.length > 0);
const clearCartTitle = computed(() => t(order.value ? "posPanels.clearNewTitle" : "posPanels.clearCartTitle"));
const clearCartDescription = computed(() => order.value
	? t("posPanels.clearNewDescription")
	: t("posPanels.clearCartDescription"));
const clearCartCountLabel = computed(() => t(order.value ? "posPanels.newItemCount" : "posPanels.itemCount", { count: order.value ? tableDraft.value.length : localCart.value.length }));
const suggestedLocalPromotions = computed(() => {
	if (order.value || localCart.value.length === 0) return [];
	return availablePromotions.value.filter((promotion) => isManualPromotion(promotion) && promotion.eligible !== false && (selectedPromotionCounts.value[promotion.promotion_id] || 0) < Number(promotion.applications || 0) && !promotionBlockedReason(promotion));
});
const guestQuickCounts = computed(() => {
	const capacity = Math.max(1, Math.round(Number(selectedTable.value?.capacity || 4)));
	return [ ...new Set([1, 2, capacity, Math.min(100, capacity + 2)]) ];
});
const automaticCheckoutPromotionIds = computed(() => !order.value
	? availablePromotions.value.filter((promotion) => isAutomaticPromotion(promotion) && promotion.eligible !== false && Number(promotion.applications || 0) > 0 && !promotionBlockedReason(promotion)).map((promotion) => promotion.promotion_id)
	: []);
const checkoutPromotionIds = computed(() => [ ...new Set([ ...selectedPromotionIds.value, ...automaticCheckoutPromotionIds.value ]) ]);
function pendingLocalGiftQty(promotion: AvailablePromotion) {
	const selectedCount = selectedPromotionCounts.value[promotion.promotion_id] || 0;
	const applications = Math.max(0, Number(promotion.applications || 0));
	const giftPerApplication = Math.max(1, Math.round(Number(promotion.gift_qty || 0) / Math.max(1, applications)));
	return Math.max(0, (applications - selectedCount) * giftPerApplication);
}
function isDiscountPromotion(promotion: AvailablePromotion | Promotion) {
	return promotion.type === "cart_discount" || promotion.type === "cart_threshold_discount";
}
function promotionBenefitLabel(promotion: AvailablePromotion) {
	if (isDiscountPromotion(promotion)) return `${t("pos.discount")} -${money(Number(promotion.discount_amount || 0))}`;
	return `${t("restaurantPos.free")} × ${pendingLocalGiftQty(promotion)}`;
}
function isAutomaticPromotion(promotion: AvailablePromotion | Promotion) {
	return promotion.apply_mode === "automatic";
}
function isManualPromotion(promotion: AvailablePromotion | Promotion) {
	return !isAutomaticPromotion(promotion);
}
const receiptItems = computed<OrderItem[]>(() => checkoutReceipt.value?.receipt.lines.map((item, index) => ({
	id: `receipt:${index}`, product_id: item.product_id, name: item.name, sku: item.sku, qty: item.qty,
	line_total: item.line_total, line_status: "sent", is_gift: item.is_gift ? 1 : 0,
})) || []);
const printOrder = computed(() => completedOrder.value || order.value);
const printItems = computed(() => checkoutReceipt.value
	? receiptItems.value
	: printKind.value === "kitchen"
		? printOrder.value?.items.filter((item) => item.line_status === "sent" && Number(item.round_no) === printRound.value) || []
		: printOrder.value?.items.filter((item) => item.line_status !== "cancelled") || localItems.value);
const orderLabel = computed(() => order.value?.service_mode === "pickup"
	? `คิว ${displayQueueNo(order.value.queue_no)}`
	: `${order.value?.zone_name || ""} · ${order.value?.table_name || "โต๊ะ"}`);
const printLabel = computed(() => checkoutReceipt.value
	? `คิว ${displayQueueNo(checkoutReceipt.value.queue_no)} · ซื้อกลับบ้าน`
	: printOrder.value ? (printOrder.value.service_mode === "pickup" ? `คิว ${displayQueueNo(printOrder.value.queue_no)}` : `${printOrder.value.zone_name || ""} · ${printOrder.value.table_name || "โต๊ะ"}`) : "ขายด่วน · ยังไม่ชำระ");
const printQueueText = computed(() => checkoutReceipt.value?.queue_no ? displayQueueNo(checkoutReceipt.value.queue_no) : (printOrder.value?.service_mode === "pickup" && printOrder.value.queue_no ? displayQueueNo(printOrder.value.queue_no) : ""));
const printOrderNo = computed(() => checkoutReceipt.value?.order_no || printOrder.value?.order_no || (printKind.value === "estimate" ? "ใบประเมินยอด" : ""));
const printSubtotal = computed(() => checkoutReceipt.value?.subtotal ?? printOrder.value?.subtotal ?? 0);
const printVat = computed(() => checkoutReceipt.value?.vat_amount ?? printOrder.value?.vat_amount ?? 0);
const printNetSubtotal = computed(() => vatMode.value === "INCLUSIVE" ? Math.max(0, printSubtotal.value - printVat.value) : printSubtotal.value);
const printTotal = computed(() => checkoutReceipt.value?.total ?? printOrder.value?.total ?? displayTotal.value);
const printPaymentMethod = computed(() => checkoutReceipt.value?.payment_method || printOrder.value?.payment_method || "");
const printTendered = computed(() => checkoutReceipt.value?.amount_tendered ?? printOrder.value?.amount_tendered ?? 0);
const printChange = computed(() => checkoutReceipt.value?.change_amount ?? printOrder.value?.change_amount ?? 0);
const receiptStoreLines = computed(() => [
	receiptShowStoreAddress.value ? storeAddress.value : "",
	receiptShowStorePhone.value && storePhone.value ? `ໂທ: ${storePhone.value}` : "",
].filter(Boolean));
const receiptStoreLogoUrl = computed(() => resolveProductImageUrl(storeLogo.value));
const checkoutTitle = computed(() => t(checkoutStep.value === "processing" ? "posPanels.processing" : checkoutStep.value === "success" ? "posPanels.success" : checkoutStep.value === "receipt" ? "posPanels.receiptPreview" : "posPanels.payment"));
const checkoutDescription = computed(() => checkoutStep.value === "receipt" ? t("posPanels.receiptPreviewHint") : checkoutStep.value === "success" || checkoutStep.value === "processing" ? "" : (order.value ? orderLabel.value : ""));

function money(value: number) { return formatMoneyWithSymbol(value, currency.value, locale.value); }
function isProductUnavailable(product: Product) {
	if (product.stock_state === "inactive") return true;
	if (product.inventory_mode === "tracked") return product.stock_state === "out" || product.stock_state === "negative" || Number(product.available_base || 0) <= 0;
	return Boolean(product.manual_sold_out);
}
function productUnavailableMessage(product: Product) {
	if (product.inventory_mode === "untracked" && product.manual_sold_out) return t("restaurantPos.menuSoldOutCannotSell");
	if (product.stock_state === "inactive") return t("restaurantPos.productInactiveCannotSell");
	return t("restaurantPos.outOfStockCannotSell");
}
function resolveProductImageUrl(imageUrl: string | null | undefined) {
	const normalized = String(imageUrl || "").trim();
	if (!normalized) return null;
	if (/^(https?:\/\/|data:|blob:)/i.test(normalized) || normalized.startsWith("//")) return normalized;
	const base = String(runtimeConfig.public.r2PublicBaseUrl || "").replace(/\/$/, "");
	const path = normalized.startsWith("/") ? normalized : `/${normalized}`;
	return `${base}${path}`;
}
function productImageForItem(item: Pick<OrderItem, "product_id">) {
	const product = products.value.find((candidate) => candidate.id === item.product_id);
	return resolveProductImageUrl(product?.image_url || null);
}
function promotionBlockedReason(promotion: AvailablePromotion | Promotion) {
	const giftProductId = "gift_product_id" in promotion ? promotion.gift_product_id : null;
	const giftProduct = products.value.find((product) => product.id === giftProductId);
	if (giftProduct && isProductUnavailable(giftProduct)) return t("restaurantPos.promotionGiftSoldOut", { name: giftProduct.name });
	if (promotion.type === "buy_x_get_y" && promotion.qualifying_product_id) {
		const qualifyingProduct = products.value.find((product) => product.id === promotion.qualifying_product_id);
		if (qualifyingProduct && isProductUnavailable(qualifyingProduct)) return t("restaurantPos.promotionProductSoldOut", { name: qualifyingProduct.name });
		const requiredQty = Math.max(1, Number(promotion.qualifying_qty || 1));
		if (qualifyingProduct?.inventory_mode === "tracked" && Number(qualifyingProduct.available_base || 0) < requiredQty) return t("restaurantPos.promotionProductInsufficient", { name: qualifyingProduct.name });
	}
	return "";
}
function localizedApiError(error: unknown) {
	return resolveApiErrorMessage(error, t("validation.generic"), {
		networkMessage: t("validation.network"),
	});
}
function elapsed(value?: string) {
	if (!value) return "";
	const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
	return minutes < 60 ? t("pickupQueueHistory.minutes", { count: minutes }) : t("pickupQueueHistory.hoursMinutes", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}
function queueHistoryTime(value?: string | null) {
	if (!value) return "-";
	return new Intl.DateTimeFormat(locale.value, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
function queueWaitDuration(start?: string | null, end?: string | null) {
	if (!start || !end) return "-";
	const minutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
	return minutes < 60 ? t("pickupQueueHistory.minutes", { count: minutes }) : t("pickupQueueHistory.hoursMinutes", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}
function tableTone(table: DiningTable) {
	if (table.order_status === "ready_to_pay") return "border-amber-300 bg-amber-50 shadow-amber-100/70";
	if (table.order_id && table.draft_count) return "border-orange-300 bg-orange-50 shadow-orange-100/70";
	if (table.order_id) return "border-emerald-300 bg-emerald-50/60 shadow-emerald-100/70 hover:border-emerald-400";
	return "border-neutral-200 bg-white shadow-neutral-100/80 hover:border-emerald-200 hover:bg-emerald-50/20";
}
function tableStatusLabel(table: DiningTable) {
	if (table.order_status === "ready_to_pay") return t("restaurantPos.readyToPay");
	if (table.order_id && table.draft_count) return t("restaurantPos.unsavedCount", { count: table.draft_count });
	if (table.order_id) return t("restaurantPos.open");
	return t("restaurantPos.available");
}
function tableStatusClasses(table: DiningTable) {
	if (table.order_status === "ready_to_pay") return "bg-amber-100 text-amber-800 ring-amber-200";
	if (table.order_id && table.draft_count) return "bg-orange-100 text-orange-800 ring-orange-200";
	if (table.order_id) return "bg-emerald-100 text-emerald-800 ring-emerald-200";
	return "bg-neutral-100 text-stone-600 ring-neutral-200";
}
function tableAccentClasses(table: DiningTable) {
	if (table.order_status === "ready_to_pay") return "bg-amber-500";
	if (table.order_id && table.draft_count) return "bg-orange-500";
	if (table.order_id) return "bg-emerald-500";
	return "bg-neutral-200";
}
function openOrderTone(opened: OpenOrder) {
	if (opened.status === "ready_to_pay") return "border-amber-200 bg-amber-50/40 hover:border-amber-300";
	if (opened.draft_count) return "border-orange-200 bg-orange-50/35 hover:border-orange-300";
	return "border-emerald-200 bg-emerald-50/45 hover:border-emerald-300 hover:bg-emerald-50/70";
}
function openOrderAccent(opened: OpenOrder) {
	if (opened.status === "ready_to_pay") return "bg-amber-500";
	if (opened.draft_count) return "bg-orange-500";
	return "bg-emerald-500";
}
function openOrderIcon(opened: OpenOrder) {
	if (opened.service_mode === "pickup") return "i-heroicons-receipt-percent";
	return "i-heroicons-table-cells";
}
function openOrderTitle(opened: OpenOrder) {
	return opened.service_mode === "pickup" ? `คิว ${displayQueueNo(opened.queue_no)}` : `${opened.zone_name} · ${opened.table_name}`;
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
function applyCatalog(catalog: PosCatalog) {
	products.value = catalog.items;
	const store = catalog.store || {};
	storeName.value = String(store.name || "ร้านค้า");
	storeLogo.value = String(store.logo_url || "");
	storeAddress.value = String(store.address || "");
	storePhone.value = String(store.phone_number || "");
	receiptShowStoreName.value = Number(store.receipt_show_store_name ?? 1) !== 0;
	receiptShowStoreLogo.value = Number(store.pdf_show_logo ?? 0) !== 0;
	receiptShowStoreAddress.value = Number(store.receipt_show_store_address ?? 1) !== 0;
	receiptShowStorePhone.value = Number(store.receipt_show_store_phone ?? 1) !== 0;
	receiptShowTendered.value = Number(store.receipt_show_tendered ?? 1) !== 0;
	receiptShowChange.value = Number(store.receipt_show_change ?? 1) !== 0;
	receiptShowPaymentMethod.value = Number(store.receipt_show_payment_method ?? 1) !== 0;
	pickupQueueEnabled.value = Number(store.pickup_queue_enabled ?? 0) !== 0;
	receiptShowQueue.value = pickupQueueEnabled.value;
	currency.value = String(store.currency || "LAK");
	vatEnabled.value = Boolean(Number(store.vat_enabled));
	vatRate.value = Number(store.vat_rate || 0);
	vatMode.value = String(store.vat_mode || "EXCLUSIVE").toUpperCase();
}

async function loadDashboard() {
	pending.value = true;
	loadError.value = "";
	try {
		// The parent fetches the catalogue once for first paint, so reuse it on
		// the initial load only. Every later reload has to hit the API again or
		// changes such as menu availability would keep showing the stale prop.
		const useInitialCatalog = Boolean(props.initialCatalog) && !catalogLoadedOnce.value;
		if (useInitialCatalog && props.initialCatalog) applyCatalog(props.initialCatalog);
		const [ dashboard, opened, catalog ] = await Promise.all([
			apiFetch<Envelope<{ zones: Zone[]; tables: DiningTable[]; pickup_queue_enabled: number }>>(`/pos/restaurant/tables?store_id=${encodeURIComponent(props.storeId)}`),
			apiFetch<Envelope<OpenOrder[]>>(`/pos/restaurant/orders/open?store_id=${encodeURIComponent(props.storeId)}`),
			useInitialCatalog
				? Promise.resolve(null)
				: apiFetch<Envelope<PosCatalog>>(`/pos/products?store_id=${encodeURIComponent(props.storeId)}`),
		]);
		catalogLoadedOnce.value = true;
		zones.value = dashboard.data.zones.filter((zone) => zone.is_active);
		tables.value = dashboard.data.tables;
		pickupQueueEnabled.value = Number(dashboard.data.pickup_queue_enabled || 0) !== 0;
		receiptShowQueue.value = pickupQueueEnabled.value;
		openOrders.value = opened.data;
		if (catalog) applyCatalog(catalog.data);
		if (pickupQueueEnabled.value) await loadPickupQueue(); else pickupQueue.value = [];
		activeZone.value = zones.value.some((zone) => zone.id === activeZone.value) ? activeZone.value : "";
	} catch (error) {
		loadError.value = localizedApiError(error);
		toast.error({ title: t("restaurantPos.loadFailed"), description: loadError.value });
	} finally { pending.value = false; }
}

async function loadPickupQueue() {
	if (!pickupQueueEnabled.value) return;
	const response = await apiFetch<Envelope<PickupQueueOrder[]>>(`/pos/restaurant/pickup-queue?store_id=${encodeURIComponent(props.storeId)}`);
	pickupQueue.value = response.data;
}

async function openPickupQueueHistory() {
	pickupQueueHistoryOpen.value = true;
	pickupQueueHistoryPending.value = true;
	try {
		const response = await apiFetch<Envelope<PickupQueueOrder[]>>(`/pos/restaurant/pickup-queue/history?store_id=${encodeURIComponent(props.storeId)}`);
		pickupQueueHistory.value = response.data;
	} catch (error) {
		toast.error({ title: t("pickupQueueHistory.loadFailed"), description: localizedApiError(error) });
	} finally { pickupQueueHistoryPending.value = false; }
}

function openPickupQueueDetail(queued: PickupQueueOrder) {
	if (queued.collected_at) pickupQueueHistoryOpen.value = false;
	pickupQueueDetail.value = queued;
	pickupQueueDetailOpen.value = true;
}

async function markPickupCollected(orderId: string) {
	if (collectingOrderId.value) return;
	collectingOrderId.value = orderId;
	try {
		await apiFetch(`/pos/restaurant/pickup-queue/${encodeURIComponent(orderId)}/collected`, { method: "POST", body: { store_id: props.storeId } });
		pickupQueue.value = pickupQueue.value.filter((item) => item.id !== orderId);
		if (pickupQueueHistoryOpen.value) void openPickupQueueHistory();
		toast.success({ title: t("restaurantPos.collectedSuccess") });
	} catch (error) { toast.error({ title: t("restaurantPos.collectFailed"), description: localizedApiError(error) }); }
	finally { collectingOrderId.value = ""; }
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
		selectedPromotionCounts.value = parsed?.promotion_counts && typeof parsed.promotion_counts === "object"
			? Object.fromEntries(Object.entries(parsed.promotion_counts).filter(([key, value]) => typeof key === "string" && Number.isInteger(value) && Number(value) > 0)) as Record<string, number>
			: Object.fromEntries(selectedPromotionIds.value.map((id) => [id, 1]));
	} catch { localCart.value = []; selectedPromotionIds.value = []; selectedPromotionCounts.value = {}; }
}
function persistLocalCart() {
	if (!import.meta.client) return;
	if (localCart.value.length) sessionStorage.setItem(cartStorageKey(), JSON.stringify({ items: localCart.value, promotion_ids: selectedPromotionIds.value, promotion_counts: selectedPromotionCounts.value }));
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
function openClearCartPanel() {
	if (!canClearCartDraft.value) return;
	moreActionsOpen.value = false;
	clearCartPanel.value = true;
}
function confirmClearCart() {
	if (!canClearCartDraft.value) return;
	if (order.value) {
		clearTableDraft();
		toast.success({ title: t("toastMessages.cartReset") });
	} else {
		localCart.value = [];
		selectedPromotionIds.value = [];
		selectedPromotionCounts.value = {};
		persistLocalCart();
		toast.success({ title: t("toastMessages.cartCleared") });
	}
	clearCartPanel.value = false;
}
function isPromotionRecordActive(promotion: PromotionRecord) {
	const now = Date.now();
	const startsAt = promotion.starts_at ? new Date(promotion.starts_at).getTime() : Number.NEGATIVE_INFINITY;
	const endsAt = promotion.ends_at ? new Date(promotion.ends_at).getTime() : Number.POSITIVE_INFINITY;
	return Boolean(promotion.is_active)
		&& (Number.isNaN(startsAt) || startsAt <= now)
		&& (Number.isNaN(endsAt) || endsAt >= now);
}
function promotionRecordToAvailable(promotion: PromotionRecord): AvailablePromotion {
	const requiredQty = Math.max(0, Number(promotion.qualifying_qty || 0));
	const minimumSubtotal = Math.max(0, Number(promotion.minimum_subtotal || 0));
	return {
		promotion_id: promotion.id,
		name: promotion.name,
		type: promotion.type,
		apply_mode: promotion.apply_mode,
		applications: 0,
		qualifying_product_id: promotion.qualifying_product_id || null,
		qualifying_qty: requiredQty || null,
		gift_product_id: promotion.gift_product_id,
		gift_product_name: promotion.gift_product_name || undefined,
		gift_qty: 0,
		discount_method: promotion.discount_method || null,
		discount_value: Number(promotion.discount_value || 0),
		discount_amount: 0,
		eligible: false,
		remaining_qty: promotion.type === "buy_x_get_y" ? requiredQty : 0,
		remaining_amount: promotion.type === "cart_total_gift" ? minimumSubtotal : 0,
	};
}
function syncSelectedPromotions(promotions: AvailablePromotion[]) {
	selectedPromotionIds.value = selectedPromotionIds.value.filter((id) => promotions.some((promotion) => promotion.promotion_id === id && promotion.eligible !== false));
	const nextCounts: Record<string, number> = {};
	for (const id of selectedPromotionIds.value) {
		const promotion = promotions.find((candidate) => candidate.promotion_id === id);
		const maxApplications = Math.max(1, Number(promotion?.applications || 1));
		nextCounts[id] = Math.min(Math.max(1, selectedPromotionCounts.value[id] || 1), maxApplications);
	}
	selectedPromotionCounts.value = nextCounts;
}
async function loadActivePromotionCatalog() {
	const response = await apiFetch<Envelope<PromotionRecord[]>>(`/promotions?store_id=${encodeURIComponent(props.storeId)}`);
	return response.data.filter(isPromotionRecordActive).map(promotionRecordToAvailable);
}
function promotionEvaluationItems() {
	if (!order.value) return localCart.value.map(({ product_id, qty }) => ({ product_id, qty }));
	const orderItems = order.value.items
		.filter((item) => item.line_status !== "cancelled" && !item.is_gift)
		.map((item) => ({ product_id: item.product_id, qty: item.qty }));
	return [
		...orderItems,
		...tableDraft.value.map(({ product_id, qty, is_gift }) => ({ product_id, qty, is_gift: Boolean(is_gift) })),
	];
}
async function evaluateLocalPromotions() {
	if (!props.storeId) {
		availablePromotions.value = [];
		selectedPromotionIds.value = [];
		selectedPromotionCounts.value = {};
		return;
	}
	try {
		const evaluationItems = promotionEvaluationItems();
		if (!evaluationItems.length) {
			const catalog = await loadActivePromotionCatalog();
			availablePromotions.value = catalog;
			selectedPromotionIds.value = [];
			selectedPromotionCounts.value = {};
			return;
		}
		const response = await apiFetch<Envelope<AvailablePromotion[]>>("/promotions/evaluate", { method: "POST", body: { store_id: props.storeId, items: evaluationItems } });
		if (response.data.length || evaluationItems.length) {
			availablePromotions.value = response.data;
			syncSelectedPromotions(response.data);
			return;
		}
		const catalog = await loadActivePromotionCatalog();
		availablePromotions.value = catalog;
		syncSelectedPromotions(catalog);
	} catch {
		try {
			const catalog = await loadActivePromotionCatalog();
			availablePromotions.value = catalog;
			syncSelectedPromotions(catalog);
		} catch {
			availablePromotions.value = [];
			selectedPromotionIds.value = [];
			selectedPromotionCounts.value = {};
		}
	}
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
	if (isProductUnavailable(product)) {
		toast.error({ title: productUnavailableMessage(product), description: product.name });
		return;
	}
	if (!order.value) {
		const existing = localCart.value.find((item) => item.product_id === product.id);
		if (existing) existing.qty += 1;
		else localCart.value.unshift({ product_id: product.id, qty: 1 });
		return;
	}
	const localQty = tableDraft.value.filter((item) => item.product_id === product.id).reduce((total, item) => total + item.qty, 0);
	if (product.inventory_mode === "tracked" && localQty >= Number(product.available_base || 0)) {
		toast.error({ title: t("toastMessages.insufficientStock"), description: t("toastMessages.stockRecheckHint") });
		return;
	}
	const existing = tableDraft.value.find((item) => item.product_id === product.id && !item.note);
	if (existing) existing.qty += 1;
	else tableDraft.value.unshift({ product_id: product.id, qty: 1 });
}

function productCartQty(productId: string) {
	const entries = order.value ? tableDraft.value : localCart.value;
	return entries
		.filter((item) => item.product_id === productId && !item.is_gift)
		.reduce((total, item) => total + Number(item.qty || 0), 0);
}

function applyLocalPromotion(promotion: AvailablePromotion) {
	const blockedReason = promotionBlockedReason(promotion);
	if (blockedReason) {
		toast.error({ title: t("toastMessages.promotionUnavailable"), description: blockedReason });
		return;
	}
	const currentCount = selectedPromotionCounts.value[promotion.promotion_id] || 0;
	if (promotion.type === "buy_x_get_y" && promotion.qualifying_product_id) {
		const requiredQty = Math.max(1, Number(promotion.qualifying_qty || 1));
		if (order.value) {
			const entry = tableDraft.value.find((item) => item.product_id === promotion.qualifying_product_id && !item.note);
			if (entry) entry.qty += requiredQty;
			else tableDraft.value.unshift({ product_id: promotion.qualifying_product_id, qty: requiredQty });
		} else {
			const entry = localCart.value.find((item) => item.product_id === promotion.qualifying_product_id);
			if (entry) entry.qty = Math.max(entry.qty + requiredQty, requiredQty * (currentCount + 1));
			else localCart.value.unshift({ product_id: promotion.qualifying_product_id, qty: requiredQty });
			if (!selectedPromotionIds.value.includes(promotion.promotion_id)) selectedPromotionIds.value.push(promotion.promotion_id);
			selectedPromotionCounts.value[promotion.promotion_id] = currentCount + 1;
		}
		promotionPanelOpen.value = false;
		toast.success({ title: t("toastMessages.promotionAdded"), description: promotion.name });
		void nextTick(() => evaluateLocalPromotions());
		return;
	}
	if (order.value) {
		toast.error({ title: t("toastMessages.promotionConditionMissing"), description: promotion.remaining_amount ? t("toastMessages.addMoreAmount", { amount: money(promotion.remaining_amount) }) : t("toastMessages.addRequiredProducts") });
		return;
	}
	const maxApplications = Math.max(1, Number(promotion.applications || 1));
	if (currentCount >= maxApplications) {
		toast.error({ title: t("toastMessages.promotionLimitReached"), description: t("toastMessages.promotionLimitHint") });
		return;
	}
	if (promotion.eligible === false) {
		toast.error({ title: t("toastMessages.promotionConditionMissing"), description: promotion.remaining_amount ? t("toastMessages.addMoreAmount", { amount: money(promotion.remaining_amount) }) : t("toastMessages.addRequiredProducts") });
		return;
	}
	if (!selectedPromotionIds.value.includes(promotion.promotion_id)) selectedPromotionIds.value.push(promotion.promotion_id);
	selectedPromotionCounts.value[promotion.promotion_id] = currentCount + 1;
	promotionPanelOpen.value = false;
	toast.success({ title: t("toastMessages.promotionAdded"), description: promotion.name });
}

function addLocalPromotionGift(promotion: AvailablePromotion) {
	const blockedReason = promotionBlockedReason(promotion);
	if (blockedReason) {
		toast.error({ title: t("toastMessages.giftAddFailed"), description: blockedReason });
		return;
	}
	if (promotion.eligible === false) {
		toast.error({ title: t("toastMessages.promotionConditionMissing"), description: promotion.remaining_amount ? t("toastMessages.addMoreAmount", { amount: money(promotion.remaining_amount) }) : t("toastMessages.addRequiredProducts") });
		return;
	}
	const currentCount = selectedPromotionCounts.value[promotion.promotion_id] || 0;
	const maxApplications = Math.max(0, Number(promotion.applications || 0));
	if (currentCount >= maxApplications) {
		toast.error({ title: t("toastMessages.giftLimitReached"), description: t("toastMessages.giftLimitHint") });
		return;
	}
	const giftQty = pendingLocalGiftQty(promotion);
	if (order.value) {
		const giftLine = giftLineForPromotion(promotion, maxApplications - currentCount)[0];
		if (!giftLine) return;
		const existing = tableDraft.value.find((item) => item.product_id === giftLine.product_id && Boolean(item.is_gift) && (item.note || "") === (giftLine.note || ""));
		if (existing) existing.qty += giftLine.qty;
		else tableDraft.value.unshift({ product_id: giftLine.product_id, qty: giftLine.qty, note: giftLine.note, is_gift: true, promotion_id: giftLine.promotion_id || promotion.promotion_id });
		selectedPromotionCounts.value[promotion.promotion_id] = maxApplications;
		toast.success({ title: t("toastMessages.giftAdded"), description: `${promotion.name} · ${t("toastMessages.giftQuantity", { count: giftQty })}` });
		return;
	}
	if (!selectedPromotionIds.value.includes(promotion.promotion_id)) selectedPromotionIds.value.push(promotion.promotion_id);
	selectedPromotionCounts.value[promotion.promotion_id] = maxApplications;
	toast.success({ title: t("toastMessages.giftAdded"), description: `${promotion.name} · ${t("toastMessages.giftQuantity", { count: giftQty })}` });
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
	} catch (error) { order.value = rollback; toast.error({ title: t("toastMessages.quantityUpdateFailed"), description: localizedApiError(error) }); await refreshOrder(); }
	finally { endItemMutation(item.id); actionPending.value = false; }
}

async function removeItem(item: OrderItem) {
	if (!order.value) {
		if (item.is_gift && item.promotion_id) {
			selectedPromotionIds.value = selectedPromotionIds.value.filter((id) => id !== item.promotion_id);
			delete selectedPromotionCounts.value[item.promotion_id];
		}
		else localCart.value = localCart.value.filter((entry) => entry.product_id !== item.product_id);
		return;
	}
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
	} catch (error) { order.value = rollback; toast.error({ title: t("toastMessages.itemDeleteFailed"), description: localizedApiError(error) }); await refreshOrder(); }
	finally { endItemMutation(item.id); actionPending.value = false; }
}

function showTables() {
	tableSelectionMode.value = "browse";
	selectedTable.value = null;
	guestPanel.value = false;
	mobileTicketOpen.value = false;
	view.value = "tables";
}

function beginMoveTable() {
	if (!order.value) return showTables();
	tableSelectionMode.value = "move";
	selectedTable.value = null;
	guestPanel.value = false;
	mobileTicketOpen.value = false;
	view.value = "tables";
}

function beginCartTable() {
	if (order.value || !localCart.value.length) return;
	tableSelectionMode.value = "cart";
	selectedTable.value = null;
	guestPanel.value = false;
	mobileTicketOpen.value = false;
	moreActionsOpen.value = false;
	view.value = "tables";
}

function cancelTableSelection() {
	tableSelectionMode.value = "browse";
	selectedTable.value = null;
	guestPanel.value = false;
	activeZone.value = "";
	view.value = "quick";
}

function chooseTable(table: DiningTable) {
	if (table.order_id) {
		if (tableSelectionMode.value === "move" || tableSelectionMode.value === "cart") {
			if (tableSelectionMode.value === "cart") {
				toast.error({ title: t("toastMessages.tableOccupied"), description: t("toastMessages.chooseEmptyTable") });
				return;
			}
			if (order.value && table.order_id === order.value.id) {
				toast.info({ title: t("toastMessages.currentTable"), description: t("toastMessages.chooseEmptyTableToMove") });
			} else {
				toast.error({ title: t("toastMessages.tableOccupied"), description: t("toastMessages.chooseEmptyTableToMove") });
			}
			return;
		}
		void loadOrder(table.order_id);
		return;
	}
	selectedTable.value = table;
	setGuestCount(order.value?.guest_count_specified ? order.value.guest_count : null);
	guestPanel.value = true;
}

async function confirmTable() {
	if (!selectedTable.value) return;
	actionPending.value = true;
	try {
		const guestPayload = guestCount.value ? { guest_count: guestCount.value } : {};
		if (tableSelectionMode.value === "move" && order.value) {
			const response = await apiFetch<Envelope<Order>>(`/pos/restaurant/orders/${order.value.id}/service-mode`, {
				method: "POST", body: { store_id: props.storeId, service_mode: "dine-in", table_id: selectedTable.value.id, expected_version: order.value.version, ...guestPayload },
			});
			order.value = response.data;
		} else {
			const transferringCart = tableSelectionMode.value === "cart";
			const cartSnapshot: TableDraftEntry[] = transferringCart
				? localItems.value.map((item) => ({ product_id: item.product_id, qty: item.qty, note: item.note || null, is_gift: Boolean(item.is_gift), promotion_id: item.promotion_id || null }))
				: [];
			const response = await apiFetch<Envelope<Order>>("/pos/restaurant/orders", {
				method: "POST", body: { store_id: props.storeId, service_mode: "dine-in", table_id: selectedTable.value.id, ...guestPayload },
			});
			order.value = response.data;
			tableDraft.value = cartSnapshot;
			if (transferringCart) {
				localCart.value = [];
				selectedPromotionIds.value = [];
				selectedPromotionCounts.value = {};
			}
		}
		tableSelectionMode.value = "browse";
		guestPanel.value = false;
		view.value = "quick";
		// The order is ready for local item entry; dashboard refreshes are informational.
		actionPending.value = false;
		await loadDashboard();
		toast.success({ title: t("toastMessages.orderLinkedToTable", { table: selectedTable.value.name }) });
	} catch (error) {
		const description = localizedApiError(error);
		toast.error({ title: t(tableSelectionMode.value === "move" ? "toastMessages.tableMoveFailed" : "toastMessages.tableSelectFailed"), description });
		if (description.includes("open restaurant order not found")) tableSelectionMode.value = "browse";
		await loadDashboard();
	}
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
		toast.success({ title: t("toastMessages.changedToTakeaway", { queue: displayQueueNo(response.data.queue_no) }) });
	} catch (error) { toast.error({ title: t("toastMessages.serviceChangeFailed"), description: localizedApiError(error) }); }
	finally { actionPending.value = false; }
}

async function sendKitchen(options: { print: boolean; park: boolean; pay: boolean }) {
	if (!order.value || !draftItems.value.length) return;
	actionPending.value = true;
	try {
		sendKey ||= crypto.randomUUID();
		const response = await apiFetch<Envelope<Order>>(`/pos/restaurant/orders/${order.value.id}/send`, {
			method: "POST", headers: { "Idempotency-Key": sendKey }, body: { store_id: props.storeId, expected_version: order.value.version, items: tableDraft.value.map(({ product_id, qty, note, is_gift, promotion_id }) => ({ product_id, qty, note: note || null, is_gift: Boolean(is_gift), promotion_id: promotion_id || null })) },
		});
		order.value = response.data;
		clearTableDraft(response.data.id);
		sendKey = "";
		const round = Number(response.data.rounds.at(-1)?.round_no || 0);
		if (options.print) printDocument("kitchen", round);
		if (options.pay) openCheckout("existing");
		else if (options.park) parkOrder();
		else void loadDashboard();
		toast.success({ title: options.park ? t("toastMessages.billParked") : t("toastMessages.billRoundSaved", { round }) });
	} catch (error) { toast.error({ title: t("toastMessages.billSaveFailed"), description: `${localizedApiError(error)} · ${t("toastMessages.unsavedItemsRemain")}` }); }
	finally { actionPending.value = false; }
}

function openCheckout(dispatch: "existing" | "direct") {
	if (!order.value && !localCart.value.length) return;
	if (hasLocalTableDraft.value) {
		toast.error({ title: t("toastMessages.saveBeforePayment"), description: t("toastMessages.serverStockCheckHint") });
		return;
	}
	if (checkoutSuccessTimer) clearTimeout(checkoutSuccessTimer);
	checkoutStep.value = "payment";
	checkoutReceipt.value = null;
	completedOrder.value = null;
	checkoutDispatch.value = dispatch;
	cashTendered.value = 0;
	cashTenderedHistory.value = [];
	checkoutKey ||= crypto.randomUUID();
	checkoutPanel.value = true;
	if (!paymentAccounts.value.length) void loadPaymentAccounts();
}

function setCashTendered(amount: number) {
	const nextAmount = Math.max(0, Math.round(Number(amount || 0)));
	if (nextAmount === cashTendered.value) return;
	cashTenderedHistory.value = [ ...cashTenderedHistory.value.slice(-11), cashTendered.value ];
	cashTendered.value = nextAmount;
}

function undoCashTendered() {
	const previous = cashTenderedHistory.value.at(-1);
	if (previous === undefined) return;
	cashTenderedHistory.value = cashTenderedHistory.value.slice(0, -1);
	cashTendered.value = previous;
}

function addCashTendered(amount: number) {
	setCashTendered(cashTendered.value + Number(amount || 0));
}

function appendCashDigit(digit: string) {
	const nextValue = `${Math.max(0, Math.round(Number(cashTendered.value || 0)))}${digit}`.replace(/^0+(?=\d)/, "");
	setCashTendered(Number(nextValue || 0));
}

function backspaceCashTendered() {
	const nextValue = String(Math.max(0, Math.round(Number(cashTendered.value || 0)))).slice(0, -1);
	setCashTendered(Number(nextValue || 0));
}

function showCheckoutReceipt() {
	checkoutStep.value = "success";
	if (checkoutSuccessTimer) clearTimeout(checkoutSuccessTimer);
	checkoutSuccessTimer = setTimeout(() => {
		checkoutStep.value = "receipt";
		checkoutSuccessTimer = null;
	}, 850);
}

function finishCheckoutFlow() {
	if (checkoutSuccessTimer) {
		clearTimeout(checkoutSuccessTimer);
		checkoutSuccessTimer = null;
	}
	checkoutPanel.value = false;
	checkoutStep.value = "payment";
	checkoutReceipt.value = null;
	completedOrder.value = null;
	order.value = null;
	mobileTicketOpen.value = false;
	void loadDashboard();
}

function releaseCompletedOrder(completed: Order) {
	clearTableDraft(completed.id);
	openOrders.value = openOrders.value.filter((opened) => opened.id !== completed.id);
	tables.value = tables.value.map((table) => table.order_id === completed.id
		? { ...table, order_id: null, order_status: null, total: 0, guest_count: undefined, guest_count_specified: undefined, opened_at: undefined, draft_count: 0 }
		: table);
	order.value = null;
	mobileTicketOpen.value = false;
	view.value = completed.service_mode === "dine-in" ? "tables" : "quick";
	void loadDashboard();
}

function printReceiptAndFinish() {
	if (!canPrintDocument("receipt")) return toast.error({ title: t("toastMessages.printForbidden") });
	printKind.value = "receipt";
	printRound.value = null;
	nextTick(() => window.print());
	setTimeout(finishCheckoutFlow, 350);
}

async function waitForCheckoutLoadingPaint() {
	await nextTick();
	await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function checkout() {
	if (!order.value && !localCart.value.length) return;
	actionPending.value = true;
	checkoutStep.value = "processing";
	await waitForCheckoutLoadingPaint();
	try {
		if (!order.value) {
			const response = await apiFetch<Envelope<CheckoutResult>>("/pos/checkout", {
				method: "POST", headers: { "Idempotency-Key": checkoutKey },
				body: { store_id: props.storeId, service_mode: "pickup", payment_method: paymentMethod.value, items: localCart.value.map(({ product_id, qty }) => ({ product_id, qty })), promotion_ids: checkoutPromotionIds.value, amount_tendered: paymentMethod.value === "cash" ? cashTendered.value : null, payment_account_id: paymentMethod.value === "qr_transfer" ? paymentAccountId.value : null },
			});
			checkoutReceipt.value = response.data;
			if (pickupQueueEnabled.value) void loadPickupQueue();
			checkoutKey = "";
			localCart.value = [];
			selectedPromotionIds.value = [];
			selectedPromotionCounts.value = {};
			toast.success({ title: t("toastMessages.paymentSuccessful") });
			showCheckoutReceipt();
			return;
		}
		const response = await apiFetch<Envelope<Order>>(`/pos/restaurant/orders/${order.value.id}/checkout`, {
			method: "POST", headers: { "Idempotency-Key": checkoutKey },
			body: { store_id: props.storeId, expected_version: order.value.version, payment_method: paymentMethod.value, amount_tendered: paymentMethod.value === "cash" ? cashTendered.value : null, dispatch_mode: checkoutDispatch.value },
		});
		completedOrder.value = response.data;
		printKind.value = "receipt";
		checkoutKey = "";
		releaseCompletedOrder(response.data);
		toast.success({ title: t("toastMessages.paymentAndCloseSuccessful") });
		showCheckoutReceipt();
	} catch (error) {
		checkoutStep.value = "payment";
		toast.error({ title: t("toastMessages.paymentFailed"), description: localizedApiError(error) });
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
		toast.success({ title: t("toastMessages.orderCancelled") });
	} catch (error) { toast.error({ title: t("toastMessages.orderCancelFailed"), description: localizedApiError(error) }); }
	finally { actionPending.value = false; }
}

// Deliberately lives in its own panel rather than on the product tiles: the
// tiles are the tap target used constantly while selling, and this change is
// silent and instant, so a mis-tap there would take a menu item off sale
// without anyone noticing.
async function setMenuAvailability(product: Product, soldOut: boolean) {
	if (menuAvailabilityPendingId.value) return;
	menuAvailabilityPendingId.value = product.id;
	try {
		await apiFetch(`/pos/restaurant/products/${product.id}/availability`, {
			method: "PATCH",
			body: { store_id: props.storeId, sold_out: soldOut },
		});
		await loadDashboard();
		toast.success({
			title: soldOut ? t("restaurantPos.menuMarkedSoldOut") : t("restaurantPos.menuMarkedAvailable"),
			description: product.name,
		});
	} catch (error) {
		toast.error({ title: t("toastMessages.menuStatusChangeFailed"), description: localizedApiError(error) });
	} finally {
		menuAvailabilityPendingId.value = "";
	}
}

async function applyPromotion(promotion: Promotion) {
	if (!order.value) return;
	const blockedReason = promotionBlockedReason(promotion);
	if (blockedReason) {
		toast.error({ title: t("toastMessages.promotionUnavailable"), description: blockedReason });
		return;
	}
	actionPending.value = true;
	try {
		const response = await apiFetch<Envelope<Order>>(`/pos/restaurant/orders/${order.value.id}/promotions/${promotion.promotion_id}`, {
			method: "POST", body: { store_id: props.storeId, expected_version: order.value.version },
		});
		order.value = response.data;
		promotionPanelOpen.value = false;
	} catch (error) { toast.error({ title: t("toastMessages.promotionApplyFailed"), description: localizedApiError(error) }); }
	finally { actionPending.value = false; }
}

function editSentItem(item: OrderItem) {
	cancellingItem.value = item;
	sentItemQty.value = Number(item.qty || 0);
	sentItemReasonPreset.value = "";
	cancelReason.value = "";
	sentItemPanel.value = true;
}

async function adjustSentItem() {
	if (!order.value || !cancellingItem.value || sentItemQty.value >= Number(cancellingItem.value.qty)) return;
	actionPending.value = true;
	try {
		const response = await apiFetch<Envelope<Order>>(`/pos/restaurant/orders/${order.value.id}/items/${cancellingItem.value.id}/cancel`, {
			method: "POST", body: { store_id: props.storeId, expected_version: order.value.version, qty: sentItemQty.value, reason: (sentItemReasonPreset.value === "ອື່ນໆ" ? cancelReason.value : sentItemReasonPreset.value).trim() || undefined },
		});
		order.value = response.data;
		sentItemPanel.value = false;
		toast.success({ title: sentItemQty.value === 0 ? t("toastMessages.itemCancelled") : t("toastMessages.quantityUpdated") });
	} catch (error) { toast.error({ title: t("toastMessages.quantityUpdateFailed"), description: localizedApiError(error) }); await refreshOrder(); }
	finally { actionPending.value = false; }
}

async function markReady() {
	if (!order.value || draftItems.value.length) return;
	if (order.value.status === "ready_to_pay") {
		printDocument("check");
		return;
	}
	actionPending.value = true;
	try {
		const response = await apiFetch<Envelope<Order>>(`/pos/restaurant/orders/${order.value.id}/ready`, { method: "POST", body: { store_id: props.storeId, expected_version: order.value.version } });
		order.value = response.data;
		printDocument("check");
	} catch (error) { toast.error({ title: t("toastMessages.checkBillFailed"), description: localizedApiError(error) }); }
	finally { actionPending.value = false; }
}

function openEstimate() {
	if (!localCart.value.length) return;
	moreActionsOpen.value = false;
	printDocument("estimate");
}

function refreshOrder() { if (order.value) return loadOrder(order.value.id); }
function canPrintDocument(kind: "kitchen" | "check" | "estimate" | "receipt") {
	// Kitchen slips only contain order data already visible on this POS screen.
	return kind !== "receipt" || can("pos.restaurant.print");
}
function printDocument(kind: "kitchen" | "check" | "estimate" | "receipt", round?: number) {
	if (!canPrintDocument(kind)) return toast.error({ title: t("toastMessages.printForbidden") });
	printKind.value = kind;
	printRound.value = round || null;
	printPreviewOpen.value = true;
}
function confirmPrintDocument() {
	printPreviewOpen.value = false;
	nextTick(() => window.print());
}

watch(() => props.storeId, () => {
	order.value = null;
	mobileTicketOpen.value = false;
	view.value = "quick";
	// A different store gets a fresh catalogue, so the prop is usable again.
	catalogLoadedOnce.value = false;
	restoreLocalCart();
	void loadDashboard();
	void evaluateLocalPromotions();
}, { immediate: true });

watch(localCart, () => {
	persistLocalCart();
	if (promotionTimer) clearTimeout(promotionTimer);
	promotionTimer = setTimeout(() => void evaluateLocalPromotions(), 180);
}, { deep: true });
watch(selectedPromotionIds, persistLocalCart, { deep: true });
watch(selectedPromotionCounts, persistLocalCart, { deep: true });
watch(promotionPanelOpen, (opened) => {
	if (opened) void evaluateLocalPromotions();
});
watch(tableDraft, () => {
	persistTableDraft();
	if (promotionTimer) clearTimeout(promotionTimer);
	promotionTimer = setTimeout(() => void evaluateLocalPromotions(), 180);
}, { deep: true });

function syncTicketScrollLock() {
	if (!import.meta.client) return;
	document.body.style.overflow = mobileTicketOpen.value && !desktopMedia?.matches ? "hidden" : "";
}

watch(mobileTicketOpen, syncTicketScrollLock);
watch(view, (nextView) => {
	if (nextView !== "quick") mobileTicketOpen.value = false;
	tableActionsOpen.value = false;
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
		<template #default>
			<div class="flex h-full min-h-0 flex-col gap-3">
				<div class="relative flex items-center gap-2">
					<div class="restaurant-pos-tab-scroll flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
						<AppButton class="shrink-0" size="sm" :color="view === 'quick' ? 'primary' : 'neutral'" :variant="view === 'quick' ? 'solid' : 'soft'" icon="i-heroicons-bolt" @click="view = 'quick'">{{ t('restaurantPos.quickSale') }}</AppButton>
						<AppButton class="shrink-0" size="sm" :color="view === 'tables' ? 'primary' : 'neutral'" :variant="view === 'tables' ? 'solid' : 'soft'" icon="i-heroicons-table-cells" @click="showTables">{{ t('restaurantPos.selectTable') }}</AppButton>
						<AppButton class="shrink-0" size="sm" :color="view === 'open' ? 'primary' : 'neutral'" :variant="view === 'open' ? 'solid' : 'soft'" icon="i-heroicons-queue-list" @click="view = 'open'">{{ t('restaurantPos.openOrders') }} <span v-if="openOrders.length" class="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-current/10 px-1 text-xs">{{ openOrders.length }}</span></AppButton>
						<AppButton v-if="pickupQueueEnabled" class="shrink-0" size="sm" :color="view === 'pickupQueue' ? 'primary' : 'neutral'" :variant="view === 'pickupQueue' ? 'solid' : 'soft'" icon="i-lucide-list-ordered" @click="view = 'pickupQueue'">{{ t('restaurantPos.pickupQueue') }} <span v-if="pickupQueue.length" class="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-current/10 px-1 text-xs">{{ pickupQueue.length }}</span></AppButton>
					</div>
					<AppButton v-if="view === 'quick'" class="shrink-0 shadow-sm ring-1 ring-emerald-700/10" size="sm" color="success" variant="solid" icon="i-heroicons-gift" :aria-label="t('restaurantPos.promotions')" :title="t('restaurantPos.promotions')" @click="promotionPanelOpen = true">
						<span class="hidden sm:inline">{{ t('restaurantPos.promotions') }}</span>
						<span v-if="promotionOptionCount" class="ml-1 hidden min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 text-[11px] font-bold tabular-nums sm:inline-flex">{{ promotionOptionCount }}</span>
					</AppButton>
					<AppButton v-else-if="view === 'pickupQueue'" class="shrink-0" size="sm" color="neutral" variant="soft" icon="i-heroicons-clock" :aria-label="t('pickupQueueHistory.title')" :title="t('pickupQueueHistory.title')" @click="openPickupQueueHistory">
						<span class="hidden sm:inline">{{ t('pickupQueueHistory.title') }}</span>
					</AppButton>
					<AppButton
						v-if="canManageMenuAvailability && menuAvailabilityItems.length"
						class="shrink-0"
						size="sm"
						:color="menuSoldOutCount ? 'warning' : 'neutral'"
						variant="soft"
						icon="i-heroicons-clipboard-document-check"
						:aria-label="t('restaurantPos.manageMenu')"
						:title="t('restaurantPos.manageMenu')"
						@click="menuAvailabilityOpen = true"
					>
						<span class="hidden sm:inline">{{ t('restaurantPos.manageMenu') }}</span>
						<span v-if="menuSoldOutCount" class="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-current/15 px-1.5 text-[11px] font-bold tabular-nums">{{ menuSoldOutCount }}</span>
					</AppButton>
					<AppButton class="shrink-0" size="sm" color="neutral" variant="soft" icon="i-heroicons-arrow-path" :loading="pending" :aria-label="t('restaurantPos.reload')" :title="t('restaurantPos.reload')" @click="loadDashboard">
						<span class="hidden lg:inline">{{ t('restaurantPos.reload') }}</span>
					</AppButton>
					<AppInlineLoadingBar
						v-if="pending && products.length"
						minimal
						class="pointer-events-none absolute inset-x-0 -bottom-2"
						container-class="h-0.5 bg-transparent dark:bg-transparent"
					/>
				</div>
				<div v-if="pending && !products.length" class="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_400px]">
					<section class="rounded-md border border-neutral-200 bg-white p-3"><USkeleton class="h-10 w-full rounded-md" /><div class="mt-3 grid content-start grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"><div v-for="index in 10" :key="index" class="min-h-[118px] rounded-md border border-neutral-100 p-2"><div class="flex gap-2"><USkeleton class="size-10 shrink-0 rounded-md" /><div class="flex-1 space-y-2"><USkeleton class="h-3.5 w-4/5" /><USkeleton class="h-2.5 w-2/5" /></div></div><USkeleton class="mt-5 h-3.5 w-2/5" /><USkeleton class="mt-1.5 h-3.5 w-3/5" /></div></div></section>
					<aside class="hidden rounded-md border border-neutral-200 bg-white p-3 lg:block"><USkeleton class="h-5 w-32" /><USkeleton class="mt-2 h-3 w-52" /><USkeleton class="mt-6 h-20 w-full rounded-md" /><USkeleton class="mt-3 h-11 w-full rounded-md" /></aside>
				</div>
				<div v-else-if="view === 'quick'" class="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_400px] lg:overflow-hidden">
					<section class="min-h-0 rounded-md border border-neutral-200 bg-white p-3 pb-24 lg:flex lg:flex-col lg:pb-3">
						<div v-if="order?.service_mode === 'dine-in'" class="relative mb-2 overflow-visible rounded-md border border-emerald-300 bg-emerald-50/60 shadow-sm ring-1 ring-emerald-100 lg:mb-3">
							<div class="flex items-center justify-between gap-2 border-l-4 border-emerald-600 px-2.5 py-2 lg:border-l-[6px] lg:px-3">
								<div class="flex min-w-0 items-center gap-2.5">
									<span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white shadow-sm shadow-emerald-900/10 lg:size-9">
										<UIcon name="i-heroicons-table-cells" class="size-4" />
									</span>
									<div class="min-w-0">
										<div class="flex min-w-0 flex-wrap items-center gap-1.5">
											<p class="truncate text-sm font-bold text-emerald-950">{{ t('restaurantPos.sellingTable', { table: `${order.zone_name} · ${order.table_name}` }) }}</p>
											<UBadge color="success" variant="soft">{{ t('restaurantPos.open') }}</UBadge>
										</div>
										<p class="mt-0.5 text-xs text-emerald-700">{{ displayGuestCount(order.guest_count, order.guest_count_specified) }} · {{ elapsed(order.opened_at) }}</p>
									</div>
								</div>
								<div class="hidden grid-cols-none grid-flow-col gap-2 lg:grid">
									<AppButton class="min-h-9 border border-sky-200 bg-sky-50 px-3 text-sky-800 shadow-sm hover:bg-sky-100" size="sm" color="neutral" variant="ghost" icon="i-heroicons-bolt" @click="parkOrder">{{ t('restaurantPos.quickSale') }}</AppButton>
									<AppButton class="min-h-9 border border-emerald-200 bg-white px-3 text-emerald-800 shadow-sm hover:bg-emerald-50" size="sm" color="neutral" variant="ghost" icon="i-heroicons-table-cells" @click="beginMoveTable">{{ t('restaurantPos.moveTable') }}</AppButton>
									<AppButton class="min-h-9 border border-amber-200 bg-amber-50 px-3 text-amber-800 shadow-sm hover:bg-amber-100" size="sm" color="neutral" variant="ghost" icon="i-heroicons-bookmark" @click="parkOrder">{{ t('restaurantPos.parkOrder') }}</AppButton>
								</div>
								<AppButton class="shrink-0 lg:hidden" size="sm" color="neutral" variant="soft" icon="i-heroicons-ellipsis-horizontal" :aria-label="t('restaurantPos.tableActions')" @click="tableActionsOpen = !tableActionsOpen" />
							</div>
							<div v-if="tableActionsOpen" class="absolute right-2 top-[calc(100%-2px)] z-40 w-52 overflow-hidden rounded-md border border-neutral-200 bg-white p-1.5 shadow-xl lg:hidden">
								<button class="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-sm font-medium text-sky-800 hover:bg-sky-50" @click="tableActionsOpen = false; parkOrder()"><UIcon name="i-heroicons-bolt" class="size-4" />ຂາຍດ່ວນ</button>
								<button class="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-sm font-medium text-emerald-800 hover:bg-emerald-50" @click="tableActionsOpen = false; beginMoveTable()"><UIcon name="i-heroicons-table-cells" class="size-4" />ປ່ຽນໂຕະ</button>
								<button class="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-sm font-medium text-amber-800 hover:bg-amber-50" @click="tableActionsOpen = false; parkOrder()"><UIcon name="i-heroicons-bookmark" class="size-4" />ພັກບິນ</button>
							</div>
						</div>
						<div class="sticky top-0 z-20 -mx-1 bg-white/95 px-1 pb-2 backdrop-blur lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:backdrop-blur-none">
							<UInput v-model="search" class="w-full shrink-0" size="lg" icon="i-heroicons-magnifying-glass" :placeholder="t('restaurantPos.search')" />
						</div>
						<div class="mt-1 grid content-start grid-cols-2 gap-2 overflow-y-auto sm:mt-3 sm:grid-cols-3 lg:min-h-0 lg:flex-1 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
							<div v-if="loadError && !products.length" class="col-span-full flex min-h-72 flex-col items-center justify-center rounded-md border border-dashed border-amber-300 bg-amber-50/40 p-8 text-center">
								<span class="flex size-11 items-center justify-center rounded-md border border-amber-200 bg-white text-amber-600 shadow-sm">
									<UIcon name="i-heroicons-wifi" class="size-5" />
								</span>
								<h2 class="mt-3 font-semibold text-stone-900">{{ t('restaurantPos.loadFailed') }}</h2>
								<p class="mt-1 max-w-md text-sm text-stone-500">{{ locale === 'lo' ? 'ອາດເກີດຈາກສັນຍານບໍ່ດີ ຫຼື server ບໍ່ພ້ອມ ກະລຸນາລອງໃໝ່' : 'The connection may be unstable or the server may be unavailable. Please try again.' }}</p>
								<AppButton class="mt-4" color="success" variant="solid" icon="i-heroicons-arrow-path" :loading="pending" @click="loadDashboard">{{ t('restaurantPos.retry') }}</AppButton>
							</div>
							<div v-else-if="hasEmptyCatalog" class="col-span-full flex min-h-[55vh] flex-col items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-50/60 p-8 text-center">
								<span class="flex size-11 items-center justify-center rounded-md border border-neutral-200 bg-white text-primary-600 shadow-sm">
									<UIcon name="i-heroicons-cube" class="size-5" />
								</span>
								<h2 class="mt-3 font-semibold text-stone-900">{{ t('pos.emptyCatalog') }}</h2>
								<p class="mt-1 max-w-md text-sm leading-6 text-stone-500">
									{{ canCreateProduct ? t('pos.emptyCatalogHint') : t('pos.emptyCatalogHintReadOnly') }}
								</p>
								<AppButton
									v-if="canCreateProduct"
									class="mt-4"
									color="success"
									variant="solid"
									icon="i-heroicons-plus-20-solid"
									@click="navigateTo('/products')"
								>
									{{ t('pos.emptyCatalogAction') }}
								</AppButton>
							</div>
							<div v-else-if="hasNoSearchMatch" class="col-span-full flex min-h-72 flex-col items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-50/60 p-8 text-center">
								<span class="flex size-11 items-center justify-center rounded-md border border-neutral-200 bg-white text-stone-400 shadow-sm">
									<UIcon name="i-heroicons-magnifying-glass" class="size-5" />
								</span>
								<h2 class="mt-3 font-semibold text-stone-900">{{ t('pos.noProductsFound') }}</h2>
								<p class="mt-1 max-w-md text-sm leading-6 text-stone-500">{{ t('pos.noProductsFoundHint') }}</p>
								<AppButton class="mt-4" color="neutral" variant="soft" icon="i-heroicons-x-mark-20-solid" @click="search = ''">
									{{ t('pos.clearSearch') }}
								</AppButton>
							</div>
							<article
								v-for="product in filteredProducts"
								:key="product.id"
								class="relative min-h-[108px] self-start rounded-md border bg-white p-2 shadow-sm transition hover:border-primary-300 hover:shadow-md sm:min-h-[118px]"
								:class="isProductUnavailable(product) ? 'border-neutral-200 opacity-65 grayscale-[0.35]' : 'border-neutral-200'"
							>
								<button type="button" class="flex min-h-[90px] w-full touch-manipulation flex-col text-left disabled:cursor-wait disabled:opacity-60 sm:min-h-[100px]" :disabled="Boolean(order) && actionPending" @click="addProduct(product)">
									<div class="flex min-w-0 items-start gap-2">
										<div class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-neutral-100">
											<img
												v-if="resolveProductImageUrl(product.image_url)"
												:src="resolveProductImageUrl(product.image_url) || undefined"
												:alt="product.name"
												class="h-full w-full object-cover"
											>
											<UIcon v-else name="i-heroicons-cube" class="size-5 text-stone-400" />
										</div>
										<div class="min-w-0 flex-1">
											<p class="line-clamp-2 text-xs font-semibold leading-4 sm:text-sm">{{ product.name }}</p>
											<p class="mt-0.5 truncate text-[9px] text-stone-400">{{ product.sku }}</p>
										</div>
									</div>
									<div class="mt-auto pt-2">
										<p class="text-sm font-semibold tabular-nums">{{ money(product.price_base) }}</p>
										<UBadge
											class="mt-1 text-[9px]"
											:color="isProductUnavailable(product) ? 'error' : product.inventory_mode === 'tracked' ? 'neutral' : 'primary'"
											variant="soft"
										>
											{{ product.inventory_mode === 'tracked' ? isProductUnavailable(product) ? t('restaurantPos.outOfStock') : t('restaurantPos.stock', { count: product.available_base }) : product.manual_sold_out ? t('restaurantPos.soldOut') : t('restaurantPos.foodMenu') }}
										</UBadge>
									</div>
								</button>
								<span v-if="productCartQty(product.id)" class="pointer-events-none absolute right-1.5 top-1.5 flex min-w-5 items-center justify-center rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white shadow-sm">
									{{ productCartQty(product.id) }}
								</span>
							</article>
						</div>
					</section>

					<button v-if="view === 'quick'" class="restaurant-mobile-ticket-bar fixed inset-x-2 bottom-2 z-30 flex min-h-[64px] items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white/95 px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-left shadow-[0_-8px_24px_rgba(31,28,24,0.08)] backdrop-blur lg:hidden" @click="mobileTicketOpen = true"><div class="min-w-0"><p class="truncate text-xs font-semibold text-stone-800">{{ order ? orderLabel : t('restaurantPos.quickCart') }}</p><p class="mt-0.5 text-xs text-stone-500">{{ t('common.itemCount', { count: cartItemCount }) }}</p></div><div class="flex shrink-0 items-center gap-3"><strong class="text-base tabular-nums sm:text-lg">{{ money(displayTotal) }}</strong><span class="rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white">{{ t('restaurantPos.viewBill') }}</span></div></button>

					<div class="fixed inset-0 z-50 items-end bg-black/45 p-0 sm:p-3 lg:static lg:z-auto lg:contents lg:bg-transparent lg:p-0" :class="mobileTicketOpen ? 'flex' : 'hidden lg:contents'" @click.self="mobileTicketOpen = false">
					<aside class="flex max-h-[92dvh] w-full min-h-0 flex-col overflow-hidden rounded-t-md border border-neutral-200 bg-white shadow-2xl sm:rounded-md lg:max-h-none lg:shadow-none">
						<header class="border-b p-3">
							<div class="flex items-start justify-between gap-2">
								<template v-if="order">
									<div class="min-w-0">
										<h2 class="truncate font-semibold">{{ orderLabel }}</h2>
										<p class="mt-0.5 truncate text-xs text-stone-500">{{ order.service_mode === 'pickup' ? t('restaurantPos.takeaway') : t('restaurantPos.dineIn') }} · {{ elapsed(order.opened_at) }}</p>
									</div>
									<div class="flex shrink-0 items-center gap-2">
										<AppButton v-if="canClearCartDraft" size="xs" color="error" variant="soft" icon="i-heroicons-trash" @click="openClearCartPanel">{{ t('restaurantPos.clear') }}</AppButton>
										<UBadge :color="order.status === 'ready_to_pay' ? 'warning' : 'success'" variant="soft">{{ order.status === 'ready_to_pay' ? t('restaurantPos.readyToPay') : t('restaurantPos.open') }}</UBadge>
										<AppButton class="lg:hidden" size="xs" color="neutral" variant="ghost" icon="i-heroicons-x-mark" aria-label="ปิดบิล" @click="mobileTicketOpen = false" />
									</div>
								</template>
								<template v-else>
									<div class="min-w-0">
										<h2 class="truncate font-semibold">{{ t('restaurantPos.quickCart') }}</h2>
										<p class="text-xs text-stone-500">{{ t('restaurantPos.quickCartHint') }}</p>
									</div>
									<div class="flex shrink-0 items-center gap-2">
										<UBadge v-if="selectedPromotionTotal" color="success" variant="soft">{{ t('restaurantPos.selectedCount', { count: selectedPromotionTotal }) }}</UBadge>
										<AppButton v-if="canClearCartDraft" size="xs" color="error" variant="soft" icon="i-heroicons-trash" @click="openClearCartPanel">{{ t('restaurantPos.clear') }}</AppButton>
										<AppButton class="lg:hidden" size="xs" color="neutral" variant="ghost" icon="i-heroicons-x-mark" aria-label="ปิดบิล" @click="mobileTicketOpen = false" />
									</div>
								</template>
							</div>
						</header>
						<div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
							<div v-if="!order && !localCart.length" class="flex min-h-56 flex-col items-center justify-center text-center"><UIcon name="i-heroicons-shopping-cart" class="size-10 text-stone-300" /><p class="mt-3 font-medium text-stone-700">{{ t('restaurantPos.noItems') }}</p><p class="mt-1 text-sm text-stone-500">{{ t('restaurantPos.selectProduct') }}</p></div>
							<div v-if="suggestedLocalPromotions.length" class="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2.5 shadow-sm">
								<div class="flex items-start gap-2">
									<span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-white text-emerald-700 ring-1 ring-emerald-100">
										<UIcon name="i-heroicons-gift" class="size-4" />
									</span>
									<div class="min-w-0 flex-1">
										<p class="text-sm font-semibold text-emerald-950">มีโปรโมชั่นที่รับได้</p>
										<p class="mt-0.5 truncate text-xs text-emerald-700">{{ suggestedLocalPromotions[0]?.name }} · {{ suggestedLocalPromotions[0] ? promotionBenefitLabel(suggestedLocalPromotions[0]) : '' }}</p>
									</div>
									<AppButton class="shrink-0 shadow-sm" size="xs" color="success" variant="solid" icon="i-heroicons-plus" @click="suggestedLocalPromotions[0] && (isDiscountPromotion(suggestedLocalPromotions[0]) ? applyLocalPromotion(suggestedLocalPromotions[0]) : addLocalPromotionGift(suggestedLocalPromotions[0]))">{{ suggestedLocalPromotions[0] && isDiscountPromotion(suggestedLocalPromotions[0]) ? t('restaurantPos.applyPromotion') : t('restaurantPos.addGift') }}</AppButton>
								</div>
								<button v-if="suggestedLocalPromotions.length > 1" class="mt-2 text-xs font-medium text-emerald-700" @click="promotionPanelOpen = true">ดูโปรโมชั่นทั้งหมด {{ suggestedLocalPromotions.length }} รายการ</button>
							</div>
							<section v-if="draftItems.length">
								<div class="divide-y divide-orange-100 rounded-md border border-orange-200 bg-orange-50/60 dark:divide-emerald-400/15 dark:border-emerald-400/30 dark:bg-emerald-500/10">
									<div v-for="item in draftItems" :key="item.id" class="px-2.5 py-2 text-stone-900 dark:text-stone-100">
										<div class="flex items-start justify-between gap-2">
											<div class="flex min-w-0 flex-1 items-start gap-2">
												<div class="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-orange-100 bg-white text-stone-400 dark:border-emerald-400/20 dark:bg-[#171a16] dark:text-stone-400">
													<img v-if="productImageForItem(item)" :src="productImageForItem(item) || undefined" :alt="item.name" class="h-full w-full object-cover">
													<UIcon v-else name="i-heroicons-cube" class="size-4" />
												</div>
												<div class="min-w-0 flex-1">
											<p class="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">{{ item.name }} <span v-if="item.is_gift" class="text-emerald-600 dark:text-emerald-300">· {{ t('restaurantPos.free') }}</span></p>
													<p v-if="item.note" class="mt-0.5 truncate text-[11px] text-stone-500 dark:text-stone-400">{{ item.note }}</p>
												</div>
											</div>
											<p class="shrink-0 text-sm font-semibold tabular-nums">{{ money(item.line_total) }}</p>
										</div>
										<div class="mt-1.5 flex items-center justify-end gap-1">
											<template v-if="!item.is_gift">
												<AppButton class="dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700" size="xs" color="neutral" variant="ghost" :disabled="actionPending || isItemPending(item.id)" @click="changeQty(item, -1)">−</AppButton>
												<span class="min-w-7 text-center text-sm font-semibold">{{ item.qty }}</span>
												<AppButton class="dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700" size="xs" color="neutral" variant="ghost" :disabled="actionPending || isItemPending(item.id)" @click="changeQty(item, 1)">+</AppButton>
											</template>
											<span v-else class="text-sm">× {{ item.qty }}</span>
											<AppButton class="dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20" size="xs" color="error" variant="ghost" icon="i-heroicons-trash" :disabled="actionPending || isItemPending(item.id)" :aria-label="`ลบ ${item.name}`" @click="removeItem(item)" />
										</div>
									</div>
								</div>
							</section>
							<section v-for="([round, items], roundIndex) in sentGroups" :key="round" class="rounded-md border" :class="roundIndex === 0 ? 'border-emerald-200 bg-emerald-50/20' : 'border-neutral-200 bg-white'">
								<div class="flex w-full items-center justify-between gap-2 px-2.5 py-2">
									<span class="text-xs font-semibold text-stone-600">{{ roundMode(round) === 'direct' ? t('restaurantPosCompact.directSale') : t('restaurantPosCompact.kitchenRound', { round }) }} · {{ t('common.itemCount', { count: items.length }) }}</span>
									<span v-if="roundIndex === 0" class="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{{ t('restaurantPos.latest') }}</span>
								</div>
								<div class="divide-y divide-neutral-100 border-t">
									<div v-for="item in items" :key="item.id" class="flex items-center justify-between gap-2 px-2.5 py-2 text-sm">
										<div class="flex min-w-0 flex-1 items-center gap-2">
											<div class="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-100 bg-neutral-50 text-stone-400">
												<img v-if="productImageForItem(item)" :src="productImageForItem(item) || undefined" :alt="item.name" class="h-full w-full object-cover">
												<UIcon v-else name="i-heroicons-cube" class="size-4" />
											</div>
											<span class="min-w-0 flex-1 truncate">{{ item.name }} <em v-if="item.is_gift" class="text-emerald-600">{{ t('restaurantPos.free') }}</em></span>
										</div>
										<div class="shrink-0 text-right">
											<p class="font-semibold tabular-nums">{{ money(item.line_total) }}</p>
											<p class="text-xs text-stone-500">× {{ item.qty }}</p>
										</div>
									<AppButton v-if="!item.is_gift" size="xs" color="primary" variant="soft" icon="i-heroicons-pencil-square" aria-label="ແກ້ໄຂຈຳນວນ" title="ແກ້ໄຂຈຳນວນ" @click="editSentItem(item)" />
									</div>
									<AppButton v-if="roundMode(round) === 'kitchen'" class="m-2" size="xs" color="neutral" variant="soft" icon="i-heroicons-printer" @click="printDocument('kitchen', round)">พิมพ์รายการ</AppButton>
								</div>
							</section>
						</div>
						<footer v-if="order || localCart.length" class="relative border-t bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pb-3">
							<div class="space-y-2">
								<div class="flex items-center justify-between">
									<span class="text-sm text-stone-500">{{ t('restaurantPos.total') }}</span>
									<strong class="text-xl tabular-nums">{{ money(displayTotal) }}</strong>
								</div>
								<div v-if="!order && localDiscount > 0" class="flex items-center justify-between rounded-md bg-emerald-50 px-2.5 py-2 text-sm text-emerald-800">
									<span>{{ t('pos.discount') }}</span>
									<strong class="tabular-nums">-{{ money(localDiscount) }}</strong>
								</div>
								<template v-if="!order">
									<div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] gap-2">
										<AppButton class="w-full justify-center" color="primary" :loading="actionPending" @click="openCheckout('direct')">
											<span class="inline-flex items-center justify-center gap-2"><Banknote class="size-5" />{{ t('restaurantPos.payDirect') }}</span>
										</AppButton>
										<AppButton class="w-full justify-center whitespace-nowrap" color="neutral" variant="soft" icon="i-heroicons-table-cells" :disabled="actionPending" @click="beginCartTable">{{ t('restaurantPos.openTableWithCart') }}</AppButton>
										<AppButton color="neutral" variant="soft" icon="i-heroicons-ellipsis-horizontal" aria-label="คำสั่งเพิ่มเติม" @click="moreActionsOpen = !moreActionsOpen" />
									</div>
								</template>
								<template v-else-if="draftItems.length">
									<div v-if="hasLocalTableDraft" class="flex min-w-0 items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-800" title="ມີລາຍການໃໝ່ ກະລຸນາບັນທຶກກ່ອນຊຳລະ">
										<UIcon name="i-heroicons-exclamation-circle" class="size-3.5 shrink-0" />
										<p class="truncate text-[11px] font-medium leading-none">ມີລາຍການໃໝ່ · ບັນທຶກກ່ອນຊຳລະ</p>
									</div>
									<AppButton v-if="!hasLocalTableDraft" block color="primary" :loading="actionPending" @click="openCheckout('direct')">
										<span class="inline-flex items-center justify-center gap-2"><Banknote class="size-5" />{{ t('restaurantPos.payDirect') }}</span>
									</AppButton>
									<div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] gap-2">
										<AppButton class="w-full justify-center" color="primary" variant="solid" icon="i-heroicons-check-circle" :loading="actionPending" @click="sendKitchen({ print: false, park: false, pay: false })">{{ t('restaurantPos.save') }}</AppButton>
										<AppButton class="w-full justify-center" color="neutral" variant="soft" :disabled="hasLocalTableDraft" @click="openCheckout('existing')">
											<span class="inline-flex items-center justify-center gap-2"><Banknote class="size-5" />{{ t('restaurantPos.pay') }}</span>
										</AppButton>
										<AppButton color="neutral" variant="soft" icon="i-heroicons-ellipsis-horizontal" aria-label="คำสั่งเพิ่มเติม" @click="moreActionsOpen = !moreActionsOpen" />
									</div>
								</template>
								<template v-else>
									<div class="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_44px] gap-2">
										<AppButton v-if="order.service_mode === 'dine-in'" class="w-full justify-center whitespace-nowrap" color="neutral" variant="soft" icon="i-heroicons-document-text" :loading="actionPending" @click="markReady">{{ t('restaurantPos.checkBill') }}</AppButton>
										<AppButton class="w-full justify-center" color="primary" :loading="actionPending" @click="openCheckout('existing')">
											<span class="inline-flex items-center justify-center gap-2"><Banknote class="size-5" />{{ t('restaurantPos.pay') }}</span>
										</AppButton>
										<AppButton color="neutral" variant="soft" icon="i-heroicons-ellipsis-horizontal" aria-label="คำสั่งเพิ่มเติม" @click="moreActionsOpen = !moreActionsOpen" />
									</div>
								</template>
							</div>
							<div v-if="moreActionsOpen" class="absolute inset-x-3 bottom-[calc(100%-0.25rem)] z-30 overflow-hidden rounded-md border border-neutral-200 bg-white shadow-2xl ring-1 ring-black/5">
								<div class="border-b border-neutral-100 bg-neutral-50 px-3 py-2 text-xs font-semibold text-stone-500">{{ t('restaurantPos.additionalActions') }}</div>
								<div class="p-1.5">
									<button v-if="!order" class="flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-stone-700 hover:bg-neutral-50" @click="openEstimate"><UIcon name="i-heroicons-document-text" class="size-4 text-stone-500" />{{ t('restaurantPos.printEstimate') }}</button>
									<template v-else>
									<button v-if="draftItems.length" class="flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-stone-700 hover:bg-amber-50 hover:text-amber-800" @click="moreActionsOpen = false; sendKitchen({ print: false, park: true, pay: false })"><UIcon name="i-heroicons-bookmark" class="size-4 text-amber-600" />{{ t('restaurantPos.saveAndPark') }}</button>
									<button class="flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-stone-700 hover:bg-neutral-50" @click="moreActionsOpen = false; parkOrder()"><UIcon name="i-heroicons-bookmark-square" class="size-4 text-stone-500" />{{ t('restaurantPos.parkOrder') }}</button>
									<button class="flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-stone-700 hover:bg-emerald-50 hover:text-emerald-800" @click="moreActionsOpen = false; beginMoveTable()"><UIcon name="i-heroicons-table-cells" class="size-4 text-emerald-600" />{{ order.service_mode === 'pickup' ? t('restaurantPos.selectTable') : t('restaurantPos.moveTable') }}</button>
									<button v-if="order.service_mode === 'dine-in'" class="flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-stone-700 hover:bg-neutral-50" @click="moreActionsOpen = false; changeToPickup()"><UIcon name="i-heroicons-shopping-bag" class="size-4 text-stone-500" />{{ t('restaurantPos.changeToTakeaway') }}</button>
									<button class="flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-stone-700 hover:bg-neutral-50" @click="moreActionsOpen = false; refreshOrder()"><UIcon name="i-heroicons-arrow-path" class="size-4 text-stone-500" />{{ t('restaurantPos.reload') }}</button>
									<button class="mt-1 flex min-h-10 w-full items-center gap-2 rounded-md border-t border-neutral-100 px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50" @click="moreActionsOpen = false; cancelReason = ''; cancelPanel = true"><UIcon name="i-heroicons-trash" class="size-4" />{{ t('restaurantPos.cancelOrder') }}</button>
									</template>
								</div>
							</div>
						</footer>
					</aside>
					</div>
				</div>

				<div v-else-if="view === 'pickupQueue'" class="min-h-0 flex-1 overflow-y-auto px-2 sm:px-3 lg:px-0">
					<div v-if="!pickupQueue.length" class="flex min-h-72 flex-col items-center justify-center rounded-md border border-dashed border-neutral-300 bg-white p-8 text-center">
						<span class="flex size-11 items-center justify-center rounded-md bg-emerald-50 text-emerald-700"><UIcon name="i-heroicons-check-circle" class="size-6" /></span>
						<h2 class="mt-3 font-semibold text-stone-900">{{ t('restaurantPos.noPickupQueue') }}</h2><p class="mt-1 text-sm text-stone-500">{{ t('restaurantPos.noPickupQueueHint') }}</p>
					</div>
					<div v-else class="flex flex-wrap content-start items-stretch gap-2">
						<article v-for="queued in pickupQueue" :key="queued.id" class="flex min-h-[190px] w-full flex-col overflow-hidden rounded-md border border-amber-200 bg-white shadow-sm sm:w-[340px]">
							<header class="flex items-start justify-between gap-3 border-b border-amber-100 bg-amber-50/60 px-3 py-2"><div><p class="text-[11px] font-medium text-amber-700">{{ t('restaurantPos.queueNumber') }}</p><p class="text-lg font-bold leading-tight tabular-nums text-stone-950">{{ displayQueueNo(queued.queue_no) }}</p></div><div class="text-right"><p class="text-[11px] text-stone-500">{{ t('restaurantPos.waitingFor', { time: elapsed(queued.paid_at || queued.created_at) }) }}</p><p class="mt-0.5 text-sm font-semibold tabular-nums">{{ money(queued.total) }}</p></div></header>
							<div class="space-y-1 px-3 py-2"><div v-for="item in queued.items.slice(0, 3)" :key="item.product_id" class="flex items-start justify-between gap-3 text-sm"><span class="min-w-0 truncate">{{ item.name }}<span v-if="item.is_gift" class="ml-1 text-xs text-emerald-600">{{ t('restaurantPos.free') }}</span></span><strong class="shrink-0 tabular-nums">× {{ item.qty }}</strong></div><button v-if="queued.items.length > 3" type="button" class="inline-flex min-h-7 items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800" @click="openPickupQueueDetail(queued)"><UIcon name="i-heroicons-eye" class="size-4" />{{ t('restaurantPos.viewBill') }} · {{ queued.items.length }}</button></div>
							<footer class="mt-auto border-t border-neutral-100 p-2.5"><AppButton block size="sm" color="success" variant="solid" icon="i-heroicons-check" :loading="collectingOrderId === queued.id" :disabled="Boolean(collectingOrderId)" @click="markPickupCollected(queued.id)">{{ t('restaurantPos.customerCollected') }}</AppButton></footer>
						</article>
					</div>
				</div>

				<div v-else-if="view === 'tables'" class="space-y-3 px-2 sm:px-3 lg:px-0">
					<div v-if="tableSelectionMode === 'cart'" class="flex items-center justify-between gap-3 rounded-md border border-sky-200 bg-sky-50/70 px-3 py-2 text-sky-950">
						<div class="flex min-w-0 items-center gap-2.5">
							<div class="flex size-9 shrink-0 items-center justify-center rounded-md border border-sky-200 bg-white text-sky-700">
								<UIcon name="i-heroicons-shopping-cart" class="size-4.5" />
							</div>
							<div class="min-w-0">
								<p class="truncate text-sm font-semibold">{{ t('restaurantPos.selectTableForCart', { count: cartItemCount }) }}</p>
								<p class="truncate text-xs text-sky-700">{{ t('restaurantPos.selectTableForCartHint') }}</p>
							</div>
						</div>
						<AppButton class="shrink-0" size="sm" color="neutral" variant="soft" @click="cancelTableSelection">{{ t('common.cancel') }}</AppButton>
					</div>
					<div v-if="tableSelectionMode === 'move' && order" class="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-emerald-950">
						<div class="flex min-w-0 items-center gap-2.5">
							<div class="flex size-9 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-white text-emerald-700">
								<UIcon name="i-heroicons-arrows-right-left" class="size-4.5" />
							</div>
							<div class="min-w-0">
								<p class="truncate text-sm font-semibold">{{ t('restaurantPos.selectingTableFor', { order: orderLabel }) }}</p>
								<p class="truncate text-xs text-emerald-700">{{ t('restaurantPos.moveTableHint') }}</p>
							</div>
						</div>
						<AppButton class="shrink-0" size="sm" color="neutral" variant="soft" @click="cancelTableSelection">{{ t('common.cancel') }}</AppButton>
					</div>
					<div v-if="zones.length" class="restaurant-pos-tab-scroll flex gap-2 overflow-x-auto">
						<AppButton class="shrink-0" :color="!activeZone ? 'primary' : 'neutral'" :variant="!activeZone ? 'solid' : 'soft'" @click="activeZone = ''">{{ t('restaurantPos.allZones') }}</AppButton>
						<AppButton v-for="zone in zones" :key="zone.id" class="shrink-0" :color="activeZone === zone.id ? 'primary' : 'neutral'" :variant="activeZone === zone.id ? 'solid' : 'soft'" @click="activeZone = zone.id">{{ zone.name }}</AppButton>
					</div>
					<div v-if="!zones.length" class="flex min-h-72 flex-col items-center justify-center rounded-md border border-dashed border-neutral-300 bg-white p-8 text-center">
						<UIcon name="i-heroicons-table-cells" class="size-10 text-stone-400" />
						<h2 class="mt-3 font-semibold">{{ t('restaurantPos.noTablesTitle') }}</h2>
						<p class="mt-1 text-sm text-stone-500">{{ t('restaurantPos.noTablesDescription') }}</p>
						<div class="mt-4 flex gap-2">
							<AppButton color="neutral" variant="soft" @click="view = 'quick'">{{ t('restaurantPos.backToQuickSale') }}</AppButton>
							<AppButton v-if="can('settings.restaurant.update')" to="/settings/restaurant">{{ t('restaurantPos.tableSettings') }}</AppButton>
						</div>
					</div>
					<div v-else-if="!zoneTables.length" class="rounded-md border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-stone-500">{{ t('restaurantPos.emptyZone') }}</div>
					<div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
						<button
							v-for="table in zoneTables"
							:key="table.id"
							class="group relative flex min-h-40 flex-col overflow-hidden rounded-md border p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
							:class="tableTone(table)"
							@click="chooseTable(table)"
						>
							<span class="absolute inset-x-0 top-0 h-1" :class="tableAccentClasses(table)" />
							<div class="flex items-start justify-between gap-3 pt-1">
								<div class="min-w-0">
									<p class="truncate text-lg font-bold text-stone-950">{{ table.name }}</p>
									<p class="mt-0.5 text-xs text-stone-500">{{ table.zone_name }} · {{ t('restaurantPos.seats', { count: table.capacity }) }}</p>
								</div>
								<span class="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ring-1" :class="tableStatusClasses(table)">
									<UIcon :name="table.order_id ? 'i-heroicons-user-group' : 'i-heroicons-check-circle'" class="size-3.5" />
									{{ tableStatusLabel(table) }}
								</span>
							</div>

							<div v-if="table.order_id" class="mt-4 space-y-2">
								<div class="flex items-end justify-between gap-2">
									<div>
										<p class="text-[11px] font-medium uppercase tracking-[0.12em] text-stone-400">{{ t('restaurantPos.tableTotal') }}</p>
										<p class="mt-0.5 text-xl font-bold tabular-nums text-stone-950">{{ money(Number(table.total || 0)) }}</p>
									</div>
									<UIcon name="i-heroicons-chevron-right" class="size-5 text-stone-400 transition group-hover:translate-x-0.5" />
								</div>
								<div class="grid gap-1.5 text-xs text-stone-600">
									<span class="inline-flex items-center gap-1.5"><UIcon name="i-heroicons-clock" class="size-3.5 text-stone-400" />{{ elapsed(table.opened_at) }}</span>
									<span class="inline-flex items-center gap-1.5"><UIcon name="i-heroicons-users" class="size-3.5 text-stone-400" />{{ displayGuestCount(table.guest_count, table.guest_count_specified) }}</span>
								</div>
								<UBadge v-if="table.draft_count" class="mt-1 w-fit" color="warning" variant="soft">{{ t('restaurantPos.unsavedCount', { count: table.draft_count }) }}</UBadge>
							</div>
							<div v-else class="mt-4 flex flex-1 flex-col justify-between gap-4">
								<div class="flex min-h-14 items-center justify-center rounded-md border border-dashed border-emerald-200 bg-emerald-50/60 text-emerald-700">
									<UIcon name="i-heroicons-plus-circle" class="size-6" />
								</div>
								<p class="inline-flex items-center justify-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm">
									{{ t('restaurantPos.openThisTable') }}
								</p>
							</div>
						</button>
					</div>
				</div>

				<div v-else class="space-y-3 px-2 sm:px-3 lg:px-0">
					<div v-if="!openOrders.length" class="flex min-h-72 flex-col items-center justify-center rounded-md border border-dashed border-neutral-300 bg-white p-8 text-center">
						<UIcon name="i-heroicons-check-circle" class="size-10 text-emerald-500" />
						<h2 class="mt-3 font-semibold">{{ t('restaurantPos.noOpenOrders') }}</h2>
						<p class="mt-1 text-sm text-stone-500">{{ t('restaurantPos.noOpenOrdersDescription') }}</p>
						<AppButton class="mt-4" @click="view = 'quick'">{{ t('restaurantPos.startQuickSale') }}</AppButton>
					</div>
					<div v-else class="grid max-w-5xl gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
						<button
							v-for="opened in openOrders"
							:key="opened.id"
							class="group relative overflow-hidden rounded-md border p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
							:class="openOrderTone(opened)"
							@click="loadOrder(opened.id)"
						>
							<span class="absolute inset-y-0 left-0 w-1" :class="openOrderAccent(opened)" />
							<div class="flex items-start justify-between gap-3 pl-1.5">
								<div class="flex min-w-0 items-start gap-2.5">
									<span class="flex size-9 shrink-0 items-center justify-center rounded-md bg-white text-stone-600 shadow-sm ring-1 ring-neutral-100">
										<UIcon :name="openOrderIcon(opened)" class="size-4" />
									</span>
									<div class="min-w-0">
										<p class="truncate text-sm font-bold text-stone-950">{{ openOrderTitle(opened) }}</p>
										<p class="mt-0.5 truncate text-xs text-stone-500">{{ opened.service_mode === 'pickup' ? t('restaurantPos.takeaway') : t('restaurantPos.dineIn') }} · {{ elapsed(opened.opened_at) }}</p>
									</div>
								</div>
								<UBadge class="shrink-0" :color="opened.status === 'ready_to_pay' ? 'warning' : 'success'" variant="soft">{{ opened.status === 'ready_to_pay' ? t('restaurantPos.readyToPay') : t('restaurantPos.open') }}</UBadge>
							</div>
							<div class="mt-3 flex items-end justify-between gap-3 pl-1.5">
								<div class="flex min-w-0 flex-wrap gap-1.5">
									<span class="rounded-md bg-white/80 px-2 py-1 text-[11px] font-medium text-stone-600 ring-1 ring-neutral-100">{{ t('restaurantPos.unsaved', { count: opened.draft_count }) }}</span>
									<span class="rounded-md bg-white/80 px-2 py-1 text-[11px] font-medium text-stone-600 ring-1 ring-neutral-100">{{ t('restaurantPos.saved', { count: opened.sent_count }) }}</span>
								</div>
								<div class="shrink-0 text-right">
									<p class="text-[10px] font-medium uppercase tracking-[0.12em] text-stone-400">{{ t('restaurantPos.amount') }}</p>
									<p class="text-lg font-bold tabular-nums text-stone-950">{{ money(opened.total) }}</p>
								</div>
							</div>
						</button>
					</div>
				</div>
			</div>
		</template>
	</AppSidebarShell>

	<AppResponsivePanel v-model="pickupQueueHistoryOpen" :title="t('pickupQueueHistory.title')" :description="t('pickupQueueHistory.hint')" desktop-width="680px" desktop-placement="center" mobile-max-height="90vh" fill-mobile-height panel-class="lg:h-[560px]" content-class="flex flex-col !overflow-hidden">
		<div class="min-h-0 flex-1">
			<div v-if="pickupQueueHistoryPending" class="scrollbar-soft h-full space-y-2 overflow-y-auto pr-1"><USkeleton v-for="index in 3" :key="index" class="h-24 w-full rounded-md" /></div>
			<div v-else-if="!pickupQueueHistory.length" class="flex h-full flex-col items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center">
				<UIcon name="i-heroicons-clock" class="size-8 text-stone-300" />
				<p class="mt-3 text-sm font-semibold text-stone-700">{{ t('pickupQueueHistory.empty') }}</p>
			</div>
			<div v-else class="scrollbar-soft h-full space-y-2 overflow-y-auto pr-1">
				<button v-for="queued in pickupQueueHistory" :key="queued.id" type="button" class="w-full rounded-md border border-neutral-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/30" @click="openPickupQueueDetail(queued)">
					<div class="flex items-start justify-between gap-3"><div><p class="text-xs text-stone-500">{{ t('restaurantPos.queueNumber') }}</p><p class="text-lg font-bold tabular-nums text-stone-950">{{ displayQueueNo(queued.queue_no) }}</p></div><div class="text-right"><p class="font-semibold tabular-nums text-stone-950">{{ money(queued.total) }}</p><p class="mt-0.5 text-xs text-emerald-700">{{ t('pickupQueueHistory.waitDuration', { time: queueWaitDuration(queued.paid_at || queued.created_at, queued.collected_at) }) }}</p></div></div>
					<div class="mt-2 grid gap-1 border-t border-neutral-100 pt-2 text-xs text-stone-500 sm:grid-cols-2"><span>{{ t('pickupQueueHistory.paidAt', { time: queueHistoryTime(queued.paid_at || queued.created_at) }) }}</span><span>{{ t('pickupQueueHistory.collectedAt', { time: queueHistoryTime(queued.collected_at) }) }}</span><span v-if="queued.collected_by_name" class="sm:col-span-2">{{ t('pickupQueueHistory.handledBy', { name: queued.collected_by_name }) }}</span></div>
				</button>
			</div>
		</div>
	</AppResponsivePanel>

	<AppResponsivePanel v-model="pickupQueueDetailOpen" :title="`${t('restaurantPos.queueNumber')} ${displayQueueNo(pickupQueueDetail?.queue_no)}`" :description="pickupQueueDetail ? `${pickupQueueDetail.collected_at ? t('pickupQueueHistory.collectedAt', { time: queueHistoryTime(pickupQueueDetail.collected_at) }) : t('restaurantPos.waitingFor', { time: elapsed(pickupQueueDetail.paid_at || pickupQueueDetail.created_at) })} · ${money(pickupQueueDetail.total)}` : ''" desktop-width="520px" desktop-placement="center" mobile-max-height="88vh">
		<div v-if="pickupQueueDetail" class="flex min-h-0 flex-col gap-3">
			<div class="scrollbar-soft max-h-[min(60vh,520px)] space-y-1.5 overflow-y-auto pr-1">
				<div v-for="(item, index) in pickupQueueDetail.items" :key="`${item.product_id}-${index}`" class="flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm">
					<span class="min-w-0 font-medium text-stone-800">{{ item.name }}<UBadge v-if="item.is_gift" class="ml-2" color="success" variant="soft">{{ t('restaurantPos.free') }}</UBadge></span>
					<strong class="shrink-0 tabular-nums">× {{ item.qty }}</strong>
				</div>
			</div>
			<AppButton v-if="!pickupQueueDetail.collected_at" block color="success" variant="solid" icon="i-heroicons-check" :loading="collectingOrderId === pickupQueueDetail.id" :disabled="Boolean(collectingOrderId)" @click="markPickupCollected(pickupQueueDetail.id); pickupQueueDetailOpen = false">{{ t('restaurantPos.customerCollected') }}</AppButton>
		</div>
	</AppResponsivePanel>

	<Teleport to="body">
		<Transition enter-active-class="transition duration-200 ease-out" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition duration-150 ease-in" leave-from-class="opacity-100" leave-to-class="opacity-0">
			<div v-if="promotionPanelOpen" class="fixed inset-0 z-[180] bg-[rgba(28,25,23,0.48)] p-3 backdrop-blur-[2px]" @click.self="promotionPanelOpen = false">
				<div class="mx-auto flex h-full max-h-[min(760px,calc(100dvh-1.5rem))] w-full max-w-3xl flex-col overflow-hidden rounded-md border border-neutral-200 bg-white shadow-2xl">
					<header class="flex items-start justify-between gap-4 border-b border-neutral-100 px-4 py-4 sm:px-5">
						<div class="min-w-0">
							<h2 class="text-lg font-semibold text-stone-950">{{ t('restaurantPos.promotionPickerTitle') }}</h2>
							<p class="mt-1 text-sm text-stone-500">{{ t('restaurantPos.promotionPickerHint') }}</p>
						</div>
						<AppButton color="neutral" variant="soft" icon="i-heroicons-x-mark-20-solid" :aria-label="t('restaurantPos.promotionPickerClose')" @click="promotionPanelOpen = false" />
					</header>

					<div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
						<div v-if="!promotionOptionCount" class="flex min-h-72 flex-col items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
							<UIcon name="i-heroicons-gift" class="size-10 text-stone-300" />
							<h3 class="mt-3 font-semibold text-stone-800">{{ t('restaurantPos.noPromotions') }}</h3>
							<p class="mt-1 max-w-sm text-sm text-stone-500">{{ t('restaurantPos.noPromotionsHint') }}</p>
						</div>

						<div class="grid gap-3 sm:grid-cols-2">
							<article v-for="promotion in promotionOptions" :key="promotion.promotion_id" class="flex min-h-[132px] flex-col rounded-md border p-4 transition" :class="promotionBlockedReason(promotion) ? 'border-neutral-200 bg-neutral-50 opacity-80' : selectedPromotionIds.includes(promotion.promotion_id) ? 'border-emerald-400 bg-emerald-50 shadow-sm ring-1 ring-emerald-100' : 'border-neutral-200 bg-white shadow-sm hover:border-emerald-300 hover:shadow-md'">
								<span class="flex items-start justify-between gap-3">
									<span class="flex min-w-0 gap-3">
										<span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
											<UIcon name="i-heroicons-gift" class="size-5" />
										</span>
										<span class="min-w-0">
											<span class="block line-clamp-2 text-sm font-semibold text-stone-950">{{ promotion.name }}</span>
											<span class="mt-1 block text-xs text-stone-500">
												{{ promotionBlockedReason(promotion) || (promotion.eligible === false ? promotion.remaining_qty ? t('restaurantPos.promotionAddMoreQty', { count: promotion.remaining_qty }) : t('restaurantPos.promotionAddMoreAmount', { amount: money(promotion.remaining_amount || 0) }) : isDiscountPromotion(promotion) ? `${t('pos.discount')} -${money(Number(promotion.discount_amount || 0))}` : `${t('restaurantPos.promotionRounds', { count: promotion.applications })} · ${t('restaurantPos.free')} × ${promotion.gift_qty}`) }}
											</span>
										</span>
									</span>
									<UIcon v-if="selectedPromotionIds.includes(promotion.promotion_id)" name="i-heroicons-check-circle" class="mt-1 size-5 shrink-0 text-emerald-600" />
								</span>
								<div class="mt-auto flex items-center justify-between gap-2 pt-4">
									<UBadge class="w-fit shrink-0" :color="promotionBlockedReason(promotion) ? 'error' : promotion.eligible === false ? 'neutral' : 'success'" variant="soft">
										{{ promotionBlockedReason(promotion) ? t('restaurantPos.promotionGiftOut') : promotion.eligible === false ? t('restaurantPos.promotionNotEligible') : isDiscountPromotion(promotion) ? t('restaurantPos.readyDiscount') : t('restaurantPos.promotionReadyGift') }}
									</UBadge>
									<AppButton class="min-w-[116px] justify-center shadow-sm ring-1 ring-emerald-700/10" size="sm" color="success" variant="solid" icon="i-heroicons-plus" :disabled="Boolean(promotionBlockedReason(promotion))" @click="applyLocalPromotion(promotion)">
										{{ selectedPromotionIds.includes(promotion.promotion_id) ? t('restaurantPos.promotionApplyAgain') : t('restaurantPos.applyPromotion') }}
									</AppButton>
								</div>
							</article>
						</div>
					</div>

					<footer class="flex items-center justify-between gap-3 border-t border-neutral-100 px-4 py-3 sm:px-5">
						<p class="text-xs text-stone-500">{{ !order && selectedPromotionTotal ? t('restaurantPos.promotionSelectedCount', { count: selectedPromotionTotal }) : t('restaurantPos.promotionSaveHint') }}</p>
						<AppButton color="neutral" variant="soft" @click="promotionPanelOpen = false">{{ t('restaurantPos.done') }}</AppButton>
					</footer>
				</div>
			</div>
		</Transition>
	</Teleport>

	<AppResponsivePanel
		v-model="menuAvailabilityOpen"
		:title="t('restaurantPos.manageMenu')"
		:description="t('restaurantPos.manageMenuHint')"
		desktop-width="560px"
		desktop-placement="center"
		mobile-max-height="88vh"
	>
		<div class="space-y-3">
			<UInput
				v-if="menuAvailabilitySearchable"
				v-model="menuAvailabilitySearch"
				size="md"
				color="neutral"
				icon="i-heroicons-magnifying-glass-20-solid"
				:placeholder="t('restaurantPos.searchMenu')"
				class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white"
			/>

			<div v-if="menuSoldOutCount" class="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
				{{ t('restaurantPos.menuSoldOutSummary', { count: menuSoldOutCount }) }}
			</div>

			<div
				v-if="!menuAvailabilityVisible.length"
				class="flex h-[min(60vh,420px)] items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-50 px-4 text-center text-sm text-stone-500"
			>
				{{ menuAvailabilityItems.length ? t('restaurantPos.noMenuMatch') : t('restaurantPos.noMenuItems') }}
			</div>

			<!-- Fixed height, not a cap: the panel then opens at the same size for
				 every store and in every state, so the close button and rows stay
				 where staff expect them. Only the rows scroll, keeping the search
				 box and the sold-out summary in view. -->
			<div v-else class="scrollbar-soft h-[min(60vh,420px)] space-y-3 overflow-y-auto">
				<div
					v-for="product in menuAvailabilityVisible"
					:key="product.id"
					class="flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white p-3"
				>
					<div class="min-w-0">
						<p class="truncate text-sm font-semibold text-stone-950">{{ product.name }}</p>
						<p class="mt-0.5 truncate text-xs text-stone-500">{{ product.sku }} · {{ money(product.price_base) }}</p>
					</div>
					<div class="flex shrink-0 items-center gap-2">
						<UBadge :color="product.manual_sold_out ? 'error' : 'success'" variant="soft" class="text-[10px]">
							{{ product.manual_sold_out ? t('restaurantPos.soldOut') : t('restaurantPos.available') }}
						</UBadge>
						<AppButton
							size="xs"
							class="min-w-[92px] justify-center"
							:color="product.manual_sold_out ? 'success' : 'error'"
							variant="solid"
							:icon="product.manual_sold_out ? 'i-heroicons-arrow-path-rounded-square' : 'i-heroicons-no-symbol'"
							:loading="menuAvailabilityPendingId === product.id"
							:disabled="Boolean(menuAvailabilityPendingId)"
							@click="setMenuAvailability(product, !product.manual_sold_out)"
						>
							{{ product.manual_sold_out ? t('restaurantPos.reopenMenu') : t('restaurantPos.markSoldOut') }}
						</AppButton>
					</div>
				</div>
			</div>
		</div>
	</AppResponsivePanel>

	<AppResponsivePanel v-model="guestPanel" :title="t('restaurantPos.chooseTable')" :description="selectedTable ? `${selectedTable.zone_name} · ${selectedTable.name}` : ''" desktop-width="520px" desktop-placement="center" mobile-max-height="88vh">
		<div class="space-y-4">
			<div class="rounded-md border border-emerald-100 bg-emerald-50/70 p-4">
				<div class="flex items-start justify-between gap-3">
					<div>
						<p class="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">{{ t('restaurantPos.table') }}</p>
						<h3 class="mt-1 text-xl font-bold text-emerald-950">{{ selectedTable?.name || '-' }}</h3>
						<p class="mt-1 text-sm text-emerald-700">{{ selectedTable?.zone_name || '-' }} · {{ t('restaurantPos.seats', { count: selectedTable?.capacity || 1 }) }}</p>
					</div>
					<UIcon name="i-heroicons-table-cells" class="size-7 text-emerald-600" />
				</div>
			</div>

			<section class="rounded-md border border-neutral-200 bg-white p-4">
				<div class="flex items-start justify-between gap-3">
					<div>
						<h4 class="font-semibold text-stone-950">{{ t('restaurantPos.guestCount') }}</h4>
						<p class="mt-1 text-sm text-stone-500">{{ t('restaurantPos.guestCountHint') }}</p>
					</div>
					<AppButton size="sm" color="neutral" :variant="guestCount === null ? 'solid' : 'soft'" @click="setGuestCount(null)">{{ t('restaurantPos.unspecified') }}</AppButton>
				</div>

				<div class="mt-4 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
					<AppButton color="neutral" variant="soft" icon="i-heroicons-minus" :disabled="guestCount === null || guestCount <= 1" aria-label="ลดจำนวนลูกค้า" @click="setGuestCount((guestCount || 1) - 1)" />
					<button
						type="button"
						class="min-h-12 rounded-md border text-center font-semibold tabular-nums transition"
						:class="guestCount === null ? 'border-neutral-200 bg-neutral-50 text-stone-500' : 'border-emerald-200 bg-emerald-50 text-emerald-950'"
						@click="setGuestCount(guestCount || selectedTable?.capacity || 1)"
					>
						{{ guestCount === null ? t('restaurantPos.unspecified') : t('restaurantPos.people', { count: guestCount }) }}
					</button>
					<AppButton color="neutral" variant="soft" icon="i-heroicons-plus" :disabled="guestCount !== null && guestCount >= 100" aria-label="เพิ่มจำนวนลูกค้า" @click="setGuestCount((guestCount || 0) + 1)" />
				</div>

				<div class="mt-3 grid grid-cols-4 gap-2">
					<button v-for="count in guestQuickCounts" :key="count" type="button" class="min-h-10 rounded-md border border-neutral-200 bg-neutral-50 px-2 text-sm font-semibold tabular-nums text-stone-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800" @click="setGuestCount(count)">
						{{ count }}
					</button>
				</div>
			</section>

			<div class="grid grid-cols-2 gap-2">
				<AppButton color="neutral" variant="soft" block @click="guestPanel = false">{{ t('common.cancel') }}</AppButton>
				<AppButton block :loading="actionPending" @click="confirmTable">{{ t('restaurantPos.confirmTable') }}</AppButton>
			</div>
		</div>
	</AppResponsivePanel>
	<AppResponsivePanel
		v-model="checkoutPanel"
		:title="checkoutTitle"
		:description="checkoutDescription"
		desktop-width="560px"
		desktop-placement="center"
		mobile-max-height="96dvh"
		fill-mobile-height
		compact-header
		close-button-size="sm"
		panel-class="lg:h-[min(720px,calc(100dvh-2rem))]"
		content-class="flex flex-col !overflow-hidden !px-4 !py-4"
	>
		<div v-if="checkoutStep === 'processing'" class="-mx-4 -mb-4 -mt-3 flex min-h-0 flex-1 flex-col items-center justify-center border-t border-emerald-100 bg-emerald-50/60 px-6 py-8 text-center">
			<div class="grid size-16 place-items-center rounded-full bg-white shadow-sm">
				<Loader class="size-8 animate-spin text-emerald-600" :stroke-width="2.4" />
			</div>
			<h3 class="mt-5 text-lg font-bold text-emerald-900">{{ t('posPanels.processing') }}...</h3>
			<p class="mt-1 max-w-xs text-sm text-emerald-700">{{ t('posPanels.processingHint') }}</p>
		</div>
		<div v-else-if="checkoutStep === 'success'" class="-mx-4 -mb-4 -mt-3 flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden border-t border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-emerald-100 px-6 py-8 text-center">
			<div class="checkout-success-burst">
				<div class="checkout-success-ring">
					<UIcon name="i-heroicons-check" class="checkout-success-check" />
				</div>
			</div>
			<h3 class="mt-5 text-xl font-bold text-emerald-900">{{ t('posPanels.success') }}</h3>
			<p class="mt-1 text-sm text-emerald-700">{{ t('posPanels.generatingReceipt') }}</p>
		</div>
		<div v-else-if="checkoutStep === 'receipt'" class="flex min-h-0 flex-col space-y-3 md:max-h-[calc(100vh-190px)]">
			<div v-if="printPaymentMethod === 'cash'" class="rounded-md border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-400/40 dark:bg-emerald-500/15">
				<p class="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">{{ t('pos.change') }}</p>
				<p class="mt-1 text-3xl font-bold tabular-nums text-emerald-950 dark:text-emerald-100">{{ money(printChange) }}</p>
			</div>
			<div class="scrollbar-soft min-h-[220px] flex-1 overflow-y-auto rounded-md border border-neutral-200 bg-neutral-50 px-3 py-4 md:min-h-0">
				<div class="receipt-preview-sheet mx-auto w-[80mm] max-w-full rounded-sm border border-neutral-200 bg-white px-[5mm] py-[6mm] text-[12px] leading-snug text-stone-900 shadow-sm">
					<div class="text-center">
						<img v-if="receiptShowStoreLogo && receiptStoreLogoUrl" :src="receiptStoreLogoUrl" alt="" class="mx-auto mb-2 size-14 object-contain">
						<p v-if="receiptShowStoreName" class="text-[13px] font-bold text-stone-950">{{ storeName }}</p>
						<p v-for="line in receiptStoreLines" :key="line" class="mt-0.5 text-[11px] text-stone-500">{{ line }}</p>
						<p class="mt-1 text-[11px] text-stone-500">{{ printOrderNo }}</p>
					</div>
					<div class="my-3 border-t border-dashed border-neutral-300" />
					<div class="space-y-2">
						<div v-for="item in printItems" :key="item.id" class="flex justify-between gap-3">
							<div class="min-w-0">
							<p class="truncate font-medium text-stone-900">{{ item.name }} <span v-if="item.is_gift" class="font-sans text-emerald-600">· {{ t('posPanels.free') }}</span></p>
								<p class="text-[11px] text-stone-500">× {{ item.qty }}</p>
							</div>
							<span class="shrink-0 font-mono tabular-nums">{{ money(item.line_total) }}</span>
						</div>
					</div>
					<div class="my-3 border-t border-dashed border-neutral-300" />
					<div class="space-y-2">
						<div class="flex justify-between gap-3">
						<span>{{ t(vatEnabled && vatMode === 'INCLUSIVE' ? 'posPanels.productBeforeVat' : 'posPanels.productAmount') }}</span>
							<span class="font-mono tabular-nums">{{ money(printNetSubtotal) }}</span>
						</div>
						<div v-if="printVat" class="flex justify-between gap-3">
						<span>VAT {{ vatRateLabel }}%{{ vatMode === 'INCLUSIVE' ? ` (${t('posPanels.vatIncluded')})` : '' }}</span>
							<span class="font-mono tabular-nums">{{ money(printVat) }}</span>
						</div>
						<div class="flex justify-between gap-3 border-t border-neutral-200 pt-2 text-[13px] font-bold">
						<span>{{ t('posPanels.amountDue') }}</span>
							<span class="font-mono tabular-nums">{{ money(printTotal) }}</span>
						</div>
						<div v-if="receiptShowPaymentMethod" class="flex justify-between gap-3 text-stone-600">
						<span>{{ t('posPanels.paymentMethod') }}</span>
							<span>{{ paymentMethodOptions.find((method) => method.id === printPaymentMethod)?.label || printPaymentMethod }}</span>
						</div>
						<div v-if="printPaymentMethod === 'cash' && receiptShowTendered" class="flex justify-between gap-3 text-stone-600">
						<span>{{ t('posPanels.cashReceived') }}</span>
							<span class="font-mono tabular-nums">{{ money(printTendered) }}</span>
						</div>
						<div v-if="printPaymentMethod === 'cash' && receiptShowChange" class="flex justify-between gap-3 text-stone-600">
						<span>{{ t('pos.change') }}</span>
							<span class="font-mono tabular-nums">{{ money(printChange) }}</span>
						</div>
					</div>
					<div class="mt-4 border-t border-dashed border-neutral-300 pt-3 text-center">
						<div v-if="receiptShowQueue && printQueueText" class="mb-3">
						<p class="font-sans text-[11px] text-stone-500">{{ t('posPanels.queue') }}</p>
							<p class="text-lg font-bold leading-tight text-stone-950">{{ printQueueText }}</p>
						</div>
					<p class="font-sans text-[11px] text-stone-500">{{ t('posPanels.thankYou') }}</p>
						<p class="mt-1 text-[10px] text-stone-400">Powered by O KhaiDee+</p>
					</div>
				</div>
			</div>
			<div class="grid grid-cols-2 gap-2 md:gap-3">
				<AppButton color="neutral" variant="soft" size="lg" block @click="finishCheckoutFlow">{{ t('posPanels.noPrint') }}</AppButton>
				<AppButton color="primary" size="lg" block icon="i-heroicons-printer" @click="printReceiptAndFinish">{{ t('posPanels.printReceipt') }}</AppButton>
			</div>
		</div>
		<div v-else class="scrollbar-soft flex min-h-0 flex-1 flex-col space-y-3 overflow-y-auto pr-1">
			<div class="grid shrink-0 grid-cols-3 gap-1.5 md:gap-2">
				<button
					v-for="method in paymentMethodOptions"
					:key="method.id"
					type="button"
					class="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md border px-2 py-1 text-xs font-semibold transition md:min-h-11 md:text-sm"
					:class="paymentMethod === method.id ? 'border-primary-600 bg-primary-600 text-white shadow-sm' : 'border-neutral-200 bg-neutral-50 text-stone-700 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700'"
					@click="paymentMethod = method.id"
				>
					<UIcon :name="method.icon" class="size-5" />
					<span class="truncate">{{ method.label }}</span>
				</button>
			</div>
			<div class="min-h-[166px] shrink-0">
				<div v-if="paymentMethod === 'cash'" class="space-y-2">
					<div class="rounded-md border border-neutral-200 bg-white px-3 py-1.5">
						<div class="flex items-center justify-between gap-3">
							<p class="text-[11px] font-semibold uppercase text-stone-400">{{ t('posPanels.cashReceived') }}</p>
							<div class="flex items-center gap-1.5">
								<button type="button" class="grid size-7 place-items-center rounded-md bg-neutral-100 text-stone-600 transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40" :disabled="!cashTenderedHistory.length" :aria-label="t('posPanels.undoCash')" @click="undoCashTendered">
									<UIcon name="i-heroicons-arrow-uturn-left" class="size-3.5" />
								</button>
								<button type="button" class="min-h-7 rounded-md bg-neutral-100 px-2 text-[11px] font-semibold text-stone-600 transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40" :disabled="cashTendered <= 0" @click="setCashTendered(0)">
									{{ t('posPanels.clear') }}
								</button>
							</div>
						</div>
						<p class="text-right text-xl font-bold leading-tight tabular-nums text-stone-950">{{ money(cashTendered) }}</p>
					</div>
					<div class="grid grid-cols-4 gap-1.5">
						<button
							v-for="amount in cashQuickAmounts"
							:key="amount"
							type="button"
							class="min-h-9 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1.5 text-xs font-semibold tabular-nums text-emerald-700 transition hover:border-emerald-200 hover:bg-emerald-100 active:scale-[0.98] md:min-h-10"
							@click="addCashTendered(amount)"
						>
							+{{ money(amount) }}
						</button>
					</div>
					<div class="grid grid-cols-3 gap-1.5">
						<button
							v-for="digit in ['1','2','3','4','5','6','7','8','9']"
							:key="digit"
							type="button"
							class="min-h-10 rounded-md border border-neutral-200 bg-neutral-50 text-base font-semibold tabular-nums text-stone-900 transition hover:border-primary-200 hover:bg-primary-50 active:scale-[0.98] md:min-h-11"
							@click="appendCashDigit(digit)"
						>
							{{ digit }}
						</button>
						<button type="button" class="min-h-10 rounded-md border border-neutral-200 bg-neutral-50 text-sm font-semibold text-stone-700 transition hover:border-primary-200 hover:bg-primary-50 active:scale-[0.98] md:min-h-11" @click="setCashTendered(0)">
							{{ t('posPanels.clear') }}
						</button>
						<button type="button" class="min-h-10 rounded-md border border-neutral-200 bg-neutral-50 text-base font-semibold tabular-nums text-stone-900 transition hover:border-primary-200 hover:bg-primary-50 active:scale-[0.98] md:min-h-11" @click="appendCashDigit('0')">
							0
						</button>
						<button type="button" class="flex min-h-10 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-stone-700 transition hover:border-primary-200 hover:bg-primary-50 active:scale-[0.98] md:min-h-11" :aria-label="t('posPanels.deleteDigit')" @click="backspaceCashTendered">
							<UIcon name="i-heroicons-backspace" class="size-5" />
						</button>
					</div>
				</div>
				<template v-if="paymentMethod === 'qr_transfer' && !order">
					<UFormField :label="t('pos.paymentAccount')">
						<select v-model="paymentAccountId" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm md:min-h-11">
							<option value="">{{ t('posPanels.selectAccount') }}</option>
							<option v-for="account in paymentAccounts" :key="account.id" :value="account.id">{{ account.display_name }}</option>
						</select>
					</UFormField>
				</template>
			</div>
			<div class="mt-auto shrink-0 rounded-md border border-neutral-200 bg-neutral-50 p-3">
				<div class="flex justify-between gap-3 text-sm">
					<span>{{ t(vatEnabled && vatMode === 'INCLUSIVE' ? 'posPanels.productBeforeVat' : 'posPanels.productAmount') }}</span>
					<span class="tabular-nums">{{ money(billingSubtotal) }}</span>
				</div>
				<div v-if="billingDiscount > 0" class="mt-2 flex justify-between gap-3 text-sm text-emerald-700">
					<span>{{ t('pos.discount') }}</span>
					<span class="font-semibold tabular-nums">-{{ money(billingDiscount) }}</span>
				</div>
				<div v-if="vatEnabled" class="mt-2 flex justify-between gap-3 text-sm">
					<span>VAT {{ vatRateLabel }}%{{ vatMode === 'INCLUSIVE' ? ` (${t('posPanels.vatIncluded')})` : '' }}</span>
					<span class="tabular-nums">{{ money(billingVat) }}</span>
				</div>
				<div class="mt-2 flex justify-between gap-3 border-t border-neutral-200 pt-2">
					<span>{{ t('posPanels.amountDue') }}</span>
					<strong class="tabular-nums">{{ money(displayTotal) }}</strong>
				</div>
				<div v-if="paymentMethod === 'cash'" class="mt-2 flex justify-between gap-3 text-sm">
					<span>{{ t('pos.change') }}</span>
					<span class="tabular-nums">{{ money(Math.max(0, cashTendered - displayTotal)) }}</span>
				</div>
			</div>
			<AppButton
				block
				size="md"
				color="primary"
				class="shrink-0"
				:loading="actionPending"
				:disabled="paymentMethod === 'cash' ? cashTendered < displayTotal : paymentMethod === 'qr_transfer' && !order ? !paymentAccountId : false"
				@click="checkout"
			>
				{{ t('pos.confirmPayment') }}
			</AppButton>
		</div>
	</AppResponsivePanel>
	<AppResponsivePanel v-model="clearCartPanel" :title="clearCartTitle" :description="clearCartDescription" desktop-width="440px" desktop-placement="center">
		<div class="space-y-4">
			<div class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
				<p class="font-semibold">{{ clearCartCountLabel }}</p>
				<p class="mt-1">{{ t(order ? 'posPanels.savedItemsRemain' : 'posPanels.cartStartsNew') }}</p>
			</div>
			<div class="grid grid-cols-2 gap-2">
				<AppButton color="neutral" variant="soft" block @click="clearCartPanel = false">{{ t('common.cancel') }}</AppButton>
				<AppButton color="error" block icon="i-heroicons-trash" @click="confirmClearCart">{{ t('posPanels.clear') }}</AppButton>
			</div>
		</div>
	</AppResponsivePanel>
	<AppResponsivePanel
		v-model="cancelPanel"
		:title="t('posPanels.cancelOrder')"
		:description="orderLabel"
		desktop-width="480px"
		desktop-placement="center"
		mobile-max-height="88vh"
	>
		<div class="space-y-4">
			<div v-if="order?.items.some((item) => item.line_status === 'sent')" class="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
				<UIcon name="i-heroicons-exclamation-triangle" class="mt-0.5 size-5 shrink-0 text-amber-600" />
				<p>{{ t('posPanels.sentOrderWarning') }}</p>
			</div>
			<UFormField :label="t('posPanels.reason')">
				<UTextarea v-model="cancelReason" class="w-full" :rows="3" maxlength="280" autofocus />
			</UFormField>
			<div class="grid grid-cols-2 gap-2">
				<AppButton color="neutral" variant="soft" block @click="cancelPanel = false">{{ t('posPanels.back') }}</AppButton>
				<AppButton color="error" block icon="i-heroicons-trash" :loading="actionPending" :disabled="Boolean(order?.items.some((item) => item.line_status === 'sent')) && !cancelReason.trim()" @click="cancelOrder">{{ t('posPanels.confirmCancel') }}</AppButton>
			</div>
		</div>
	</AppResponsivePanel>
	<AppResponsivePanel v-model="sentItemPanel" :title="t('posPanels.editItem')" :description="cancellingItem?.name || ''" desktop-width="520px" desktop-placement="center">
		<div class="space-y-4">
			<div class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{{ t('posPanels.editItemWarning') }}</div>
			<div class="rounded-md border border-neutral-200 bg-white p-3">
				<div class="flex items-center justify-between gap-3">
					<div><p class="text-sm font-semibold">{{ t('posPanels.newQuantity') }}</p><p class="text-xs text-stone-500">{{ t('posPanels.oldQuantity', { count: cancellingItem?.qty || 0 }) }}</p></div>
					<div class="grid grid-cols-[44px_72px_44px] items-center gap-2">
						<AppButton color="neutral" variant="soft" icon="i-heroicons-minus" :aria-label="t('posPanels.decrease')" :disabled="sentItemQty <= 0" @click="sentItemQty = Math.max(0, sentItemQty - 1)" />
						<div class="flex h-10 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-lg font-bold tabular-nums">{{ sentItemQty }}</div>
						<AppButton color="neutral" variant="soft" icon="i-heroicons-plus" :aria-label="t('posPanels.increase')" :disabled="sentItemQty >= Number(cancellingItem?.qty || 0) - 1" @click="sentItemQty = Math.min(Number(cancellingItem?.qty || 0) - 1, sentItemQty + 1)" />
					</div>
				</div>
				<p v-if="sentItemQty === 0" class="mt-2 text-xs font-medium text-red-600">{{ t('posPanels.itemWillCancel') }}</p>
			</div>
			<div>
				<p class="text-sm font-semibold">{{ t('posPanels.reason') }} <span class="font-normal text-stone-400">({{ t('posPanels.optional') }})</span></p>
				<div class="mt-2 grid grid-cols-2 gap-2">
					<AppButton v-for="reason in sentItemReasonPresets" :key="reason" color="neutral" :variant="sentItemReasonPreset === reason ? 'solid' : 'soft'" @click="sentItemReasonPreset = sentItemReasonPreset === reason ? '' : reason; cancelReason = ''">{{ reason }}</AppButton>
				</div>
				<UTextarea v-if="sentItemReasonPreset === t('posPanels.reasonOther')" v-model="cancelReason" class="mt-2 w-full" :rows="2" maxlength="280" :placeholder="t('posPanels.reasonPlaceholder')" />
			</div>
			<div class="grid grid-cols-2 gap-2">
				<AppButton color="neutral" variant="soft" block @click="sentItemPanel = false">{{ t('posPanels.back') }}</AppButton>
				<AppButton :color="sentItemQty === 0 ? 'error' : 'primary'" block :loading="actionPending" :disabled="sentItemQty >= Number(cancellingItem?.qty || 0)" @click="adjustSentItem">{{ t(sentItemQty === 0 ? 'posPanels.confirmCancel' : 'posPanels.saveChanges') }}</AppButton>
			</div>
		</div>
	</AppResponsivePanel>
	<AppResponsivePanel
		v-model="printPreviewOpen"
		:title="t('posPanels.printPreview')"
		:description="printKind === 'kitchen' ? t('posPanels.round', { round: printRound || '-' }) : printKind === 'check' ? `${t('posPanels.checkBill')} · ${t('posPanels.unpaid')}` : printKind === 'estimate' ? `${t('posPanels.estimate')} · ${t('posPanels.unpaid')}` : t('posPanels.receipt')"
		desktop-width="520px"
		desktop-placement="center"
		mobile-max-height="92vh"
	>
		<div class="flex min-h-0 flex-col gap-3">
			<div class="scrollbar-soft max-h-[calc(100vh-260px)] overflow-y-auto rounded-md border border-neutral-200 bg-neutral-50 p-4">
				<div class="receipt-preview-sheet mx-auto w-[80mm] max-w-full rounded-sm border border-neutral-200 bg-white px-[5mm] py-[6mm] text-[12px] leading-snug text-stone-900 shadow-sm">
					<div class="text-center">
						<img v-if="receiptShowStoreLogo && receiptStoreLogoUrl" :src="receiptStoreLogoUrl" alt="" class="mx-auto mb-2 size-14 object-contain">
						<p v-if="receiptShowStoreName" class="text-[13px] font-bold text-stone-950">{{ storeName }}</p>
						<p class="mt-1 font-semibold">{{ t(printKind === 'kitchen' ? 'posPanels.billItems' : printKind === 'check' ? 'posPanels.checkBill' : printKind === 'estimate' ? 'posPanels.estimate' : 'posPanels.receipt') }}</p>
						<p v-if="printKind === 'check' || printKind === 'estimate'" class="mt-1 font-bold text-red-600">{{ t('posPanels.unpaid') }}</p>
						<p v-if="printKind !== 'receipt'" class="mt-1 text-[11px] text-stone-500">{{ printLabel }}</p>
						<p class="mt-0.5 text-[11px] text-stone-500">{{ printOrderNo }}<template v-if="printRound"> · {{ t('posPanels.round', { round: printRound }) }}</template></p>
					</div>
					<div class="my-3 border-t border-dashed border-neutral-300" />
					<div class="space-y-2">
						<div v-for="item in printItems" :key="item.id" class="flex justify-between gap-3">
							<div class="min-w-0">
								<p class="font-medium text-stone-900">{{ item.name }} <span v-if="item.is_gift" class="text-emerald-600">· {{ t('posPanels.free') }}</span></p>
								<p v-if="item.note" class="text-[10px] text-stone-500">{{ item.note }}</p>
							</div>
							<span class="shrink-0 font-mono tabular-nums">× {{ item.qty }}<template v-if="printKind !== 'kitchen'"> · {{ money(item.line_total) }}</template></span>
						</div>
					</div>
					<p v-if="!printItems.length" class="py-5 text-center text-stone-500">{{ t('posPanels.noRoundItems') }}</p>
					<template v-if="printKind !== 'kitchen'">
						<div class="my-3 border-t border-dashed border-neutral-300" />
						<div class="flex justify-between gap-3 text-[13px] font-bold"><span>{{ t('posPanels.total') }}</span><span class="font-mono tabular-nums">{{ money(printTotal) }}</span></div>
					</template>
				</div>
			</div>
			<div class="grid grid-cols-2 gap-2">
				<AppButton color="neutral" variant="soft" block @click="printPreviewOpen = false">{{ t('common.cancel') }}</AppButton>
				<AppButton color="primary" block icon="i-heroicons-printer" :disabled="!printItems.length" @click="confirmPrintDocument">{{ t('posPanels.print') }}</AppButton>
			</div>
		</div>
	</AppResponsivePanel>

	<div class="restaurant-print-root">
		<div class="print-sheet">
			<img v-if="receiptShowStoreLogo && receiptStoreLogoUrl" :src="receiptStoreLogoUrl" alt="" class="print-store-logo">
			<h1 v-if="receiptShowStoreName">{{ storeName }}</h1>
			<p v-for="line in receiptStoreLines" :key="line">{{ line }}</p>
			<p class="print-kind">{{ t(printKind === 'kitchen' ? 'posPanels.billItems' : printKind === 'check' ? 'posPanels.checkBill' : printKind === 'estimate' ? 'posPanels.estimate' : 'posPanels.receipt') }}</p>
			<p v-if="printKind === 'check' || printKind === 'estimate'" class="print-unpaid">{{ t('posPanels.unpaid') }}</p>
			<p v-if="printKind !== 'receipt'">{{ printLabel }}</p>
			<p>{{ printOrderNo }}<template v-if="printRound"> · {{ t('posPanels.round', { round: printRound }) }}</template></p>
			<hr>
			<div v-for="item in printItems" :key="item.id">
				<div class="print-line">
					<span>{{ item.name }} <b v-if="item.is_gift">({{ t('posPanels.free') }})</b></span>
					<span>× {{ item.qty }}<template v-if="printKind !== 'kitchen'"> · {{ money(item.line_total) }}</template></span>
				</div>
				<p v-if="item.note" class="print-note">{{ t('posPanels.note') }}: {{ item.note }}</p>
			</div>
			<template v-if="printKind !== 'kitchen'">
				<hr>
				<div class="print-line"><span>{{ t(vatEnabled && vatMode === 'INCLUSIVE' ? 'posPanels.productBeforeVat' : 'posPanels.productAmount') }}</span><span>{{ money(printNetSubtotal) }}</span></div>
				<div v-if="printVat" class="print-line"><span>VAT {{ vatRateLabel }}%<template v-if="vatMode === 'INCLUSIVE'"> ({{ t('posPanels.vatIncluded') }})</template></span><span>{{ money(printVat) }}</span></div>
				<div class="print-total"><strong>{{ t('posPanels.total') }}</strong><strong>{{ money(printTotal) }}</strong></div>
				<template v-if="printKind === 'receipt'">
					<div v-if="receiptShowPaymentMethod" class="print-line"><span>{{ t('posPanels.paymentMethod') }}</span><span>{{ paymentMethodOptions.find((method) => method.id === printPaymentMethod)?.label || printPaymentMethod }}</span></div>
					<div v-if="printPaymentMethod === 'cash' && receiptShowTendered" class="print-line"><span>{{ t('posPanels.cashReceived') }}</span><span>{{ money(printTendered) }}</span></div>
					<div v-if="printPaymentMethod === 'cash' && receiptShowChange" class="print-line"><span>{{ t('pos.change') }}</span><span>{{ money(printChange) }}</span></div>
					<div v-if="receiptShowQueue && printQueueText" class="print-queue"><span>{{ t('posPanels.queue') }}</span><strong>{{ printQueueText }}</strong></div>
				</template>
			</template>
			<p class="print-time">{{ new Date().toLocaleString(locale) }}</p>
			<p class="print-powered">Powered by O KhaiDee+</p>
		</div>
	</div>
</template>

<style scoped>
.restaurant-pos-tab-scroll{scrollbar-width:none;-ms-overflow-style:none}.restaurant-pos-tab-scroll::-webkit-scrollbar{display:none}
@media (min-width:1024px){.restaurant-mobile-ticket-bar{display:none!important}}
.checkout-success-burst{position:relative;display:grid;place-items:center;width:112px;height:112px;border-radius:999px;background:radial-gradient(circle,rgba(16,185,129,.24),rgba(16,185,129,0) 68%);animation:checkout-burst .85s ease-out both}.checkout-success-burst::before{content:"";position:absolute;inset:10px;border-radius:999px;background:rgba(16,185,129,.12);animation:checkout-pulse .85s ease-out both}.checkout-success-ring{position:relative;display:grid;place-items:center;width:76px;height:76px;border-radius:999px;background:#10b981;color:white;box-shadow:0 18px 36px rgba(16,185,129,.32);animation:checkout-pop .38s cubic-bezier(.2,1.35,.35,1) both}.checkout-success-check{width:42px;height:42px;stroke-width:3;animation:checkout-check .48s .18s ease-out both}
@keyframes checkout-burst{0%{opacity:0;transform:scale(.72)}55%{opacity:1;transform:scale(1.08)}100%{opacity:1;transform:scale(1)}}@keyframes checkout-pulse{0%{opacity:0;transform:scale(.35)}65%{opacity:1;transform:scale(1.18)}100%{opacity:0;transform:scale(1.55)}}@keyframes checkout-pop{0%{opacity:0;transform:scale(.42) rotate(-8deg)}100%{opacity:1;transform:scale(1) rotate(0)}}@keyframes checkout-check{0%{opacity:0;transform:scale(.5)}100%{opacity:1;transform:scale(1)}}
.receipt-preview-sheet{font-family:"Google Sans Lao","Avenir Next","Segoe UI",sans-serif}.receipt-preview-sheet .font-sans{font-family:inherit}
.restaurant-print-root{display:none}.print-line,.print-total{display:flex;justify-content:space-between;gap:12px;margin:7px 0}.print-line span:last-child,.print-total strong:last-child{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-variant-numeric:tabular-nums}.print-sheet{font-family:"Google Sans Lao","Avenir Next","Segoe UI",sans-serif}.print-sheet h1{text-align:center;font-size:18px}.print-sheet>p{text-align:center;margin:3px 0}.print-kind{font-weight:700;margin-top:10px!important}.print-time,.print-unpaid{text-align:center;margin-top:16px;font-size:11px}.print-unpaid{font-size:14px;font-weight:700}.print-note{margin:-4px 0 7px 12px;font-size:11px}.print-queue{border-top:1px dashed #000;margin-top:12px;padding-top:8px;text-align:center}.print-queue span{display:block;font-size:11px}.print-queue strong{display:block;font-size:20px;line-height:1.1}.print-powered{text-align:center;margin-top:8px!important;font-size:10px;color:#555}
@media print{body *{visibility:hidden!important}.restaurant-print-root,.restaurant-print-root *{visibility:visible!important}.restaurant-print-root{display:block!important;position:fixed;inset:0;background:#fff;color:#000;padding:8mm;font-family:"Google Sans Lao","Avenir Next","Segoe UI",sans-serif}.print-sheet{width:72mm;margin:0 auto;font-size:12px}.print-store-logo{display:block;width:56px;height:56px;object-fit:contain;margin:0 auto 8px}.print-sheet hr{border:0;border-top:1px dashed #000;margin:10px 0}}
</style>
