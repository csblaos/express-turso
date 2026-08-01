<script setup lang="ts">
import { getCurrencySymbol, formatMoneyWithSymbol, normalizeMoneyTyping } from "~/utils/currency";
import { appNavItems } from "~/utils/app-nav";
import { formatAppDateTime } from "~/utils/date-format";

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type ApiPurchaseOrderListItem = {
	id: string;
	store_id: string;
	po_number: string;
	supplier_name: string | null;
	supplier_contact: string | null;
	purchase_currency: string;
	exchange_rate: number;
	shipping_cost: number;
	other_cost: number;
	other_cost_note: string | null;
	status: string;
	ordered_at: string | null;
	expected_at: string | null;
	shipped_at: string | null;
	received_at: string | null;
	tracking_info: string | null;
	cancelled_at: string | null;
	note: string | null;
	created_by: string | null;
	created_at: string;
	updated_at: string | null;
	updated_by: string | null;
	exchange_rate_initial: number;
	payment_status: string;
	paid_at: string | null;
	paid_by: string | null;
	payment_reference: string | null;
	payment_note: string | null;
	due_date: string | null;
	shipping_cost_original: number;
	shipping_cost_currency: string;
	other_cost_original: number;
	other_cost_currency: string;
	item_count: number;
	total_qty_ordered: number;
	total_qty_received: number;
	total_estimated_base: number;
};

type ApiPurchaseOrderDetailItem = {
	id: string;
	purchase_order_id: string;
	product_id: string;
	product_name: string | null;
	product_sku: string | null;
	unit_name: string | null;
	qty_ordered: number;
	qty_received: number;
	unit_cost_purchase: number;
	unit_cost_base: number;
	landed_cost_per_unit: number;
	unit_id: string | null;
	multiplier_to_base: number;
	qty_base_ordered: number;
	qty_base_received: number;
};

type ApiPurchaseOrderDetailPayment = {
	id: string;
	purchase_order_id: string;
	store_id: string;
	entry_type: string;
	estimated_amount_base: number;
	amount_base: number;
	variance_base: number;
	paid_at: string;
	reference: string | null;
	note: string | null;
	reversed_payment_id: string | null;
	created_by: string | null;
	created_at: string;
};

type ReceiveLineForm = {
	itemId: string;
	productName: string;
	productSku: string | null;
	orderedQty: number;
	receivedQty: number;
	remainingQty: number;
	receiveQty: string;
};

type ApiPurchaseOrderDetail = {
	order: ApiPurchaseOrderListItem;
	items: ApiPurchaseOrderDetailItem[];
	payments: ApiPurchaseOrderDetailPayment[];
};

type ApiProduct = {
	id: string;
	store_id: string;
	sku: string;
	name: string;
	base_unit_id: string;
	cost_base: number;
	inventory_mode?: string;
};

type StoreRecord = {
	id: string;
	name: string;
	currency?: string;
};

type CreateLine = {
	id: string;
	productId: string;
	qtyOrdered: string;
	costMode: "unit" | "total";
	unitCost: string;
	lineTotalCost: string;
};

const { apiFetch } = useApiClient();
const { can, accessToken, currentUser, currentAccess, fetchMe, hydrateAuthState, currentStoreId, switchStore } = useAuthSession();
const appToast = useAppToast();
const route = useRoute();
const { t, locale } = useI18n();

const searchQuery = ref("");
const activeStatus = ref("all");
const activePaymentStatus = ref("all");

const orders = ref<ApiPurchaseOrderListItem[]>([]);
const ordersPending = ref(true);
const ordersError = ref<string | null>(null);

const products = ref<ApiProduct[]>([]);
const productsPending = ref(true);
const stores = ref<StoreRecord[]>([]);

const selectedOrderId = ref("");
const selectedOrderDetail = ref<ApiPurchaseOrderDetail | null>(null);
const purchaseOrderDetailCache = ref<Record<string, ApiPurchaseOrderDetail>>({});
// Holds the in-flight promise per order, not just its id: a prefetch already
// running must be awaitable, otherwise a detail open that lands mid-prefetch
// has nothing to show and the panel renders empty.
const purchaseOrderDetailRequests = new Map<string, Promise<ApiPurchaseOrderDetail | null>>();
const detailPending = ref(false);
const detailError = ref<string | null>(null);

const detailOpen = ref(false);
const receiveOpen = ref(false);
const receiveSaving = ref(false);
const paymentOpen = ref(false);
const paymentSaving = ref(false);
const purchaseOrderOrderedSaving = ref(false);
const receiveMode = ref<"now" | "partial" | "later">("now");
const receiveLines = ref<ReceiveLineForm[]>([]);
const paymentForm = reactive({
	exchangeRate: "1",
	shippingCost: "0",
	otherCost: "0",
	paymentReference: "",
	paymentNote: "",
	paidAt: "",
});
const createOpen = ref(false);
const purchaseOrderEditLoading = ref(false);
const purchaseOrderFormMode = ref<"create" | "edit">("create");
const editingPurchaseOrderId = ref<string | null>(null);
const purchaseOrderEditTargetStatus = ref<string>("");
const submitting = ref(false);
const authPermissionReady = ref(false);
const canCreatePurchaseOrder = computed(() => can("purchase_orders.create"));
const canUpdatePurchaseOrder = computed(() => can("purchase_orders.update"));
const canReceivePurchaseOrder = computed(() => can("purchase_orders.receive"));
const purchaseOrderCostOnlyEdit = computed(() => purchaseOrderFormMode.value === "edit" && purchaseOrderEditTargetStatus.value !== "draft");

const createForm = reactive({
	storeId: "",
	supplierName: "",
	supplierContact: "",
	purchaseCurrency: "LAK",
	exchangeRate: "1",
	shippingCost: "",
	otherCost: "",
	otherCostNote: "",
	expectedAt: "",
	note: "",
	createdBy: "",
	items: [] as CreateLine[],
});

const numberFormatter = computed(() => new Intl.NumberFormat(locale.value === "lo" ? "lo-LA" : locale.value === "en" ? "en-US" : "th-TH"));
const receiveQtyFormatter = computed(() => new Intl.NumberFormat(locale.value === "lo" ? "lo-LA" : locale.value === "en" ? "en-US" : "th-TH", { maximumFractionDigits: 0 }));
const appLocale = computed(() => locale.value as "th" | "lo" | "en");
const currentPage = ref(1);
const pageSize = ref(20);
const pageSizeOptions = [10, 20, 50];

const poFormText = computed(() => {
	if (locale.value === "en") return {
		optional: "(optional)", expectedAtSet: "Set an expected date", expectedAtUnset: "Not specified", rateLockedHint: "The PO uses {currency}, the same currency as the store, so the exchange rate is always 1 and cannot be edited.", store: "Store", restricted: "This status only allows rate, shipping, other costs, and notes to be edited.", poInfo: "PO information", poInfoHint: "Enter the supplier, currency, and expected delivery date.", supplier: "Supplier", supplierPlaceholder: "Supplier name", supplierContact: "Supplier contact", supplierContactPlaceholder: "Phone number or contact channel", currency: "Currency", expectedAt: "Expected delivery", extraCosts: "Exchange rate and additional costs", extraCostsHint: "Enter an estimated rate now and adjust it at final settlement.", extraCostsEditHint: "You can edit the rate, shipping, and other costs before receiving stock.", estimatedRate: "Estimated exchange rate", estimatedRatePlaceholder: "e.g. 1 or 21,500", estimatedRateHint: "If the rate is not known yet, keep the current value when creating the PO.", estimatedShipping: "Estimated shipping", estimatedShippingHint: "Enter the actual shipping cost after goods arrive.", estimatedOtherCost: "Estimated other costs", otherCostNote: "Other-cost note", otherCostNotePlaceholder: "e.g. fees, customs, handling", items: "Product items", itemsHint: "Add only products that will be received into stock.", itemsCostHint: "Enter actual costs from Lazada, Taobao, or the supplier for each item.", addItem: "Add item", product: "Product", loadingProducts: "Loading products…", selectProduct: "Select product", quantity: "Quantity", cost: "Cost", perUnit: "Per unit", total: "Total", totalCost: "Total cost", unitCostPlaceholder: "Enter the actual cost from the supplier", removeItem: "Remove item", note: "Note", notePlaceholder: "Additional details (optional)", cancel: "Cancel", saveCost: "Save costs", saveChanges: "Save changes", saveDraft: "Save draft", createPo: "Create PO", previewItems: "Items subtotal", previewCount: "{count} items", previewExtra: "Additional costs", previewShippingShort: "Shipping", previewOtherShort: "Other", previewTotal: "Grand total", previewPerUnit: "Additional cost per unit", previewPerUnitHint: "Shipping and other costs are spread evenly across every unit on this PO.", previewEmpty: "Enter a quantity and a cost to see the totals", previewRate: "rate {rate}", lineLanded: "Real cost/unit",
	};
	if (locale.value === "lo") return {
		optional: "(ບໍ່ບັງຄັບ)", expectedAtSet: "ລະບຸວັນຄາດວ່າຈະໄດ້ຮັບ", expectedAtUnset: "ບໍ່ລະບຸ", rateLockedHint: "ສະກຸນເງິນ PO ເປັນ {currency} ດຽວກັບຮ້ານ ອັດຕາແລກປ່ຽນຈຶ່ງເປັນ 1 ສະເໝີ ແກ້ໄຂບໍ່ໄດ້", store: "ຮ້ານ", restricted: "ສະຖານະນີ້ແກ້ໄຂໄດ້ສະເພາະອັດຕາແລກປ່ຽນ, ຄ່າຂົນສົ່ງ, ຄ່າໃຊ້ຈ່າຍອື່ນ ແລະ ໝາຍເຫດ.", poInfo: "ຂໍ້ມູນ PO", poInfoHint: "ລະບຸຜູ້ສະໜອງ, ສະກຸນເງິນ ແລະ ວັນຄາດວ່າຈະໄດ້ຮັບ.", supplier: "ຜູ້ສະໜອງ", supplierPlaceholder: "ຊື່ຜູ້ສະໜອງ", supplierContact: "ຂໍ້ມູນຕິດຕໍ່ຜູ້ສະໜອງ", supplierContactPlaceholder: "ເບີໂທ ຫຼື ຊ່ອງທາງຕິດຕໍ່", currency: "ສະກຸນເງິນ", expectedAt: "ວັນຄາດວ່າຈະໄດ້ຮັບ", extraCosts: "ອັດຕາແລກປ່ຽນ ແລະ ຄ່າໃຊ້ຈ່າຍເພີ່ມ", extraCostsHint: "ລະບຸອັດຕາໂດຍປະມານໄດ້ ແລະ ປັບຕອນປິດບິນຈິງ.", extraCostsEditHint: "ແກ້ໄຂອັດຕາ, ຄ່າຂົນສົ່ງ ແລະ ຄ່າອື່ນໄດ້ກ່ອນຮັບສິນຄ້າ.", estimatedRate: "ອັດຕາແລກປ່ຽນ (ປະມານ)", estimatedRatePlaceholder: "ເຊັ່ນ 1 ຫຼື 21500", estimatedRateHint: "ຖ້າຍັງບໍ່ຮູ້ອັດຕາ ໃຫ້ໃຊ້ຄ່າເດີມໄດ້.", estimatedShipping: "ຄ່າຂົນສົ່ງ (ປະມານ)", estimatedShippingHint: "ລະບຸຄ່າຂົນສົ່ງຈິງຫຼັງສິນຄ້າມາຮອດ.", estimatedOtherCost: "ຄ່າໃຊ້ຈ່າຍອື່ນ (ປະມານ)", otherCostNote: "ໝາຍເຫດຄ່າໃຊ້ຈ່າຍອື່ນ", otherCostNotePlaceholder: "ເຊັ່ນ ຄ່າທຳນຽມ, ພາສີ, ຄ່າດຳເນີນການ", items: "ລາຍການສິນຄ້າ", itemsHint: "ໃສ່ສະເພາະສິນຄ້າທີ່ຈະຮັບເຂົ້າສະຕັອກ.", itemsCostHint: "ລະບຸຕົ້ນທຶນຈິງຈາກ Lazada, Taobao ຫຼື ຜູ້ສະໜອງໃນແຕ່ລະລາຍການ.", addItem: "ເພີ່ມລາຍການ", product: "ສິນຄ້າ", loadingProducts: "ກຳລັງໂຫຼດສິນຄ້າ…", selectProduct: "ເລືອກສິນຄ້າ", quantity: "ຈຳນວນ", cost: "ຕົ້ນທຶນ", perUnit: "ຕໍ່ໜ່ວຍ", total: "ລວມ", totalCost: "ຕົ້ນທຶນລວມ", unitCostPlaceholder: "ລະບຸຕົ້ນທຶນຈິງຈາກຜູ້ສະໜອງ", removeItem: "ລົບລາຍການ", note: "ໝາຍເຫດ", notePlaceholder: "ລາຍລະອຽດເພີ່ມ (ຖ້າມີ)", cancel: "ຍົກເລີກ", saveCost: "ບັນທຶກຕົ້ນທຶນ", saveChanges: "ບັນທຶກການແກ້ໄຂ", saveDraft: "ບັນທຶກຮ່າງ", createPo: "ສ້າງ PO", previewItems: "ລວມຄ່າສິນຄ້າ", previewCount: "{count} ລາຍການ", previewExtra: "ຄ່າໃຊ້ຈ່າຍເພີ່ມ", previewShippingShort: "ຂົນສົ່ງ", previewOtherShort: "ອື່ນໆ", previewTotal: "ລວມທັງໝົດ", previewPerUnit: "ຄ່າໃຊ້ຈ່າຍເພີ່ມສະເລ່ຍຕໍ່ໜ່ວຍ", previewPerUnitHint: "ຄ່າຂົນສົ່ງ ແລະ ຄ່າໃຊ້ຈ່າຍອື່ນ ຖືກສະເລ່ຍຕາມຈຳນວນຫົວໜ່ວຍທັງໝົດໃນ PO ນີ້", previewEmpty: "ກອກຈຳນວນ ແລະ ຕົ້ນທຶນ ເພື່ອເບິ່ງຍອດລວມ", previewRate: "ອັດຕາ {rate}", lineLanded: "ຕົ້ນທຶນຈິງ/ໜ່ວຍ",
	};
	return { optional: "(ไม่บังคับ)", expectedAtSet: "ระบุวันคาดรับ", expectedAtUnset: "ไม่ระบุ", rateLockedHint: "สกุลเงิน PO เป็น {currency} เดียวกับร้าน อัตราแลกเปลี่ยนจึงเป็น 1 เสมอ แก้ไม่ได้", store: "ร้าน", restricted: "สถานะนี้แก้ได้เฉพาะ rate / shipping / other cost และหมายเหตุเท่านั้น", poInfo: "ข้อมูล PO", poInfoHint: "กรอก supplier, สกุลเงิน และวันคาดรับของ", supplier: "Supplier", supplierPlaceholder: "ชื่อ supplier", supplierContact: "Supplier contact", supplierContactPlaceholder: "เบอร์โทร/ช่องทางติดต่อ", currency: "Currency", expectedAt: "Expected at", extraCosts: "อัตราแลกเปลี่ยนและค่าใช้จ่ายเพิ่มเติม", extraCostsHint: "กรอก rate แบบประมาณได้ แล้วค่อยปรับตอน settle จริง", extraCostsEditHint: "แก้ rate / shipping / ค่าใช้จ่ายอื่นได้ก่อนรับของ", estimatedRate: "อัตราแลกเปลี่ยน (ประมาณ)", estimatedRatePlaceholder: "เช่น 1 หรือ 21500", estimatedRateHint: "ถ้ายังไม่รู้ rate ตอนสร้าง PO ให้ปล่อยค่าเดิมไว้ได้", estimatedShipping: "ค่าขนส่ง (ประมาณ)", estimatedShippingHint: "กรอกตอนรู้ค่าขนส่งจริงหลังของมาถึงได้", estimatedOtherCost: "ค่าใช้จ่ายอื่น (ประมาณ)", otherCostNote: "หมายเหตุค่าใช้จ่ายอื่น", otherCostNotePlaceholder: "เช่น ค่าธรรมเนียม, ภาษี, ค่าดำเนินการ", items: "รายการสินค้า", itemsHint: "ใส่เฉพาะสินค้าที่จะเข้าสต็อก", itemsCostHint: "กรอกต้นทุนจริงจาก Lazada / Taobao / Supplier ในแต่ละรายการ", addItem: "เพิ่มรายการ", product: "สินค้า", loadingProducts: "กำลังโหลดสินค้า...", selectProduct: "เลือกสินค้า", quantity: "จำนวน", cost: "ต้นทุน", perUnit: "ต่อหน่วย", total: "รวม", totalCost: "ต้นทุนรวม", unitCostPlaceholder: "กรอกราคาจริงจาก supplier", removeItem: "ลบรายการ", note: "หมายเหตุ", notePlaceholder: "รายละเอียดเพิ่มเติม (ถ้ามี)", cancel: "ยกเลิก", saveCost: "บันทึกต้นทุน", saveChanges: "บันทึกการแก้ไข", saveDraft: "บันทึก Draft", createPo: "สร้าง PO", previewItems: "รวมค่าสินค้า", previewCount: "{count} รายการ", previewExtra: "ค่าใช้จ่ายเพิ่ม", previewShippingShort: "ขนส่ง", previewOtherShort: "อื่นๆ", previewTotal: "รวมทั้งหมด", previewPerUnit: "ค่าใช้จ่ายเพิ่มเฉลี่ยต่อหน่วย", previewPerUnitHint: "ค่าขนส่งและค่าใช้จ่ายอื่นถูกเฉลี่ยตามจำนวนหน่วยทั้งหมดใน PO นี้", previewEmpty: "กรอกจำนวนและต้นทุนเพื่อดูยอดรวม", previewRate: "อัตรา {rate}", lineLanded: "ต้นทุนจริง/หน่วย", };
});

const poListText = computed(() => {
	if (locale.value === "en") return { eyebrow: "Purchasing", search: "Search PO number, supplier, or contact", clear: "Clear search", history: "PO history", reload: "Reload", create: "Create PO", open: "Open", pending: "Unpaid", estimated: "Estimated value", filters: "Filters", items: "{count} items", poStatus: "PO status", paymentStatus: "Payment status", allPayments: "All payment statuses", orders: "Purchase orders", ordersHint: "Select a PO to see product lines, payments, and total cost.", retry: "Try again", noOrders: "No purchase orders yet", supplier: "Supplier", status: "Status", payment: "Payment", lines: "Items", orderedQty: "Ordered", expected: "Expected", value: "Value", action: "Action", createdAt: "Created", unspecifiedSupplier: "Unspecified supplier", convertedBase: "Converted to base currency", manage: "Manage", perPage: "Per page", previousPage: "Previous page", previous: "Previous", nextPage: "Next page", next: "Next", unpaid: "Unpaid", partialPayment: "Partial", paid: "Paid" };
	if (locale.value === "lo") return { eyebrow: "ຈັດຊື້", search: "ຄົ້ນຫາເລກ PO, ຜູ້ສະໜອງ ຫຼື ຂໍ້ມູນຕິດຕໍ່", clear: "ລ້າງຄຳຄົ້ນຫາ", history: "ປະຫວັດ PO", reload: "ໂຫຼດໃໝ່", create: "ສ້າງ PO", open: "ເປີດຢູ່", pending: "ຄ້າງຊຳລະ", estimated: "ມູນຄ່າໂດຍປະມານ", filters: "ຕົວກອງ", items: "{count} ລາຍການ", poStatus: "ສະຖານະ PO", paymentStatus: "ສະຖານະການຊຳລະ", allPayments: "ທຸກການຊຳລະ", orders: "ໃບສັ່ງຊື້", ordersHint: "ເລືອກ PO ເພື່ອເບິ່ງລາຍການສິນຄ້າ, ການຊຳລະ ແລະ ຕົ້ນທຶນລວມ.", retry: "ລອງໃໝ່", noOrders: "ຍັງບໍ່ມີໃບສັ່ງຊື້", supplier: "ຜູ້ສະໜອງ", status: "ສະຖານະ", payment: "ຊຳລະ", lines: "ລາຍການ", orderedQty: "ສັ່ງລວມ", expected: "ຄາດຮັບ", value: "ມູນຄ່າ", action: "ຈັດການ", createdAt: "ສ້າງເມື່ອ", unspecifiedSupplier: "ບໍ່ລະບຸຜູ້ສະໜອງ", convertedBase: "ແປງເປັນສະກຸນຫຼັກ", manage: "ຈັດການ", perPage: "ຕໍ່ໜ້າ", previousPage: "ໜ້າກ່ອນ", previous: "ກ່ອນໜ້າ", nextPage: "ໜ້າຕໍ່ໄປ", next: "ຕໍ່ໄປ", unpaid: "ຍັງບໍ່ຊຳລະ", partialPayment: "ຊຳລະບາງສ່ວນ", paid: "ຊຳລະແລ້ວ" };
	return { eyebrow: "Purchase", search: "ค้นหาเลข PO, supplier หรือ contact", clear: "ล้างคำค้น", history: "ประวัติ PO", reload: "รีโหลด", create: "สร้าง PO", open: "เปิดอยู่", pending: "ค้างชำระ", estimated: "มูลค่าประมาณ", filters: "ตัวกรอง", items: "{count} รายการ", poStatus: "สถานะ PO", paymentStatus: "สถานะชำระเงิน", allPayments: "ทุกการชำระ", orders: "Purchase orders", ordersHint: "เลือก PO เพื่อดูรายการสินค้า, payment และต้นทุนรวมแบบละเอียด", retry: "ลองใหม่", noOrders: "ยังไม่มี purchase order", supplier: "Supplier", status: "สถานะ", payment: "ชำระ", lines: "รายการ", orderedQty: "สั่งรวม", expected: "คาดรับ", value: "มูลค่า", action: "Action", createdAt: "สร้างเมื่อ", unspecifiedSupplier: "ไม่ระบุ supplier", convertedBase: "แปลงเป็น base", manage: "จัดการ", perPage: "ต่อหน้า", previousPage: "หน้าก่อนหน้า", previous: "ก่อนหน้า", nextPage: "หน้าถัดไป", next: "ถัดไป", unpaid: "Unpaid", partialPayment: "Partial", paid: "Paid" };
});

const poDetailText = computed(() => {
	if (locale.value === "en") return { unspecifiedSupplier: "Unspecified supplier", edit: "Edit", editCost: "Edit costs", items: "{count} items", overview: "Overview", supplier: "Supplier", expected: "Expected delivery", totalCost: "Total cost", note: "Note", productItems: "Product items", paymentSummary: "Payment summary", loading: "Loading", estimated: "Estimated", actual: "Actual paid", variance: "Variance", retry: "Try again", copySupplier: "Copy supplier contact", copy: "Copy", baseUnit: "Base unit", ordered: "Ordered {count}", received: "Received {count}", remaining: "Remaining {count}", paymentItems: "{count} payments", lastPaid: "Last paid {date}", reference: "Reference", noPayments: "No payment entries", close: "Close", confirmOrder: "Confirm order", receiveStock: "Receive into stock", savePayment: "Record payment", costTitle: "PO cost", costGoods: "Goods", costShipping: "Shipping", costOther: "Other costs", costTotal: "Grand total", costPerUnit: "Additional cost per unit", costPerUnitHint: "Shipping and other costs are spread evenly across every unit on this PO, which is what each product cost becomes when the stock is received.", costLanded: "Real cost/unit", costRate: "rate {rate}", };
	if (locale.value === "lo") return { unspecifiedSupplier: "ບໍ່ລະບຸຜູ້ສະໜອງ", edit: "ແກ້ໄຂ", editCost: "ແກ້ໄຂຕົ້ນທຶນ", items: "{count} ລາຍການ", overview: "ສະຫຼຸບຂໍ້ມູນຫຼັກ", supplier: "ຜູ້ສະໜອງ", expected: "ຄາດຮັບ", totalCost: "ຕົ້ນທຶນລວມ", note: "ໝາຍເຫດ", productItems: "ລາຍການສິນຄ້າ", paymentSummary: "ສະຫຼຸບການຊຳລະ", loading: "ກຳລັງໂຫຼດ", estimated: "ປະມານ", actual: "ຊຳລະຈິງ", variance: "ສ່ວນຕ່າງ", retry: "ລອງໃໝ່", copySupplier: "ຄັດລອກຂໍ້ມູນຕິດຕໍ່ຜູ້ສະໜອງ", copy: "ຄັດລອກ", baseUnit: "ຫົວໜ່ວຍຫຼັກ", ordered: "ສັ່ງ {count}", received: "ຮັບແລ້ວ {count}", remaining: "ຄົງເຫຼືອ {count}", paymentItems: "{count} ລາຍການຊຳລະ", lastPaid: "ຊຳລະລ່າສຸດ {date}", reference: "ເລກອ້າງອີງ", noPayments: "ຍັງບໍ່ມີລາຍການຊຳລະ", close: "ປິດ", confirmOrder: "ຢືນຢັນສັ່ງຊື້", receiveStock: "ຮັບເຂົ້າສະຕັອກ", savePayment: "ບັນທຶກການຊຳລະ", costTitle: "ຕົ້ນທຶນ PO", costGoods: "ຄ່າສິນຄ້າ", costShipping: "ຄ່າຂົນສົ່ງ", costOther: "ຄ່າໃຊ້ຈ່າຍອື່ນ", costTotal: "ລວມທັງໝົດ", costPerUnit: "ຄ່າໃຊ້ຈ່າຍເພີ່ມສະເລ່ຍຕໍ່ໜ່ວຍ", costPerUnitHint: "ຄ່າຂົນສົ່ງ ແລະ ຄ່າໃຊ້ຈ່າຍອື່ນ ຖືກສະເລ່ຍຕາມຈຳນວນຫົວໜ່ວຍທັງໝົດ ແລະ ກາຍເປັນຕົ້ນທຶນສິນຄ້າຕອນຮັບເຂົ້າສະຕັອກ", costLanded: "ຕົ້ນທຶນຈິງ/ໜ່ວຍ", costRate: "ອັດຕາ {rate}", };
	return { unspecifiedSupplier: "ไม่ระบุ supplier", edit: "แก้ไข", editCost: "แก้ไขต้นทุน", items: "{count} รายการ", overview: "สรุปข้อมูลหลัก", supplier: "Supplier", expected: "คาดรับ", totalCost: "ต้นทุนรวม", note: "หมายเหตุ", productItems: "รายการสินค้า", paymentSummary: "สรุปชำระเงิน", loading: "กำลังโหลด", estimated: "ประมาณ", actual: "ชำระจริง", variance: "ส่วนต่าง", retry: "ลองใหม่", copySupplier: "คัดลอก contact supplier", copy: "คัดลอก", baseUnit: "หน่วยหลัก", ordered: "สั่ง {count}", received: "รับแล้ว {count}", remaining: "คงเหลือ {count}", paymentItems: "{count} รายการชำระ", lastPaid: "ชำระล่าสุด {date}", reference: "Reference", noPayments: "ยังไม่มี payment entry", close: "ปิด", confirmOrder: "ยืนยันสั่งซื้อ", receiveStock: "รับของเข้าสต็อก", savePayment: "บันทึกชำระเงิน", costTitle: "ต้นทุน PO", costGoods: "ค่าสินค้า", costShipping: "ค่าขนส่ง", costOther: "ค่าใช้จ่ายอื่น", costTotal: "รวมทั้งหมด", costPerUnit: "ค่าใช้จ่ายเพิ่มเฉลี่ยต่อหน่วย", costPerUnitHint: "ค่าขนส่งและค่าใช้จ่ายอื่นถูกเฉลี่ยตามจำนวนหน่วยทั้งหมด และกลายเป็นต้นทุนสินค้าตอนรับเข้าสต็อก", costLanded: "ต้นทุนจริง/หน่วย", costRate: "อัตรา {rate}", };
});

const poPaymentText = computed(() => {
	if (locale.value === "en") return { title: "Record payment", description: "Update the real rate, shipping, and other costs at settlement without changing the stock cost.", stockCostNote: "The stock cost stays as recorded when the goods were received; this screen only changes the real rate, shipping, and other costs at settlement.", unspecifiedSupplier: "Unspecified supplier", itemCount: "{count} items", settlementInfo: "Settlement details", settlementHint: "Adjust the rate, shipping, and other costs before recording the payment.", actualRate: "Actual exchange rate", actualRatePlaceholder: "e.g. 21,500", actualShipping: "Actual shipping", actualOtherCost: "Actual other costs", paidAt: "Payment date", reference: "Reference / document number", referencePlaceholder: "Invoice or reference number", note: "Payment note", notePlaceholder: "Additional details (optional)", settlementTotal: "Settlement total", variance: "Variance", status: "Status", matchesEstimate: "Matches the estimate", hasVariance: "Has a variance", cancel: "Cancel", submit: "Record payment" };
	if (locale.value === "lo") return { title: "ບັນທຶກຊຳລະເງິນ", description: "ອັບເດດອັດຕາ, ຄ່າຂົນສົ່ງ ແລະ ຄ່າໃຊ້ຈ່າຍຈິງຕອນປິດບິນ ໂດຍບໍ່ປ່ຽນຕົ້ນທຶນສິນຄ້າໃນສະຕັອກ.", stockCostNote: "ຕົ້ນທຶນສິນຄ້າໃນສະຕັອກຈະຄົງເດີມຫຼັງຢືນຢັນຮັບເຂົ້າສະຕັອກ ສ່ວນທີ່ແກ້ໃນໜ້ານີ້ຄືອັດຕາ, ຄ່າຂົນສົ່ງ ແລະ ຄ່າໃຊ້ຈ່າຍຈິງຕອນປິດບິນເທົ່ານັ້ນ", unspecifiedSupplier: "ບໍ່ລະບຸຜູ້ສະໜອງ", itemCount: "{count} ລາຍການ", settlementInfo: "ຂໍ້ມູນປິດບິນ", settlementHint: "ແກ້ອັດຕາ, ຄ່າຂົນສົ່ງ ແລະ ຄ່າໃຊ້ຈ່າຍຈິງໄດ້ກ່ອນບັນທຶກຊຳລະເງິນ", actualRate: "ອັດຕາແລກປ່ຽນຈິງ", actualRatePlaceholder: "ເຊັ່ນ 21500", actualShipping: "ຄ່າຂົນສົ່ງຈິງ", actualOtherCost: "ຄ່າໃຊ້ຈ່າຍອື່ນຈິງ", paidAt: "ວັນທີ່ຊຳລະ", reference: "Reference / ເລກທີ່ເອກະສານ", referencePlaceholder: "ເລກທີ່ບິນ / reference", note: "ໝາຍເຫດການຊຳລະ", notePlaceholder: "ລາຍລະອຽດເພີ່ມ (ຖ້າມີ)", settlementTotal: "ຍອດລວມປິດບິນ", variance: "ສ່ວນຕ່າງ", status: "ສະຖານະ", matchesEstimate: "ຕົງຕາມປະມານ", hasVariance: "ມີສ່ວນຕ່າງ", cancel: "ຍົກເລີກ", submit: "ບັນທຶກຊຳລະເງິນ" };
	return { title: "บันทึกชำระเงิน", description: "อัปเดต rate / shipping / ค่าใช้จ่ายจริงตอนปิดบิล โดยไม่เปลี่ยนต้นทุนสินค้าใน stock", stockCostNote: "ต้นทุนสินค้าใน stock จะคงเดิมหลังยืนยันรับเข้าสต็อก ส่วนที่แก้ในหน้านี้คือ rate / shipping / ค่าใช้จ่ายจริงตอนปิดบิลเท่านั้น", unspecifiedSupplier: "ไม่ระบุ supplier", itemCount: "{count} รายการ", settlementInfo: "ข้อมูลปิดบิล", settlementHint: "แก้ rate, shipping และค่าใช้จ่ายจริงได้ก่อนบันทึกชำระเงิน", actualRate: "อัตราแลกเปลี่ยนจริง", actualRatePlaceholder: "เช่น 21500", actualShipping: "ค่าขนส่งจริง", actualOtherCost: "ค่าใช้จ่ายอื่นจริง", paidAt: "วันที่ชำระ", reference: "Reference / เลขที่เอกสาร", referencePlaceholder: "เลขที่บิล / reference", note: "หมายเหตุชำระเงิน", notePlaceholder: "รายละเอียดเพิ่มเติม (ถ้ามี)", settlementTotal: "ยอดรวมปิดบิล", variance: "ส่วนต่าง", status: "สถานะ", matchesEstimate: "ตรงตามประมาณ", hasVariance: "มีส่วนต่าง", cancel: "ยกเลิก", submit: "บันทึกชำระเงิน" };
});

const poReceiveText = computed(() => {
	if (locale.value === "en") return { title: "Receive into stock", description: "Receive everything now, or receive part of it and come back for the rest later.", chooseMethod: "Choose how to receive", chooseMethodHint: "Pick the option that matches the situation, then confirm once.", badgeNow: "Receive all", badgePartial: "Receive part", badgeLater: "Awaiting stock", nowTitle: "Receive into stock now", nowHint: "Receive everything and update stock immediately.", partialTitle: "Receive part of it", partialHint: "Receive only what arrived, then come back for the rest.", laterTitle: "Not receiving yet", laterHint: "Keep the PO and mark it as awaiting stock.", summaryNow: "Everything still outstanding is received into stock immediately.", summaryPartial: "Enter the quantity actually received for each line, and that amount goes into stock.", summaryLater: "The PO is saved as awaiting stock and can be received later from this same dialog.", poDetails: "PO details", poNumber: "PO number", unspecifiedSupplier: "Unspecified supplier", linesAndUnits: "Items / units", linesAndUnitsValue: "{items} items · {units} units", receiveLineByLine: "Receive line by line", productItems: "Product items", lineSummary: "Ordered {ordered} · Received {received} · Remaining {remaining}", receiveQty: "Quantity received", cancel: "Cancel", confirmNow: "Confirm receipt into stock", confirmPartial: "Confirm partial receipt", confirmLater: "Save as awaiting stock" };
	if (locale.value === "lo") return { title: "ຮັບສິນຄ້າເຂົ້າສະຕັອກ", description: "ຮັບຄົບຕອນນີ້ ຫຼື ຮັບບາງສ່ວນແລ້ວກັບມາຮັບຕໍ່ພາຍຫຼັງໄດ້", chooseMethod: "ເລືອກວິທີຮັບສິນຄ້າ", chooseMethodHint: "ເລືອກແບບທີ່ຕົງກັບສະຖານະການຕອນນີ້ ແລ້ວກົດຢືນຢັນພຽງຄັ້ງດຽວ", badgeNow: "ຮັບຄົບ", badgePartial: "ຮັບບາງສ່ວນ", badgeLater: "ລໍຮັບສະຕັອກ", nowTitle: "ຮັບເຂົ້າສະຕັອກຕອນນີ້", nowHint: "ຮັບຄົບທັງໝົດ ແລະ ອັບເດດສະຕັອກທັນທີ", partialTitle: "ຮັບບາງສ່ວນ", partialHint: "ຮັບແຕ່ຈຳນວນທີ່ມາຮອດ ແລ້ວກັບມາຮັບຕໍ່ພາຍຫຼັງ", laterTitle: "ຍັງບໍ່ຮັບຕອນນີ້", laterHint: "ເກັບ PO ໄວ້ກ່ອນ ແລ້ວບັນທຶກເປັນລໍຮັບສະຕັອກ", summaryNow: "ລະບົບຈະຮັບຈຳນວນທີ່ຄ້າງທັງໝົດເຂົ້າສະຕັອກທັນທີ", summaryPartial: "ປ້ອນຈຳນວນຮັບຈິງໃນແຕ່ລະລາຍການ ແລ້ວລະບົບຈະຮັບເຂົ້າສະຕັອກຕາມຈຳນວນທີ່ໃສ່", summaryLater: "PO ຈະຖືກບັນທຶກເປັນລໍຮັບສະຕັອກ ແລະ ກັບມາຮັບພາຍຫຼັງໄດ້ຈາກໜ້ານີ້", poDetails: "ລາຍລະອຽດ PO", poNumber: "ເລກ PO", unspecifiedSupplier: "ບໍ່ລະບຸຜູ້ສະໜອງ", linesAndUnits: "ລາຍການ / ຫົວໜ່ວຍ", linesAndUnitsValue: "{items} ລາຍການ · {units} ຫົວໜ່ວຍ", receiveLineByLine: "ຮັບເຂົ້າສະຕັອກເທື່ອລະລາຍການ", productItems: "ລາຍການສິນຄ້າ", lineSummary: "ສັ່ງ {ordered} · ຮັບແລ້ວ {received} · ເຫຼືອ {remaining}", receiveQty: "ຮັບຈຳນວນ", cancel: "ຍົກເລີກ", confirmNow: "ຢືນຢັນຮັບເຂົ້າສະຕັອກ", confirmPartial: "ຢືນຢັນຮັບບາງສ່ວນ", confirmLater: "ບັນທຶກເປັນລໍຮັບສະຕັອກ" };
	return { title: "รับสินค้าเข้าสต็อก", description: "รับครบตอนนี้หรือรับบางส่วนแล้วกลับมารับต่อภายหลังได้", chooseMethod: "เลือกวิธีรับสินค้า", chooseMethodHint: "เลือกแบบที่ตรงกับสถานการณ์ตอนนี้ แล้วค่อยกดยืนยันเพียงครั้งเดียว", badgeNow: "รับครบ", badgePartial: "รับบางส่วน", badgeLater: "รอรับสต็อก", nowTitle: "รับเข้าสต็อกตอนนี้", nowHint: "รับครบทั้งหมดและอัปเดต stock ทันที", partialTitle: "รับบางส่วน", partialHint: "รับแค่จำนวนที่มาถึง แล้วกลับมารับต่อภายหลัง", laterTitle: "ยังไม่รับตอนนี้", laterHint: "เก็บ PO ไว้ก่อน แล้วบันทึกเป็นรอรับสต็อก", summaryNow: "ระบบจะรับจำนวนที่ค้างทั้งหมดเข้าสต็อกทันที", summaryPartial: "กรอกจำนวนรับจริงในแต่ละรายการ แล้วระบบจะรับเข้า stock ตามจำนวนที่ใส่", summaryLater: "PO จะถูกบันทึกเป็นรอรับสต็อก และกลับมารับภายหลังได้จาก modal เดิม", poDetails: "รายละเอียด PO", poNumber: "เลข PO", unspecifiedSupplier: "ไม่ระบุ supplier", linesAndUnits: "รายการ / หน่วย", linesAndUnitsValue: "{items} รายการ · {units} หน่วย", receiveLineByLine: "รับเข้าสต็อกทีละรายการ", productItems: "รายการสินค้า", lineSummary: "สั่ง {ordered} · รับแล้ว {received} · เหลือ {remaining}", receiveQty: "รับจำนวน", cancel: "ยกเลิก", confirmNow: "ยืนยันรับเข้าสต็อก", confirmPartial: "ยืนยันรับบางส่วน", confirmLater: "บันทึกเป็นรอรับสต็อก" };
});

let reloadTimer: ReturnType<typeof setTimeout> | null = null;
const selectedOrder = computed(() =>
	orders.value.find((order) => order.id === selectedOrderId.value) ?? null,
);

const totalOpenOrders = computed(() => orders.value.filter((order) => order.status !== "received" && order.status !== "cancelled").length);
const totalDraftOrders = computed(() => orders.value.filter((order) => order.status === "draft").length);
const totalPendingPayments = computed(() => orders.value.filter((order) => order.payment_status !== "paid").length);
const totalEstimated = computed(() => orders.value.reduce((sum, order) => sum + Number(order.total_estimated_base || 0), 0));
const totalPages = computed(() => Math.max(1, Math.ceil(orders.value.length / pageSize.value)));
const paginatedOrders = computed(() => {
	const startIndex = (currentPage.value - 1) * pageSize.value;
	return orders.value.slice(startIndex, startIndex + pageSize.value);
});
// Filtering happens on the server, so an empty list means either "nothing
// matched the filters" or "this store has no purchase orders at all".
const hasActiveFilters = computed(() => (
	Boolean(searchQuery.value.trim())
	|| activeStatus.value !== "all"
	|| activePaymentStatus.value !== "all"
));
const hasEmptyOrderList = computed(() => !ordersPending.value && !ordersError.value && orders.value.length === 0);

function clearOrderFilters() {
	searchQuery.value = "";
	activeStatus.value = "all";
	activePaymentStatus.value = "all";
}

const showReceiveLaterOption = computed(() => selectedOrderDetail.value?.order.status !== "arrived");
const paymentSettledBase = computed(() => {
	if (!selectedOrderDetail.value) return 0;
	const exchangeRate = paymentExchangeRateLocked.value ? 1 : (parseMoneyInputValue(paymentForm.exchangeRate) || 1);
	const shippingOriginal = parseMoneyInputValue(paymentForm.shippingCost) ?? 0;
	const otherOriginal = parseMoneyInputValue(paymentForm.otherCost) ?? 0;
	const itemsBase = selectedOrderDetail.value.items.reduce((sum, item) => sum + (Number(item.qty_ordered || 0) * Number(item.unit_cost_base || 0)), 0);
	return itemsBase + (shippingOriginal * exchangeRate) + (otherOriginal * exchangeRate);
});
const paymentVarianceBase = computed(() => {
	if (!selectedOrderDetail.value) return 0;
	return paymentSettledBase.value - Number(selectedOrderDetail.value.order.total_estimated_base || 0);
});
const effectiveStoreId = computed(() => (
	currentStoreId.value?.trim()
	|| createForm.storeId?.trim()
	|| products.value[0]?.store_id?.trim()
	|| orders.value[0]?.store_id?.trim()
	|| ""
));
const currentStoreName = computed(() => (
	stores.value.find((store) => store.id === effectiveStoreId.value)?.name
	|| t("purchaseOrdersPage.storeNotFound")
));
const storeCurrency = computed(() => (
	stores.value.find((store) => store.id === effectiveStoreId.value)?.currency?.trim()?.toUpperCase()
	|| "LAK"
));
// Buying in the store's own currency means there is nothing to convert, and
// every line cost is multiplied by this rate, so anything other than 1 would
// silently inflate the whole purchase order.
const exchangeRateLocked = computed(() => (
	String(createForm.purchaseCurrency || "").trim().toUpperCase() === storeCurrency.value
));
// Settlement reads the currency off the order being closed, not the create form.
const paymentExchangeRateLocked = computed(() => (
	String(selectedOrderDetail.value?.order.purchase_currency || "").trim().toUpperCase() === storeCurrency.value
));

// Mirrors the server's total_estimated_base formula (PurchaseOrderInterface
// findById) so the live preview and the saved order can never disagree:
// SUM(qty * unit_cost) + shipping + other, converted at the same rate.
const createTotals = computed(() => {
	const exchangeRate = exchangeRateLocked.value ? 1 : (parseMoneyInputValue(createForm.exchangeRate) || 1);

	let itemsOriginal = 0;
	let qtyTotal = 0;
	let pricedLines = 0;

	for (const line of createForm.items) {
		const lineTotal = getLineOriginalTotal(line);
		if (lineTotal === null) continue;
		itemsOriginal += lineTotal;
		qtyTotal += getLineQtyValue(line);
		pricedLines += 1;
	}

	const shippingOriginal = parseMoneyInputValue(createForm.shippingCost) ?? 0;
	const otherOriginal = parseMoneyInputValue(createForm.otherCost) ?? 0;
	const extraOriginal = shippingOriginal + otherOriginal;
	const totalOriginal = itemsOriginal + extraOriginal;

	return {
		// Showing 0 before anything is priced reads like the goods are free.
		ready: pricedLines > 0,
		pricedLines,
		qtyTotal,
		exchangeRate,
		shippingOriginal,
		otherOriginal,
		hasExtra: extraOriginal > 0,
		itemsOriginal,
		extraOriginal,
		totalOriginal,
		itemsBase: itemsOriginal * exchangeRate,
		extraBase: extraOriginal * exchangeRate,
		totalBase: totalOriginal * exchangeRate,
		// Receiving spreads freight evenly over every base unit on the PO
		// (PurchaseOrderInterface.receive), so this is the amount that will be
		// added to each unit's cost, not a display-only average.
		extraPerUnitBase: qtyTotal > 0 ? (extraOriginal * exchangeRate) / qtyTotal : 0,
	};
});
const pageLabel = computed(() => t("purchaseOrdersPage.pageLabel", { page: currentPage.value, total: totalPages.value }));
const pageStart = computed(() => (
	orders.value.length === 0
		? 0
		: ((currentPage.value - 1) * pageSize.value) + 1
));
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, orders.value.length));
const pageSummaryText = computed(() => (
	orders.value.length === 0
		? t("purchaseOrdersPage.noData")
		: t("purchaseOrdersPage.pageSummary", { start: pageStart.value, end: pageEnd.value, count: orders.value.length })
));
const selectedOrderPaymentSummary = computed(() => {
	if (!selectedOrderDetail.value?.payments.length) return null;
	const relevantPayments = selectedOrderDetail.value.payments.filter((payment) => payment.entry_type === "payment");
	if (!relevantPayments.length) return null;
	const estimatedAmountBase = relevantPayments.reduce((sum, payment) => sum + Number(payment.estimated_amount_base || 0), 0);
	const actualAmountBase = relevantPayments.reduce((sum, payment) => sum + Number(payment.amount_base || 0), 0);
	const varianceBase = relevantPayments.reduce((sum, payment) => sum + Number(payment.variance_base || 0), 0);
	return {
		count: relevantPayments.length,
		estimatedAmountBase,
		actualAmountBase,
		varianceBase,
		paidAt: relevantPayments[0]?.paid_at || null,
		reference: relevantPayments[0]?.reference || null,
		note: relevantPayments[0]?.note || null,
	};
});

// Splits the stored total back into its parts for the detail modal. The order
// only persists the combined total_estimated_base, so the goods subtotal is
// re-derived from the item rows the same way the server summed it.
//
// Freight is deliberately NOT read from purchase_order_items.landed_cost_per_unit:
// despite the name that column is only ever written as unit_cost_purchase *
// exchange_rate and never picks up shipping, so it equals unit_cost_base. The
// per-unit allocation below repeats what receive() actually does when it writes
// products.cost_base.
const selectedOrderCosts = computed(() => {
	const detail = selectedOrderDetail.value;
	if (!detail) return null;

	const shippingBase = Number(detail.order.shipping_cost || 0);
	const otherBase = Number(detail.order.other_cost || 0);
	const goodsBase = detail.items.reduce((sum, item) => sum + (Number(item.qty_ordered || 0) * Number(item.unit_cost_base || 0)), 0);
	const qtyBaseOrdered = detail.items.reduce((sum, item) => sum + (Number(item.qty_ordered || 0) * Number(item.multiplier_to_base || 1)), 0);
	const extraBase = shippingBase + otherBase;
	const exchangeRate = Number(detail.order.exchange_rate) > 0 ? Number(detail.order.exchange_rate) : 1;

	return {
		goodsBase,
		shippingBase,
		otherBase,
		extraBase,
		hasExtra: extraBase > 0,
		totalBase: goodsBase + extraBase,
		itemCount: detail.items.length,
		exchangeRate,
		isForeign: String(detail.order.purchase_currency || "").trim().toUpperCase() !== storeCurrency.value,
		purchaseCurrency: detail.order.purchase_currency || storeCurrency.value,
		otherCostNote: detail.order.other_cost_note || "",
		extraPerUnitBase: qtyBaseOrdered > 0 ? extraBase / qtyBaseOrdered : 0,
	};
});

// The unit cost this line actually contributes to products.cost_base once
// freight has been spread across the order.
function detailLandedUnitBase(item: ApiPurchaseOrderDetailItem) {
	return Number(item.unit_cost_base || 0) + (selectedOrderCosts.value?.extraPerUnitBase ?? 0);
}

const validStoreIdSet = computed(() => new Set(stores.value.map((store) => store.id)));
const isHistoryRoute = computed(() => route.path.startsWith("/purchase-orders/history"));

// "No expected date" is the default; the picker only appears once the user asks
// for it, so an empty datetime-local never sits there looking half-filled.
const expectedAtEnabled = ref(false);
watch(expectedAtEnabled, (enabled) => {
	if (!enabled) createForm.expectedAt = "";
});

// Keeps the stored rate honest whenever the currency selection changes, so a
// rate typed while the currencies differed cannot survive switching back.
watch(exchangeRateLocked, (locked) => {
	if (locked) createForm.exchangeRate = "1";
}, { immediate: true });

watch(paymentExchangeRateLocked, (locked) => {
	if (locked) paymentForm.exchangeRate = "1";
}, { immediate: true });

watch([searchQuery, activeStatus, activePaymentStatus], () => {
	currentPage.value = 1;
	if (reloadTimer) clearTimeout(reloadTimer);
	reloadTimer = setTimeout(() => {
		void loadOrders();
	}, 180);
});

watch(orders, (value) => {
	const maxPage = Math.max(1, Math.ceil(value.length / pageSize.value));
	if (currentPage.value > maxPage) {
		currentPage.value = maxPage;
	}
	if (!value.length) {
		selectedOrderId.value = "";
		detailOpen.value = false;
		return;
	}

	if (!value.some((order) => order.id === selectedOrderId.value)) {
		selectedOrderId.value = "";
		detailOpen.value = false;
	}
}, { immediate: true });

watch(pageSize, () => {
	currentPage.value = 1;
});

onMounted(() => {
	void ensurePurchaseOrderAuthPermissionReady();
	void Promise.all([loadOrders(), loadProducts(), loadStores()]);
});

onBeforeUnmount(() => {
	if (reloadTimer) clearTimeout(reloadTimer);
});

function showToast(message: string) {
	appToast.info({ title: message });
}

async function copyToClipboard(text: string, toastTitle: string) {
	const value = String(text || "").trim();
	if (!value) return;
	try {
		await navigator.clipboard.writeText(value);
		showToast(toastTitle);
	} catch {
		showToast(t("toastMessages.copyFailed"));
	}
}

async function copySupplierContact() {
	if (!selectedOrderDetail.value?.order.supplier_contact) return;
	await copyToClipboard(selectedOrderDetail.value.order.supplier_contact, t("toastMessages.copiedSupplierContact"));
}

async function ensurePurchaseOrderAuthPermissionReady() {
	hydrateAuthState();
	if (!accessToken.value) {
		authPermissionReady.value = true;
		return;
	}
	if (currentUser.value && currentAccess.value) {
		authPermissionReady.value = true;
		return;
	}
	try {
		await fetchMe();
	} catch {
		// permission resolution will fall back to hydrated state
	} finally {
		authPermissionReady.value = true;
	}
}

function formatMoney(value: number, currency = "THB") {
	return formatMoneyWithSymbol(value || 0, currency, { locale: "th-TH", maximumFractionDigits: 0 });
}

function formatPurchaseMoney(value: number, currency: string) {
	return formatMoneyWithSymbol(value || 0, currency || "LAK", { locale: "th-TH", maximumFractionDigits: 0 });
}

function formatPurchaseAmount(baseAmount: number, exchangeRate: number, currency: string) {
	const normalizedExchangeRate = Number(exchangeRate) > 0 ? Number(exchangeRate) : 1;
	const originalAmount = baseAmount / normalizedExchangeRate;
	return formatPurchaseMoney(originalAmount, currency);
}

function formatDate(value?: string | null) {
	if (!value) return "-";
	return formatAppDateTime(value, appLocale.value);
}

function toDatetimeLocalInput(value?: string | null) {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const timezoneOffset = date.getTimezoneOffset() * 60000;
	return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function statusColor(status: string) {
	if (status === "received") return "success";
	if (status === "ordered" || status === "shipped") return "info";
	if (status === "arrived") return "warning";
	if (status === "cancelled") return "error";
	return "warning";
}

function statusLabel(status: string) {
	if (status === "draft") return t("purchaseOrdersPage.draft");
	if (status === "ordered") return t("purchaseOrdersPage.ordered");
	if (status === "shipped") return t("purchaseOrdersPage.shipped");
	if (status === "arrived") return t("purchaseOrdersPage.arrived");
	if (status === "partial") return t("purchaseOrdersPage.partial");
	if (status === "received") return t("purchaseOrdersPage.received");
	if (status === "cancelled") return t("purchaseOrdersPage.cancelled");
	return status;
}

function paymentStatusColor(status: string) {
	if (status === "paid") return "success";
	if (status === "partial") return "warning";
	return "neutral";
}

function paymentStatusLabel(status: string) {
	if (status === "paid") return poListText.value.paid;
	if (status === "partial") return poListText.value.partialPayment;
	if (status === "unpaid") return poListText.value.unpaid;
	return status;
}

function productLabel(productId: string) {
	const product = products.value.find((item) => item.id === productId);
	return product ? `${product.name} · ${product.sku}` : "เลือกสินค้า";
}

function parseMoneyInputValue(value: string | number | null | undefined) {
	const rawValue = String(value ?? "").trim().replace(/,/g, "");
	if (!rawValue) return null;
	const parsed = Number(rawValue);
	return Number.isFinite(parsed) ? parsed : null;
}

// Blank for zero so the field shows its "0" placeholder instead of a literal
// zero the user has to delete before typing.
function formatOptionalMoneyInputValue(value: number) {
	return Number.isFinite(value) && value !== 0 ? formatMoneyInputValue(value) : "";
}

function formatMoneyInputValue(value: number) {
	if (!Number.isFinite(value)) return "";
	// Grouped so the derived side of the unit/total pair reads the same as the
	// side being typed; parseMoneyInputValue strips the separators again.
	return new Intl.NumberFormat("en-US", {
		useGrouping: true,
		maximumFractionDigits: 2,
	}).format(value);
}

function getLineQtyValue(line: CreateLine) {
	const parsed = Number(String(line.qtyOrdered ?? "").replace(/[^\d.-]/g, ""));
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function syncLineCostFields(line: CreateLine) {
	const qty = getLineQtyValue(line);
	const unitCost = parseMoneyInputValue(line.unitCost);
	const totalCost = parseMoneyInputValue(line.lineTotalCost);

	if (!qty) {
		line.lineTotalCost = "";
		if (line.costMode === "total") {
			line.unitCost = "";
		}
		return;
	}

	if (line.costMode === "total") {
		if (totalCost === null) {
			line.unitCost = "";
			return;
		}
		line.unitCost = formatMoneyInputValue(totalCost / qty);
		return;
	}

	if (unitCost === null) {
		line.lineTotalCost = "";
		return;
	}

	line.lineTotalCost = formatMoneyInputValue(unitCost * qty);
}

function handleLineQtyInput(line: CreateLine, value: string | number) {
	line.qtyOrdered = String(value ?? "");
	syncLineCostFields(line);
}

function handleLineUnitCostInput(line: CreateLine, value: string | number) {
	line.unitCost = normalizeMoneyTyping(String(value ?? ""), { maxDecimals: 2 });
	line.costMode = "unit";
	syncLineCostFields(line);
}

function handleLineTotalCostInput(line: CreateLine, value: string | number) {
	line.lineTotalCost = normalizeMoneyTyping(String(value ?? ""), { maxDecimals: 2 });
	line.costMode = "total";
	syncLineCostFields(line);
}

function setLineCostMode(line: CreateLine, mode: "unit" | "total") {
	if (line.costMode === mode) return;
	line.costMode = mode;
	syncLineCostFields(line);
}

// The purchase-currency total for one line, computed the same way submitCreate
// builds unit_cost_purchase so the preview matches what gets posted. In "total"
// mode the typed total is authoritative; line.unitCost is a rounded echo of it.
function getLineOriginalTotal(line: CreateLine) {
	const qty = getLineQtyValue(line);
	if (!qty) return null;

	if (line.costMode === "total") {
		return parseMoneyInputValue(line.lineTotalCost);
	}

	const unitCost = parseMoneyInputValue(line.unitCost);
	return unitCost === null ? null : unitCost * qty;
}

function lineUnitCostOriginal(line: CreateLine) {
	const qty = getLineQtyValue(line);
	const lineTotal = getLineOriginalTotal(line);
	if (!qty || lineTotal === null) return null;
	return lineTotal / qty;
}

// "100 x 11,000 = 1,100,000" under the input, so a mistyped extra digit is
// obvious before the PO is saved.
function lineBreakdownText(line: CreateLine) {
	const qty = getLineQtyValue(line);
	const unitCost = lineUnitCostOriginal(line);
	const lineTotal = getLineOriginalTotal(line);
	if (!qty || unitCost === null || lineTotal === null) return "";
	return `${receiveQtyFormatter.value.format(qty)} x ${formatMoneyInputValue(unitCost)} = ${formatMoneyInputValue(lineTotal)}`;
}

// What this product's cost_base actually becomes once freight is allocated.
function lineLandedUnitBase(line: CreateLine) {
	const unitCost = lineUnitCostOriginal(line);
	if (unitCost === null) return null;
	return (unitCost * createTotals.value.exchangeRate) + createTotals.value.extraPerUnitBase;
}

function addLine() {
	createForm.items.push({
		id: crypto.randomUUID(),
		productId: "",
		qtyOrdered: "1",
		costMode: "unit",
		unitCost: "",
		lineTotalCost: "",
	});
}

function removeLine(lineId: string) {
	createForm.items = createForm.items.filter((line) => line.id !== lineId);
}

function resetPurchaseOrderForm() {
	createForm.storeId = effectiveStoreId.value;
	createForm.supplierName = "";
	createForm.supplierContact = "";
	createForm.purchaseCurrency = "LAK";
	createForm.exchangeRate = "1";
	createForm.shippingCost = "";
	createForm.otherCost = "";
	createForm.otherCostNote = "";
	createForm.expectedAt = "";
	expectedAtEnabled.value = false;
	createForm.note = "";
	createForm.createdBy = currentUser.value?.id || "";
	createForm.items = [];
	addLine();
}

function openCreateDrawer() {
	purchaseOrderFormMode.value = "create";
	editingPurchaseOrderId.value = null;
	purchaseOrderEditTargetStatus.value = "";
	purchaseOrderEditLoading.value = false;
	resetPurchaseOrderForm();
	createOpen.value = true;
	detailOpen.value = false;
}

function closeCreateDrawer() {
	createOpen.value = false;
	if (purchaseOrderFormMode.value === "edit" && selectedOrderId.value) {
		detailOpen.value = true;
	}
	purchaseOrderFormMode.value = "create";
	editingPurchaseOrderId.value = null;
	purchaseOrderEditTargetStatus.value = "";
	purchaseOrderEditLoading.value = false;
}

function hydratePurchaseOrderForm(detail: ApiPurchaseOrderDetail) {
	const exchangeRate = Number(detail.order.exchange_rate || 1) || 1;
	createForm.storeId = detail.order.store_id;
	createForm.supplierName = detail.order.supplier_name || "";
	createForm.supplierContact = detail.order.supplier_contact || "";
	createForm.purchaseCurrency = detail.order.purchase_currency || "LAK";
	createForm.exchangeRate = String(detail.order.exchange_rate_initial || exchangeRate || 1);
	createForm.shippingCost = formatOptionalMoneyInputValue(Number(detail.order.shipping_cost_original ?? (detail.order.shipping_cost / exchangeRate) ?? 0));
	createForm.otherCost = formatOptionalMoneyInputValue(Number(detail.order.other_cost_original ?? (detail.order.other_cost / exchangeRate) ?? 0));
	createForm.otherCostNote = detail.order.other_cost_note || "";
	createForm.expectedAt = toDatetimeLocalInput(detail.order.expected_at);
	expectedAtEnabled.value = Boolean(createForm.expectedAt);
	createForm.note = detail.order.note || "";
	createForm.createdBy = detail.order.created_by || currentUser.value?.id || "";
	createForm.items = detail.items.map((item) => ({
		id: crypto.randomUUID(),
		productId: item.product_id,
		qtyOrdered: String(item.qty_ordered),
		costMode: "unit",
		unitCost: formatMoneyInputValue(Number(item.unit_cost_purchase || 0)),
		lineTotalCost: formatMoneyInputValue(Number(item.unit_cost_purchase || 0) * Number(item.qty_ordered || 0)),
	}));
	if (!createForm.items.length) {
		addLine();
	}
}

async function openEditDrawer(orderId?: string) {
	const targetOrderId = orderId
		|| selectedOrderDetail.value?.order.id
		|| selectedOrderId.value
		|| selectedOrder.value?.id
		|| "";
	if (!targetOrderId) return;

	const targetOrder = selectedOrderDetail.value?.order
		?? selectedOrder.value
		?? purchaseOrderDetailCache.value[targetOrderId]?.order
		?? null;
	if (!targetOrder || targetOrder.status === "received" || targetOrder.status === "cancelled") return;

	purchaseOrderFormMode.value = "edit";
	editingPurchaseOrderId.value = targetOrder.id;
	purchaseOrderEditTargetStatus.value = targetOrder.status;
	detailOpen.value = false;
	purchaseOrderEditLoading.value = true;
	await nextTick();
	createOpen.value = true;

	const cachedDetail = purchaseOrderDetailCache.value[targetOrderId];
	if (cachedDetail) {
		selectedOrderDetail.value = cachedDetail;
		hydratePurchaseOrderForm(cachedDetail);
		purchaseOrderEditLoading.value = false;
		return;
	}

	void loadOrderDetail(targetOrderId)
		.then(() => {
			if (purchaseOrderFormMode.value !== "edit" || editingPurchaseOrderId.value !== targetOrderId || !selectedOrderDetail.value) return;
			hydratePurchaseOrderForm(selectedOrderDetail.value);
		})
		.finally(() => {
			if (editingPurchaseOrderId.value === targetOrderId) {
				purchaseOrderEditLoading.value = false;
			}
		});
}

function openDetail(orderId: string) {
	selectedOrderId.value = orderId;
	createOpen.value = false;
	detailOpen.value = true;
	const cachedDetail = purchaseOrderDetailCache.value[orderId];
	if (cachedDetail) {
		selectedOrderDetail.value = cachedDetail;
		detailError.value = null;
		detailPending.value = false;
	}
	void loadOrderDetail(orderId);
}

function closeDetail() {
	detailOpen.value = false;
	selectedOrderId.value = "";
	selectedOrderDetail.value = null;
	receiveOpen.value = false;
	paymentOpen.value = false;
	receiveMode.value = "now";
	receiveLines.value = [];
	receiveSaving.value = false;
	paymentSaving.value = false;
}

function openReceiveFlow() {
	if (!selectedOrderDetail.value || selectedOrderDetail.value.order.status === "received" || selectedOrderDetail.value.order.status === "cancelled") return;
	receiveMode.value = "now";
	receiveLines.value = selectedOrderDetail.value.items.map((item) => {
		const orderedQty = Number(item.qty_ordered || 0);
		const receivedQty = Number(item.qty_received || 0);
		const remainingQty = Math.max(0, orderedQty - receivedQty);
		return {
			itemId: item.id,
			productName: item.product_name || item.product_sku || "ไม่ระบุสินค้า",
			productSku: item.product_sku || null,
			orderedQty,
			receivedQty,
			remainingQty,
			receiveQty: receiveQtyFormatter.value.format(remainingQty),
		};
	});
	receiveOpen.value = true;
}

function fillAllReceiveNow() {
	receiveLines.value = receiveLines.value.map((line) => ({
		...line,
		receiveQty: receiveQtyFormatter.value.format(line.remainingQty),
	}));
}

function selectReceiveMode(mode: typeof receiveMode.value) {
	receiveMode.value = mode;
	if (mode === "now") {
		fillAllReceiveNow();
		return;
	}
	if (mode === "partial") {
		receiveLines.value = receiveLines.value.map((line) => ({
			...line,
			receiveQty: receiveQtyFormatter.value.format(Math.max(0, Math.min(parseReceiveQty(line.receiveQty), line.remainingQty))),
		}));
	}
}

function parseReceiveQty(value: string | number | null | undefined) {
	const rawValue = String(value ?? "").replace(/\s+/g, "").replace(/,/g, "");
	const normalized = rawValue.replace(/\D/g, "");
	return Number(normalized || 0);
}

function formatReceiveQty(value: string | number | null | undefined) {
	return receiveQtyFormatter.value.format(Math.max(0, parseReceiveQty(value)));
}

function handleReceiveQtyInput(line: ReceiveLineForm, value: string | number) {
	const nextValue = formatReceiveQty(value);
	if (line.receiveQty !== nextValue) {
		line.receiveQty = nextValue;
	}
}

function setReceiveQtyToMax(line: ReceiveLineForm) {
	line.receiveQty = receiveQtyFormatter.value.format(line.remainingQty);
}

async function confirmReceiveAllNow() {
	selectReceiveMode("now");
	await nextTick();
	await confirmReceiveSelectedOrder();
}

async function confirmReceiveSelectedOrder() {
	if (!selectedOrderDetail.value) return;
	if (receiveMode.value === "later") {
		await confirmMarkPurchaseOrderArrived();
		return;
	}
	if (receiveMode.value === "now") {
		fillAllReceiveNow();
		await nextTick();
	}
	const payloadItems = receiveLines.value
		.map((line) => ({
			item_id: line.itemId,
			qty_received: parseReceiveQty(line.receiveQty),
		}))
		.filter((line) => Number.isFinite(line.qty_received) && line.qty_received > 0);
	if (!payloadItems.length) {
		showToast(t("toastMessages.receiveQuantityRequired"));
		return;
	}
	receiveSaving.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<ApiPurchaseOrderDetail>>(`/purchase-orders/${selectedOrderDetail.value.order.id}/receive`, {
			method: "POST",
			body: { items: payloadItems },
		});
		selectedOrderDetail.value = response.data;
		purchaseOrderDetailCache.value[response.data.order.id] = response.data;
		showToast(t("toastMessages.stockReceived"));
		receiveOpen.value = false;
		await loadOrders();
	} catch (err) {
		showToast(err instanceof Error ? err.message : t("toastMessages.stockReceiveFailed"));
	} finally {
		receiveSaving.value = false;
	}
}

async function confirmMarkPurchaseOrderArrived() {
	if (!selectedOrderDetail.value) return;
	receiveSaving.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<ApiPurchaseOrderDetail>>(`/purchase-orders/${selectedOrderDetail.value.order.id}/arrived`, {
			method: "POST",
		});
		selectedOrderDetail.value = response.data;
		purchaseOrderDetailCache.value[response.data.order.id] = response.data;
		showToast(t("toastMessages.pendingStockSaved"));
		receiveOpen.value = false;
		await loadOrders();
	} catch (err) {
		showToast(err instanceof Error ? err.message : t("toastMessages.pendingStockSaveFailed"));
	} finally {
		receiveSaving.value = false;
	}
}

async function confirmMarkPurchaseOrderOrdered() {
	if (!selectedOrderDetail.value || selectedOrderDetail.value.order.status !== "draft") return;
	purchaseOrderOrderedSaving.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<ApiPurchaseOrderDetail>>(`/purchase-orders/${selectedOrderDetail.value.order.id}/ordered`, {
			method: "POST",
		});
		selectedOrderDetail.value = response.data;
		purchaseOrderDetailCache.value[response.data.order.id] = response.data;
		showToast(t("toastMessages.purchaseConfirmed"));
		await loadOrders();
	} catch (err) {
		showToast(err instanceof Error ? err.message : t("toastMessages.purchaseConfirmFailed"));
	} finally {
		purchaseOrderOrderedSaving.value = false;
	}
}

function resetPaymentForm() {
	if (!selectedOrderDetail.value) return;
	const exchangeRate = Number(selectedOrderDetail.value.order.exchange_rate || 1) || 1;
	paymentForm.exchangeRate = String(selectedOrderDetail.value.order.exchange_rate_initial || exchangeRate || 1);
	paymentForm.shippingCost = String(selectedOrderDetail.value.order.shipping_cost_original ?? (selectedOrderDetail.value.order.shipping_cost / exchangeRate) ?? 0);
	paymentForm.otherCost = String(selectedOrderDetail.value.order.other_cost_original ?? (selectedOrderDetail.value.order.other_cost / exchangeRate) ?? 0);
	paymentForm.paymentReference = selectedOrderDetail.value.order.payment_reference || "";
	paymentForm.paymentNote = selectedOrderDetail.value.order.payment_note || "";
	paymentForm.paidAt = toDatetimeLocalInput(new Date().toISOString());
}

function openPaymentFlow() {
	if (!selectedOrderDetail.value) return;
	if (selectedOrderDetail.value.order.status === "draft" || selectedOrderDetail.value.order.status === "ordered" || selectedOrderDetail.value.order.status === "arrived" || selectedOrderDetail.value.order.status === "cancelled") return;
	resetPaymentForm();
	paymentOpen.value = true;
}

function closePaymentFlow() {
	paymentOpen.value = false;
	paymentSaving.value = false;
}

async function submitPaymentSettlement() {
	if (!selectedOrderDetail.value) return;
	const payload = {
		exchange_rate: paymentExchangeRateLocked.value ? 1 : (parseMoneyInputValue(paymentForm.exchangeRate) ?? 1),
		shipping_cost: parseMoneyInputValue(paymentForm.shippingCost) ?? 0,
		other_cost: parseMoneyInputValue(paymentForm.otherCost) ?? 0,
		payment_reference: paymentForm.paymentReference || null,
		payment_note: paymentForm.paymentNote || null,
		paid_at: paymentForm.paidAt ? new Date(paymentForm.paidAt).toISOString() : null,
	};

	paymentSaving.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<ApiPurchaseOrderDetail>>(`/purchase-orders/${selectedOrderDetail.value.order.id}/settle`, {
			method: "POST",
			body: payload,
		});
		selectedOrderDetail.value = response.data;
		purchaseOrderDetailCache.value[response.data.order.id] = response.data;
		showToast(t("toastMessages.paymentSaved"));
		paymentOpen.value = false;
		await loadOrders();
	} catch (err) {
		showToast(err instanceof Error ? err.message : t("toastMessages.paymentSaveFailed"));
	} finally {
		paymentSaving.value = false;
	}
}

function goToPage(page: number) {
	currentPage.value = Math.min(Math.max(page, 1), totalPages.value);
}

function updatePageSize(value: string) {
	const normalizedSize = Number(value);
	if (!Number.isFinite(normalizedSize) || normalizedSize <= 0 || normalizedSize === pageSize.value) return;
	pageSize.value = normalizedSize;
}

async function loadOrders() {
	ordersPending.value = true;
	ordersError.value = null;

	try {
		const params = new URLSearchParams();
		if (searchQuery.value.trim()) params.set("query", searchQuery.value.trim());
		if (activeStatus.value !== "all") params.set("status", activeStatus.value);
		if (activePaymentStatus.value !== "all") params.set("payment_status", activePaymentStatus.value);

		const response = await apiFetch<ApiEnvelope<ApiPurchaseOrderListItem[]>>(
			`/purchase-orders${params.toString() ? `?${params.toString()}` : ""}`,
		);
		orders.value = response.data;
		void prefetchOrderDetails(response.data.slice(0, 2).map((order) => order.id));
	} catch (err) {
		ordersError.value = err instanceof Error ? err.message : "โหลด purchase orders ไม่สำเร็จ";
	} finally {
		ordersPending.value = false;
	}
}

async function loadProducts() {
	productsPending.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<ApiProduct[]>>("/products");
		products.value = response.data.filter((product) => product.inventory_mode !== "untracked");
		if (!createForm.storeId) {
			createForm.storeId = response.data[0]?.store_id || "";
		}
	} finally {
		productsPending.value = false;
	}
}

async function loadStores() {
	try {
		const response = await apiFetch<ApiEnvelope<StoreRecord[]>>("/stores");
		stores.value = response.data;
		await syncActiveStoreSelection(response.data);
	} catch {
		stores.value = [];
	}
}

async function syncActiveStoreSelection(storeRecords: StoreRecord[]) {
	const persistedStoreId = currentStoreId.value?.trim() || "";
	if (persistedStoreId) {
		// A partial or delayed store list must never change the user's active store.
		createForm.storeId = persistedStoreId;
		return;
	}

	const availableStoreId = storeRecords[0]?.id || "";
	if (!availableStoreId) return;

	await switchStore(availableStoreId);
	createForm.storeId = availableStoreId;
}

function fetchOrderDetail(id: string) {
	const inFlight = purchaseOrderDetailRequests.get(id);
	if (inFlight) return inFlight;

	const request = apiFetch<ApiEnvelope<ApiPurchaseOrderDetail>>(`/purchase-orders/${id}`)
		.then((response) => {
			purchaseOrderDetailCache.value[id] = response.data;
			return response.data;
		})
		.finally(() => {
			purchaseOrderDetailRequests.delete(id);
		});

	purchaseOrderDetailRequests.set(id, request);
	return request;
}

async function loadOrderDetail(id: string) {
	detailPending.value = true;
	detailError.value = null;

	try {
		const detail = await fetchOrderDetail(id);
		// The user may have moved on to another order while this was in flight.
		if (detail && selectedOrderId.value === id) selectedOrderDetail.value = detail;
	} catch (err) {
		detailError.value = err instanceof Error ? err.message : "โหลดรายละเอียด PO ไม่สำเร็จ";
	} finally {
		detailPending.value = false;
	}
}

async function prefetchOrderDetails(orderIds: string[]) {
	const uniqueOrderIds = Array.from(new Set(orderIds)).filter((id) => !!id && !purchaseOrderDetailCache.value[id]);
	if (!uniqueOrderIds.length) return;

	// Ignore prefetch failures; opening the order will surface the error properly.
	await Promise.allSettled(uniqueOrderIds.map((id) => fetchOrderDetail(id)));
}

function buildPurchaseOrderPayload(status: "draft" | "ordered", includeCreator = true) {
	return {
		store_id: createForm.storeId,
		supplier_name: createForm.supplierName || null,
		supplier_contact: createForm.supplierContact || null,
		purchase_currency: createForm.purchaseCurrency,
		// These read from grouped inputs ("1,000"), which Number() turns into
		// NaN, so they go through the comma-stripping parser instead.
		exchange_rate: parseMoneyInputValue(createForm.exchangeRate) ?? 1,
		exchange_rate_initial: parseMoneyInputValue(createForm.exchangeRate) ?? 1,
		shipping_cost: parseMoneyInputValue(createForm.shippingCost) ?? 0,
		shipping_cost_original: parseMoneyInputValue(createForm.shippingCost) ?? 0,
		shipping_cost_currency: createForm.purchaseCurrency,
		other_cost: parseMoneyInputValue(createForm.otherCost) ?? 0,
		other_cost_original: parseMoneyInputValue(createForm.otherCost) ?? 0,
		other_cost_currency: createForm.purchaseCurrency,
		other_cost_note: createForm.otherCostNote || null,
		expected_at: createForm.expectedAt ? new Date(createForm.expectedAt).toISOString() : null,
		note: createForm.note || null,
		status,
		...(includeCreator
			? {
					created_by: currentUser.value?.id || createForm.createdBy || null,
				}
			: {}),
		items: createForm.items.map((line) => ({
			product_id: line.productId,
			qty_ordered: Number(line.qtyOrdered),
			unit_cost_purchase: line.costMode === "total"
				? (() => {
					const qty = getLineQtyValue(line);
					const totalCost = parseMoneyInputValue(line.lineTotalCost) ?? 0;
					return qty > 0 ? totalCost / qty : 0;
				})()
				: (parseMoneyInputValue(line.unitCost) ?? 0),
		})),
	};
}

async function submitCreate(status: "draft" | "ordered") {
	createForm.items.forEach((line) => syncLineCostFields(line));

	if (!createForm.storeId || !validStoreIdSet.value.has(createForm.storeId)) {
		showToast(t("toastMessages.createStoreMissing"));
		return;
	}

	if (!createForm.items.length || createForm.items.some((line) => !line.productId || !line.qtyOrdered)) {
		showToast(t("toastMessages.productQuantityRequired"));
		return;
	}

	if (currentStoreId.value !== createForm.storeId) {
		try {
			await switchStore(createForm.storeId);
		} catch {
			currentStoreId.value = createForm.storeId;
		}
	}

	submitting.value = true;
	try {
		const payload = buildPurchaseOrderPayload(status);
		const response = await apiFetch<ApiEnvelope<ApiPurchaseOrderDetail>>("/purchase-orders", {
			method: "POST",
			body: payload,
		});

		showToast(t(status === "draft" ? "toastMessages.draftSaved" : "toastMessages.purchaseOrderCreated"));
		createOpen.value = false;
		await loadOrders();
		openDetail(response.data.order.id);
	} catch (err) {
		showToast(err instanceof Error ? err.message : t(status === "draft" ? "toastMessages.draftSaveFailed" : "toastMessages.purchaseOrderCreateFailed"));
	} finally {
		submitting.value = false;
	}
}

async function submitEditPurchaseOrder() {
	if (!editingPurchaseOrderId.value) return;
	createForm.items.forEach((line) => syncLineCostFields(line));

	if (!createForm.storeId || !validStoreIdSet.value.has(createForm.storeId)) {
		showToast(t("toastMessages.editStoreMissing"));
		return;
	}

	if (!createForm.items.length || createForm.items.some((line) => !line.productId || !line.qtyOrdered)) {
		showToast(t("toastMessages.productQuantityRequired"));
		return;
	}

	if (currentStoreId.value !== createForm.storeId) {
		try {
			await switchStore(createForm.storeId);
		} catch {
			currentStoreId.value = createForm.storeId;
		}
	}

	submitting.value = true;
	try {
		const payload = {
			...buildPurchaseOrderPayload("draft", false),
			updated_by: currentUser.value?.id || null,
		};
		const response = await apiFetch<ApiEnvelope<ApiPurchaseOrderDetail>>(`/purchase-orders/${editingPurchaseOrderId.value}`, {
			method: "PATCH",
			body: payload,
		});

		showToast(t("toastMessages.purchaseOrderUpdated"));
		createOpen.value = false;
		purchaseOrderFormMode.value = "create";
		editingPurchaseOrderId.value = null;
		purchaseOrderEditLoading.value = false;
		await loadOrders();
		openDetail(response.data.order.id);
	} catch (err) {
		showToast(err instanceof Error ? err.message : t("toastMessages.purchaseOrderUpdateFailed"));
	} finally {
		submitting.value = false;
		purchaseOrderEditLoading.value = false;
	}
}
</script>

<template>
	<NuxtPage v-if="isHistoryRoute" />
	<AppSidebarShell
		v-else
		:nav-items="appNavItems"
		:active-ids="['purchase']"
		:sidebar-eyebrow="poListText.eyebrow"
		:sidebar-title="t('purchaseOrdersPage.title')"
		sidebar-compact-title="PO"
		:sidebar-description="t('purchaseOrdersPage.sidebarDescription')"
	>
			<template #default="{ openSidebar }">
				<div class="grid gap-3 pb-3 lg:gap-4">
					<AppPageHeader
						title=""
						compact
						:description="t('purchaseOrdersPage.headerDescription')"
						@menu="openSidebar"
					>
						<div class="ml-auto grid w-full grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 pt-0.5 sm:pt-1 lg:w-auto lg:grid-cols-[minmax(320px,1fr)_auto_auto_auto] lg:justify-end">
							<div class="relative min-w-0">
								<UInput
									v-model="searchQuery"
									size="lg"
									icon="i-heroicons-magnifying-glass-20-solid"
									:placeholder="poListText.search"
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
									:aria-label="poListText.clear"
									:title="poListText.clear"
									@click="searchQuery = ''"
								/>
							</div>

							<AppButton
								color="neutral"
								variant="soft"
								size="md"
								icon="i-heroicons-clock-20-solid"
								class="justify-center rounded-md"
								:aria-label="poListText.history"
								:title="poListText.history"
								@click="navigateTo('/purchase-orders/history')"
							>
								<span class="hidden sm:inline">{{ poListText.history }}</span>
							</AppButton>

							<AppButton
								color="neutral"
								variant="soft"
								size="md"
								icon="i-heroicons-arrow-path-20-solid"
								class="justify-center rounded-md"
								:loading="ordersPending"
								:disabled="ordersPending"
								:spin-icon-on-loading="true"
								:aria-label="poListText.reload"
								:title="poListText.reload"
								@click="loadOrders"
							>
								<span class="hidden sm:inline">{{ poListText.reload }}</span>
							</AppButton>

									<AppButton
										color="primary"
										variant="solid"
										size="md"
										icon="i-heroicons-plus-20-solid"
										class="justify-center rounded-md"
										:disabled="!authPermissionReady || !canCreatePurchaseOrder"
										:aria-label="poListText.create"
										:title="poListText.create"
										@click="openCreateDrawer"
									>
								<span class="hidden sm:inline">{{ poListText.create }}</span>
							</AppButton>
						</div>
					</AppPageHeader>

					<UCard
						class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md"
						:ui="{ body: 'p-1.5 sm:p-2 lg:p-2.5' }"
					>
						<div class="grid grid-cols-3 gap-1.5 p-0 sm:grid-cols-4">
							<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{{ poListText.open }}</p>
								<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">{{ numberFormatter.format(totalOpenOrders) }}</p>
							</div>
							<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Draft</p>
								<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">{{ numberFormatter.format(totalDraftOrders) }}</p>
							</div>
							<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{{ poListText.pending }}</p>
								<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">{{ numberFormatter.format(totalPendingPayments) }}</p>
							</div>
							<div class="col-span-3 min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center sm:col-span-1">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{{ poListText.estimated }}</p>
								<p class="mt-1 truncate text-base font-semibold text-stone-950 tabular-nums">{{ formatMoney(totalEstimated, storeCurrency) }}</p>
							</div>
						</div>
					</UCard>

					<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">{{ poListText.filters }}</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									{{ poListText.items.replace('{count}', numberFormatter.format(orders.length)) }}
								</div>
							</div>

								<div class="grid gap-2 px-4 py-3">
									<div class="grid grid-cols-2 gap-2 md:items-end">
										<div class="min-w-0">
											<label class="mb-1 block whitespace-nowrap text-[10px] font-medium text-stone-500 sm:text-[11px]">{{ poListText.poStatus }}</label>
											<div class="relative">
												<select
													v-model="activeStatus"
													class="w-full appearance-none rounded-md border border-neutral-200 bg-white px-3 py-2.5 pr-8 text-xs font-medium text-stone-800 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200 sm:px-4 sm:text-sm"
												>
													<option value="all">{{ t('purchaseOrdersPage.allStatuses') }}</option>
													<option value="draft">{{ t('purchaseOrdersPage.draft') }}</option>
													<option value="ordered">{{ t('purchaseOrdersPage.ordered') }}</option>
													<option value="shipped">{{ t('purchaseOrdersPage.shipped') }}</option>
													<option value="arrived">{{ t('purchaseOrdersPage.arrived') }}</option>
													<option value="received">{{ t('purchaseOrdersPage.received') }}</option>
													<option value="cancelled">{{ t('purchaseOrdersPage.cancelled') }}</option>
												</select>
												<UIcon name="i-heroicons-chevron-up-down" class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
											</div>
										</div>

										<div class="min-w-0">
											<label class="mb-1 block whitespace-nowrap text-[10px] font-medium text-stone-500 sm:text-[11px]">{{ poListText.paymentStatus }}</label>
											<div class="relative">
												<select
													v-model="activePaymentStatus"
													class="w-full appearance-none rounded-md border border-neutral-200 bg-white px-3 py-2.5 pr-8 text-xs font-medium text-stone-800 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200 sm:px-4 sm:text-sm"
												>
													<option value="all">{{ poListText.allPayments }}</option>
													<option value="unpaid">{{ poListText.unpaid }}</option>
													<option value="partial">{{ poListText.partialPayment }}</option>
													<option value="paid">{{ poListText.paid }}</option>
												</select>
												<UIcon name="i-heroicons-chevron-up-down" class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
											</div>
										</div>
									</div>
								</div>

								<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-y border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">{{ poListText.orders }}</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">{{ poListText.ordersHint }}</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									{{ poListText.items.replace('{count}', numberFormatter.format(orders.length)) }}
								</div>
							</div>

								<div class="min-h-0 flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
									<div v-if="ordersPending" class="min-h-[280px]">
										<AppInlineLoadingBar container-class="bg-neutral-100" />
									</div>
									<div v-else-if="ordersError" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center">
										<div class="space-y-3">
											<p class="text-sm text-stone-600">{{ ordersError }}</p>
											<AppButton color="primary" variant="soft" size="md" class="rounded-md" @click="loadOrders">{{ poListText.retry }}</AppButton>
										</div>
									</div>
									<div v-else-if="hasEmptyOrderList" class="flex h-full min-h-[55vh] flex-col items-center justify-center px-4 text-center">
										<span class="flex size-11 items-center justify-center rounded-md border border-neutral-200 bg-white text-primary-600 shadow-sm">
											<UIcon :name="hasActiveFilters ? 'i-heroicons-magnifying-glass' : 'i-heroicons-clipboard-document-list'" class="size-5" />
										</span>
										<h2 class="mt-3 font-semibold text-stone-900">
											{{ hasActiveFilters ? $t('purchaseOrdersPage.noFilterMatch') : poListText.noOrders }}
										</h2>
										<p class="mt-1 max-w-md text-sm leading-6 text-stone-500">
											{{ hasActiveFilters
												? $t('purchaseOrdersPage.noFilterMatchHint')
												: (canCreatePurchaseOrder ? $t('purchaseOrdersPage.noOrdersHint') : $t('purchaseOrdersPage.noOrdersHintReadOnly')) }}
										</p>
										<AppButton
											v-if="hasActiveFilters"
											class="mt-4 rounded-md"
											color="neutral"
											variant="soft"
											size="md"
											icon="i-heroicons-x-mark-20-solid"
											@click="clearOrderFilters"
										>
											{{ poListText.clear }}
										</AppButton>
										<AppButton
											v-else-if="canCreatePurchaseOrder"
											class="mt-4 rounded-md"
											color="primary"
											variant="solid"
											size="md"
											icon="i-heroicons-plus-20-solid"
											:disabled="!authPermissionReady"
											@click="openCreateDrawer"
										>
											{{ poListText.create }}
										</AppButton>
									</div>
									<table v-else class="min-w-[1120px] w-full border-separate border-spacing-0">
										<thead class="sticky top-0 z-10 bg-[#fcfbf8] dark:bg-[#221d18]">
											<tr class="text-left text-xs font-medium uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">PO</th>
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ poListText.supplier }}</th>
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ poListText.status }}</th>
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ poListText.payment }}</th>
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ poListText.lines }}</th>
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ poListText.orderedQty }}</th>
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ poListText.expected }}</th>
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ poListText.value }}</th>
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 text-right dark:border-[#3a332a] dark:bg-[#221d18]">{{ poListText.action }}</th>
											</tr>
										</thead>
										<tbody>
											<tr
												v-for="order in paginatedOrders"
												:key="order.id"
												class="cursor-pointer text-sm text-stone-700 transition hover:bg-primary-50"
												:class="selectedOrderId === order.id ? 'bg-primary-50' : 'bg-white'"
												@pointerenter="prefetchOrderDetails([order.id])"
												@click="openDetail(order.id)"
											>
												<td class="border-b border-[#f1ede6] px-4 py-4">
													<p class="font-semibold text-stone-950">{{ order.po_number }}</p>
													<p class="mt-1 text-xs text-stone-400">{{ poListText.createdAt }} {{ formatDate(order.created_at) }}</p>
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-4">
													<p class="font-medium text-stone-900">{{ order.supplier_name || poListText.unspecifiedSupplier }}</p>
													<p v-if="order.supplier_contact" class="mt-1 text-xs text-stone-500">{{ order.supplier_contact }}</p>
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-4">
													<UBadge :color="statusColor(order.status)" variant="soft" :label="statusLabel(order.status)" />
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-4">
											<UBadge :color="paymentStatusColor(order.payment_status)" variant="soft" :label="paymentStatusLabel(order.payment_status)" />
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-900 tabular-nums">
													{{ numberFormatter.format(order.item_count) }}
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-900 tabular-nums">
													{{ numberFormatter.format(order.total_qty_ordered) }}
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600">
													{{ formatDate(order.expected_at) }}
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-4">
													<div class="text-right">
														<p class="font-semibold text-stone-950 tabular-nums">
															{{ formatPurchaseAmount(order.total_estimated_base, order.exchange_rate, order.purchase_currency) }}
														</p>
														<p class="mt-1 text-xs text-stone-500">
															{{ formatMoney(order.total_estimated_base, storeCurrency) }} · {{ poListText.convertedBase }}
														</p>
													</div>
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-4 text-right">
													<AppButton
														color="neutral"
														variant="soft"
														size="md"
														class="rounded-md"
														icon="i-heroicons-chevron-right-20-solid"
														@click.stop="prefetchOrderDetails([order.id]); openDetail(order.id)"
													>
														{{ poListText.manage }}
													</AppButton>
												</td>
											</tr>
										</tbody>
									</table>
								</div>

							<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.96)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
								<div class="flex flex-col gap-2.5 sm:gap-3 md:flex-row md:items-center md:justify-between">
									<div class="flex items-center justify-between gap-3 md:min-w-0 md:flex-1">
										<div class="min-w-0 text-xs text-stone-500 sm:text-sm">
											<span class="sm:hidden">{{ pageSummaryText }}</span>
											<span class="hidden sm:inline">{{ pageLabel }} • {{ pageSummaryText }}</span>
										</div>
										<div class="shrink-0 rounded-md bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-stone-600 sm:hidden">
											{{ pageLabel }}
										</div>
									</div>

									<div class="flex items-center justify-between gap-2 sm:flex-wrap sm:justify-end md:flex-nowrap md:justify-end">
										<div class="flex items-center gap-2">
											<label class="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">{{ poListText.perPage }}</label>
											<select
												:value="pageSize"
												class="min-w-[68px] rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-sm text-stone-700 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
												@change="updatePageSize(($event.target as HTMLSelectElement).value)"
											>
												<option v-for="option in pageSizeOptions" :key="option" :value="option">
													{{ option }}
												</option>
											</select>
										</div>

										<div class="flex items-center gap-2">
											<AppButton
												color="neutral"
												variant="soft"
												size="md"
												class="rounded-md"
												icon="i-heroicons-chevron-left-20-solid"
												:disabled="currentPage <= 1 || ordersPending"
												:aria-label="poListText.previousPage"
												:title="poListText.previousPage"
												@click="goToPage(currentPage - 1)"
											>
												<span class="hidden sm:inline">{{ poListText.previous }}</span>
											</AppButton>
											<AppButton
												color="neutral"
												variant="soft"
												size="md"
												class="rounded-md"
												icon="i-heroicons-chevron-right-20-solid"
												:disabled="currentPage >= totalPages || ordersPending"
												:aria-label="poListText.nextPage"
												:title="poListText.nextPage"
												@click="goToPage(currentPage + 1)"
											>
												<span class="hidden sm:inline">{{ poListText.next }}</span>
											</AppButton>
										</div>
									</div>
								</div>
							</div>
						</div>
						</div>
					</div>

					<AppResponsivePanel
						v-model="detailOpen"
						:title="t('purchaseOrdersPage.poDetails')"
						:description="t('purchaseOrdersPage.poDetailsDescription')"
					desktop-width="680px"
					close-button-size="md"
					compact-header
					full-bleed-header
					content-class="flex h-full flex-col !overflow-y-hidden overflow-hidden"
					@close="closeDetail"
				>
					<template #default>
						<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
							<div class="scrollbar-soft min-h-0 space-y-3 overflow-y-auto px-0 py-2 sm:px-0 sm:py-2">
							<div v-if="selectedOrder" class="relative rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<div class="flex items-start gap-3">
								<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700 ring-1 ring-primary-200">
									<UIcon name="i-heroicons-clipboard-document-list" class="h-5 w-5" />
								</div>
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-start justify-between gap-3">
										<div class="min-w-0">
											<h3 class="truncate text-base font-semibold text-stone-950">{{ selectedOrder.po_number }}</h3>
											<p class="mt-1 truncate text-sm text-stone-500">{{ selectedOrder.supplier_name || poDetailText.unspecifiedSupplier }}</p>
										</div>
										<div class="flex shrink-0 flex-wrap items-center gap-2">
											<UBadge :color="statusColor(selectedOrder.status)" variant="soft" :label="statusLabel(selectedOrder.status)" />
											<AppButton
												v-if="selectedOrder.status !== 'received' && selectedOrder.status !== 'cancelled'"
												color="neutral"
												variant="soft"
												size="sm"
												icon="i-heroicons-pencil-square-20-solid"
												class="rounded-md"
												:disabled="!authPermissionReady || !canUpdatePurchaseOrder"
												@click="openEditDrawer(selectedOrder.id)"
											>
												{{ selectedOrder.status === 'draft' ? poDetailText.edit : poDetailText.editCost }}
											</AppButton>
										</div>
									</div>
									<div class="mt-3 flex flex-wrap gap-2">
										<UBadge :color="paymentStatusColor(selectedOrder.payment_status)" variant="soft" :label="paymentStatusLabel(selectedOrder.payment_status)" />
										<UBadge color="neutral" variant="soft" :label="getCurrencySymbol(selectedOrder.purchase_currency) || selectedOrder.purchase_currency" />
										<UBadge color="neutral" variant="soft" :label="poDetailText.items.replace('{count}', String(selectedOrder.item_count))" />
									</div>
									<div v-if="detailPending" class="pointer-events-none absolute inset-x-0 bottom-0">
										<AppInlineLoadingBar minimal container-class="bg-transparent" />
									</div>
								</div>
							</div>
						</div>

							<template v-if="detailPending">
								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<h3 class="text-sm font-semibold text-stone-950">{{ poDetailText.overview }}</h3>
									<dl class="mt-4 space-y-3 text-sm">
										<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
											<dt class="text-stone-500">{{ poDetailText.supplier }}</dt>
											<dd class="text-right font-medium text-stone-900">-</dd>
										</div>
										<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
											<dt class="text-stone-500">{{ poDetailText.expected }}</dt>
											<dd class="text-right font-medium text-stone-900">-</dd>
										</div>
										<div class="flex items-start justify-between gap-4">
											<dt class="text-stone-500">{{ poDetailText.note }}</dt>
											<dd class="max-w-[220px] text-right font-medium text-stone-900">-</dd>
										</div>
									</dl>
								</div>

								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<div class="flex items-center justify-between gap-2">
										<h3 class="text-sm font-semibold text-stone-950">{{ poDetailText.productItems }}</h3>
									</div>
									<div class="mt-4 space-y-3">
										<div v-for="index in 2" :key="index" class="min-h-[72px] rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200" />
									</div>
								</div>

								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<div class="flex items-center justify-between gap-2">
										<h3 class="text-sm font-semibold text-stone-950">{{ poDetailText.paymentSummary }}</h3>
										<UBadge color="neutral" variant="soft" :label="poDetailText.loading" />
									</div>
									<div class="mt-4 grid gap-3 sm:grid-cols-3">
										<div class="rounded-md border border-neutral-200 bg-white px-4 py-3">
											<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">{{ poDetailText.estimated }}</p>
											<p class="mt-2 text-base font-semibold text-stone-950">-</p>
										</div>
										<div class="rounded-md border border-neutral-200 bg-white px-4 py-3">
											<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">{{ poDetailText.actual }}</p>
											<p class="mt-2 text-base font-semibold text-stone-950">-</p>
										</div>
										<div class="rounded-md border border-neutral-200 bg-white px-4 py-3">
											<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">{{ poDetailText.variance }}</p>
											<p class="mt-2 text-base font-semibold text-stone-950">-</p>
										</div>
									</div>
									<div class="mt-4 space-y-3">
										<div v-for="index in 2" :key="index" class="min-h-[64px] rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200" />
									</div>
								</div>
							</template>
							<UCard v-else-if="detailError" class="border border-dashed border-[#f1c7c0] bg-[#fff7f5] shadow-none">
								<div class="space-y-3 py-10 text-center">
									<p class="text-sm text-stone-600">{{ detailError }}</p>
									<AppButton color="primary" variant="soft" size="md" class="rounded-md" @click="selectedOrderId && loadOrderDetail(selectedOrderId)">{{ poDetailText.retry }}</AppButton>
								</div>
							</UCard>
							<template v-else-if="selectedOrderDetail">
								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<h3 class="text-sm font-semibold text-stone-950">{{ poDetailText.overview }}</h3>
									<dl class="mt-4 space-y-3 text-sm">
										<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
											<dt class="text-stone-500">{{ poDetailText.supplier }}</dt>
											<dd class="text-right font-medium text-stone-900">
												{{ selectedOrderDetail.order.supplier_name || "-" }}
												<div v-if="selectedOrderDetail.order.supplier_contact" class="mt-2 flex items-center justify-end gap-2">
													<span class="text-xs font-normal text-stone-500">{{ selectedOrderDetail.order.supplier_contact }}</span>
													<AppButton
														color="neutral"
														variant="soft"
														size="xs"
														icon="i-heroicons-clipboard-document-20-solid"
														class="rounded-md"
														type="button"
															:title="poDetailText.copySupplier"
														@click="copySupplierContact"
													>
														{{ poDetailText.copy }}
													</AppButton>
												</div>
											</dd>
										</div>
										<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
											<dt class="text-stone-500">{{ poDetailText.expected }}</dt>
											<dd class="text-right font-medium text-stone-900">{{ formatDate(selectedOrderDetail.order.expected_at) }}</dd>
										</div>
										<div class="flex items-start justify-between gap-4">
											<dt class="text-stone-500">{{ poDetailText.note }}</dt>
											<dd class="max-w-[220px] text-right font-medium text-stone-900">{{ selectedOrderDetail.order.note || "-" }}</dd>
										</div>
									</dl>
								</div>

								<div v-if="selectedOrderCosts" class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<h3 class="text-sm font-semibold text-stone-950">{{ poDetailText.costTitle }}</h3>
									<dl class="mt-4 space-y-2.5 text-sm tabular-nums">
										<div class="flex items-start justify-between gap-4">
											<dt class="text-stone-500">
												{{ poDetailText.costGoods }}
												<span class="text-stone-400">{{ poDetailText.items.replace('{count}', String(selectedOrderCosts.itemCount)) }}</span>
											</dt>
											<dd class="text-right font-medium text-stone-900">{{ formatMoney(selectedOrderCosts.goodsBase, storeCurrency) }}</dd>
										</div>
										<div class="flex items-start justify-between gap-4">
											<dt :class="selectedOrderCosts.shippingBase > 0 ? 'text-stone-500' : 'text-stone-400'">{{ poDetailText.costShipping }}</dt>
											<dd :class="selectedOrderCosts.shippingBase > 0 ? 'text-right font-medium text-stone-900' : 'text-right font-medium text-stone-400'">{{ formatMoney(selectedOrderCosts.shippingBase, storeCurrency) }}</dd>
										</div>
										<div class="flex items-start justify-between gap-4">
											<dt :class="selectedOrderCosts.otherBase > 0 ? 'text-stone-500' : 'text-stone-400'">
												{{ poDetailText.costOther }}
												<span v-if="selectedOrderCosts.otherCostNote" class="block max-w-[220px] text-xs leading-4 text-stone-400">{{ selectedOrderCosts.otherCostNote }}</span>
											</dt>
											<dd :class="selectedOrderCosts.otherBase > 0 ? 'text-right font-medium text-stone-900' : 'text-right font-medium text-stone-400'">{{ formatMoney(selectedOrderCosts.otherBase, storeCurrency) }}</dd>
										</div>
										<div class="flex items-baseline justify-between gap-4 border-t border-[#ece6dc] pt-2.5">
											<dt class="text-sm font-semibold text-stone-950">{{ poDetailText.costTotal }}</dt>
											<dd class="text-right">
												<span class="text-base font-semibold text-stone-950">{{ formatMoney(selectedOrderCosts.totalBase, storeCurrency) }}</span>
												<span v-if="selectedOrderCosts.isForeign" class="mt-0.5 block text-xs font-normal text-stone-500">
													{{ formatPurchaseAmount(selectedOrderCosts.totalBase, selectedOrderCosts.exchangeRate, selectedOrderCosts.purchaseCurrency) }}
													· {{ poDetailText.costRate.replace('{rate}', numberFormatter.format(selectedOrderCosts.exchangeRate)) }}
												</span>
											</dd>
										</div>
										<div v-if="selectedOrderCosts.extraPerUnitBase > 0" class="flex items-start justify-between gap-4 text-xs">
											<dt class="text-stone-500" :title="poDetailText.costPerUnitHint">{{ poDetailText.costPerUnit }}</dt>
											<dd class="text-right font-medium text-primary-700">+{{ formatMoney(selectedOrderCosts.extraPerUnitBase, storeCurrency) }}</dd>
										</div>
									</dl>
								</div>

								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<div class="flex items-center justify-between gap-2">
										<h3 class="text-sm font-semibold text-stone-950">{{ poDetailText.productItems }}</h3>
										<UBadge color="neutral" variant="soft" :label="poDetailText.items.replace('{count}', String(selectedOrderDetail.items.length))" />
									</div>
									<div class="mt-4 space-y-3">
										<div v-for="item in selectedOrderDetail.items" :key="item.id" class="rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200">
											<div class="flex items-start justify-between gap-3">
												<div class="min-w-0">
													<p class="truncate text-sm font-semibold text-stone-900">{{ item.product_name || item.product_id }}</p>
														<p class="mt-1 text-xs text-stone-500">{{ item.product_sku || "-" }} · {{ item.unit_name || poDetailText.baseUnit }}</p>
												</div>
												<div class="shrink-0 text-right">
													<p class="text-sm font-semibold text-stone-900">{{ formatMoney(item.unit_cost_base, storeCurrency) }}</p>
													<p v-if="(selectedOrderCosts?.extraPerUnitBase ?? 0) > 0" class="mt-0.5 text-xs text-primary-700">
														{{ poDetailText.costLanded }} {{ formatMoney(detailLandedUnitBase(item), storeCurrency) }}
													</p>
												</div>
											</div>
											<div class="mt-3 flex flex-wrap gap-2">
												<UBadge color="neutral" variant="soft" :label="poDetailText.ordered.replace('{count}', numberFormatter.format(item.qty_ordered))" />
												<UBadge color="neutral" variant="soft" :label="poDetailText.received.replace('{count}', numberFormatter.format(item.qty_received))" />
												<UBadge color="neutral" variant="soft" :label="poDetailText.remaining.replace('{count}', numberFormatter.format(Math.max(0, item.qty_ordered - item.qty_received)))" />
											</div>
										</div>
									</div>
								</div>

								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<div class="flex items-center justify-between gap-2">
										<h3 class="text-sm font-semibold text-stone-950">{{ poDetailText.paymentSummary }}</h3>
										<UBadge :color="paymentStatusColor(selectedOrderDetail.order.payment_status)" variant="soft" :label="paymentStatusLabel(selectedOrderDetail.order.payment_status)" />
									</div>
									<div class="mt-4 grid gap-3 sm:grid-cols-3">
										<div class="rounded-md border border-neutral-200 bg-white px-4 py-3">
											<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">{{ poDetailText.estimated }}</p>
											<p class="mt-2 text-base font-semibold text-stone-950">{{ formatMoney(selectedOrderDetail.order.total_estimated_base, storeCurrency) }}</p>
										</div>
										<div class="rounded-md border border-neutral-200 bg-white px-4 py-3">
											<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">{{ poDetailText.actual }}</p>
											<p class="mt-2 text-base font-semibold text-stone-950">
												{{ formatMoney(selectedOrderPaymentSummary?.actualAmountBase ?? 0, storeCurrency) }}
											</p>
										</div>
										<div class="rounded-md border border-neutral-200 bg-white px-4 py-3">
											<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">{{ poDetailText.variance }}</p>
											<p
												class="mt-2 text-base font-semibold"
												:class="(selectedOrderPaymentSummary?.varianceBase || 0) === 0
													? 'text-stone-950'
													: (selectedOrderPaymentSummary?.varianceBase || 0) > 0
														? 'text-amber-600'
														: 'text-emerald-600'"
											>
												{{ formatMoney(Math.abs(selectedOrderPaymentSummary?.varianceBase || 0), storeCurrency) }}
											</p>
										</div>
									</div>
									<div v-if="selectedOrderPaymentSummary" class="mt-4 rounded-md border border-neutral-200 bg-white px-4 py-4">
										<div class="flex flex-wrap items-center gap-2">
											<UBadge color="neutral" variant="soft" :label="poDetailText.paymentItems.replace('{count}', String(selectedOrderPaymentSummary.count))" />
											<UBadge color="neutral" variant="soft" :label="poDetailText.lastPaid.replace('{date}', formatDate(selectedOrderPaymentSummary.paidAt))" />
											<UBadge v-if="selectedOrderPaymentSummary.reference" color="neutral" variant="soft" :label="selectedOrderPaymentSummary.reference" />
										</div>
										<p v-if="selectedOrderPaymentSummary.note" class="mt-3 text-sm leading-6 text-stone-600">
											{{ selectedOrderPaymentSummary.note }}
										</p>
									</div>
									<div v-if="selectedOrderDetail.payments.length" class="mt-4 space-y-3">
										<div v-for="payment in selectedOrderDetail.payments" :key="payment.id" class="rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200">
											<div class="flex flex-wrap items-start justify-between gap-3">
												<div class="min-w-0">
													<p class="text-sm font-semibold text-stone-900">{{ payment.entry_type }}</p>
													<p class="mt-1 text-xs text-stone-500">{{ formatDate(payment.paid_at) }}</p>
													<div class="mt-2 flex flex-wrap gap-2">
														<UBadge color="neutral" variant="soft" :label="`${poDetailText.estimated} ${formatMoney(payment.estimated_amount_base, storeCurrency)}`" />
														<UBadge color="neutral" variant="soft" :label="`${poDetailText.actual} ${formatMoney(payment.amount_base, storeCurrency)}`" />
														<UBadge
															:color="payment.variance_base === 0 ? 'neutral' : payment.variance_base > 0 ? 'warning' : 'success'"
															variant="soft"
															:label="`${poDetailText.variance} ${formatMoney(Math.abs(payment.variance_base), storeCurrency)}`"
														/>
													</div>
													<div v-if="payment.reference || payment.note" class="mt-3 space-y-1 text-xs text-stone-500">
														<p v-if="payment.reference">{{ poDetailText.reference }}: {{ payment.reference }}</p>
														<p v-if="payment.note">{{ poDetailText.note }}: {{ payment.note }}</p>
													</div>
												</div>
												<p class="text-sm font-semibold text-stone-900">{{ formatMoney(payment.amount_base, storeCurrency) }}</p>
											</div>
										</div>
									</div>
									<div v-else class="mt-4 rounded-md bg-white px-4 py-4 text-sm text-stone-500 ring-1 ring-neutral-200">
										{{ poDetailText.noPayments }}
									</div>
								</div>
								</template>
							</div>

									<div
										class="-mx-5 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-5 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm"
										:style="{ transform: 'translateY(calc(-1 * var(--app-panel-keyboard-inset)))' }"
									>
										<div class="flex w-full gap-2">
											<AppButton
												color="neutral"
												variant="soft"
												size="md"
												:block="true"
												class="flex-1"
												@click="closeDetail"
											>
												{{ poDetailText.close }}
											</AppButton>
											<AppButton
												v-if="selectedOrderDetail && selectedOrderDetail.order.status === 'draft'"
												color="primary"
												variant="solid"
												size="md"
												icon="i-heroicons-check-badge-20-solid"
												class="flex-1 rounded-md"
												:loading="purchaseOrderOrderedSaving"
												:spin-icon-on-loading="true"
												:disabled="purchaseOrderOrderedSaving || !authPermissionReady || !canUpdatePurchaseOrder"
												:block="true"
												@click="confirmMarkPurchaseOrderOrdered"
											>
												{{ poDetailText.confirmOrder }}
											</AppButton>
											<AppButton
												v-else-if="selectedOrderDetail && selectedOrderDetail.order.status !== 'received' && selectedOrderDetail.order.status !== 'cancelled'"
												color="primary"
												variant="solid"
												size="md"
												icon="i-heroicons-arrow-down-tray-20-solid"
												class="flex-1 rounded-md"
												:disabled="!canReceivePurchaseOrder"
												:block="true"
												@click="openReceiveFlow"
											>
												{{ poDetailText.receiveStock }}
											</AppButton>
											<AppButton
												v-else-if="selectedOrderDetail && selectedOrderDetail.order.status === 'received' && selectedOrderDetail.order.payment_status !== 'paid'"
												color="primary"
												variant="solid"
												size="md"
												icon="i-heroicons-banknotes-20-solid"
												class="flex-1 rounded-md"
												:block="true"
												@click="openPaymentFlow"
											>
												{{ poDetailText.savePayment }}
											</AppButton>
										</div>
									</div>
						</div>
					</template>
					</AppResponsivePanel>

					<AppResponsivePanel
						v-model="paymentOpen"
						:title="poPaymentText.title"
						:description="poPaymentText.description"
						desktop-width="680px"
						close-button-size="md"
						compact-header
						full-bleed-header
						content-class="flex h-full flex-col !overflow-y-hidden overflow-hidden"
						@close="closePaymentFlow"
					>
						<template #default>
							<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
								<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-0 py-2 sm:px-0 sm:py-2">
									<div class="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
										{{ poPaymentText.stockCostNote }}
									</div>

									<div v-if="selectedOrderDetail" class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0">
												<h3 class="truncate text-base font-semibold text-stone-950">{{ selectedOrderDetail.order.po_number }}</h3>
												<p class="mt-1 text-sm text-stone-500">{{ selectedOrderDetail.order.supplier_name || poPaymentText.unspecifiedSupplier }}</p>
											</div>
											<UBadge :color="paymentStatusColor(selectedOrderDetail.order.payment_status)" variant="soft" :label="paymentStatusLabel(selectedOrderDetail.order.payment_status)" />
										</div>
										<div class="mt-3 flex flex-wrap gap-2">
											<UBadge color="neutral" variant="soft" :label="getCurrencySymbol(selectedOrderDetail.order.purchase_currency) || selectedOrderDetail.order.purchase_currency" />
											<UBadge color="neutral" variant="soft" :label="poPaymentText.itemCount.replace('{count}', String(selectedOrderDetail.items.length))" />
											<UBadge color="neutral" variant="soft" :label="formatMoney(paymentSettledBase, storeCurrency)" />
										</div>
									</div>

									<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
										<div class="space-y-4">
											<div class="flex items-start justify-between gap-3">
												<div>
													<p class="text-sm font-semibold text-stone-950">{{ poPaymentText.settlementInfo }}</p>
													<p class="mt-1 text-xs leading-5 text-stone-500">{{ poPaymentText.settlementHint }}</p>
												</div>
											</div>

											<div class="grid gap-4 md:grid-cols-2">
												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">{{ poPaymentText.actualRate }}</label>
													<div v-if="paymentExchangeRateLocked" class="flex min-h-[46px] items-center rounded-md border border-neutral-200 bg-neutral-100 px-4 py-2.5 text-sm font-medium tabular-nums text-stone-600">
														1
													</div>
													<UInput
														v-else
														v-model="paymentForm.exchangeRate"
														type="text"
														inputmode="decimal"
														pattern="[0-9.,-]*"
														size="lg"
														color="neutral"
														:placeholder="poPaymentText.actualRatePlaceholder"
														class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
													/>
													<p v-if="paymentExchangeRateLocked" class="mt-1 text-xs leading-5 text-stone-500">
														{{ poFormText.rateLockedHint.replace('{currency}', storeCurrency) }}
													</p>
												</div>

												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">{{ poPaymentText.actualShipping }}</label>
													<UInput
														v-model="paymentForm.shippingCost"
														type="text"
														inputmode="decimal"
														pattern="[0-9.,-]*"
														size="lg"
														color="neutral"
														placeholder="0"
														class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
													/>
												</div>

												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">{{ poPaymentText.actualOtherCost }}</label>
													<UInput
														v-model="paymentForm.otherCost"
														type="text"
														inputmode="decimal"
														pattern="[0-9.,-]*"
														size="lg"
														color="neutral"
														placeholder="0"
														class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
													/>
												</div>

												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">{{ poPaymentText.paidAt }}</label>
													<UInput
														v-model="paymentForm.paidAt"
														type="datetime-local"
														size="lg"
														color="neutral"
														class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
													/>
												</div>

												<div class="md:col-span-2">
													<label class="mb-2 block text-xs font-medium text-stone-500">{{ poPaymentText.reference }}</label>
													<UInput
														v-model="paymentForm.paymentReference"
														type="text"
														size="lg"
														color="neutral"
														:placeholder="poPaymentText.referencePlaceholder"
														class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
													/>
												</div>

												<div class="md:col-span-2">
													<label class="mb-2 block text-xs font-medium text-stone-500">{{ poPaymentText.note }}</label>
													<textarea
														v-model="paymentForm.paymentNote"
														rows="3"
														:placeholder="poPaymentText.notePlaceholder"
														class="w-full resize-none rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
													/>
												</div>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
										<div class="grid gap-3 sm:grid-cols-3">
											<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
												<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">{{ poPaymentText.settlementTotal }}</p>
												<p class="mt-2 text-base font-semibold text-stone-950">{{ formatMoney(paymentSettledBase, storeCurrency) }}</p>
											</div>
											<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
												<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">{{ poPaymentText.variance }}</p>
												<p class="mt-2 text-base font-semibold" :class="paymentVarianceBase >= 0 ? 'text-amber-600' : 'text-emerald-600'">
													{{ formatMoney(Math.abs(paymentVarianceBase), storeCurrency) }}
												</p>
											</div>
											<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
												<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">{{ poPaymentText.status }}</p>
												<p class="mt-2 text-base font-semibold text-stone-950">
													{{ paymentVarianceBase === 0 ? poPaymentText.matchesEstimate : poPaymentText.hasVariance }}
												</p>
											</div>
										</div>
									</UCard>
								</div>

								<div
									class="-mx-5 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-5 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm"
									:style="{ transform: 'translateY(calc(-1 * var(--app-panel-keyboard-inset)))' }"
								>
									<div class="grid w-full grid-cols-2 gap-2">
										<AppButton color="neutral" variant="soft" size="md" :block="true" @click="closePaymentFlow">{{ poPaymentText.cancel }}</AppButton>
										<AppButton
											color="primary"
											variant="solid"
											size="md"
											icon="i-heroicons-banknotes-20-solid"
											class="rounded-md"
											:loading="paymentSaving"
											:spin-icon-on-loading="true"
											:disabled="paymentSaving || !selectedOrderDetail"
											:block="true"
											@click="submitPaymentSettlement"
										>
											{{ poPaymentText.submit }}
										</AppButton>
									</div>
								</div>
							</div>
						</template>
					</AppResponsivePanel>

					<AppResponsivePanel
						v-model="receiveOpen"
						:title="poReceiveText.title"
						:description="poReceiveText.description"
						desktop-width="680px"
						close-button-size="md"
						compact-header
						full-bleed-header
						content-class="flex h-full flex-col !overflow-y-hidden overflow-hidden"
						@close="receiveOpen = false"
					>
						<template #default>
							<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
								<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-0 py-2 sm:px-0 sm:py-2">
									<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0">
												<div class="flex items-center gap-2">
													<UIcon name="i-heroicons-clipboard-document-check-20-solid" class="h-4 w-4 text-primary-600" />
													<h3 class="text-sm font-semibold text-stone-950">{{ poReceiveText.chooseMethod }}</h3>
												</div>
												<p class="mt-1 text-xs leading-5 text-stone-600">
													{{ poReceiveText.chooseMethodHint }}
												</p>
											</div>
											<UBadge
												color="neutral"
												variant="soft"
												:label="receiveMode === 'now' ? poReceiveText.badgeNow : receiveMode === 'partial' ? poReceiveText.badgePartial : poReceiveText.badgeLater"
											/>
										</div>
										<div class="mt-4 grid gap-2" :class="showReceiveLaterOption ? 'md:grid-cols-3' : 'md:grid-cols-2'">
											<button
												type="button"
												class="group rounded-md border px-4 py-3 text-left transition"
												:class="receiveMode === 'now'
													? 'border-primary-300 bg-primary-50 ring-1 ring-primary-200'
													: 'border-neutral-200 bg-white hover:border-primary-200 hover:bg-primary-50/50'"
												@click="selectReceiveMode('now')"
											>
												<div class="flex items-start justify-between gap-3">
													<div class="min-w-0">
														<p class="text-sm font-semibold text-stone-950">{{ poReceiveText.nowTitle }}</p>
														<p class="mt-1 text-xs leading-5 text-stone-600">{{ poReceiveText.nowHint }}</p>
													</div>
													<div
														class="mt-0.5 h-4 w-4 shrink-0 rounded-full border"
														:class="receiveMode === 'now' ? 'border-primary-600 bg-primary-600' : 'border-neutral-300 bg-white'"
													/>
												</div>
											</button>
											<button
												type="button"
												class="group rounded-md border px-4 py-3 text-left transition"
												:class="receiveMode === 'partial'
													? 'border-primary-300 bg-primary-50 ring-1 ring-primary-200'
													: 'border-neutral-200 bg-white hover:border-primary-200 hover:bg-primary-50/50'"
												@click="selectReceiveMode('partial')"
											>
												<div class="flex items-start justify-between gap-3">
													<div class="min-w-0">
														<p class="text-sm font-semibold text-stone-950">{{ poReceiveText.partialTitle }}</p>
														<p class="mt-1 text-xs leading-5 text-stone-600">{{ poReceiveText.partialHint }}</p>
													</div>
													<div
														class="mt-0.5 h-4 w-4 shrink-0 rounded-full border"
														:class="receiveMode === 'partial' ? 'border-primary-600 bg-primary-600' : 'border-neutral-300 bg-white'"
													/>
												</div>
											</button>
											<button
												v-if="showReceiveLaterOption"
												type="button"
												class="group rounded-md border px-4 py-3 text-left transition"
												:class="receiveMode === 'later'
													? 'border-primary-300 bg-primary-50 ring-1 ring-primary-200'
													: 'border-neutral-200 bg-white hover:border-primary-200 hover:bg-primary-50/50'"
												@click="selectReceiveMode('later')"
											>
												<div class="flex items-start justify-between gap-3">
													<div class="min-w-0">
														<p class="text-sm font-semibold text-stone-950">{{ poReceiveText.laterTitle }}</p>
														<p class="mt-1 text-xs leading-5 text-stone-600">{{ poReceiveText.laterHint }}</p>
													</div>
													<div
														class="mt-0.5 h-4 w-4 shrink-0 rounded-full border"
														:class="receiveMode === 'later' ? 'border-primary-600 bg-primary-600' : 'border-neutral-300 bg-white'"
													/>
												</div>
											</button>
										</div>
										<div class="mt-3 rounded-md border border-dashed border-neutral-200 bg-white px-4 py-3 text-xs leading-5 text-stone-600">
											<span v-if="receiveMode === 'now'">{{ poReceiveText.summaryNow }}</span>
											<span v-else-if="receiveMode === 'partial'">{{ poReceiveText.summaryPartial }}</span>
											<span v-else>{{ poReceiveText.summaryLater }}</span>
										</div>
									</div>

									<div v-if="selectedOrderDetail" class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
										<h3 class="text-sm font-semibold text-stone-950">{{ poReceiveText.poDetails }}</h3>
										<dl class="mt-4 space-y-3 text-sm">
											<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
												<dt class="text-stone-500">{{ poReceiveText.poNumber }}</dt>
												<dd class="text-right font-medium text-stone-900">{{ selectedOrderDetail.order.po_number }}</dd>
											</div>
											<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
												<dt class="text-stone-500">Supplier</dt>
												<dd class="text-right font-medium text-stone-900">{{ selectedOrderDetail.order.supplier_name || poReceiveText.unspecifiedSupplier }}</dd>
											</div>
											<div class="flex items-start justify-between gap-4">
												<dt class="text-stone-500">{{ poReceiveText.linesAndUnits }}</dt>
												<dd class="text-right font-medium text-stone-900">
													{{ poReceiveText.linesAndUnitsValue.replace('{items}', numberFormatter.format(selectedOrderDetail.items.length)).replace('{units}', numberFormatter.format(selectedOrderDetail.order.total_qty_ordered)) }}
												</dd>
											</div>
										</dl>
									</div>

									<div v-if="receiveLines.length && receiveMode === 'partial'" class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
										<div class="flex items-center justify-between gap-2">
											<h3 class="text-sm font-semibold text-stone-950">{{ poReceiveText.receiveLineByLine }}</h3>
											<UBadge color="neutral" variant="soft" :label="`${receiveLines.length} lines`" />
										</div>
										<div class="mt-4 space-y-3">
											<div v-for="line in receiveLines" :key="line.itemId" class="rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200">
												<div class="flex items-start justify-between gap-3">
													<div class="min-w-0">
														<p class="truncate text-sm font-semibold text-stone-900">{{ line.productName }}</p>
														<p v-if="line.productSku" class="mt-1 text-xs text-stone-500">{{ line.productSku }}</p>
														<p class="mt-1 text-xs text-stone-500">
															{{ poReceiveText.lineSummary.replace('{ordered}', numberFormatter.format(line.orderedQty)).replace('{received}', numberFormatter.format(line.receivedQty)).replace('{remaining}', numberFormatter.format(line.remainingQty)) }}
														</p>
													</div>
												</div>
												<div class="mt-3">
													<label class="mb-2 block text-xs font-medium text-stone-500">{{ poReceiveText.receiveQty }}</label>
													<UInput
														:model-value="line.receiveQty"
														type="text"
														inputmode="numeric"
														autocomplete="off"
														size="lg"
														color="neutral"
														class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
														@update:model-value="(value) => handleReceiveQtyInput(line, value)"
													>
														<template #trailing>
															<AppButton
																color="neutral"
																variant="soft"
																size="xs"
																class="rounded-md px-2.5 text-[11px] font-medium leading-none"
																:disabled="line.remainingQty <= 0"
																@click="setReceiveQtyToMax(line)"
															>
																Max
															</AppButton>
														</template>
													</UInput>
												</div>
											</div>
										</div>
									</div>
									<div v-else-if="receiveLines.length" class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
										<div class="flex items-center justify-between gap-2">
											<h3 class="text-sm font-semibold text-stone-950">{{ poReceiveText.productItems }}</h3>
											<UBadge color="neutral" variant="soft" :label="`${receiveLines.length} lines`" />
										</div>
										<div class="mt-4 space-y-3">
											<div v-for="line in receiveLines" :key="line.itemId" class="rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200">
												<div class="flex items-start justify-between gap-3">
													<div class="min-w-0">
														<p class="truncate text-sm font-semibold text-stone-900">{{ line.productName }}</p>
														<p v-if="line.productSku" class="mt-1 text-xs text-stone-500">{{ line.productSku }}</p>
														<p class="mt-1 text-xs text-stone-500">
															{{ poReceiveText.lineSummary.replace('{ordered}', numberFormatter.format(line.orderedQty)).replace('{received}', numberFormatter.format(line.receivedQty)).replace('{remaining}', numberFormatter.format(line.remainingQty)) }}
														</p>
													</div>
												</div>
											</div>
										</div>
									</div>
								</div>

									<div
										class="-mx-5 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-5 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm"
										:style="{ transform: 'translateY(calc(-1 * var(--app-panel-keyboard-inset)))' }"
									>
										<div class="grid w-full grid-cols-2 gap-2">
										<AppButton color="neutral" variant="soft" size="md" :block="true" @click="receiveOpen = false">{{ poReceiveText.cancel }}</AppButton>
										<AppButton
											color="primary"
											variant="solid"
											size="md"
											icon="i-heroicons-arrow-down-tray-20-solid"
											:loading="receiveSaving"
											:spin-icon-on-loading="true"
											:disabled="receiveSaving || !selectedOrderDetail || (receiveMode === 'partial' && !receiveLines.length)"
											:block="true"
											@click="confirmReceiveSelectedOrder"
										>
											{{ receiveMode === 'now' ? poReceiveText.confirmNow : receiveMode === 'partial' ? poReceiveText.confirmPartial : poReceiveText.confirmLater }}
										</AppButton>
									</div>
								</div>
							</div>
						</template>
					</AppResponsivePanel>

					<AppResponsivePanel
						v-model="createOpen"
						:title="purchaseOrderFormMode === 'edit'
							? (purchaseOrderCostOnlyEdit ? t('purchaseOrdersPage.editPoCost') : t('purchaseOrdersPage.editPo'))
							: t('purchaseOrdersPage.createNewPo')"
						:description="purchaseOrderFormMode === 'edit'
							? (purchaseOrderCostOnlyEdit
								? t('purchaseOrdersPage.editCostDescription')
								: t('purchaseOrdersPage.editPoDescription'))
							: t('purchaseOrdersPage.createPoDescription')"
						desktop-width="680px"
						close-button-size="md"
						compact-header
						full-bleed-header
						content-class="flex h-full flex-col !overflow-y-hidden overflow-hidden"
						@close="closeCreateDrawer"
					>
						<template #default>
							<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
								<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-0 py-2 sm:px-1 sm:py-2">
									<div class="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-stone-700">
										<UIcon name="i-heroicons-building-storefront-20-solid" class="h-4 w-4 shrink-0 text-stone-400" />
										<span class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">{{ poFormText.store }}</span>
										<UBadge color="neutral" variant="soft" class="max-w-full">
											<span class="truncate">{{ currentStoreName }}</span>
										</UBadge>
									</div>
									<div v-if="purchaseOrderFormMode === 'edit' && purchaseOrderEditLoading" class="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
										<AppInlineLoadingBar minimal container-class="bg-transparent" />
									</div>
									<div v-if="purchaseOrderCostOnlyEdit" class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
										{{ poFormText.restricted }}
									</div>

									<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
										<div class="space-y-4">
											<div class="flex items-start justify-between gap-3">
												<div>
											<p class="text-sm font-semibold text-stone-950">{{ poFormText.poInfo }}</p>
											<p class="mt-1 text-xs leading-5 text-stone-500">{{ poFormText.poInfoHint }}</p>
												</div>
												<UBadge color="neutral" variant="soft" :label="createForm.purchaseCurrency" />
											</div>

											<div class="grid gap-4 sm:grid-cols-2">
												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">{{ poFormText.supplier }} <span class="font-normal text-stone-400">{{ poFormText.optional }}</span></label>
													<UInput
														v-model="createForm.supplierName"
														type="text"
														size="lg"
														color="neutral"
														:placeholder="poFormText.supplierPlaceholder"
														class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
														:disabled="purchaseOrderCostOnlyEdit"
													/>
												</div>
												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">{{ poFormText.supplierContact }} <span class="font-normal text-stone-400">{{ poFormText.optional }}</span></label>
													<UInput
														v-model="createForm.supplierContact"
														type="text"
														size="lg"
														color="neutral"
														:placeholder="poFormText.supplierContactPlaceholder"
														class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
														:disabled="purchaseOrderCostOnlyEdit"
													/>
												</div>
											</div>

											<div class="grid gap-4 sm:grid-cols-2">
												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">{{ poFormText.currency }}</label>
													<div class="relative">
														<select
															v-model="createForm.purchaseCurrency"
															class="w-full appearance-none rounded-md border border-neutral-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-stone-800 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
															:disabled="purchaseOrderCostOnlyEdit"
														>
															<option value="LAK">LAK</option>
															<option value="THB">THB</option>
															<option value="USD">USD</option>
														</select>
														<UIcon name="i-heroicons-chevron-up-down" class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
													</div>
												</div>
												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">{{ poFormText.expectedAt }} <span class="font-normal text-stone-400">{{ poFormText.optional }}</span></label>
													<label class="flex min-h-[46px] items-center gap-2 rounded-md border border-neutral-200 bg-white px-4 py-2.5">
														<input
															v-model="expectedAtEnabled"
															type="checkbox"
															class="h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200"
															:disabled="purchaseOrderCostOnlyEdit"
														>
														<span class="text-sm text-stone-700">{{ expectedAtEnabled ? poFormText.expectedAtSet : poFormText.expectedAtUnset }}</span>
													</label>
													<UInput
														v-if="expectedAtEnabled"
														v-model="createForm.expectedAt"
														type="datetime-local"
														size="lg"
														color="neutral"
														class="mt-2 w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
														:disabled="purchaseOrderCostOnlyEdit"
													/>
												</div>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
										<div class="space-y-4">
											<div class="flex items-start justify-between gap-3">
												<div>
											<p class="text-sm font-semibold text-stone-950">{{ poFormText.extraCosts }}</p>
													<p class="mt-1 text-xs leading-5 text-stone-500">
												{{ purchaseOrderCostOnlyEdit ? poFormText.extraCostsEditHint : poFormText.extraCostsHint }}
													</p>
												</div>
												<UBadge color="neutral" variant="soft" label="Optional" />
											</div>

											<div class="grid gap-4 md:grid-cols-2">
												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">{{ poFormText.estimatedRate }}</label>
													<div v-if="exchangeRateLocked" class="flex min-h-[46px] items-center rounded-md border border-neutral-200 bg-neutral-100 px-4 py-2.5 text-sm font-medium tabular-nums text-stone-600">
														1
													</div>
													<UInput
														v-else
														v-model="createForm.exchangeRate"
														type="text"
														inputmode="decimal"
														pattern="[0-9.,-]*"
														size="lg"
														color="neutral"
														:placeholder="poFormText.estimatedRatePlaceholder"
														class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
													/>
													<p class="mt-1 text-xs leading-5 text-stone-500">
														{{ exchangeRateLocked ? poFormText.rateLockedHint.replace('{currency}', storeCurrency) : poFormText.estimatedRateHint }}
													</p>
												</div>

												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">{{ poFormText.estimatedShipping }}</label>
													<UInput
														:model-value="createForm.shippingCost"
														@update:model-value="(v: string | number) => createForm.shippingCost = normalizeMoneyTyping(String(v ?? ''), { maxDecimals: 2 })"
														type="text"
														inputmode="decimal"
														pattern="[0-9.,-]*"
														size="lg"
														color="neutral"
														placeholder="0"
														class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
													/>
													<p class="mt-1 text-xs leading-5 text-stone-500">{{ poFormText.estimatedShippingHint }}</p>
												</div>

												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">{{ poFormText.estimatedOtherCost }}</label>
													<UInput
														:model-value="createForm.otherCost"
														@update:model-value="(v: string | number) => createForm.otherCost = normalizeMoneyTyping(String(v ?? ''), { maxDecimals: 2 })"
														type="text"
														inputmode="decimal"
														pattern="[0-9.,-]*"
														size="lg"
														color="neutral"
														placeholder="0"
														class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
													/>
												</div>

												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">{{ poFormText.otherCostNote }}</label>
													<UInput
														v-model="createForm.otherCostNote"
														type="text"
														size="lg"
														color="neutral"
														:placeholder="poFormText.otherCostNotePlaceholder"
														class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
													/>
												</div>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
										<div class="space-y-4">
											<div class="flex items-center justify-between gap-3">
												<div>
											<p class="text-sm font-semibold text-stone-950">{{ poFormText.items }}</p>
											<p class="mt-1 text-xs leading-5 text-stone-500">{{ poFormText.itemsHint }}</p>
											<p class="mt-1 text-xs leading-5 text-stone-500">{{ poFormText.itemsCostHint }}</p>
												</div>
												<AppButton
													v-if="!purchaseOrderCostOnlyEdit"
													color="neutral"
													variant="soft"
													size="md"
													class="rounded-md"
													icon="i-heroicons-plus-20-solid"
													:label="poFormText.addItem"
													@click="addLine"
												/>
											</div>

										<div class="space-y-3">
												<div v-for="line in createForm.items" :key="line.id" class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
													<div class="grid gap-3 md:grid-cols-[minmax(0,1.45fr)_96px_minmax(0,1.1fr)_44px] md:items-end">
														<div class="min-w-0">
															<label class="mb-2 block text-xs font-medium text-stone-500">{{ poFormText.product }}</label>
															<div class="relative">
																<select
																	v-model="line.productId"
																	class="w-full appearance-none rounded-md border border-neutral-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-stone-800 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
																	:disabled="purchaseOrderCostOnlyEdit"
																>
																	<option value="" disabled>{{ productsPending ? poFormText.loadingProducts : poFormText.selectProduct }}</option>
																	<option v-for="product in products" :key="product.id" :value="product.id">{{ productLabel(product.id) }}</option>
																</select>
																<UIcon name="i-heroicons-chevron-up-down" class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
															</div>
														</div>
														<div class="min-w-0">
															<label class="mb-2 block text-xs font-medium text-stone-500">{{ poFormText.quantity }}</label>
															<UInput
																:model-value="line.qtyOrdered"
																type="number"
																min="1"
																step="1"
																size="lg"
																color="neutral"
																class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
																:disabled="purchaseOrderCostOnlyEdit"
																@update:model-value="(value) => handleLineQtyInput(line, value)"
															/>
														</div>
														<div class="min-w-0">
															<div class="mb-1 flex items-center justify-between gap-2">
																<label class="block text-xs font-medium text-stone-500">{{ poFormText.cost }}</label>
																<div class="inline-flex rounded-md bg-neutral-100 p-0.5 text-[11px] font-medium text-stone-500">
																	<button
																		type="button"
																		class="rounded-md px-2 py-0.5 transition"
																		:class="line.costMode === 'unit' ? 'bg-white text-stone-950 shadow-sm ring-1 ring-neutral-200' : 'hover:text-stone-800'"
																		:disabled="purchaseOrderCostOnlyEdit"
																		@click="setLineCostMode(line, 'unit')"
																	>
																						{{ poFormText.perUnit }}
																	</button>
																	<button
																		type="button"
																		class="rounded-md px-2 py-0.5 transition"
																		:class="line.costMode === 'total' ? 'bg-white text-stone-950 shadow-sm ring-1 ring-neutral-200' : 'hover:text-stone-800'"
																		:disabled="purchaseOrderCostOnlyEdit"
																		@click="setLineCostMode(line, 'total')"
																	>
																						{{ poFormText.total }}
																	</button>
																</div>
															</div>
															<UInput
																:model-value="line.costMode === 'total' ? line.lineTotalCost : line.unitCost"
																type="text"
																inputmode="decimal"
																pattern="[0-9.,-]*"
																size="lg"
																color="neutral"
																:placeholder="line.costMode === 'total' ? poFormText.totalCost : poFormText.unitCostPlaceholder"
																class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
																:disabled="purchaseOrderCostOnlyEdit"
																@update:model-value="(value) => line.costMode === 'total' ? handleLineTotalCostInput(line, value) : handleLineUnitCostInput(line, value)"
															/>
														</div>
														<div v-if="!purchaseOrderCostOnlyEdit" class="flex items-end justify-end">
															<AppButton color="neutral" variant="soft" size="sm" class="h-11 w-11 rounded-md p-0" icon="i-heroicons-trash-20-solid" :aria-label="poFormText.removeItem" :title="poFormText.removeItem" @click="removeLine(line.id)" />
														</div>
													</div>

													<div v-if="lineBreakdownText(line)" class="mt-3 flex flex-col gap-1 border-t border-neutral-200 pt-2.5 text-[11px] leading-4 tabular-nums sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
														<span class="text-stone-500">{{ lineBreakdownText(line) }}</span>
														<span v-if="createTotals.extraPerUnitBase > 0" class="text-primary-700">
															{{ poFormText.lineLanded }} {{ formatPurchaseMoney(lineLandedUnitBase(line) ?? 0, storeCurrency) }}
														</span>
													</div>
												</div>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
										<div class="space-y-2">
											<label class="block text-xs font-medium text-stone-500">{{ poFormText.note }}</label>
											<textarea
												v-model="createForm.note"
												rows="4"
												:placeholder="poFormText.notePlaceholder"
												class="w-full resize-none rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
											/>
										</div>
									</UCard>
								</div>

								<div
									class="-mx-5 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-5 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm"
									:style="{ transform: 'translateY(calc(-1 * var(--app-panel-keyboard-inset)))' }"
								>
											<div class="mb-2.5 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2.5">
												<p v-if="!createTotals.ready" class="text-xs leading-5 text-stone-500">{{ poFormText.previewEmpty }}</p>
												<div v-else class="space-y-1 text-xs tabular-nums">
													<div class="flex items-baseline justify-between gap-3">
														<span class="text-stone-500">
															{{ poFormText.previewItems }}
															<span class="text-stone-400">{{ poFormText.previewCount.replace('{count}', String(createTotals.pricedLines)) }}</span>
														</span>
														<span class="font-medium text-stone-800">{{ formatPurchaseMoney(createTotals.itemsOriginal, createForm.purchaseCurrency) }}</span>
													</div>
													<div v-if="createTotals.hasExtra" class="flex items-baseline justify-between gap-3">
														<span class="text-stone-500">
															{{ poFormText.previewExtra }}
															<span class="text-stone-400">
																<template v-if="createTotals.shippingOriginal > 0">{{ poFormText.previewShippingShort }} {{ formatMoneyInputValue(createTotals.shippingOriginal) }}</template><template v-if="createTotals.shippingOriginal > 0 && createTotals.otherOriginal > 0"> + </template><template v-if="createTotals.otherOriginal > 0">{{ poFormText.previewOtherShort }} {{ formatMoneyInputValue(createTotals.otherOriginal) }}</template>
															</span>
														</span>
														<span class="font-medium text-stone-800">{{ formatPurchaseMoney(createTotals.extraOriginal, createForm.purchaseCurrency) }}</span>
													</div>
													<div class="flex items-baseline justify-between gap-3 border-t border-neutral-200 pt-1.5">
														<span class="text-sm font-semibold text-stone-950">{{ poFormText.previewTotal }}</span>
														<span class="text-right">
															<span class="text-sm font-semibold text-stone-950">{{ formatPurchaseMoney(createTotals.totalOriginal, createForm.purchaseCurrency) }}</span>
															<span v-if="!exchangeRateLocked" class="ml-2 text-[11px] font-normal text-stone-500">
																≈ {{ formatPurchaseMoney(createTotals.totalBase, storeCurrency) }} ({{ poFormText.previewRate.replace('{rate}', formatMoneyInputValue(createTotals.exchangeRate)) }})
															</span>
														</span>
													</div>
													<div v-if="createTotals.extraPerUnitBase > 0" class="flex items-baseline justify-between gap-3 text-[11px] text-stone-500">
														<span :title="poFormText.previewPerUnitHint">{{ poFormText.previewPerUnit }}</span>
														<span class="font-medium text-primary-700">+{{ formatPurchaseMoney(createTotals.extraPerUnitBase, storeCurrency) }}</span>
													</div>
												</div>
											</div>

											<div class="grid w-full gap-2" :class="purchaseOrderFormMode === 'edit' ? 'grid-cols-2' : 'grid-cols-3'">
										<AppButton color="neutral" variant="soft" size="md" :block="true" @click="closeCreateDrawer">{{ poFormText.cancel }}</AppButton>
										<template v-if="purchaseOrderFormMode === 'edit'">
											<AppButton
												color="primary"
												variant="solid"
												size="md"
												icon="i-heroicons-pencil-square-20-solid"
												:loading="submitting"
												:spin-icon-on-loading="true"
												:disabled="submitting || !authPermissionReady || !canUpdatePurchaseOrder"
												:block="true"
												@click="submitEditPurchaseOrder"
											>
												{{ purchaseOrderCostOnlyEdit ? poFormText.saveCost : poFormText.saveChanges }}
											</AppButton>
										</template>
										<template v-else>
											<AppButton
												color="neutral"
												variant="soft"
												size="md"
												icon="i-heroicons-bookmark-20-solid"
												:loading="submitting"
												:spin-icon-on-loading="true"
												:disabled="submitting || !authPermissionReady || !canCreatePurchaseOrder"
												:block="true"
												@click="submitCreate('draft')"
											>
												{{ poFormText.saveDraft }}
											</AppButton>
											<AppButton
												color="primary"
												variant="solid"
												size="md"
												icon="i-heroicons-check-20-solid"
												:loading="submitting"
												:spin-icon-on-loading="true"
												:disabled="submitting || !authPermissionReady || !canCreatePurchaseOrder"
												:block="true"
												@click="submitCreate('ordered')"
											>
												{{ poFormText.createPo }}
											</AppButton>
										</template>
									</div>
								</div>
							</div>
						</template>
					</AppResponsivePanel>

			<Transition
				enter-active-class="transition duration-200 ease-out"
				enter-from-class="translate-y-3 opacity-0"
				enter-to-class="translate-y-0 opacity-100"
				leave-active-class="transition duration-150 ease-in"
				leave-from-class="translate-y-0 opacity-100"
				leave-to-class="translate-y-3 opacity-0"
			>
				<div
					v-if="toast"
					class="fixed bottom-6 left-1/2 z-[70] w-[min(560px,calc(100%-2rem))] -translate-x-1/2 rounded-md bg-[rgba(28,25,23,0.92)] px-4 py-3 text-sm text-white shadow-[0_18px_40px_rgba(15,23,42,0.22)] ring-1 ring-white/10 backdrop-blur lg:left-auto lg:right-6 lg:w-[min(420px,calc(100%-2rem))] lg:translate-x-0"
				>
					{{ toast }}
				</div>
			</Transition>
		</template>
	</AppSidebarShell>
</template>
