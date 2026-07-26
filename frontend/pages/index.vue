<script setup lang="ts">
import { formatMoneyWithSymbol } from "~/utils/currency";
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";
import { BadgeCheck, Eraser, SlidersHorizontal, Trash2 } from "@lucide/vue";

type ServiceMode = "หน้าร้าน" | "รับกลับ" | "เดลิเวอรี";
type QuickView = "all" | "ready" | "low-stock" | "out" | "inactive";
type ProductSort = "best-selling" | "name" | "stock" | "price";
type StockState = "ready" | "low" | "out" | "negative" | "inactive";
type CameraPermissionState = "unknown" | "prompt" | "granted" | "denied";
type PaymentMethod = "cash" | "qr_transfer" | "credit_card";

type PaymentAccount = { id: string; display_name: string; bank_name: string | null; account_number: string | null; qr_id: string | null; is_active: number };

type Category = {
	id: string;
	label: string;
};

type Product = {
	id: string;
	name: string;
	category: string;
	sku: string;
	barcode: string;
	price: number;
	compareAt?: number;
	unitLabel: string;
	stock: number;
	stockState: StockState;
	tag?: string;
	hasVariants?: boolean;
	thumbnail: string;
	accent: string;
	imageUrl?: string | null;
	location?: string | null;
};

type CartEntry = {
	productId: string;
	qty: number;
};

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type ApiPosCatalogResponse = {
	store: {
		id: string;
		name: string;
		currency: string | null;
		vat_enabled: number;
		vat_rate: number;
		vat_mode: string;
		store_type: string;
	};
	categories: Array<{
		id: string;
		name: string;
		count: number;
	}>;
	items: Array<{
		id: string;
		store_id: string;
		sku: string;
		name: string;
		barcode: string | null;
		location: string | null;
		category_id: string | null;
		category_name: string | null;
		base_unit_id: string;
		unit_name: string | null;
		price_base: number;
		cost_base: number;
		active: number;
		low_stock_threshold: number | null;
		out_stock_threshold: number | null;
		on_hand_base: number;
		reserved_base: number;
		available_base: number;
		image_url: string | null;
		updated_at: string;
		stock_state: StockState;
	}>;
};

const compactCardUi = {
	body: "p-0",
};

const compactSectionCardUi = {
	body: "p-2.5 sm:p-3",
};

const categories = ref<Category[]>([
	{ id: "all", label: "ทั้งหมด" },
	{ id: "coffee", label: "กาแฟ" },
	{ id: "tea", label: "ชา" },
	{ id: "bakery", label: "เบเกอรี" },
	{ id: "snack", label: "ของทานเล่น" },
	{ id: "retail", label: "รีเทล" },
]);

const serviceModes: ServiceMode[] = ["หน้าร้าน", "รับกลับ", "เดลิเวอรี"];

const products = ref<Product[]>([
	{
		id: "iced-latte",
		name: "ลาเต้เย็น",
		category: "coffee",
		sku: "CF-LAT-16",
		barcode: "8851234500011",
		price: 95,
		unitLabel: "แก้ว 16 oz",
		stock: 28,
		stockState: "ready",
		tag: "ขายดี",
		hasVariants: true,
		thumbnail: "LT",
		accent: "linear-gradient(135deg, #fed7aa 0%, #ea580c 100%)",
	},
	{
		id: "americano",
		name: "อเมริกาโน่",
		category: "coffee",
		sku: "CF-AMR-16",
		barcode: "8851234500012",
		price: 80,
		unitLabel: "แก้ว 16 oz",
		stock: 19,
		stockState: "ready",
		thumbnail: "AM",
		accent: "linear-gradient(135deg, #e7e5e4 0%, #78716c 100%)",
	},
	{
		id: "matcha-cloud",
		name: "มัทฉะคลาวด์",
		category: "tea",
		sku: "TE-MAT-16",
		barcode: "8851234500013",
		price: 120,
		unitLabel: "แก้ว 16 oz",
		stock: 9,
		stockState: "low",
		tag: "โปร",
		thumbnail: "MC",
		accent: "linear-gradient(135deg, #d9f99d 0%, #65a30d 100%)",
	},
	{
		id: "thai-milk-tea",
		name: "ชาไทยนมสด",
		category: "tea",
		sku: "TE-THM-16",
		barcode: "8851234500014",
		price: 90,
		unitLabel: "แก้ว 16 oz",
		stock: 24,
		stockState: "ready",
		thumbnail: "TT",
		accent: "linear-gradient(135deg, #fdba74 0%, #f97316 100%)",
	},
	{
		id: "croffle",
		name: "ครอฟเฟิลเนยสด",
		category: "bakery",
		sku: "BK-CRF-01",
		barcode: "8851234500015",
		price: 85,
		unitLabel: "ชิ้น",
		stock: 6,
		stockState: "low",
		thumbnail: "CR",
		accent: "linear-gradient(135deg, #fde68a 0%, #d97706 100%)",
	},
	{
		id: "burnt-cheesecake",
		name: "ชีสเค้กหน้าไหม้",
		category: "bakery",
		sku: "BK-CHS-02",
		barcode: "8851234500016",
		price: 125,
		unitLabel: "ชิ้น",
		stock: 4,
		stockState: "low",
		tag: "ลิมิเต็ด",
		thumbnail: "BC",
		accent: "linear-gradient(135deg, #fecdd3 0%, #e11d48 100%)",
	},
	{
		id: "garlic-fries",
		name: "เฟรนช์ฟรายกระเทียม",
		category: "snack",
		sku: "SN-FRY-01",
		barcode: "8851234500017",
		price: 79,
		unitLabel: "ถาด",
		stock: 15,
		stockState: "ready",
		thumbnail: "GF",
		accent: "linear-gradient(135deg, #fde68a 0%, #ca8a04 100%)",
	},
	{
		id: "sparkling-yuzu",
		name: "ยูซุโซดา",
		category: "tea",
		sku: "TE-YUZ-16",
		barcode: "8851234500018",
		price: 105,
		unitLabel: "แก้ว 16 oz",
		stock: 18,
		stockState: "ready",
		thumbnail: "YZ",
		accent: "linear-gradient(135deg, #fef08a 0%, #eab308 100%)",
	},
	{
		id: "beans-250",
		name: "เมล็ดกาแฟคั่ว 250 กรัม",
		category: "retail",
		sku: "RT-BNS-250",
		barcode: "8851234500019",
		price: 240,
		unitLabel: "ถุง",
		stock: 12,
		stockState: "ready",
		thumbnail: "BN",
		accent: "linear-gradient(135deg, #e7e5e4 0%, #92400e 100%)",
	},
	{
		id: "oat-milk",
		name: "นมโอ๊ตสำหรับเพิ่ม",
		category: "retail",
		sku: "RT-OAT-01",
		barcode: "8851234500020",
		price: 25,
		unitLabel: "เพิ่มต่อแก้ว",
		stock: 0,
		stockState: "inactive",
		tag: "ปิดขาย",
		thumbnail: "OM",
		accent: "linear-gradient(135deg, #e7e5e4 0%, #a8a29e 100%)",
	},
	{
		id: "avocado-toast",
		name: "อโวคาโดโทสต์",
		category: "snack",
		sku: "SN-AVO-02",
		barcode: "8851234500021",
		price: 160,
		unitLabel: "จาน",
		stock: 8,
		stockState: "low",
		hasVariants: true,
		tag: "มีตัวเลือก",
		thumbnail: "AT",
		accent: "linear-gradient(135deg, #bbf7d0 0%, #059669 100%)",
	},
	{
		id: "black-tea",
		name: "ชาดำเย็น",
		category: "tea",
		sku: "TE-BLK-16",
		barcode: "8851234500022",
		price: 70,
		unitLabel: "แก้ว 16 oz",
		stock: 21,
		stockState: "ready",
		thumbnail: "BT",
		accent: "linear-gradient(135deg, #fed7aa 0%, #c2410c 100%)",
	},
]);

// Never render fixtures in the POS. The catalog is store-specific and must only
// appear after the live API response has been received.
categories.value = [];
products.value = [];

const searchQuery = ref("");
const activeCategory = ref("all");
const activeQuickView = ref<QuickView>("all");
const activeProductSort = ref<ProductSort>("name");
const sortMenuOpen = ref(false);
const activeMode = ref<ServiceMode>("หน้าร้าน");
const orderNote = ref("ไม่ใส่น้ำตาลในรายการชา");
const mobileTicketOpen = ref(false);
const scanToast = ref("");
const cameraScannerOpen = ref(false);
const cameraScannerStarting = ref(false);
const cameraScannerError = ref<string | null>(null);
const cameraPermissionState = ref<CameraPermissionState>("unknown");
const paymentModalOpen = ref(false);
const paymentCheckoutStep = ref<1 | 2>(1);
const selectedPaymentMethod = ref<PaymentMethod | null>(null);
const checkoutSaving = ref(false);
const checkoutError = ref<string | null>(null);
const cashTendered = ref("");
const paymentAccountId = ref("");
const paymentReference = ref("");
const paymentSlipUrl = ref("");
const paymentAccounts = ref<PaymentAccount[]>([]);
const checkoutIdempotencyKey = ref("");
const paymentModalBodyOverflowSnapshot = ref<string | null>(null);
const cameraDevices = ref<Array<{ deviceId: string; label: string }>>([]);
const selectedCameraDeviceId = ref("");
const cameraUserSelected = ref(false);
const scannerVideoRef = ref<HTMLVideoElement | null>(null);
const productsPending = ref(true);
const productsError = ref<string | null>(null);
const catalogCurrency = ref("THB");
const vatEnabled = ref(false);
const vatRate = ref(0);
const vatMode = ref<"EXCLUSIVE" | "INCLUSIVE">("EXCLUSIVE");
const catalogStoreType = ref("");
const isRestaurantStore = computed(() => catalogStoreType.value === "RESTAURANT");
const posExperience = computed<"loading" | "restaurant" | "retail">(() => {
	if (productsPending.value && !catalogStoreType.value) return "loading";
	return isRestaurantStore.value ? "restaurant" : "retail";
});
const cart = ref<CartEntry[]>([]);
type AvailablePromotion = { promotion_id: string; name: string; applications: number; gift_product_id: string; gift_qty: number };
const availablePromotions = ref<AvailablePromotion[]>([]);
const selectedPromotionIds = ref<string[]>([]);
const promotionsPending = ref(false);

const runtimeConfig = useRuntimeConfig();
const { t } = useI18n();
const { intlLocale } = useAppLocale();
const { apiFetch } = useApiClient();
const { currentStoreId, currentAccess } = useAuthSession();
const appToast = useAppToast();

let scanIndex = 0;
let scanToastTimer: ReturnType<typeof setTimeout> | null = null;
let cameraScannerControls: { stop?: () => void } | null = null;
let lastScannerKeyAt = 0;
let scannerBuffer = "";
let scannerBufferTimer: ReturnType<typeof setTimeout> | null = null;
let promotionTimer: ReturnType<typeof setTimeout> | null = null;

const quickViewsLocalized = computed<Array<{ id: QuickView; label: string }>>(() => [
	{ id: "all", label: t("pos.allProducts") },
	{ id: "low-stock", label: t("pos.lowStock") },
	{ id: "ready", label: t("pos.readyProducts") },
	{ id: "out", label: t("pos.outOfStock") },
	{ id: "inactive", label: t("pos.inactive") },
]);

const sortOptionsLocalized = computed<Array<{ value: ProductSort; label: string }>>(() => [
	{ value: "best-selling", label: t("pos.sortBestSelling") },
	{ value: "name", label: t("pos.sortName") },
	{ value: "stock", label: t("pos.sortStock") },
	{ value: "price", label: t("pos.sortPrice") },
]);

const posCopy = computed(() => ({
	search: t("pos.searchPlaceholder"),
	clearSearch: t("pos.clearSearch"),
	scanBarcode: t("pos.scanBarcode"),
	loading: t("pos.loadingProducts"),
	loadError: t("pos.loadProductsFailed"),
	noProducts: t("pos.noProductsFound"),
	noProductsHint: t("pos.noProductsFoundHint"),
	items: t("pos.items"),
	sortBy: t("pos.sortBy"),
}));
const hasCatalogError = computed(() => Boolean(productsError.value && !productsPending.value));

const activeModeLabel = computed(() => (
	activeMode.value === "หน้าร้าน"
		? t("pos.walkIn")
		: activeMode.value === "รับกลับ"
			? t("pos.pickup")
			: t("pos.delivery")
));

const numberFormatter = new Intl.NumberFormat("th-TH", {
	maximumFractionDigits: 0,
});

const effectiveStoreId = computed(() => (
	currentStoreId.value?.trim()
	|| currentAccess.value?.store_id?.trim()
	|| currentAccess.value?.memberships?.find((membership) => membership.status === "active")?.store_id?.trim()
	|| currentAccess.value?.memberships?.[0]?.store_id?.trim()
	|| ""
));

const productMap = computed(() =>
	Object.fromEntries(products.value.map((product) => [product.id, product])),
);

const categoryCounts = computed(() =>
	categories.value.reduce<Record<string, number>>((result, category) => {
		result[category.id] = category.id === "all"
			? products.value.length
			: products.value.filter((product) => product.category === category.id).length;
		return result;
	}, {}),
);

const activeProductSortLabel = computed(() => (
	sortOptionsLocalized.value.find((option) => option.value === activeProductSort.value)?.label ?? t("pos.sortBestSelling")
));

const filteredProducts = computed(() => {
	const query = searchQuery.value.trim().toLowerCase();

	const matchedProducts = products.value.filter((product) => {
		const categoryMatch =
			activeCategory.value === "all" || product.category === activeCategory.value;
		const quickViewMatch =
			activeQuickView.value === "all" ||
			(activeQuickView.value === "low-stock" && product.stockState === "low") ||
			(activeQuickView.value === "ready" && product.stockState === "ready") ||
			(activeQuickView.value === "out" && (product.stockState === "out" || product.stockState === "negative")) ||
			(activeQuickView.value === "inactive" && product.stockState === "inactive");
		const textMatch =
			query.length === 0 ||
			product.name.toLowerCase().includes(query) ||
			product.sku.toLowerCase().includes(query) ||
			product.barcode.includes(query) ||
			product.location?.toLowerCase().includes(query) ||
			product.tag?.toLowerCase().includes(query);

		return categoryMatch && quickViewMatch && textMatch;
	});

	const sortedProducts = [...matchedProducts].sort((left, right) => {
		switch (activeProductSort.value) {
			case "name":
				return left.name.localeCompare(right.name, "th");
			case "stock":
				return right.stock - left.stock;
			case "price":
				return right.price - left.price;
			case "best-selling":
			default: {
				const leftRank = left.tag === t("pos.sortBestSelling") ? 0 : 1;
				const rightRank = right.tag === t("pos.sortBestSelling") ? 0 : 1;
				if (leftRank !== rightRank) {
					return leftRank - rightRank;
				}
				return left.name.localeCompare(right.name, "th");
			}
		}
	});

	return sortedProducts;
});

const cartItems = computed(() =>
	cart.value
		.map((entry) => {
			const product = productMap.value[entry.productId];

			if (!product) {
				return null;
			}

			return {
				...product,
				qty: entry.qty,
				lineTotal: product.price * entry.qty,
			};
		})
		.filter((item): item is NonNullable<typeof item> => item !== null),
);

const itemCount = computed(() =>
	cartItems.value.reduce((sum, item) => sum + item.qty, 0),
);

const subtotal = computed(() =>
	cartItems.value.reduce((sum, item) => sum + item.lineTotal, 0),
);

const vatPercent = computed(() => {
	if (!vatEnabled.value) return 0;
	const rawRate = Number(vatRate.value || 0);
	if (!Number.isFinite(rawRate) || rawRate <= 0) return 0;
	return rawRate > 100 ? rawRate / 100 : rawRate;
});

const discount = computed(() =>
	cartItems.value.reduce(
		(sum, item) => sum + ((item.compareAt ?? item.price) - item.price) * item.qty,
		0,
	),
);

const tax = computed(() => {
	const rate = vatPercent.value;
	if (rate <= 0) return 0;
	if (vatMode.value === "INCLUSIVE") {
		return Math.round(subtotal.value * (rate / (100 + rate)));
	}
	return Math.round(subtotal.value * (rate / 100));
});
const serviceCharge = computed(() => 0);
const total = computed(() => (
	vatEnabled.value && vatPercent.value > 0 && vatMode.value !== "INCLUSIVE"
		? subtotal.value + tax.value + serviceCharge.value
		: subtotal.value + serviceCharge.value
));
const vatLabel = computed(() => {
	const rate = vatPercent.value;
	const formattedRate = Number.isInteger(rate) ? String(rate) : rate.toFixed(2).replace(/\.?0+$/, "");
	return t("pos.vat", { rate: rate > 0 ? formattedRate : 0 });
});
const paymentMethodOptions = computed<Array<{
	id: PaymentMethod;
	label: string;
	hint: string;
	icon: string;
}>>(() => [
	{
		id: "cash",
		label: t("pos.cash"),
		hint: t("pos.cashHint"),
		icon: "i-heroicons-banknotes-20-solid",
	},
	{
		id: "qr_transfer",
		label: t("pos.qr"),
		hint: t("pos.qrHint"),
		icon: "i-heroicons-qr-code-20-solid",
	},
	{
		id: "credit_card",
		label: t("pos.card"),
		hint: t("pos.cardHint"),
		icon: "i-heroicons-credit-card-20-solid",
	},
]);
const selectedPaymentMethodOption = computed(() => (
	selectedPaymentMethod.value
		? paymentMethodOptions.value.find((option) => option.id === selectedPaymentMethod.value) || null
		: null
));
const selectedPaymentMethodLabel = computed(() => selectedPaymentMethodOption.value?.label || "");
const paymentModalWidthClass = computed(() => (
	paymentCheckoutStep.value === 1 ? "max-w-[620px]" : "max-w-[1040px]"
));
const paymentModalEyebrow = computed(() => (
	paymentCheckoutStep.value === 1 ? "Checkout preview" : "Bill preview"
));
const paymentModalTitle = computed(() => (
	paymentCheckoutStep.value === 1
		? "เลือกวิธีชำระเงินก่อนดำเนินการ"
		: "ตรวจสอบรายการสินค้าและสรุปบิล"
));
const paymentModalDescription = computed(() => (
	paymentCheckoutStep.value === 1
		? "กรุณาเลือก เงินสด, QR / โอน หรือบัตรเครดิต แล้วค่อยไปต่อ"
		: "ทบทวนรายการสินค้า ยอดรวม และวิธีชำระก่อนยืนยัน"
));
const paymentModalProgressLabel = computed(() => (
	paymentCheckoutStep.value === 1 ? "ขั้นตอน 1 จาก 2" : "ขั้นตอน 2 จาก 2"
));
const paymentModalSecondaryAction = computed(() => (
	paymentCheckoutStep.value === 1
		? {
			label: "ปิด",
			icon: "i-heroicons-x-mark-20-solid",
		}
		: {
			label: "ย้อนกลับ",
			icon: "i-heroicons-arrow-left-20-solid",
		}
));
const paymentModalPrimaryAction = computed(() => (
	paymentCheckoutStep.value === 1
		? {
			label: "ดำเนินการต่อ",
			icon: "i-heroicons-arrow-right-20-solid",
		}
		: {
			label: "ยืนยันชำระเงิน",
			icon: "i-heroicons-check-20-solid",
		}
));

function formatMoney(value: number) {
	return formatMoneyWithSymbol(value || 0, catalogCurrency.value, { locale: intlLocale.value, maximumFractionDigits: 0 });
}

function getInitials(name: string) {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("") || "PO";
}

function getAccent(seed: string) {
	const palette = [
		"linear-gradient(135deg, #fed7aa 0%, #ea580c 100%)",
		"linear-gradient(135deg, #e7e5e4 0%, #78716c 100%)",
		"linear-gradient(135deg, #d9f99d 0%, #65a30d 100%)",
		"linear-gradient(135deg, #fdba74 0%, #f97316 100%)",
		"linear-gradient(135deg, #fecdd3 0%, #e11d48 100%)",
		"linear-gradient(135deg, #bfdbfe 0%, #2563eb 100%)",
	];
	const total = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
	return palette[total % palette.length] as string;
}

function resolveImageUrl(imageUrl: string | null) {
	if (!imageUrl) return null;
	const normalized = imageUrl.trim();
	if (!normalized) return null;
	if (/^(https?:\/\/|data:|blob:)/i.test(normalized) || normalized.startsWith("//")) return normalized;
	const base = String(runtimeConfig.public.r2PublicBaseUrl || "").replace(/\/$/, "");
	const path = normalized.startsWith("/") ? normalized : `/${normalized}`;
	return `${base}${path}`;
}

function mapCatalogProduct(item: ApiPosCatalogResponse["items"][number]): Product {
	return {
		id: item.id,
		name: item.name,
		category: item.category_id || "uncategorized",
		sku: item.sku,
		barcode: item.barcode || "",
		price: Number(item.price_base || 0),
		compareAt: undefined,
		unitLabel: item.unit_name || t("pos.baseUnit"),
		stock: Number(item.available_base || 0),
		stockState: item.stock_state,
		tag: item.stock_state === "low"
			? t("pos.lowStock")
			: item.stock_state === "out"
				? t("pos.outOfStock")
				: item.stock_state === "inactive"
					? t("pos.inactive")
					: localizeCategoryLabel(item.category_name) || undefined,
		hasVariants: false,
		thumbnail: getInitials(item.name),
		accent: getAccent(item.id),
		imageUrl: resolveImageUrl(item.image_url),
		location: item.location,
	};
}

function localizeCategoryLabel(label: string | null | undefined) {
	const normalized = String(label || "").trim().toLowerCase();
	if (normalized === "uncategorized" || normalized === "ไม่ระบุหมวด" || normalized === "ບໍ່ລະບຸໝວດ") {
		return t("pos.uncategorized");
	}
	return label?.trim() || "";
}

function seedFallbackCategoryOptions() {
	categories.value = [
		{ id: "all", label: t("pos.allProducts") },
	];
}

function addToCart(product: Product) {
	if (product.stockState === "inactive") {
		return;
	}

	const existing = cart.value.find((entry) => entry.productId === product.id);

	if (existing) {
		existing.qty += 1;
		return;
	}

	cart.value.unshift({ productId: product.id, qty: 1 });
}

function increaseQty(productId: string) {
	const entry = cart.value.find((item) => item.productId === productId);

	if (entry) {
		entry.qty += 1;
	}
}

function decreaseQty(productId: string) {
	const entry = cart.value.find((item) => item.productId === productId);

	if (!entry) {
		return;
	}

	if (entry.qty === 1) {
		cart.value = cart.value.filter((item) => item.productId !== productId);
		return;
	}

	entry.qty -= 1;
}

function removeFromCart(productId: string) {
	cart.value = cart.value.filter((item) => item.productId !== productId);
}

function clearCart() {
	cart.value = [];
}

function getStockTone(state: StockState) {
	if (state === "ready") {
		return "success";
	}

	if (state === "low") {
		return "warning";
	}

	if (state === "out" || state === "negative") {
		return "neutral";
	}

	return "neutral";
}

function getStockLabel(product: Product) {
	if (product.stockState === "ready") {
		return t("pos.stockRemaining", { count: product.stock });
	}

	if (product.stockState === "low") {
		return t("pos.nearlyOut", { count: product.stock });
	}

	if (product.stockState === "out") {
		return t("pos.outOfStock");
	}

	if (product.stockState === "negative") {
		return t("pos.negativeStock", { count: product.stock });
	}

	return t("pos.inactive");
}

function triggerScanToast(message: string) {
	scanToast.value = message;

	if (scanToastTimer) {
		clearTimeout(scanToastTimer);
	}

	scanToastTimer = setTimeout(() => {
		scanToast.value = "";
	}, 2400);
}

function stopCameraScannerStream() {
	cameraScannerControls?.stop?.();
	cameraScannerControls = null;
	if (scannerVideoRef.value) {
		scannerVideoRef.value.srcObject = null;
	}
	cameraScannerStarting.value = false;
}

async function refreshCameraPermissionState() {
	if (!import.meta.client) return;
	if (!("permissions" in navigator) || typeof navigator.permissions?.query !== "function") {
		cameraPermissionState.value = "unknown";
		return;
	}

	try {
		const status = await navigator.permissions.query({ name: "camera" as never });
		cameraPermissionState.value = (status.state || "unknown") as CameraPermissionState;
		status.onchange = () => {
			cameraPermissionState.value = (status.state || "unknown") as CameraPermissionState;
		};
	} catch {
		cameraPermissionState.value = "unknown";
	}
}

async function refreshCameraDevices() {
	if (!import.meta.client) return;
	if (!navigator.mediaDevices?.enumerateDevices) return;

	try {
		const devices = await navigator.mediaDevices.enumerateDevices();
		const cameras = devices
			.filter((device) => device.kind === "videoinput")
			.map((device, index) => ({
				deviceId: device.deviceId,
				label: device.label || `กล้อง ${index + 1}`,
			}));

		cameraDevices.value = cameras;

		if (!cameras.length) {
			selectedCameraDeviceId.value = "";
			return;
		}

		const stillValid = cameras.some((camera) => camera.deviceId === selectedCameraDeviceId.value);
		const looksLikeGenericLabel = (label: string) => /^กล้อง\s+\d+$/i.test(label.trim());
		const scoreCamera = (label: string) => {
			const text = label.toLowerCase();
			let score = 0;
			if (/(back|rear|environment)/i.test(text)) score += 50;
			if (/(ultra[-\s]?wide|ultra wide|0\.5x|0\.6x|0\.5|0\.6)/i.test(text)) score += 30;
			if (/\bwide\b/i.test(text)) score += 10;
			if (/(front|user)/i.test(text)) score -= 50;
			if (/(tele|zoom)/i.test(text)) score -= 10;
			return score;
		};

		if (!stillValid) {
			const sorted = [...cameras].sort((a, b) => scoreCamera(b.label) - scoreCamera(a.label));
			const best = sorted[0];
			selectedCameraDeviceId.value = best?.deviceId || cameras[0].deviceId;
			cameraUserSelected.value = false;
			return;
		}

		if (cameraUserSelected.value) return;
		const currentLabel = cameras.find((camera) => camera.deviceId === selectedCameraDeviceId.value)?.label || "";
		if (looksLikeGenericLabel(currentLabel)) {
			const sorted = [...cameras].sort((a, b) => scoreCamera(b.label) - scoreCamera(a.label));
			const best = sorted[0];
			if (best && scoreCamera(best.label) > 0) {
				selectedCameraDeviceId.value = best.deviceId;
			}
		}
	} catch {
		// ignore
	}
}

async function requestCameraPermission() {
	if (!import.meta.client) return false;
	if (!navigator.mediaDevices?.getUserMedia) return false;

	try {
		const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
		for (const track of stream.getTracks()) {
			track.stop();
		}
		return true;
	} catch (error) {
		cameraScannerError.value = error instanceof Error ? error.message : "ไม่สามารถขอสิทธิ์กล้องได้";
		return false;
	}
}

async function startCameraScanner() {
	cameraScannerStarting.value = true;
	cameraScannerError.value = null;

	await nextTick();

	try {
		const videoElement = scannerVideoRef.value;
		if (!videoElement) {
			cameraScannerStarting.value = false;
			cameraScannerError.value = "ไม่พบพื้นที่แสดงภาพจากกล้อง";
			return;
		}

		stopCameraScannerStream();

		const { BrowserMultiFormatReader } = await import("@zxing/browser");
		const reader = new BrowserMultiFormatReader();
		const controls = await reader.decodeFromConstraints(
			{
				video: selectedCameraDeviceId.value
					? { deviceId: { exact: selectedCameraDeviceId.value } }
					: { facingMode: { ideal: "environment" } },
			},
			videoElement,
			(result, error, activeControls) => {
				if (result) {
					const text = typeof result.getText === "function"
						? result.getText()
						: String((result as { text?: string }).text || "");

					if (text) {
						selectProductFromScan(text, "camera");
						activeControls?.stop?.();
						cameraScannerControls = null;
						cameraScannerOpen.value = false;
						cameraScannerStarting.value = false;
					}
					return;
				}

				if (error && error.name !== "NotFoundException") {
					cameraScannerError.value = "กล้องเปิดได้ แต่ยังอ่านบาร์โค้ดไม่สำเร็จ ลองขยับกล้องหรือเปลี่ยนระยะ";
				}
			},
		);

		cameraScannerControls = controls;
		cameraScannerStarting.value = false;
	} catch (error) {
		cameraScannerStarting.value = false;
		cameraScannerError.value = error instanceof Error
			? error.message
			: "ไม่สามารถเปิดกล้องสแกนบาร์โค้ดได้";
		await refreshCameraPermissionState();
		await refreshCameraDevices();
	}
}

async function openCameraScanner() {
	cameraScannerOpen.value = true;
	cameraScannerStarting.value = false;
	cameraScannerError.value = null;
	await refreshCameraPermissionState();
	await refreshCameraDevices();
	if (cameraPermissionState.value === "granted") {
		await startCameraScanner();
	}
}

async function confirmCameraPermissionAndStart() {
	cameraScannerError.value = null;
	const ok = await requestCameraPermission();
	await refreshCameraPermissionState();
	await refreshCameraDevices();
	if (!ok) return;
	await startCameraScanner();
}

async function changeSelectedCamera(deviceId: string) {
	selectedCameraDeviceId.value = deviceId;
	cameraUserSelected.value = true;
	if (!cameraScannerOpen.value) return;
	if (cameraPermissionState.value !== "granted") return;
	await startCameraScanner();
}

function stopCameraScanner() {
	stopCameraScannerStream();
	cameraScannerOpen.value = false;
	cameraScannerStarting.value = false;
	cameraScannerError.value = null;
}

function selectProductFromScan(code: string, source: "scanner" | "camera") {
	const normalized = code.trim();
	if (!normalized) return;

	searchQuery.value = normalized;
	const lower = normalized.toLowerCase();
	const matchedProduct = products.value.find((product) =>
		product.barcode.toLowerCase() === lower || product.sku.toLowerCase() === lower,
	);

	if (matchedProduct) {
		addToCart(matchedProduct);
	}

	triggerScanToast(
		matchedProduct
			? `${source === "camera" ? "สแกนกล้อง" : "สแกน"} ${normalized} เพิ่ม ${matchedProduct.name} ลงบิลแล้ว`
			: `${source === "camera" ? "สแกนกล้อง" : "สแกน"} ${normalized} แต่ไม่พบสินค้า`,
	);
}

function flushScannerBuffer() {
	if (scannerBuffer.length < 3) {
		scannerBuffer = "";
		return;
	}

	selectProductFromScan(scannerBuffer, "scanner");
	scannerBuffer = "";
}

function resetScannerBufferTimer() {
	if (scannerBufferTimer) {
		clearTimeout(scannerBufferTimer);
	}

	scannerBufferTimer = setTimeout(() => {
		flushScannerBuffer();
	}, 90);
}

function handleGlobalScannerKeydown(event: KeyboardEvent) {
	const target = event.target as HTMLElement | null;
	const isEditable = target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		Boolean(target?.isContentEditable);

	if (isEditable || event.metaKey || event.ctrlKey || event.altKey) {
		return;
	}

	if (event.key === "Enter") {
		if (scannerBuffer.length >= 3) {
			event.preventDefault();
			flushScannerBuffer();
		}
		return;
	}

	if (event.key.length !== 1) {
		return;
	}

	const now = Date.now();
	if (now - lastScannerKeyAt > 80) {
		scannerBuffer = "";
	}

	lastScannerKeyAt = now;
	scannerBuffer += event.key;
	resetScannerBufferTimer();
}

function submitSearchInput() {
	const normalized = searchQuery.value.trim();
	if (!normalized) return;
	selectProductFromScan(normalized, "scanner");
}

function lockPaymentModalScroll() {
	if (!import.meta.client) return;
	if (paymentModalBodyOverflowSnapshot.value !== null) return;
	paymentModalBodyOverflowSnapshot.value = document.body.style.overflow;
	document.body.style.overflow = "hidden";
}

function unlockPaymentModalScroll() {
	if (!import.meta.client) return;
	if (paymentModalBodyOverflowSnapshot.value === null) return;
	document.body.style.overflow = paymentModalBodyOverflowSnapshot.value;
	paymentModalBodyOverflowSnapshot.value = null;
}

function openPaymentModal() {
	if (!cartItems.value.length) return;
	selectedPaymentMethod.value = null;
	checkoutError.value = null;
	cashTendered.value = String(total.value);
	paymentReference.value = "";
	paymentSlipUrl.value = "";
	checkoutIdempotencyKey.value = crypto.randomUUID();
	paymentCheckoutStep.value = 1;
	paymentModalOpen.value = true;
	lockPaymentModalScroll();
}

function closePaymentModal() {
	if (checkoutSaving.value) return;
	paymentModalOpen.value = false;
	selectedPaymentMethod.value = null;
	paymentCheckoutStep.value = 1;
	unlockPaymentModalScroll();
}

function choosePaymentMethod(method: PaymentMethod) {
	selectedPaymentMethod.value = method;
}

function goBackPaymentCheckout() {
	if (paymentCheckoutStep.value > 1) {
		paymentCheckoutStep.value = 1;
		return;
	}
	closePaymentModal();
}

async function continuePaymentCheckout() {
	if (!selectedPaymentMethod.value) return;
	if (paymentCheckoutStep.value === 1) {
		paymentCheckoutStep.value = 2;
		return;
	}
	checkoutSaving.value = true;
	checkoutError.value = null;
	try {
		const response = await apiFetch<ApiEnvelope<{ order_no: string; change_amount: number }>>("/pos/checkout", {
			method: "POST",
			headers: { "Idempotency-Key": checkoutIdempotencyKey.value },
			body: {
				store_id: effectiveStoreId.value,
				service_mode: activeMode.value === "หน้าร้าน" ? "walk-in" : activeMode.value === "รับกลับ" ? "pickup" : "delivery",
				payment_method: selectedPaymentMethod.value,
				items: cart.value.map((item) => ({ product_id: item.productId, qty: item.qty })),
				promotion_ids: selectedPromotionIds.value,
				amount_tendered: selectedPaymentMethod.value === "cash" ? Number(cashTendered.value) : null,
				payment_account_id: selectedPaymentMethod.value === "qr_transfer" ? paymentAccountId.value : null,
				payment_reference: paymentReference.value || null,
				payment_slip_url: paymentSlipUrl.value || null,
				note: orderNote.value || null,
			},
		});
		appToast.success({ title: `ชำระเงินสำเร็จ ${response.data.order_no}`, description: response.data.change_amount > 0 ? `เงินทอน ${formatMoney(response.data.change_amount)}` : `${selectedPaymentMethodLabel.value} • ${formatMoney(total.value)}` });
		cart.value = [];
		selectedPromotionIds.value = [];
		availablePromotions.value = [];
		mobileTicketOpen.value = false;
		checkoutSaving.value = false;
		closePaymentModal();
		await loadPosProducts();
	} catch (error) {
		checkoutError.value = resolveApiErrorMessage(error, "บันทึกการขายไม่สำเร็จ");
	} finally {
		checkoutSaving.value = false;
	}
}

async function evaluatePromotions() {
	if (!effectiveStoreId.value || !cart.value.length) { availablePromotions.value = []; selectedPromotionIds.value = []; return; }
	promotionsPending.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<AvailablePromotion[]>>("/promotions/evaluate", { method: "POST", body: { store_id: effectiveStoreId.value, items: cart.value.map((item) => ({ product_id: item.productId, qty: item.qty })) } });
		availablePromotions.value = response.data;
		selectedPromotionIds.value = selectedPromotionIds.value.filter((id) => response.data.some((promotion) => promotion.promotion_id === id));
	} catch { availablePromotions.value = []; selectedPromotionIds.value = []; }
	finally { promotionsPending.value = false; }
}

async function loadPaymentAccounts() {
	if (!effectiveStoreId.value) return;
	try {
		const response = await apiFetch<ApiEnvelope<PaymentAccount[]>>(`/stores/${encodeURIComponent(effectiveStoreId.value)}/payment-accounts`);
		paymentAccounts.value = response.data.filter((account) => Boolean(account.is_active));
		paymentAccountId.value = paymentAccounts.value[0]?.id || "";
	} catch { paymentAccounts.value = []; }
}

function simulateScan() {
	const sellableProducts = products.value.filter((product) => product.stockState !== "inactive");
	if (!sellableProducts.length) return;
	const product = sellableProducts[scanIndex % sellableProducts.length];
	scanIndex += 1;
	selectProductFromScan(product.barcode, "scanner");
}

async function loadPosProducts() {
	productsPending.value = true;
	productsError.value = null;

	try {
		if (!effectiveStoreId.value) {
			throw new Error("ไม่พบ store ที่ใช้งาน");
		}

		const response = await apiFetch<ApiEnvelope<ApiPosCatalogResponse>>(
			`/pos/products?store_id=${encodeURIComponent(effectiveStoreId.value)}`,
		);
		catalogCurrency.value = response.data.store.currency || "THB";
		catalogStoreType.value = String(response.data.store.store_type || "OTHER").toUpperCase();
		vatEnabled.value = Boolean(response.data.store.vat_enabled);
		vatRate.value = Number(response.data.store.vat_rate || 0);
		vatMode.value = String(response.data.store.vat_mode || "EXCLUSIVE").toUpperCase() === "INCLUSIVE"
			? "INCLUSIVE"
			: "EXCLUSIVE";
		categories.value = [
			{ id: "all", label: t("pos.allProducts") },
			...response.data.categories.map((category) => ({
				id: category.id,
			label: localizeCategoryLabel(category.name),
			})),
		];
		products.value = response.data.items.map(mapCatalogProduct);
	} catch (error) {
		productsError.value = resolveApiErrorMessage(error, t("pos.loadProductsFailed"));
		seedFallbackCategoryOptions();
	} finally {
		productsPending.value = false;
	}
}

watch(effectiveStoreId, () => {
	catalogStoreType.value = "";
	products.value = [];
	void loadPosProducts();
	void loadPaymentAccounts();
	void evaluatePromotions();
}, { immediate: true });

watch(cart, () => {
	if (promotionTimer) clearTimeout(promotionTimer);
	promotionTimer = setTimeout(() => void evaluatePromotions(), 180);
}, { deep: true });

watch(cameraScannerOpen, (isOpen, wasOpen) => {
	if (!isOpen && wasOpen) {
		stopCameraScannerStream();
	}
});

watch(paymentModalOpen, (isOpen, wasOpen) => {
	if (isOpen === wasOpen) return;
	if (isOpen) {
		lockPaymentModalScroll();
		return;
	}
	unlockPaymentModalScroll();
});

onMounted(() => {
	window.addEventListener("keydown", handleGlobalScannerKeydown);
});

onBeforeUnmount(() => {
	stopCameraScanner();
	unlockPaymentModalScroll();
	if (scannerBufferTimer) {
		clearTimeout(scannerBufferTimer);
	}
	if (scanToastTimer) {
		clearTimeout(scanToastTimer);
	}
	window.removeEventListener("keydown", handleGlobalScannerKeydown);
});

</script>

<template>
	<AppSidebarShell
		v-if="posExperience === 'loading'"
		:nav-items="appNavItems"
		:active-ids="['pos']"
		sidebar-eyebrow="POS"
		:sidebar-title="$t('pos.title')"
		sidebar-compact-title="POS"
		:sidebar-description="$t('pos.productList')"
	>
		<template #default>
			<div class="grid min-h-0 gap-2 lg:h-full lg:grid-cols-[minmax(0,1fr)_400px]">
				<section class="rounded-md border border-neutral-200 bg-white p-3"><USkeleton class="h-10 w-full rounded-md" /><div class="mt-3 grid content-start grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"><div v-for="index in 10" :key="index" class="min-h-[118px] rounded-md border border-neutral-100 p-2"><div class="flex gap-2"><USkeleton class="size-10 shrink-0 rounded-md" /><div class="flex-1 space-y-2"><USkeleton class="h-3.5 w-4/5" /><USkeleton class="h-2.5 w-2/5" /></div></div><USkeleton class="mt-5 h-3.5 w-2/5" /><USkeleton class="mt-1.5 h-3.5 w-3/5" /></div></div></section>
				<aside class="hidden rounded-md border border-neutral-200 bg-white p-4 lg:block"><USkeleton class="h-5 w-32" /><USkeleton class="mt-2 h-3 w-52" /><USkeleton class="mt-6 h-16 w-full rounded-md" /><USkeleton class="mt-3 h-16 w-full rounded-md" /><USkeleton class="mt-6 h-11 w-full rounded-md" /></aside>
			</div>
		</template>
	</AppSidebarShell>
	<RestaurantPos v-else-if="posExperience === 'restaurant' && effectiveStoreId" :store-id="effectiveStoreId" />
	<AppSidebarShell
		v-else
		:nav-items="appNavItems"
		:active-ids="['pos']"
		sidebar-eyebrow="POS"
		:sidebar-title="$t('pos.title')"
		sidebar-compact-title="POS"
		:sidebar-description="$t('pos.productList')"
	>
		<template #default="{ openSidebar }">
			<div class="grid gap-1.5 pb-1.5 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-stretch lg:gap-2 lg:overflow-hidden">
				<section class="min-w-0 pb-24 lg:flex lg:min-h-0 lg:flex-col lg:pb-0">
						<div class="grid gap-1.5 lg:h-full lg:min-h-0 lg:grid-rows-[auto_auto_minmax(0,1fr)] lg:gap-2">
											<UCard :ui="compactSectionCardUi" class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md lg:sticky lg:top-0 lg:z-10">
												<div class="space-y-2">
												<div class="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
													<div class="flex w-full flex-col gap-2 sm:flex-row">
														<AppButton
															color="neutral"
															variant="soft"
															size="md"
															class="justify-center rounded-md lg:hidden"
									:label="$t('pos.menu')"
															@click="openSidebar"
														/>

														<div class="relative min-w-0 flex-1">
															<UInput
																v-model="searchQuery"
																size="lg"
																icon="i-heroicons-magnifying-glass-20-solid"
										:placeholder="posCopy.search"
																color="neutral"
																class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5 [&_input]:pr-12 [&_input]:shadow-sm [&_input]:focus:border-primary-300 [&_input]:focus:ring-2 [&_input]:focus:ring-primary-200"
															/>
															<AppButton
																v-if="searchQuery"
																color="neutral"
																variant="ghost"
																size="xs"
																icon="i-heroicons-x-mark-20-solid"
																class="absolute right-2.5 top-1/2 z-10 -translate-y-1/2 rounded-md"
										:aria-label="posCopy.clearSearch"
										:title="posCopy.clearSearch"
																@click="searchQuery = ''"
															/>
														</div>
													</div>

													<AppButton
														color="primary"
														variant="solid"
														size="md"
														icon="i-heroicons-qr-code-20-solid"
								:label="posCopy.scanBarcode"
														class="justify-center rounded-md px-4"
								:aria-label="posCopy.scanBarcode"
								:title="posCopy.scanBarcode"
														@click="openCameraScanner"
													/>

													<div class="grid grid-cols-2 gap-2">
								<AppButton color="neutral" variant="soft" size="md" class="rounded-md" :label="$t('pos.holdBill')" />
								<AppButton color="neutral" variant="outline" size="md" class="rounded-md" :label="$t('pos.heldBills', { count: 4 })" />
													</div>
												</div>

												<div class="grid gap-2 border-t border-[#e7e4dd] pt-1.5 xl:grid-cols-[minmax(0,1fr)_auto]">
													<div class="space-y-2">
														<div class="scrollbar-hidden md:scrollbar-soft flex gap-2 overflow-x-auto pb-1">
															<AppButton
																v-for="category in categories"
																:key="category.id"
																:color="activeCategory === category.id ? 'primary' : 'neutral'"
																:variant="activeCategory === category.id ? 'soft' : 'ghost'"
																size="md"
																class="whitespace-nowrap rounded-md"
																@click="activeCategory = category.id"
															>
																{{ category.label }}
																<span class="ml-2 rounded-full bg-white px-2 py-0.5 text-[11px] text-stone-500">
																	{{ categoryCounts[category.id] }}
																</span>
															</AppButton>
														</div>

														<div class="scrollbar-hidden md:scrollbar-soft flex gap-2 overflow-x-auto pb-1">
															<AppButton
									v-for="view in quickViewsLocalized"
																:key="view.id"
																:color="activeQuickView === view.id ? 'neutral' : 'neutral'"
																:variant="activeQuickView === view.id ? 'solid' : 'soft'"
																size="md"
																:label="view.label"
																class="whitespace-nowrap rounded-md"
																@click="activeQuickView = view.id"
															/>
														</div>
													</div>

												</div>
											</div>
										</UCard>

								<AppCard variant="surface" class="lg:min-h-0 lg:overflow-hidden">
								<div class="space-y-2.5 p-3 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)]">
									<div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
										<div>
											<p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">
											{{ $t('pos.productList') }}
											</p>
											<h2 class="mt-2 text-xl font-semibold tracking-[-0.03em] text-stone-900">
											{{ $t('pos.readyProducts') }}
											</h2>
										</div>

										<div class="flex items-center gap-2">
											<UBadge color="success" variant="soft" class="whitespace-nowrap" :label="`${$t('pos.readyProducts')} ${filteredProducts.length} ${posCopy.items}`" />

											<UPopover
												v-model:open="sortMenuOpen"
												:content="{ side: 'bottom', align: 'end', sideOffset: 8, collisionPadding: 8 }"
											>
												<AppButton
													color="neutral"
													variant="soft"
													size="md"
													class="min-w-[11rem] justify-between rounded-md px-3"
												:aria-label="posCopy.sortBy"
												:title="posCopy.sortBy"
												>
													<span class="flex min-w-0 items-center gap-2">
														<span class="shrink-0 text-[11px] font-medium uppercase tracking-[0.16em] text-stone-500">{{ posCopy.sortBy }}</span>
														<span class="truncate text-sm font-semibold text-stone-800">{{ activeProductSortLabel }}</span>
													</span>
													<SlidersHorizontal class="h-4 w-4 shrink-0 text-stone-400" />
												</AppButton>

												<template #content>
													<div class="w-[220px] overflow-hidden rounded-md border border-[#e7e4dd] bg-white p-1.5 shadow-2xl dark:border-[#3b342c] dark:bg-[#1d1a16]">
														<button
									v-for="option in sortOptionsLocalized"
															:key="option.value"
															type="button"
															class="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm text-stone-700 transition hover:bg-primary-50 hover:text-primary-700 dark:text-stone-300 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200"
															:class="activeProductSort === option.value ? 'bg-primary-50 text-primary-700 dark:bg-emerald-500/15 dark:text-emerald-200' : ''"
															@click="activeProductSort = option.value; sortMenuOpen = false"
														>
															<span class="font-medium">{{ option.label }}</span>
															<UIcon
																v-if="activeProductSort === option.value"
																name="i-heroicons-check-20-solid"
																class="h-4 w-4 text-primary-600 dark:text-emerald-300"
															/>
														</button>
													</div>
												</template>
											</UPopover>
										</div>

									</div>

									<AppInlineLoadingBar
										v-if="productsPending && products.length"
										minimal
										container-class="h-0.5 bg-neutral-100 dark:bg-[#2a241d]"
									/>

									<div class="scrollbar-soft min-h-0 overflow-y-auto pb-2 xl:pr-1">
									<div v-if="productsPending && !products.length" class="grid grid-cols-2 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5" aria-live="polite" :aria-label="posCopy.loading">
										<div v-for="index in 10" :key="index" class="min-h-[160px] overflow-hidden rounded-md border border-neutral-200 bg-white p-2.5 dark:border-[#3b342c] dark:bg-[#1d1a16]">
											<div class="flex items-center gap-2">
												<USkeleton class="h-12 w-12 shrink-0 rounded-md" />
												<div class="min-w-0 flex-1 space-y-2"><USkeleton class="h-4 w-4/5" /><USkeleton class="h-3 w-2/5" /></div>
											</div>
											<div class="mt-6 space-y-2"><USkeleton class="h-4 w-2/5" /><USkeleton class="h-4 w-3/5" /></div>
										</div>
									</div>
									<AppCard
										v-else-if="hasCatalogError"
										variant="empty"
									>
										<div class="flex min-h-[260px] flex-col items-center justify-center px-4 py-8 text-center">
											<div class="flex h-12 w-12 items-center justify-center rounded-md bg-amber-50 text-amber-700 ring-1 ring-amber-200">
												<UIcon name="i-heroicons-wifi" class="h-6 w-6" />
											</div>
											<p class="mt-4 text-lg font-semibold text-stone-900">{{ posCopy.loadError }}</p>
											<p class="mt-2 max-w-md text-sm leading-6 text-stone-500">
												{{ productsError }}
											</p>
											<div class="mt-5 flex flex-wrap justify-center gap-2">
												<AppButton color="primary" icon="i-heroicons-arrow-path" @click="loadPosProducts">
													{{ $t('restaurantPos.retry') }}
												</AppButton>
												<AppButton color="neutral" variant="soft" icon="i-heroicons-shopping-cart" @click="searchQuery = ''">
													{{ activeModeLabel }}
												</AppButton>
											</div>
										</div>
									</AppCard>
									<div v-else class="grid grid-cols-2 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5">
										<article
											v-for="product in filteredProducts"
											:key="product.id"
											class="min-w-0 text-left"
										>
										<AppCard
											variant="compact"
											:clickable="product.stockState !== 'inactive'"
											class="h-full overflow-hidden"
											@click="product.stockState !== 'inactive' && addToCart(product)"
										>
													<div class="flex h-full min-h-[160px] flex-col p-2 sm:p-2.5">
														<div class="flex items-start justify-between gap-2">
															<div class="flex items-center gap-2">
																<div
																	class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white text-white sm:h-14 sm:w-14"
																	:style="{ background: product.accent }"
																>
																	<img
																		v-if="product.imageUrl"
																		:src="product.imageUrl"
																		:alt="product.name"
																		class="h-full w-full object-cover"
																	/>
																	<UIcon v-else name="i-heroicons-cube" class="h-5 w-5 text-white/95 sm:h-6 sm:w-6" />
																</div>

																<div class="min-w-0">
																	<h3 class="line-clamp-2 text-xs font-semibold leading-4 text-stone-900 sm:text-sm sm:leading-5">
																		{{ product.name }}
																	</h3>
																	<p class="mt-0.5 truncate text-[10px] text-stone-500 sm:text-[11px]">
																		{{ product.sku }}
																	</p>
																</div>
															</div>

														</div>

														<div class="mt-2 flex min-h-0 flex-1 flex-col justify-between">
															<div class="flex flex-wrap gap-1">
																<UBadge color="neutral" variant="soft" :label="product.unitLabel" class="text-[10px]" />
																<UBadge color="neutral" variant="soft" :label="product.tag || product.category" class="text-[10px]" />
															</div>

															<div class="mt-3 space-y-1.5">
																<div class="flex items-baseline justify-between gap-2">
																	<p class="text-base font-semibold text-stone-950 tabular-nums sm:text-lg">
																		{{ formatMoney(product.price) }}
																	</p>
																</div>
																<UBadge
																	:color="getStockTone(product.stockState)"
																	variant="soft"
																	:label="getStockLabel(product)"
																	class="text-[10px] leading-none"
																/>
															</div>
														</div>
													</div>
												</AppCard>
										</article>
									</div>

									<AppCard
										variant="empty"
										v-if="!productsPending && !hasCatalogError && filteredProducts.length === 0"
									>
										<div class="py-8 text-center">
											<p class="text-lg font-semibold text-stone-900">{{ posCopy.noProducts }}</p>
											<p class="mt-2 text-sm text-stone-500">
												{{ posCopy.noProductsHint }}
											</p>
										</div>
									</AppCard>
									</div>
									</div>
								</AppCard>
							</div>
					</section>

									<aside class="hidden w-[420px] self-stretch xl:flex xl:min-h-0 xl:flex-col xl:px-4 xl:py-0">
								<div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-md border border-neutral-200 bg-[#fbfbf8] p-4 text-stone-900 shadow-[0_8px_24px_rgba(31,28,24,0.06)] dark:border-[#3b342c] dark:bg-[#15120f] dark:text-stone-100">
										<div class="flex items-start justify-between gap-3 border-b border-[#ece6dc] pb-3 dark:border-[#3b342c]">
											<div class="min-w-0">
										<p class="truncate text-xs text-stone-500">{{ activeModeLabel }} · {{ $t('pos.itemCount', { count: itemCount }) }}</p>
											</div>
											<AppButton
												color="neutral"
												variant="soft"
												size="md"
												class="rounded-md"
										:aria-label="$t('pos.clearBill')"
										:title="$t('pos.clearBill')"
												@click="clearCart"
											>
												<span class="inline-flex items-center justify-center">
													<Eraser class="h-4 w-4 shrink-0" />
												</span>
											</AppButton>
										</div>

											<div class="mt-2 grid min-h-0 overflow-hidden grid-rows-[minmax(0,1fr)] gap-2">
												<div class="scrollbar-soft h-full min-h-0 overflow-y-auto pr-1">
													<div class="space-y-1.5 pb-1">
											<AppCard
												variant="compact"
												v-for="item in cartItems"
												:key="item.id"
													:clickable="false"
														class="rounded-md border border-neutral-200 bg-white shadow-sm dark:border-[#3b342c] dark:bg-[#1d1a16]"
										>
											<div class="relative space-y-2 p-2 pr-14 sm:p-2.5 sm:pr-16">
												<div class="flex items-start justify-between gap-3">
													<div class="min-w-0 flex-1">
														<h3 class="truncate text-sm font-semibold text-stone-900">{{ item.name }}</h3>
														<p class="mt-0.5 truncate text-[10px] text-stone-500">{{ item.unitLabel }} . {{ item.sku }}</p>
														<div class="mt-2 flex flex-wrap items-center gap-1 justify-start">
															<UBadge :color="getStockTone(item.stockState)" variant="soft" :label="getStockLabel(item)" />
															<UBadge color="neutral" variant="soft" :label="item.unitLabel" />
														<UBadge v-if="item.hasVariants" color="neutral" variant="soft" :label="$t('products.variants')" />
														</div>
													</div>
													<div class="shrink-0 text-right">
														<p class="text-sm font-semibold text-stone-900 tabular-nums">
															{{ formatMoney(item.lineTotal) }}
														</p>
														<p class="mt-0.5 text-[10px] leading-4 text-stone-500 tabular-nums">
															{{ formatMoney(item.price) }} × {{ item.qty }}
														</p>
														<div class="mt-1 inline-flex shrink-0 items-center rounded-md bg-[#f3f2ee] p-0.5">
															<AppButton color="neutral" variant="ghost" size="xs" label="-" @click="decreaseQty(item.id)" />
															<span class="min-w-[2.25rem] text-center text-sm font-semibold text-stone-900 tabular-nums">
																{{ item.qty }}
															</span>
															<AppButton color="neutral" variant="ghost" size="xs" label="+" @click="increaseQty(item.id)" />
														</div>
													</div>
												</div>

												<AppButton
													type="button"
													color="error"
													variant="soft"
													size="xs"
													class="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full p-0 shadow-sm"
													:aria-label="`ลบ ${item.name}`"
													:title="`ลบ ${item.name}`"
													@click="removeFromCart(item.id)"
												>
													<span class="flex items-center justify-center leading-none">
														<Trash2 class="h-3 w-3 shrink-0" />
													</span>
												</AppButton>

											</div>
										</AppCard>

											<AppCard
												variant="empty"
												v-if="cartItems.length === 0"
											>
												<div class="px-3 py-3 text-xs leading-6 text-stone-500 dark:text-stone-400 sm:px-4 sm:py-4 sm:text-sm">
											{{ $t('pos.cartEmpty') }} {{ $t('pos.addToBillHint') }}
												</div>
											</AppCard>
													</div>
												</div>
											</div>

					<div v-if="availablePromotions.length" class="mx-1 mb-2 rounded-md border border-emerald-200 bg-emerald-50 p-2.5 dark:border-emerald-900/70 dark:bg-emerald-950/30">
						<div class="mb-2 flex items-center justify-between"><p class="text-xs font-semibold text-emerald-900 dark:text-emerald-200">{{ $t('pos.availablePromotions') }}</p><UIcon v-if="promotionsPending" name="i-heroicons-arrow-path" class="h-4 w-4 animate-spin text-emerald-700" /></div>
						<label v-for="promotion in availablePromotions" :key="promotion.promotion_id" class="mb-1 flex cursor-pointer items-center gap-2 rounded bg-white/70 px-2 py-1.5 text-xs dark:bg-black/10"><input v-model="selectedPromotionIds" type="checkbox" :value="promotion.promotion_id" class="accent-emerald-600"><span class="min-w-0 flex-1 truncate">{{ promotion.name }}</span><span class="font-medium">{{ $t('pos.giftQuantity', { count: promotion.gift_qty }) }}</span></label>
					</div>
					<div class="sticky bottom-0 z-10 border-t border-[#ece6dc] bg-[rgba(251,251,248,0.96)] px-1 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur dark:border-[#3b342c] dark:bg-[rgba(21,18,15,0.96)]">
						<div class="space-y-1.5">
							<div class="rounded-md border border-neutral-200 bg-white px-2.5 py-2.5 shadow-sm dark:border-[#3b342c] dark:bg-[#1d1a16]">
								<div class="space-y-1.5">
									<div class="flex items-center justify-between gap-3 text-[11px]">
										<p class="text-stone-500 dark:text-stone-400">{{ $t('pos.subtotal') }}</p>
										<p class="font-semibold text-stone-900 tabular-nums dark:text-stone-50">{{ formatMoney(subtotal) }}</p>
									</div>
									<div class="flex items-center justify-between gap-3 text-[11px]">
										<p class="text-stone-500 dark:text-stone-400">{{ $t('pos.discount') }}</p>
										<p class="font-semibold text-stone-900 tabular-nums dark:text-stone-50">
											{{ discount > 0 ? `-${formatMoney(discount)}` : formatMoney(discount) }}
										</p>
									</div>
									<div class="flex items-center justify-between gap-3 text-[11px]">
										<p class="text-stone-500 dark:text-stone-400">{{ vatLabel }}</p>
										<p class="font-semibold text-stone-900 tabular-nums dark:text-stone-50">{{ formatMoney(tax) }}</p>
									</div>
									<div class="flex items-center justify-between gap-3 text-[11px]">
										<p class="text-stone-500 dark:text-stone-400">{{ $t('pos.service') }}</p>
										<p class="font-semibold text-stone-900 tabular-nums dark:text-stone-50">{{ formatMoney(serviceCharge) }}</p>
									</div>

									<div class="h-px bg-neutral-200 dark:bg-[#3b342c]" />

									<div class="rounded-md bg-stone-50 px-2.5 py-2.5 ring-1 ring-neutral-200 dark:bg-[#171410] dark:ring-[#3b342c]">
										<div class="flex items-start justify-between gap-2">
											<div>
											<p class="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">{{ $t('pos.amountDue') }}</p>
											<p class="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">{{ $t('pos.itemCount', { count: itemCount }) }} · {{ activeModeLabel }}</p>
											</div>
											<p class="text-[1.45rem] font-semibold tracking-[-0.04em] text-stone-950 tabular-nums dark:text-stone-50">
												{{ formatMoney(total) }}
											</p>
										</div>
									</div>
								</div>
							</div>

							<div class="grid gap-2">
								<AppButton
									color="primary"
									variant="solid"
									size="md"
									class="w-full justify-center gap-2 rounded-md"
									:block="true"
									@click="openPaymentModal"
								>
									<BadgeCheck class="h-4 w-4 shrink-0" />
										<span>{{ $t('pos.checkout') }}</span>
								</AppButton>
							</div>
						</div>
					</div>
								</div>
							</aside>
			</div>
		</template>
	</AppSidebarShell>

		<div class="fixed inset-x-0 bottom-0 z-30 border-t border-[#ece6dc] bg-[rgba(255,255,253,0.96)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur xl:hidden">
			<div class="flex items-center justify-between gap-4">
				<div>
					<p class="text-[11px] uppercase tracking-[0.22em] text-stone-400">{{ $t('pos.currentBill') }}</p>
					<p class="mt-1 text-sm font-medium text-stone-600">{{ $t('pos.itemCount', { count: itemCount }) }}</p>
				</div>
				<div class="flex items-center gap-3">
					<p class="text-right text-lg font-semibold text-stone-950 tabular-nums">{{ formatMoney(total) }}</p>
						<AppButton color="primary" variant="solid" size="md" class="rounded-md" :label="$t('pos.viewBill')" @click="mobileTicketOpen = true" />
				</div>
			</div>
		</div>

		<div
			v-if="mobileTicketOpen"
			class="fixed inset-0 z-50 flex items-end bg-black/45 p-3 xl:hidden"
			@click.self="mobileTicketOpen = false"
		>
			<UCard :ui="compactCardUi" class="max-h-[88vh] w-full overflow-hidden rounded-none border-0 bg-white shadow-2xl ring-1 ring-black/5 dark:bg-[#15120f] dark:ring-[#3b342c] sm:rounded-md">
				<template #header>
					<div class="flex items-center justify-between">
						<div>
							<p class="text-[11px] uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">{{ $t('pos.currentBill') }}</p>
							<p class="mt-2 text-sm text-stone-500 dark:text-stone-400">{{ $t('pos.itemCount', { count: itemCount }) }}</p>
						</div>
							<AppButton color="neutral" variant="soft" size="md" class="rounded-md" :label="$t('common.close')" @click="mobileTicketOpen = false" />
					</div>
				</template>

					<div class="scrollbar-soft max-h-[calc(88vh-240px)] space-y-2 overflow-y-auto">
						<UCard
							:ui="compactCardUi"
							v-for="item in cartItems"
							:key="item.id"
							class="rounded-md border-0 bg-white ring-1 ring-neutral-200 dark:bg-[#1d1a16] dark:ring-[#3b342c]"
						>
							<div class="relative space-y-1.5 pr-14">
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0 flex-1">
										<h3 class="truncate text-sm font-semibold text-stone-900 dark:text-stone-50">{{ item.name }}</h3>
										<p class="mt-0.5 truncate text-[10px] text-stone-500 dark:text-stone-400">{{ item.unitLabel }} . {{ item.sku }}</p>
										<div class="mt-2 flex flex-wrap items-center gap-1 justify-start">
											<UBadge :color="getStockTone(item.stockState)" variant="soft" :label="getStockLabel(item)" />
											<UBadge color="neutral" variant="soft" :label="item.unitLabel" />
										</div>
									</div>
									<div class="shrink-0 text-right">
										<p class="text-sm font-semibold text-stone-900 tabular-nums dark:text-stone-50">
											{{ formatMoney(item.lineTotal) }}
										</p>
										<p class="mt-0.5 text-[10px] leading-4 text-stone-500 tabular-nums dark:text-stone-400">
											{{ formatMoney(item.price) }} × {{ item.qty }}
										</p>
										<div class="mt-1 inline-flex shrink-0 items-center rounded-md bg-[#f3f2ee] p-0.5 dark:bg-[#2a251f]">
											<AppButton color="neutral" variant="ghost" size="xs" label="-" @click="decreaseQty(item.id)" />
											<span class="min-w-[2.25rem] text-center text-sm font-semibold text-stone-900 tabular-nums dark:text-stone-50">
												{{ item.qty }}
											</span>
											<AppButton color="neutral" variant="ghost" size="xs" label="+" @click="increaseQty(item.id)" />
										</div>
									</div>
								</div>

								<AppButton
									type="button"
									color="error"
									variant="soft"
									size="xs"
									class="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full p-0 shadow-sm"
									:aria-label="`ลบ ${item.name}`"
									:title="`ลบ ${item.name}`"
									@click="removeFromCart(item.id)"
								>
									<span class="flex items-center justify-center leading-none">
										<Trash2 class="h-3 w-3 shrink-0" />
									</span>
								</AppButton>

								<div class="flex items-center justify-between gap-3">
									<div class="flex min-w-0 flex-wrap gap-1">
										<UBadge :color="getStockTone(item.stockState)" variant="soft" :label="getStockLabel(item)" />
										<UBadge color="neutral" variant="soft" :label="item.unitLabel" />
									</div>
								</div>
							</div>
						</UCard>

					<UCard
						:ui="compactCardUi"
						v-if="cartItems.length === 0"
						class="border border-dashed border-neutral-200 bg-[#f3f2ee] text-center text-stone-500 shadow-none dark:border-[#3b342c] dark:bg-[#1d1a16] dark:text-stone-400"
					>
						<div class="px-3 py-3 text-xs leading-6 sm:px-4 sm:py-4 sm:text-sm">
							{{ $t('pos.cartEmpty') }} {{ $t('pos.addToBillHint') }}
						</div>
					</UCard>
				</div>

					<template #footer>
						<div class="space-y-1.5 border-t border-[#ece6dc] bg-[rgba(255,255,255,0.98)] pt-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur dark:border-[#3b342c] dark:bg-[rgba(21,18,15,0.96)]">
							<div class="rounded-md border border-neutral-200 bg-white px-2.5 py-2.5 shadow-sm dark:border-[#3b342c] dark:bg-[#1d1a16]">
								<div class="space-y-1.5">
									<div class="flex items-center justify-between gap-3 text-[11px]">
										<p class="text-stone-500 dark:text-stone-400">{{ $t('pos.subtotal') }}</p>
										<p class="font-semibold text-stone-900 tabular-nums dark:text-stone-50">{{ formatMoney(subtotal) }}</p>
									</div>
									<div class="flex items-center justify-between gap-3 text-[11px]">
										<p class="text-stone-500 dark:text-stone-400">{{ $t('pos.discount') }}</p>
										<p class="font-semibold text-stone-900 tabular-nums dark:text-stone-50">
											{{ discount > 0 ? `-${formatMoney(discount)}` : formatMoney(discount) }}
										</p>
									</div>
									<div class="flex items-center justify-between gap-3 text-[11px]">
										<p class="text-stone-500 dark:text-stone-400">{{ vatLabel }}</p>
										<p class="font-semibold text-stone-900 tabular-nums dark:text-stone-50">{{ formatMoney(tax) }}</p>
									</div>
									<div class="flex items-center justify-between gap-3 text-[11px]">
										<p class="text-stone-500 dark:text-stone-400">{{ $t('pos.service') }}</p>
										<p class="font-semibold text-stone-900 tabular-nums dark:text-stone-50">{{ formatMoney(serviceCharge) }}</p>
									</div>

									<div class="h-px bg-neutral-200 dark:bg-[#3b342c]" />

									<div class="rounded-md bg-[#fbfbf8] px-2.5 py-2.5 ring-1 ring-neutral-200 dark:bg-[#171410] dark:ring-[#3b342c]">
										<div class="flex items-start justify-between gap-2">
											<div>
											<p class="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">{{ $t('pos.amountDue') }}</p>
											<p class="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">{{ $t('pos.itemCount', { count: itemCount }) }} · {{ activeModeLabel }}</p>
											</div>
											<p class="text-[1.45rem] font-semibold tracking-[-0.04em] text-stone-950 tabular-nums dark:text-stone-50">{{ formatMoney(total) }}</p>
										</div>
									</div>
								</div>
							</div>

							<div class="grid gap-2">
								<AppButton
									color="primary"
									variant="solid"
									size="md"
									class="w-full justify-center gap-2 rounded-md"
									:block="true"
									@click="openPaymentModal"
								>
									<BadgeCheck class="h-4 w-4 shrink-0" />
										<span>{{ $t('pos.checkout') }}</span>
								</AppButton>
								<AppButton color="neutral" variant="soft" size="md" class="rounded-md" :label="$t('pos.holdBill')" />
							</div>
						</div>
				</template>
			</UCard>
		</div>

		<Teleport to="body">
			<Transition
				enter-active-class="transition duration-180 ease-out"
				enter-from-class="opacity-0"
				enter-to-class="opacity-100"
				leave-active-class="transition duration-140 ease-in"
				leave-from-class="opacity-100"
				leave-to-class="opacity-0"
			>
				<div
					v-if="paymentModalOpen"
					class="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
				>
					<Transition
						enter-active-class="transition duration-180 ease-out"
						enter-from-class="translate-y-2 scale-[0.98] opacity-0"
						enter-to-class="translate-y-0 scale-100 opacity-100"
						leave-active-class="transition duration-140 ease-in"
						leave-from-class="translate-y-0 scale-100 opacity-100"
						leave-to-class="translate-y-2 scale-[0.98] opacity-0"
					>
						<div
							v-if="paymentModalOpen"
							:class="[
								'w-full overflow-hidden rounded-2xl border border-[#e8e1d7] bg-[#fffefd] shadow-[0_24px_72px_rgba(31,28,24,0.26)] ring-1 ring-black/5 dark:border-[#3b342c] dark:bg-[#15120f] dark:shadow-[0_24px_72px_rgba(0,0,0,0.4)]',
								paymentModalWidthClass,
							]"
						>
							<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] px-5 py-4 dark:border-[#3b342c]">
								<div class="min-w-0">
									<p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">{{ paymentModalEyebrow }}</p>
									<h2 class="mt-1 text-lg font-semibold tracking-[-0.03em] text-stone-950 dark:text-stone-50">
										{{ paymentModalTitle }}
									</h2>
											<p class="mt-1 text-sm leading-6 text-stone-500 dark:text-stone-400">
													{{ paymentCheckoutStep === 1 ? $t('pos.selectPaymentHint') : paymentModalDescription }}
									</p>
									<div class="mt-3 flex flex-wrap items-center gap-2">
										<UBadge color="neutral" variant="soft" :label="paymentModalProgressLabel" />
										<UBadge
											v-if="selectedPaymentMethodOption"
											color="success"
											variant="soft"
											:label="selectedPaymentMethodOption.label"
										/>
									</div>
								</div>

								<AppButton
									color="neutral"
									variant="soft"
									size="md"
									icon="i-heroicons-x-mark-20-solid"
									class="shrink-0 rounded-md"
									aria-label="ปิด"
									title="ปิด"
									@click="closePaymentModal"
								/>
							</div>

							<div class="space-y-4 px-5 py-5">
								<div class="grid gap-3 sm:grid-cols-3">
									<div class="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-[#3b342c] dark:bg-[#1d1a16]">
										<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">รายการ</p>
										<p class="mt-2 text-lg font-semibold text-stone-950 dark:text-stone-50">{{ itemCount }}</p>
									</div>
									<div class="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-[#3b342c] dark:bg-[#1d1a16]">
										<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">โหมด</p>
										<p class="mt-2 text-lg font-semibold text-stone-950 dark:text-stone-50">{{ activeMode }}</p>
									</div>
									<div class="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-[#3b342c] dark:bg-[#1d1a16]">
										<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">ยอดรวม</p>
										<p class="mt-2 text-lg font-semibold text-stone-950 tabular-nums dark:text-stone-50">{{ formatMoney(total) }}</p>
									</div>
								</div>

								<template v-if="paymentCheckoutStep === 1">
									<div class="grid gap-3 sm:grid-cols-2">
										<button
											v-for="option in paymentMethodOptions"
											:key="option.id"
											type="button"
											class="flex min-h-[118px] flex-col justify-between rounded-xl border px-4 py-4 text-left transition"
											:class="selectedPaymentMethod === option.id
												? 'border-primary-500 bg-primary-50 shadow-sm dark:border-emerald-400/70 dark:bg-emerald-500/10'
												: 'border-neutral-200 bg-white hover:border-primary-300 hover:bg-primary-50/60 dark:border-[#3b342c] dark:bg-[#1d1a16] dark:hover:border-emerald-500/40 dark:hover:bg-[#162017]'"
											@click="choosePaymentMethod(option.id)"
										>
											<div class="flex items-start justify-between gap-3">
												<div class="flex min-w-0 items-start gap-3">
													<div
														class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition"
														:class="selectedPaymentMethod === option.id
															? 'bg-primary-100 text-primary-700 dark:bg-emerald-500/20 dark:text-emerald-200'
															: 'bg-stone-100 text-stone-600 dark:bg-[#2a241d] dark:text-stone-300'"
													>
														<UIcon :name="option.icon" class="h-5 w-5" />
													</div>
													<div class="min-w-0">
														<p class="text-sm font-semibold text-stone-950 dark:text-stone-50">{{ option.label }}</p>
														<p class="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">{{ option.hint }}</p>
													</div>
												</div>
												<UIcon
													v-if="selectedPaymentMethod === option.id"
													name="i-heroicons-check-circle-20-solid"
													class="mt-0.5 h-5 w-5 shrink-0 text-primary-600 dark:text-emerald-300"
												/>
											</div>
											<div class="mt-4 flex items-center justify-between gap-3 text-xs">
												<span class="text-stone-400 dark:text-stone-500">แตะเพื่อเลือก</span>
												<span
													class="rounded-full px-2.5 py-1 font-medium transition"
													:class="selectedPaymentMethod === option.id
														? 'bg-primary-100 text-primary-700 dark:bg-emerald-500/20 dark:text-emerald-200'
														: 'bg-stone-100 text-stone-500 dark:bg-[#2a241d] dark:text-stone-400'"
												>
													{{ selectedPaymentMethod === option.id ? "เลือกแล้ว" : "ยังไม่เลือก" }}
												</span>
											</div>
										</button>
									</div>

									<div class="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-4 dark:border-[#3b342c] dark:bg-[#1d1a16]">
										<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">ตัวอย่างขั้นตอน</p>

										<div v-if="selectedPaymentMethodOption" class="mt-3 space-y-3">
											<div class="flex items-center justify-between gap-3">
												<div class="min-w-0">
													<p class="text-base font-semibold text-stone-950 dark:text-stone-50">{{ selectedPaymentMethodOption.label }}</p>
													<p class="mt-1 text-sm leading-6 text-stone-500 dark:text-stone-400">
												{{ selectedPaymentMethodOption.id === "cash"
													? "รับเงินสดแล้วกดยืนยันเพื่อปิดขั้นตอนนี้"
													: selectedPaymentMethodOption.id === "qr_transfer"
														? "เลือกบัญชีร้านและบันทึกหลักฐานการโอนของบิลนี้"
														: "รับชำระผ่านเครื่องรูดภายนอก โดยไม่เก็บข้อมูลบัตร" }}
													</p>
												</div>
												<div class="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700 dark:bg-emerald-500/20 dark:text-emerald-200">
													{{ formatMoney(total) }}
												</div>
											</div>
											<div class="grid gap-2 sm:grid-cols-2">
												<div class="rounded-lg bg-white px-3 py-3 ring-1 ring-neutral-200 dark:bg-[#15120f] dark:ring-[#3b342c]">
													<p class="text-[11px] uppercase tracking-[0.16em] text-stone-400 dark:text-stone-500">รายการในบิล</p>
													<p class="mt-1 text-sm font-semibold text-stone-950 dark:text-stone-50">{{ itemCount }} รายการ</p>
												</div>
												<div class="rounded-lg bg-white px-3 py-3 ring-1 ring-neutral-200 dark:bg-[#15120f] dark:ring-[#3b342c]">
													<p class="text-[11px] uppercase tracking-[0.16em] text-stone-400 dark:text-stone-500">วิธีที่เลือก</p>
													<p class="mt-1 text-sm font-semibold text-stone-950 dark:text-stone-50">{{ selectedPaymentMethodOption.label }}</p>
												</div>
											</div>
										</div>

										<div v-else class="mt-3 rounded-lg border border-dashed border-neutral-200 bg-white px-4 py-4 text-sm leading-6 text-stone-500 dark:border-[#3b342c] dark:bg-[#15120f] dark:text-stone-400">
											เลือกวิธีชำระเงินก่อน ระบบจะโชว์ preview ของขั้นตอนถัดไปตรงนี้
										</div>
									</div>
								</template>

								<template v-else>
									<div v-if="checkoutError" class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
										{{ checkoutError }}
									</div>
									<div v-if="selectedPaymentMethod === 'cash'" class="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-4 dark:border-[#3b342c] dark:bg-[#1d1a16]">
												<label class="text-sm font-semibold text-stone-900 dark:text-stone-50">{{ $t('pos.amountReceived') }}</label>
										<input v-model="cashTendered" type="number" min="0" class="mt-2 w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm" :placeholder="String(total)">
												<p class="mt-2 text-xs text-stone-500">{{ $t('pos.change') }} {{ formatMoney(Math.max(0, Number(cashTendered || 0) - total)) }}</p>
									</div>
									<div v-else-if="selectedPaymentMethod === 'qr_transfer'" class="grid gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-4 dark:border-[#3b342c] dark:bg-[#1d1a16] sm:grid-cols-2">
												<label class="text-sm font-semibold text-stone-900 dark:text-stone-50">{{ $t('pos.paymentAccount') }}
											<select v-model="paymentAccountId" class="mt-2 w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm">
												<option value="">เลือกบัญชี</option><option v-for="account in paymentAccounts" :key="account.id" :value="account.id">{{ account.display_name }}</option>
											</select>
										</label>
												<label class="text-sm font-semibold text-stone-900 dark:text-stone-50">{{ $t('pos.reference') }}
											<input v-model="paymentReference" class="mt-2 w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm" placeholder="Transaction reference">
										</label>
												<label class="text-sm font-semibold text-stone-900 dark:text-stone-50 sm:col-span-2">{{ $t('pos.proofUrl') }}
											<input v-model="paymentSlipUrl" type="url" class="mt-2 w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm" placeholder="https://...">
										</label>
									</div>
									<div v-else class="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm text-stone-600 dark:border-[#3b342c] dark:bg-[#1d1a16] dark:text-stone-300">
										ยืนยันว่าได้รับชำระผ่านเครื่องรูดภายนอกแล้ว ระบบจะไม่จัดเก็บเลขบัตรหรือ CVV
									</div>
									<div class="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.85fr)]">
										<div class="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-[#3b342c] dark:bg-[#1d1a16]">
											<div class="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-[#3b342c]">
												<div>
													<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400 dark:text-stone-500">รายการสินค้า</p>
													<p class="mt-1 text-sm font-semibold text-stone-950 dark:text-stone-50">พรีวิวสินค้าที่อยู่ในบิลนี้</p>
												</div>
												<UBadge color="neutral" variant="soft" :label="`${itemCount} รายการ`" />
											</div>
											<div class="scrollbar-soft max-h-[48vh] space-y-2 overflow-y-auto p-4">
												<div
													v-for="item in cartItems"
													:key="item.id"
													class="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-3 dark:border-[#3b342c] dark:bg-[#171410]"
												>
													<div class="flex items-start justify-between gap-3">
														<div class="min-w-0">
															<p class="truncate text-sm font-semibold text-stone-950 dark:text-stone-50">{{ item.name }}</p>
															<p class="mt-1 text-xs text-stone-500 dark:text-stone-400">{{ item.unitLabel }} • {{ item.sku }}</p>
														</div>
														<p class="shrink-0 text-sm font-semibold tabular-nums text-stone-950 dark:text-stone-50">{{ formatMoney(item.lineTotal) }}</p>
													</div>
													<div class="mt-2 flex items-center justify-between gap-3 text-xs text-stone-500 dark:text-stone-400">
														<span>จำนวน {{ item.qty }}</span>
														<span>{{ formatMoney(item.price) }} × {{ item.qty }}</span>
													</div>
												</div>

												<div
													v-if="cartItems.length === 0"
													class="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-6 text-center text-sm text-stone-500 dark:border-[#3b342c] dark:bg-[#171410] dark:text-stone-400"
												>
													ยังไม่มีสินค้าในบิลนี้
												</div>
											</div>
										</div>

										<div class="space-y-4">
											<div class="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-4 dark:border-[#3b342c] dark:bg-[#1d1a16]">
												<div class="flex items-start justify-between gap-3">
													<div class="min-w-0">
														<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400 dark:text-stone-500">วิธีชำระที่เลือก</p>
														<p class="mt-1 text-base font-semibold text-stone-950 dark:text-stone-50">{{ selectedPaymentMethodOption?.label || "-" }}</p>
														<p class="mt-1 text-sm leading-6 text-stone-500 dark:text-stone-400">
															{{ selectedPaymentMethodOption?.hint || "ยังไม่เลือกวิธีชำระ" }}
														</p>
													</div>
													<div class="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700 dark:bg-emerald-500/20 dark:text-emerald-200">
														{{ paymentModalProgressLabel }}
													</div>
												</div>
											</div>

											<div class="rounded-xl border border-neutral-200 bg-white px-4 py-4 dark:border-[#3b342c] dark:bg-[#15120f]">
												<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400 dark:text-stone-500">สรุปบิล</p>
												<div class="mt-3 space-y-2.5">
													<div class="flex items-center justify-between gap-3 text-sm">
														<span class="text-stone-500 dark:text-stone-400">Subtotal</span>
														<span class="font-semibold text-stone-950 tabular-nums dark:text-stone-50">{{ formatMoney(subtotal) }}</span>
													</div>
													<div class="flex items-center justify-between gap-3 text-sm">
														<span class="text-stone-500 dark:text-stone-400">ส่วนลด</span>
														<span class="font-semibold text-stone-950 tabular-nums dark:text-stone-50">
															{{ discount > 0 ? `-${formatMoney(discount)}` : formatMoney(discount) }}
														</span>
													</div>
													<div class="flex items-center justify-between gap-3 text-sm">
														<span class="text-stone-500 dark:text-stone-400">{{ vatLabel }}</span>
														<span class="font-semibold text-stone-950 tabular-nums dark:text-stone-50">{{ formatMoney(tax) }}</span>
													</div>
													<div class="flex items-center justify-between gap-3 text-sm">
														<span class="text-stone-500 dark:text-stone-400">Service</span>
														<span class="font-semibold text-stone-950 tabular-nums dark:text-stone-50">{{ formatMoney(serviceCharge) }}</span>
													</div>
													<div class="h-px bg-neutral-200 dark:bg-[#3b342c]" />
													<div class="flex items-center justify-between gap-3">
														<div>
															<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">ยอดชำระ</p>
															<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">{{ itemCount }} รายการ . {{ activeMode }}</p>
														</div>
														<p class="text-[1.6rem] font-semibold tracking-[-0.04em] text-stone-950 tabular-nums dark:text-stone-50">
															{{ formatMoney(total) }}
														</p>
													</div>
												</div>
											</div>

											<div class="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm leading-6 text-stone-500 dark:border-[#3b342c] dark:bg-[#1d1a16] dark:text-stone-400">
												<p class="font-semibold text-stone-900 dark:text-stone-50">พร้อมยืนยัน</p>
												<p class="mt-1">ถ้าทุกอย่างถูกต้องแล้วกดปุ่มยืนยันชำระเงินด้านล่าง ระบบจะปิดบิลและจบ flow นี้</p>
											</div>
										</div>
									</div>
								</template>
							</div>

							<div class="border-t border-[#ece6dc] px-5 py-4 dark:border-[#3b342c]">
								<div class="grid grid-cols-2 gap-2">
									<AppButton
										color="neutral"
										variant="soft"
										size="md"
										class="justify-center gap-2 rounded-md"
										:block="true"
										:icon="paymentModalSecondaryAction.icon"
										@click="goBackPaymentCheckout"
									>
										{{ paymentModalSecondaryAction.label }}
									</AppButton>
									<AppButton
										color="primary"
										variant="solid"
										size="md"
										class="justify-center gap-2 rounded-md"
										:block="true"
										:icon="paymentModalPrimaryAction.icon"
										:loading="checkoutSaving"
										:disabled="checkoutSaving || (paymentCheckoutStep === 1 ? !selectedPaymentMethod : selectedPaymentMethod === 'cash' ? Number(cashTendered || 0) < total : selectedPaymentMethod === 'qr_transfer' ? !paymentAccountId || !paymentSlipUrl : false)"
										@click="continuePaymentCheckout"
									>
										{{ paymentModalPrimaryAction.label }}
									</AppButton>
								</div>
							</div>
						</div>
					</Transition>
				</div>
			</Transition>
		</Teleport>

		<AppResponsivePanel
			v-model="cameraScannerOpen"
			title="สแกนบาร์โค้ดด้วยกล้อง"
			description="ใช้ได้บน mobile, tablet และ desktop เมื่อเปิดสิทธิ์กล้องแล้ว"
			desktop-width="680px"
			mobile-max-height="88vh"
			fill-mobile-height
			close-button-size="md"
			compact-header
			backdrop-z-class="z-[220]"
			panel-z-class="z-[230]"
			content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			@close="stopCameraScanner"
		>
			<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
				<div class="scrollbar-soft min-h-0 space-y-3 overflow-y-auto px-0 py-2 sm:px-0 sm:py-2">
					<div
						v-if="cameraPermissionState !== 'granted'"
						class="rounded-md border border-neutral-200 bg-neutral-50 p-4 text-stone-700"
					>
						<p class="text-sm font-medium text-stone-900">ต้องขออนุญาตใช้กล้องก่อน</p>
						<p class="mt-1 text-xs leading-5 text-stone-500">
							กดปุ่มด้านล่างเพื่อให้ระบบแสดงหน้าต่างขอสิทธิ์กล้อง
						</p>
						<div class="mt-3 flex flex-wrap gap-2">
							<AppButton
								color="primary"
								variant="soft"
								size="md"
								class="rounded-md"
								icon="i-heroicons-video-camera-20-solid"
								label="ขออนุญาตกล้อง"
								@click="confirmCameraPermissionAndStart"
							/>
						</div>
					</div>

					<div
						v-else
						class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
					>
						<div v-if="cameraDevices.length > 1" class="w-full sm:max-w-[320px]">
							<label class="text-xs font-medium text-stone-500">เลือกกล้อง</label>
							<select
								:value="selectedCameraDeviceId"
								class="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
								@change="changeSelectedCamera(($event.target as HTMLSelectElement).value)"
							>
								<option v-for="camera in cameraDevices" :key="camera.deviceId" :value="camera.deviceId">
									{{ camera.label }}
								</option>
							</select>
						</div>
						<div v-else class="text-xs text-stone-500">
							กล้อง: {{ cameraDevices[0]?.label || "ค่าเริ่มต้น" }}
						</div>
					</div>

					<div
						v-if="cameraPermissionState === 'granted'"
						class="overflow-hidden rounded-md bg-stone-950 ring-1 ring-stone-900/10"
					>
						<div class="relative aspect-[4/3] w-full bg-stone-950">
							<video
								ref="scannerVideoRef"
								class="h-full w-full object-cover"
								muted
								playsinline
							/>
							<div class="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
								<div class="h-32 w-full max-w-sm rounded-md border-2 border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]" />
							</div>
						</div>
					</div>
					<div
						v-else
						class="flex items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-50 py-10 text-sm text-stone-500"
					>
						รอการอนุญาตกล้องเพื่อเริ่มแสดงภาพ
					</div>
				</div>

				<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
					<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div class="min-w-0">
							<p v-if="cameraScannerStarting" class="text-sm text-stone-600">
								กำลังเปิดกล้องและเริ่มตัวอ่านบาร์โค้ด...
							</p>
							<p v-else-if="cameraScannerError" class="text-sm text-rose-600">
								{{ cameraScannerError }}
							</p>
							<p v-else class="text-sm text-stone-600">
								จัดบาร์โค้ดให้อยู่ในกรอบ ระบบจะเพิ่มสินค้าเข้าบิลให้อัตโนมัติ
							</p>
						</div>

						<div class="flex shrink-0 gap-2">
							<AppButton
								v-if="cameraScannerError"
								color="primary"
								variant="soft"
								size="md"
								class="rounded-md"
								label="ลองเปิดใหม่"
								@click="startCameraScanner"
							/>
							<AppButton
								color="neutral"
								variant="soft"
								size="md"
								class="rounded-md"
								label="ปิด"
								@click="stopCameraScanner"
							/>
						</div>
					</div>
				</div>
			</div>
		</AppResponsivePanel>

		<div
			v-if="scanToast"
			class="fixed right-3 top-3 z-[60] max-w-sm"
		>
			<UCard class="border-0 bg-white shadow-xl ring-1 ring-neutral-200">
				<p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#97532c]">Barcode scanned</p>
				<p class="mt-1 text-sm text-stone-700">{{ scanToast }}</p>
			</UCard>
		</div>

</template>
