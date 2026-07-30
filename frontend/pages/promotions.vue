<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";
import { formatAppDateTime } from "~/utils/date-format";

type Product = { id: string; name: string; sku: string };
type PromotionType = "buy_x_get_y" | "cart_total_gift" | "cart_discount" | "cart_threshold_discount";
type Promotion = { id: string; name: string; type: PromotionType; apply_mode: "automatic" | "manual"; qualifying_product_id: string | null; qualifying_qty: number | null; minimum_subtotal: number | null; gift_product_id: string | null; gift_qty: number | null; discount_method: "percent" | "fixed" | null; discount_value: number | null; max_applications_per_bill: number | null; max_discount_amount_per_bill: number | null; starts_at: string | null; ends_at: string | null; is_active: number; gift_product_name?: string; qualifying_product_name?: string; order_count?: number; application_count?: number; gift_quantity?: number };
type Envelope<T> = { data: T };

const { apiFetch } = useApiClient();
const { currentStoreId, hydrateAuthState } = useAuthSession();
const { locale } = useI18n();
const appLocale = computed(() => locale.value as "th" | "lo" | "en");
const appToast = useAppToast();
const busy = ref(false);
const saving = ref(false);
const items = ref<Promotion[]>([]);
const products = ref<Product[]>([]);
const open = ref(false);
const editing = ref<Promotion | null>(null);
const deleteConfirmOpen = ref(false);
const deleting = ref(false);
const togglingPromotionId = ref<string | null>(null);
const search = ref("");
const statusFilter = ref<"all" | "active" | "inactive">("all");
const typeFilter = ref<"all" | Promotion["type"]>("all");
const currentPage = ref(1);
const pageSize = ref(20);
const pageSizeOptions = [ 10, 20, 50 ];
const form = reactive({ name: "", type: "buy_x_get_y" as Promotion["type"], apply_mode: "manual" as Promotion["apply_mode"], qualifying_product_id: "", qualifying_qty: 1, minimum_subtotal: 0, gift_product_id: "", gift_qty: 1, discount_method: "percent" as "percent" | "fixed", discount_value: 10, unlimited_per_bill: true, max_applications_per_bill: 1, max_discount_amount_per_bill: 0, starts_at: "", ends_at: "", is_active: true });
const noEndDate = ref(true);
const modalInputClass = "w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5 dark:[&_input]:border-[#3a332a] dark:[&_input]:bg-[#1b1713]";
const modalSelectClass = "w-full [&_button]:min-h-11 [&_button]:rounded-md [&_button]:border-neutral-200 [&_button]:bg-white dark:[&_button]:border-[#3a332a] dark:[&_button]:bg-[#1b1713]";

const copy = computed(() => locale.value === "lo" ? {
	title: "ໂປຣໂມຊັນ", description: "ຈັດການໂປຣຊື້ X ແຖມ Y ແລະ ຂອງແຖມຕາມຍອດບິນ", add: "ເພີ່ມໂປຣໂມຊັນ", reload: "ໂຫຼດໃໝ່", edit: "ແກ້ໄຂໂປຣໂມຊັນ", remove: "ລົບ", active: "ໃຊ້ງານ", inactive: "ປິດ", all: "ທັງໝົດ", type: "ປະເພດ", applyMode: "ວິທີເພີ່ມຂອງແຖມ", applyManual: "ໃຫ້ພະນັກງານກົດເພີ່ມເອງ", applyAutomatic: "ເພີ່ມອັດຕະໂນມັດເມື່ອຄົບເງື່ອນໄຂ", buy: "ຊື້ X ແຖມ Y", total: "ຍອດບິນແຖມສິນຄ້າ", name: "ຊື່ໂປຣໂມຊັນ", namePlaceholder: "ເຊັ່ນ ຊື້ 4 ແຖມ 1", selectProduct: "ເລືອກສິນຄ້າ", qty: "ຈຳນວນທີ່ຊື້", qtyPlaceholder: "ເຊັ່ນ 4", minimum: "ຍອດຂັ້ນຕ່ຳ", minimumPlaceholder: "ເຊັ່ນ 100,000", gift: "ສິນຄ້າແຖມ", giftQty: "ຈຳນວນແຖມ", period: "ໄລຍະເວລາ", start: "ເລີ່ມ", end: "ສິ້ນສຸດ", uses: "ບິນທີ່ໃຊ້", usage: "ການໃຊ້ໂປຣ", applications: "ໃຊ້", giftsGiven: "ແຖມ", save: "ບັນທຶກ", cancel: "ຍົກເລີກ", empty: "ຍັງບໍ່ມີໂປຣໂມຊັນ", emptyHint: "ສ້າງໂປຣທຳອິດເພື່ອໃຊ້ໃນ POS", first: "ເພີ່ມໂປຣໂມຊັນທຳອິດ", search: "ຄົ້ນຫາຊື່ໂປຣ ຫຼື ສິນຄ້າ", filters: "ຕົວກອງ", showing: "ສະແດງ", totalPromotions: "ໂປຣທັງໝົດ", activePromotions: "ກຳລັງໃຊ້", inactivePromotions: "ປິດໃຊ້ງານ", totalUses: "ຈຳນວນບິນທີ່ໃຊ້", condition: "ເງື່ອນໄຂ", actions: "ຈັດການ", basic: "ຂໍ້ມູນພື້ນຖານ", rules: "ເງື່ອນໄຂໂປຣ", schedule: "ກຳນົດໄລຍະ", preview: "ຕົວຢ່າງຜົນລັບ", noEnd: "ບໍ່ກຳນົດ", giftFree: "ຮັບຟຣີ", enabled: "ເປີດໃຊ້ງານ", enabledHint: "ປິດເພື່ອພັກໂປຣໄດ້ ແລະ ເປີດໃໝ່ໄດ້ທຸກເວລາ"
} : locale.value === "en" ? {
	title: "Promotions", description: "Manage Buy X Get Y and cart-total gift promotions.", add: "Add promotion", reload: "Reload", edit: "Edit promotion", remove: "Delete", active: "Active", inactive: "Inactive", all: "All", type: "Type", applyMode: "Gift add method", applyManual: "Cashier adds gift manually", applyAutomatic: "Add automatically when eligible", buy: "Buy X Get Y", total: "Cart total gift", name: "Promotion name", namePlaceholder: "e.g. Buy 4, get 1 free", selectProduct: "Select product", qty: "Buy quantity", qtyPlaceholder: "e.g. 4", minimum: "Minimum subtotal", minimumPlaceholder: "e.g. 100,000", gift: "Gift product", giftQty: "Gift quantity", period: "Date range", start: "Start", end: "End", uses: "Orders used", usage: "Promotion usage", applications: "Used", giftsGiven: "Gifts", save: "Save promotion", cancel: "Cancel", empty: "No promotions yet", emptyHint: "Create your first promotion for your POS team.", first: "Add first promotion", search: "Search promotion or product", filters: "Filters", showing: "Showing", totalPromotions: "Total promotions", activePromotions: "Active", inactivePromotions: "Inactive", totalUses: "Orders used", condition: "Condition", actions: "Actions", basic: "Basic information", rules: "Promotion rules", schedule: "Schedule", preview: "Result preview", noEnd: "No end date", giftFree: "free", enabled: "Enabled", enabledHint: "Turn this off to pause the promotion. You can enable it again at any time."
} : {
	title: "โปรโมชั่น", description: "จัดการซื้อ X แถม Y และของแถมเมื่อยอดบิลถึงกำหนด", add: "เพิ่มโปรโมชั่น", reload: "รีโหลด", edit: "แก้ไขโปรโมชั่น", remove: "ลบ", active: "ใช้งาน", inactive: "ปิดใช้งาน", all: "ทั้งหมด", type: "ประเภท", applyMode: "วิธีเพิ่มของแถม", applyManual: "ให้พนักงานกดเพิ่มเอง", applyAutomatic: "เพิ่มอัตโนมัติเมื่อครบเงื่อนไข", buy: "ซื้อ X แถม Y", total: "ยอดบิลแถมสินค้า", name: "ชื่อโปรโมชั่น", namePlaceholder: "เช่น ซื้อ 4 แถม 1", selectProduct: "เลือกสินค้า", qty: "จำนวนที่ซื้อ", qtyPlaceholder: "เช่น 4", minimum: "ยอดขั้นต่ำ", minimumPlaceholder: "เช่น 100,000", gift: "สินค้าของแถม", giftQty: "จำนวนของแถม", period: "ช่วงวันที่", start: "เริ่ม", end: "สิ้นสุด", uses: "จำนวนบิลที่ใช้", usage: "การใช้โปรโมชั่น", applications: "ใช้โปร", giftsGiven: "ของแถม", save: "บันทึกโปรโมชั่น", cancel: "ยกเลิก", empty: "ยังไม่มีโปรโมชั่น", emptyHint: "สร้างโปรโมชั่นแรกเพื่อให้พนักงานเลือกใช้ใน POS", first: "เพิ่มโปรโมชั่นแรก", search: "ค้นหาชื่อโปรโมชั่นหรือสินค้า", filters: "ตัวกรอง", showing: "แสดง", totalPromotions: "โปรโมชั่นทั้งหมด", activePromotions: "กำลังใช้งาน", inactivePromotions: "ปิดใช้งาน", totalUses: "จำนวนบิลที่ใช้", condition: "เงื่อนไข", actions: "จัดการ", basic: "ข้อมูลพื้นฐาน", rules: "เงื่อนไขโปรโมชั่น", schedule: "กำหนดช่วงเวลา", preview: "ตัวอย่างผลลัพธ์", noEnd: "ไม่กำหนดวันสิ้นสุด", giftFree: "ฟรี", enabled: "เปิดใช้งาน", enabledHint: "ปิดเพื่อพักโปรโมชั่น และเปิดใช้งานใหม่ได้ทุกเมื่อ"
});
const discountCopy = computed(() => locale.value === "lo"
	? { description: "ຈັດການຂອງແຖມ ແລະ ສ່ວນຫຼຸດທັງບິນ", direct: "ຫຼຸດທັງບິນ", threshold: "ຍອດເຖິງເກນແລ້ວຫຼຸດ", method: "ຮູບແບບສ່ວນຫຼຸດ", percent: "ເປີເຊັນ (%)", fixed: "ຈຳນວນເງິນ", value: "ສ່ວນຫຼຸດ", discount: "ຫຼຸດ", applyMode: "ວິທີນຳໃຊ້ໂປຣໂມຊັນ" }
	: locale.value === "en"
		? { description: "Manage free gifts and order discounts.", direct: "Order discount", threshold: "Minimum spend discount", method: "Discount method", percent: "Percentage (%)", fixed: "Fixed amount", value: "Discount value", discount: "Discount", applyMode: "Promotion application" }
		: { description: "จัดการของแถมและส่วนลดทั้งบิล", direct: "ลดทั้งบิล", threshold: "ยอดถึงเกณฑ์แล้วลด", method: "รูปแบบส่วนลด", percent: "เปอร์เซ็นต์ (%)", fixed: "จำนวนเงิน", value: "มูลค่าส่วนลด", discount: "ลด", applyMode: "วิธีใช้โปรโมชั่น" });
const capCopy = computed(() => locale.value === "lo"
	? { unlimited: "ບໍ່ຈຳກັດຕໍ່ບິນ", unlimitedHint: "ປິດເພື່ອກຳນົດຈຳນວນສູງສຸດຕໍ່ບິນ", maxApplications: "ສູງສຸດຕໍ່ບິນ (ຈຳນວນຊຸດ)", maxDiscount: "ສ່ວນຫຼຸດສູງສຸດຕໍ່ບິນ", unlimitedShort: "ບໍ່ຈຳກັດ", maxSets: (value: number) => `ສູງສຸດ ${value} ຊຸດ/ບິນ`, maxAmount: (value: string) => `ສູງສຸດ ${value}/ບິນ` }
	: locale.value === "en"
		? { unlimited: "Unlimited per bill", unlimitedHint: "Turn this off to set a maximum per bill.", maxApplications: "Maximum per bill (applications)", maxDiscount: "Maximum discount per bill", unlimitedShort: "Unlimited", maxSets: (value: number) => `Maximum ${value} applications/bill`, maxAmount: (value: string) => `Maximum ${value}/bill` }
		: { unlimited: "ไม่จำกัดต่อบิล", unlimitedHint: "ปิดเพื่อกำหนดจำนวนสูงสุดต่อบิล", maxApplications: "สูงสุดต่อบิล (จำนวนชุด)", maxDiscount: "ส่วนลดสูงสุดต่อบิล", unlimitedShort: "ไม่จำกัด", maxSets: (value: number) => `สูงสุด ${value} ชุด/บิล`, maxAmount: (value: string) => `สูงสุด ${value}/บิล` });

const productOptions = computed(() => products.value.map((product) => ({ label: `${product.name}${product.sku ? ` · ${product.sku}` : ""}`, value: product.id })));
const selectedQualifyingProduct = computed(() => products.value.find((product) => product.id === form.qualifying_product_id));
const selectedGiftProduct = computed(() => products.value.find((product) => product.id === form.gift_product_id));
function parseMoneyInput(value: unknown) {
	const normalized = String(value ?? "").replace(/[^\d]/g, "");
	return normalized ? Number(normalized) : 0;
}
function displayMoneyInput(value: number) {
	return value > 0 ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value) : "";
}
const minimumSubtotalInput = computed({
	get: () => displayMoneyInput(Number(form.minimum_subtotal || 0)),
	set: (value: string | number) => { form.minimum_subtotal = parseMoneyInput(value); },
});
const fixedDiscountInput = computed({
	get: () => displayMoneyInput(Number(form.discount_value || 0)),
	set: (value: string | number) => { form.discount_value = parseMoneyInput(value); },
});
const maxDiscountInput = computed({
	get: () => displayMoneyInput(Number(form.max_discount_amount_per_bill || 0)),
	set: (value: string | number) => { form.max_discount_amount_per_bill = parseMoneyInput(value); },
});
const filteredItems = computed(() => {
	const keyword = search.value.trim().toLowerCase();
	return items.value.filter((item) => {
		const matchesKeyword = !keyword || [ item.name, item.qualifying_product_name, item.gift_product_name ].filter(Boolean).join(" ").toLowerCase().includes(keyword);
		const matchesStatus = statusFilter.value === "all" || (statusFilter.value === "active" ? Boolean(item.is_active) : !item.is_active);
		const matchesType = typeFilter.value === "all" || item.type === typeFilter.value;
		return matchesKeyword && matchesStatus && matchesType;
	});
});
const stats = computed(() => ({ total: items.value.length, active: items.value.filter((item) => Boolean(item.is_active)).length, inactive: items.value.filter((item) => !item.is_active).length, uses: items.value.reduce((sum, item) => sum + Number(item.order_count || 0), 0) }));
const totalPages = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / pageSize.value)));
function giftCountLabel(value: number) {
	if (locale.value === "lo") return `${value} ຊິ້ນ`;
	if (locale.value === "th") return `${value} ชิ้น`;
	return `${value} items`;
}
const paginatedItems = computed(() => filteredItems.value
	.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value)
	.map((item) => ({
		...item,
		gift_quantity: giftCountLabel(Number(item.gift_quantity || 0)) as unknown as number,
	})));
const pageStart = computed(() => filteredItems.value.length ? ((currentPage.value - 1) * pageSize.value) + 1 : 0);
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, filteredItems.value.length));
const paginationCopy = computed(() => locale.value === "lo"
	? { perPage: "ຕໍ່ໜ້າ", previous: "ກ່ອນໜ້າ", next: "ຕໍ່ໜ້າ", manage: "ຈັດການ", page: "ໜ້າ" }
	: locale.value === "en"
		? { perPage: "Per page", previous: "Previous", next: "Next", manage: "Manage", page: "Page" }
		: { perPage: "ต่อหน้า", previous: "ก่อนหน้า", next: "ถัดไป", manage: "จัดการ", page: "หน้า" });
const deleteCopy = computed(() => locale.value === "lo"
	? { title: "ຢືນຢັນການລົບໂປຣໂມຊັນ", description: "ໂປຣນີ້ຈະຖືກປິດ ແລະ ບໍ່ສາມາດໃຊ້ໃນ POS ໄດ້", warning: "ລົບໂປຣໂມຊັນ", hint: "ກະລຸນາກວດສອບຊື່ໂປຣໂມຊັນກ່ອນຢືນຢັນ", cancel: "ຍົກເລີກ", confirm: "ຢືນຢັນລົບ" }
	: locale.value === "en"
		? { title: "Delete promotion", description: "This promotion will be disabled and unavailable in POS.", warning: "Delete promotion", hint: "Check the promotion name before confirming.", cancel: "Cancel", confirm: "Delete promotion" }
		: { title: "ยืนยันการลบโปรโมชั่น", description: "โปรโมชั่นนี้จะถูกปิดและไม่สามารถใช้ใน POS ได้", warning: "ลบโปรโมชั่น", hint: "กรุณาตรวจสอบชื่อโปรโมชั่นก่อนยืนยัน", cancel: "ยกเลิก", confirm: "ยืนยันลบ" });
const scheduleCopy = computed(() => locale.value === "lo"
	? { noEnd: "ບໍ່ກຳນົດວັນສິ້ນສຸດ", forever: "ໃຊ້ຕະຫຼອດ (ບໍ່ມີວັນສິ້ນສຸດ)", hint: "ປິດຕົວເລືອກນີ້ເມື່ອຕ້ອງການກຳນົດວັນສິ້ນສຸດ. ໂປຣຈະໃຊ້ໄດ້ເຖິງ 23:59:59 ຂອງວັນສິ້ນສຸດ (ເວລາວຽງຈັນ UTC+7)." }
	: locale.value === "en"
		? { noEnd: "No end date", forever: "Run indefinitely (no end date)", hint: "Turn this off to set an end date. The promotion remains available until 23:59:59 on that date (Vientiane time, UTC+7)." }
		: { noEnd: "ไม่กำหนดวันสิ้นสุด", forever: "ใช้ต่อเนื่อง (ไม่กำหนดวันสิ้นสุด)", hint: "ปิดตัวเลือกนี้เมื่อต้องการกำหนดวันสิ้นสุด โปรโมชั่นจะใช้ได้ถึง 23:59:59 ของวันนั้น (เวลาเวียงจันทน์ UTC+7)" });
const toggleCopy = computed(() => locale.value === "lo"
	? { pause: "ພັກໂປຣໂມຊັນ", resume: "ເປີດໃຊ້ງານອີກຄັ້ງ", paused: "ພັກໂປຣໂມຊັນແລ້ວ", resumed: "ເປີດໃຊ້ງານໂປຣໂມຊັນແລ້ວ", failed: "ປ່ຽນສະຖານະໂປຣໂມຊັນບໍ່ສຳເລັດ" }
	: locale.value === "en"
		? { pause: "Pause promotion", resume: "Enable again", paused: "Promotion paused", resumed: "Promotion enabled", failed: "Unable to update promotion status" }
		: { pause: "พักโปรโมชั่น", resume: "เปิดใช้งานอีกครั้ง", paused: "พักโปรโมชั่นแล้ว", resumed: "เปิดใช้งานโปรโมชั่นแล้ว", failed: "เปลี่ยนสถานะโปรโมชั่นไม่สำเร็จ" });

function goToPage(page: number) { currentPage.value = Math.min(Math.max(1, page), totalPages.value); }

function reset(value?: Promotion) {
	editing.value = value || null;
	noEndDate.value = !value?.ends_at;
	const existingLimit = value && (value.type === "buy_x_get_y" || value.type === "cart_total_gift") ? value.max_applications_per_bill : value?.max_discount_amount_per_bill;
	Object.assign(form, value ? { name: value.name, type: value.type, apply_mode: value.apply_mode || "manual", qualifying_product_id: value.qualifying_product_id || "", qualifying_qty: value.qualifying_qty || 1, minimum_subtotal: value.minimum_subtotal || 0, gift_product_id: value.gift_product_id || "", gift_qty: value.gift_qty || 1, discount_method: value.discount_method || "percent", discount_value: value.discount_value || 10, unlimited_per_bill: !existingLimit, max_applications_per_bill: value.max_applications_per_bill || 1, max_discount_amount_per_bill: value.max_discount_amount_per_bill || 0, starts_at: value.starts_at?.slice(0, 10) || "", ends_at: value.ends_at?.slice(0, 10) || "", is_active: Boolean(value.is_active) } : { name: "", type: "buy_x_get_y", apply_mode: "manual", qualifying_product_id: "", qualifying_qty: 1, minimum_subtotal: 0, gift_product_id: "", gift_qty: 1, discount_method: "percent", discount_value: 10, unlimited_per_bill: true, max_applications_per_bill: 1, max_discount_amount_per_bill: 0, starts_at: "", ends_at: "", is_active: true });
	open.value = true;
}
function formatMoney(value: number | null) { return new Intl.NumberFormat(locale.value === "lo" ? "lo-LA" : locale.value === "th" ? "th-TH" : "en-US").format(Number(value || 0)); }
function formatPromotionDateTime(value: string | null | undefined) {
	if (!value) return "—";
	return formatAppDateTime(value, appLocale.value);
}
function formatPeriod(item: Promotion) { return `${formatPromotionDateTime(item.starts_at)} – ${item.ends_at ? formatPromotionDateTime(item.ends_at) : scheduleCopy.value.noEnd}`; }
function promotionBoundary(date: string, endOfDay = false) {
	return new Date(`${date}T${endOfDay ? "23:59:59" : "00:00:00"}+07:00`).toISOString();
}
function discountLabel(method: "percent" | "fixed" | null, value: number | null) { return method === "percent" ? `${formatMoney(value)}%` : formatMoney(value); }
function typeLabel(type: PromotionType) { return type === "buy_x_get_y" ? copy.value.buy : type === "cart_total_gift" ? copy.value.total : type === "cart_discount" ? discountCopy.value.direct : discountCopy.value.threshold; }
function itemCondition(item: Promotion) {
	const cap = item.type === "buy_x_get_y" || item.type === "cart_total_gift"
		? item.max_applications_per_bill ? capCopy.value.maxSets(item.max_applications_per_bill) : capCopy.value.unlimitedShort
		: item.max_discount_amount_per_bill ? capCopy.value.maxAmount(formatMoney(item.max_discount_amount_per_bill)) : capCopy.value.unlimitedShort;
	if (item.type === "buy_x_get_y") return `${item.qualifying_product_name || "—"} × ${item.qualifying_qty || 0} → ${item.gift_product_name || "—"} × ${item.gift_qty} · ${cap}`;
	if (item.type === "cart_total_gift") return `${copy.value.minimum} ${formatMoney(item.minimum_subtotal)} → ${item.gift_product_name || "—"} × ${item.gift_qty} · ${cap}`;
	const discount = `${discountCopy.value.discount} ${discountLabel(item.discount_method, item.discount_value)}`;
	return `${item.type === "cart_threshold_discount" ? `${copy.value.minimum} ${formatMoney(item.minimum_subtotal)} → ` : ""}${discount} · ${cap}`;
}
const previewText = computed(() => {
	const cap = form.unlimited_per_bill ? capCopy.value.unlimitedShort : form.type === "buy_x_get_y" || form.type === "cart_total_gift" ? capCopy.value.maxSets(form.max_applications_per_bill) : capCopy.value.maxAmount(formatMoney(form.max_discount_amount_per_bill));
	if (form.type === "buy_x_get_y") return `${copy.value.buy}: ${selectedQualifyingProduct.value?.name || "…"} × ${form.qualifying_qty} → ${selectedGiftProduct.value?.name || "…"} × ${form.gift_qty} ${copy.value.giftFree} · ${cap}`;
	if (form.type === "cart_total_gift") return `${copy.value.minimum} ${formatMoney(form.minimum_subtotal)} → ${selectedGiftProduct.value?.name || "…"} × ${form.gift_qty} ${copy.value.giftFree} · ${cap}`;
	const discount = `${discountCopy.value.discount} ${discountLabel(form.discount_method, form.discount_value)}`;
	return `${form.type === "cart_threshold_discount" ? `${copy.value.minimum} ${formatMoney(form.minimum_subtotal)} → ` : ""}${discount} · ${cap}`;
});

async function load() {
	if (!currentStoreId.value) return;
	busy.value = true;
	try {
		const [promotionResponse, productResponse] = await Promise.all([ apiFetch<Envelope<Promotion[]>>(`/promotions?store_id=${currentStoreId.value}`), apiFetch<Envelope<any>>(`/products?store_id=${currentStoreId.value}&page=1&limit=100`) ]);
		items.value = promotionResponse.data;
		products.value = productResponse.data.items || productResponse.data;
	} catch (error) {
		appToast.error({ title: locale.value === "lo" ? "ໂຫຼດໂປຣໂມຊັນບໍ່ສຳເລັດ" : locale.value === "en" ? "Unable to load promotions" : "โหลดโปรโมชั่นไม่สำเร็จ", description: resolveApiErrorMessage(error), timeout: 3200 });
	} finally { busy.value = false; }
}
async function save() {
	if (!currentStoreId.value) return;
	const invalid = !form.name.trim()
		|| ((form.type === "buy_x_get_y" || form.type === "cart_total_gift") && (!form.gift_product_id || form.gift_qty < 1))
		|| (form.type === "buy_x_get_y" && (!form.qualifying_product_id || form.qualifying_qty < 1))
		|| ((form.type === "cart_total_gift" || form.type === "cart_threshold_discount") && form.minimum_subtotal <= 0)
		|| ((form.type === "cart_discount" || form.type === "cart_threshold_discount") && (form.discount_value <= 0 || (form.discount_method === "percent" && form.discount_value > 100)))
		|| (!form.unlimited_per_bill && ((form.type === "buy_x_get_y" || form.type === "cart_total_gift") ? form.max_applications_per_bill < 1 : form.max_discount_amount_per_bill <= 0));
	if (invalid) {
		appToast.error({ title: locale.value === "lo" ? "ກະລຸນາກອກຂໍ້ມູນໂປຣໂມຊັນໃຫ້ຄົບ" : locale.value === "en" ? "Complete the required promotion details" : "กรอกข้อมูลโปรโมชั่นที่จำเป็นให้ครบ", timeout: 3200 });
		return;
	}
	saving.value = true;
	try {
		const isGift = form.type === "buy_x_get_y" || form.type === "cart_total_gift";
		const payload = { ...form, name: form.name.trim(), store_id: currentStoreId.value, qualifying_product_id: form.type === "buy_x_get_y" ? form.qualifying_product_id : null, qualifying_qty: form.type === "buy_x_get_y" ? form.qualifying_qty : null, minimum_subtotal: form.type === "cart_total_gift" || form.type === "cart_threshold_discount" ? form.minimum_subtotal : null, gift_product_id: isGift ? form.gift_product_id : null, gift_qty: isGift ? form.gift_qty : null, discount_method: isGift ? null : form.discount_method, discount_value: isGift ? null : form.discount_value, max_applications_per_bill: isGift && !form.unlimited_per_bill ? form.max_applications_per_bill : null, max_discount_amount_per_bill: !isGift && !form.unlimited_per_bill ? form.max_discount_amount_per_bill : null, starts_at: form.starts_at ? promotionBoundary(form.starts_at) : null, ends_at: form.ends_at ? promotionBoundary(form.ends_at, true) : null };
		await apiFetch(editing.value ? `/promotions/${editing.value.id}?store_id=${currentStoreId.value}` : "/promotions", { method: editing.value ? "PUT" : "POST", body: payload });
		open.value = false;
		appToast.success({ title: locale.value === "lo" ? "ບັນທຶກໂປຣໂມຊັນແລ້ວ" : locale.value === "en" ? "Promotion saved" : "บันทึกโปรโมชั่นแล้ว" });
		await load();
	} catch (error) {
		appToast.error({ title: locale.value === "lo" ? "ບັນທຶກໂປຣໂມຊັນບໍ່ສຳເລັດ" : locale.value === "en" ? "Unable to save promotion" : "บันทึกโปรโมชั่นไม่สำเร็จ", description: resolveApiErrorMessage(error), timeout: 3200 });
	} finally { saving.value = false; }
}
async function remove(item: Promotion) {
	if (!currentStoreId.value) return;
	deleting.value = true;
	try {
		await apiFetch(`/promotions/${item.id}?store_id=${currentStoreId.value}`, { method: "DELETE" });
		deleteConfirmOpen.value = false;
		open.value = false;
		await load();
	} catch (error) {
		appToast.error({ title: locale.value === "lo" ? "ລົບໂປຣໂມຊັນບໍ່ສຳເລັດ" : locale.value === "en" ? "Unable to delete promotion" : "ลบโปรโมชั่นไม่สำเร็จ", description: resolveApiErrorMessage(error), timeout: 3200 });
	} finally { deleting.value = false; }
}
async function togglePromotion(item: Promotion) {
	if (!currentStoreId.value) return;
	togglingPromotionId.value = item.id;
	try {
		await apiFetch(`/promotions/${item.id}?store_id=${currentStoreId.value}`, {
			method: "PUT",
			body: {
				name: item.name, type: item.type, qualifying_product_id: item.qualifying_product_id,
				qualifying_qty: item.qualifying_qty, minimum_subtotal: item.minimum_subtotal,
				gift_product_id: item.gift_product_id, gift_qty: item.gift_qty,
				discount_method: item.discount_method, discount_value: item.discount_value,
				max_applications_per_bill: item.max_applications_per_bill, max_discount_amount_per_bill: item.max_discount_amount_per_bill,
				starts_at: item.starts_at, ends_at: item.ends_at, apply_mode: item.apply_mode || "manual", is_active: !Boolean(item.is_active)
			}
		});
		form.is_active = !Boolean(item.is_active);
		appToast.success({ title: item.is_active ? toggleCopy.value.paused : toggleCopy.value.resumed });
		await load();
		editing.value = items.value.find((promotion) => promotion.id === item.id) || null;
	} catch (error) {
		appToast.error({ title: toggleCopy.value.failed, description: resolveApiErrorMessage(error), timeout: 3200 });
	} finally { togglingPromotionId.value = null; }
}

onMounted(async () => { await hydrateAuthState(); await load(); });
watch(currentStoreId, () => void load());
watch([ search, statusFilter, typeFilter, pageSize ], () => { currentPage.value = 1; });
watch(noEndDate, (enabled) => { if (enabled) form.ends_at = ""; });
watch(totalPages, () => { if (currentPage.value > totalPages.value) currentPage.value = totalPages.value; });
</script>

<template>
	<AppSidebarShell :nav-items="appNavItems" :active-ids="['promotions']" sidebar-eyebrow="Promotion" :sidebar-title="copy.title" sidebar-compact-title="PROMO" :sidebar-description="discountCopy.description">
		<template #default="{ openSidebar }">
			<div class="space-y-3 pb-4">
				<AppPageHeader title="" compact :description="discountCopy.description" @menu="openSidebar">
					<div class="ml-auto grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 pt-0.5 sm:pt-1 lg:w-auto lg:grid-cols-[minmax(320px,1fr)_auto_auto] lg:justify-end">
						<UInput
							v-model="search"
							size="lg"
							icon="i-heroicons-magnifying-glass-20-solid"
							:placeholder="copy.search"
							class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5 [&_input]:shadow-sm [&_input]:focus:border-primary-300 [&_input]:focus:ring-2 [&_input]:focus:ring-primary-200"
						/>
						<AppButton
							color="neutral"
							variant="soft"
							size="md"
							icon="i-heroicons-arrow-path-20-solid"
							class="justify-center rounded-md"
							:aria-label="copy.reload"
							:title="copy.reload"
							:loading="busy"
							:disabled="busy"
							:spin-icon-on-loading="true"
							@click="load"
						>
							<span class="hidden lg:inline">{{ copy.reload }}</span>
						</AppButton>
						<AppButton color="primary" size="md" icon="i-heroicons-plus-20-solid" class="justify-center rounded-md" :aria-label="copy.add" :title="copy.add" @click="reset()">
							<span class="hidden lg:inline">{{ copy.add }}</span>
						</AppButton>
					</div>
				</AppPageHeader>

				<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<div v-for="stat in [{ label: copy.totalPromotions, value: stats.total, icon: 'i-heroicons-gift-20-solid' }, { label: copy.activePromotions, value: stats.active, icon: 'i-heroicons-check-circle-20-solid' }, { label: copy.inactivePromotions, value: stats.inactive, icon: 'i-heroicons-pause-circle-20-solid' }, { label: copy.totalUses, value: stats.uses, icon: 'i-heroicons-receipt-percent-20-solid' }]" :key="stat.label" class="rounded-none border border-neutral-200 bg-white px-4 py-3 sm:rounded-md dark:border-[#3a332a] dark:bg-[#221d18]">
						<div class="flex items-center gap-2 text-xs font-medium text-stone-500 dark:text-stone-400"><UIcon :name="stat.icon" class="size-4 text-primary-500" />{{ stat.label }}</div>
						<p class="mt-1 text-2xl font-semibold text-stone-900 dark:text-stone-100">{{ stat.value }}</p>
					</div>
				</div>

				<div class="rounded-none border border-neutral-200 bg-white p-3 sm:rounded-md dark:border-[#3a332a] dark:bg-[#221d18]">
					<div class="flex flex-wrap items-center gap-2">
						<span class="mr-1 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{{ copy.filters }}</span>
						<div class="flex flex-wrap gap-2">
							<USelect v-model="statusFilter" :items="[{ label: copy.all, value: 'all' }, { label: copy.active, value: 'active' }, { label: copy.inactive, value: 'inactive' }]" class="min-w-36" />
							<USelect v-model="typeFilter" :items="[{ label: copy.type, value: 'all' }, { label: copy.buy, value: 'buy_x_get_y' }, { label: copy.total, value: 'cart_total_gift' }, { label: discountCopy.direct, value: 'cart_discount' }, { label: discountCopy.threshold, value: 'cart_threshold_discount' }]" class="min-w-44" />
						</div>
					</div>
				</div>

				<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md dark:border-[#3a332a] dark:bg-[#221d18]">
					<div v-if="busy" class="min-h-[280px]">
						<AppInlineLoadingBar container-class="bg-neutral-100 dark:bg-[#221d18]" />
					</div>
					<div v-else-if="!items.length" class="flex min-h-72 flex-col items-center justify-center px-6 text-center">
						<div class="flex size-12 items-center justify-center rounded-md bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300"><UIcon name="i-heroicons-gift-20-solid" class="size-6" /></div>
						<h2 class="mt-4 text-base font-semibold text-stone-900 dark:text-stone-100">{{ copy.empty }}</h2>
						<p class="mt-1 max-w-sm text-sm text-stone-500 dark:text-stone-400">{{ copy.emptyHint }}</p>
						<AppButton color="primary" icon="i-heroicons-plus-20-solid" class="mt-5 rounded-md" @click="reset()">{{ copy.first }}</AppButton>
					</div>
					<div v-else-if="!filteredItems.length" class="p-12 text-center text-sm text-stone-500 dark:text-stone-400">{{ copy.showing }} 0</div>
					<div v-else class="flex min-h-[360px] flex-col">
						<div class="min-h-0 flex-1 overflow-x-auto">
						<table class="w-full min-w-[1060px] border-separate border-spacing-0 text-sm">
							<thead class="bg-[#fcfbf8] dark:bg-[#221d18]"><tr class="text-left text-xs font-medium uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500"><th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.name }}</th><th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.condition }}</th><th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.period }}</th><th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.uses }}</th><th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.usage }}</th><th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 text-right dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.actions }}</th></tr></thead>
							<tbody><tr v-for="item in paginatedItems" :key="item.id" class="cursor-pointer text-sm text-stone-700 transition hover:bg-primary-50 dark:text-stone-300 dark:hover:bg-primary-500/10" :class="open && editing?.id === item.id ? 'bg-primary-50 dark:bg-primary-500/10' : 'bg-white dark:bg-[#221d18]'" @click="reset(item)"><td class="border-b border-[#f1ede6] px-4 py-4 dark:border-[#332d26]"><div class="flex items-start gap-3"><div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary-500 text-white shadow-sm"><UIcon :name="item.type === 'cart_discount' || item.type === 'cart_threshold_discount' ? 'i-heroicons-receipt-percent-20-solid' : 'i-heroicons-gift-20-solid'" class="h-5 w-5" /></div><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><p class="truncate font-semibold text-stone-950 dark:text-stone-100">{{ item.name }}</p><UBadge :color="item.is_active ? 'success' : 'neutral'" variant="soft" size="xs">{{ item.is_active ? copy.active : copy.inactive }}</UBadge></div><p class="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">{{ typeLabel(item.type) }}</p><p class="mt-1 hidden text-[11px] text-stone-400 lg:block">{{ formatPeriod(item) }}</p></div></div></td><td class="border-b border-[#f1ede6] px-4 py-4 font-medium text-stone-700 dark:border-[#332d26] dark:text-stone-300">{{ itemCondition(item) }}</td><td class="border-b border-[#f1ede6] px-4 py-4 text-xs text-stone-500 dark:border-[#332d26] dark:text-stone-400">{{ formatPeriod(item) }}</td><td class="border-b border-[#f1ede6] px-4 py-4 font-semibold tabular-nums text-stone-950 dark:border-[#332d26] dark:text-stone-100">{{ item.order_count || 0 }}</td><td class="border-b border-[#f1ede6] px-4 py-4 dark:border-[#332d26]"><p class="font-semibold tabular-nums text-stone-950 dark:border-[#332d26] dark:text-stone-100">{{ copy.applications }} {{ item.application_count || 0 }}</p><p v-if="item.type === 'buy_x_get_y' || item.type === 'cart_total_gift'" class="mt-1 text-xs tabular-nums text-stone-500 dark:text-stone-400">{{ copy.giftsGiven }} {{ item.gift_quantity || 0 }}</p></td><td class="border-b border-[#f1ede6] px-4 py-4 text-right dark:border-[#332d26]"><AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-chevron-right-20-solid" class="rounded-md" @click.stop="reset(item)">{{ paginationCopy.manage }}</AppButton></td></tr></tbody>
						</table>
						</div>
						<div class="flex flex-col gap-2.5 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.96)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm dark:border-[#3a332a] dark:bg-[#221d18]/95 sm:gap-3 md:flex-row md:items-center md:justify-between">
							<div class="flex items-center justify-between gap-3"><p class="text-xs text-stone-500 dark:text-stone-400 sm:text-sm">{{ pageStart }}-{{ pageEnd }} / {{ filteredItems.length }} • {{ paginationCopy.page }} {{ currentPage }} / {{ totalPages }}</p></div>
							<div class="flex items-center justify-between gap-2 md:justify-end"><div class="flex items-center gap-2"><label class="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">{{ paginationCopy.perPage }}</label><select v-model.number="pageSize" class="min-w-[68px] rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-sm text-stone-700 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200 dark:border-[#3a332a] dark:bg-[#221d18] dark:text-stone-200"><option v-for="option in pageSizeOptions" :key="option" :value="option">{{ option }}</option></select></div><div class="flex items-center gap-2"><AppButton color="neutral" variant="soft" size="md" class="rounded-md" icon="i-heroicons-chevron-left-20-solid" :disabled="currentPage <= 1" :aria-label="paginationCopy.previous" :title="paginationCopy.previous" @click="goToPage(currentPage - 1)"><span class="hidden sm:inline">{{ paginationCopy.previous }}</span></AppButton><AppButton color="neutral" variant="soft" size="md" class="rounded-md" trailing-icon="i-heroicons-chevron-right-20-solid" :disabled="currentPage >= totalPages" :aria-label="paginationCopy.next" :title="paginationCopy.next" @click="goToPage(currentPage + 1)"><span class="hidden sm:inline">{{ paginationCopy.next }}</span></AppButton></div></div>
						</div>
					</div>
				</div>
			</div>

			<AppResponsivePanel
				v-model="open"
				:title="editing ? copy.edit : copy.add"
				:description="copy.description"
				desktop-width="680px"
				close-button-size="md"
				compact-header
				full-bleed-header
				content-class="flex h-full flex-col !overflow-y-hidden overflow-hidden"
			>
				<template #default="{ close }">
					<form class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900 dark:text-stone-100" @submit.prevent="save">
						<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto py-2">
						<section class="rounded-md border border-neutral-200 bg-white p-4 dark:border-[#3a332a] dark:bg-[#221d18]">
							<h3 class="text-sm font-semibold text-stone-900 dark:text-stone-100">{{ copy.basic }}</h3>
							<div class="mt-3 space-y-3"><UFormField :label="copy.name"><UInput v-model="form.name" size="lg" color="neutral" :placeholder="copy.namePlaceholder" :class="modalInputClass" autofocus /></UFormField><div><UCheckbox v-model="form.is_active" :label="copy.enabled" /><p class="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">{{ copy.enabledHint }}</p></div><div v-if="editing" class="border-t border-neutral-100 pt-3 dark:border-[#332d26]"><AppButton v-if="editing.is_active" type="button" color="neutral" variant="soft" size="md" icon="i-heroicons-pause-20-solid" class="rounded-md" :loading="togglingPromotionId === editing.id" :spin-icon-on-loading="true" @click="togglePromotion(editing)">{{ toggleCopy.pause }}</AppButton><AppButton v-else type="button" color="primary" variant="soft" size="md" icon="i-heroicons-play-20-solid" class="rounded-md" :loading="togglingPromotionId === editing.id" :spin-icon-on-loading="true" @click="togglePromotion(editing)">{{ toggleCopy.resume }}</AppButton></div></div>
						</section>
						<section class="rounded-md border border-neutral-200 bg-white p-4 dark:border-[#3a332a] dark:bg-[#221d18]">
							<h3 class="text-sm font-semibold text-stone-900 dark:text-stone-100">{{ copy.rules }}</h3>
							<div class="mt-3 space-y-3">
								<UFormField :label="copy.type"><USelect v-model="form.type" size="lg" color="neutral" :items="[{ label: copy.buy, value: 'buy_x_get_y' }, { label: copy.total, value: 'cart_total_gift' }, { label: discountCopy.direct, value: 'cart_discount' }, { label: discountCopy.threshold, value: 'cart_threshold_discount' }]" :class="modalSelectClass" /></UFormField>
								<UFormField :label="form.type === 'cart_discount' || form.type === 'cart_threshold_discount' ? discountCopy.applyMode : copy.applyMode"><USelect v-model="form.apply_mode" size="lg" color="neutral" :items="[{label: copy.applyManual, value:'manual'},{label: copy.applyAutomatic, value:'automatic'}]" :class="modalSelectClass" /></UFormField>
								<template v-if="form.type === 'buy_x_get_y'"><UFormField :label="copy.qualify"><USelect v-model="form.qualifying_product_id" size="lg" color="neutral" :items="productOptions" :placeholder="copy.selectProduct" :class="modalSelectClass" /></UFormField><UFormField :label="copy.qty"><UInput v-model.number="form.qualifying_qty" type="number" min="1" size="lg" color="neutral" :placeholder="copy.qtyPlaceholder" :class="modalInputClass" /></UFormField></template>
								<UFormField v-if="form.type === 'cart_total_gift' || form.type === 'cart_threshold_discount'" :label="copy.minimum"><UInput v-model="minimumSubtotalInput" type="text" inputmode="numeric" autocomplete="off" size="lg" color="neutral" :placeholder="copy.minimumPlaceholder" :class="modalInputClass" /></UFormField>
								<div v-if="form.type === 'buy_x_get_y' || form.type === 'cart_total_gift'" class="border-t border-neutral-100 pt-3 dark:border-[#332d26]"><UFormField :label="copy.gift"><USelect v-model="form.gift_product_id" size="lg" color="neutral" :items="productOptions" :placeholder="copy.selectProduct" :class="modalSelectClass" /></UFormField><UFormField :label="copy.giftQty" class="mt-3"><UInput v-model.number="form.gift_qty" type="number" min="1" size="lg" color="neutral" placeholder="1" :class="modalInputClass" /></UFormField></div>
								<div v-else class="grid grid-cols-1 gap-3 border-t border-neutral-100 pt-3 sm:grid-cols-2 dark:border-[#332d26]"><UFormField :label="discountCopy.method"><USelect v-model="form.discount_method" size="lg" color="neutral" :items="[{ label: discountCopy.percent, value: 'percent' }, { label: discountCopy.fixed, value: 'fixed' }]" :class="modalSelectClass" /></UFormField><UFormField :label="discountCopy.value"><UInput v-if="form.discount_method === 'percent'" v-model.number="form.discount_value" type="number" min="0.01" max="100" step="0.01" size="lg" color="neutral" placeholder="10" :class="modalInputClass" /><UInput v-else v-model="fixedDiscountInput" type="text" inputmode="numeric" autocomplete="off" size="lg" color="neutral" :placeholder="copy.minimumPlaceholder" :class="modalInputClass" /></UFormField></div>
								<div class="border-t border-neutral-100 pt-3 dark:border-[#332d26]">
									<UCheckbox v-model="form.unlimited_per_bill" :label="capCopy.unlimited" />
									<p class="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">{{ capCopy.unlimitedHint }}</p>
									<UFormField v-if="!form.unlimited_per_bill" class="mt-3" :label="form.type === 'buy_x_get_y' || form.type === 'cart_total_gift' ? capCopy.maxApplications : capCopy.maxDiscount">
										<UInput v-if="form.type === 'buy_x_get_y' || form.type === 'cart_total_gift'" v-model.number="form.max_applications_per_bill" type="number" min="1" step="1" size="lg" color="neutral" placeholder="1" :class="modalInputClass" />
										<UInput v-else v-model="maxDiscountInput" type="text" inputmode="numeric" autocomplete="off" size="lg" color="neutral" :placeholder="copy.minimumPlaceholder" :class="modalInputClass" />
									</UFormField>
								</div>
							</div>
						</section>
						<section class="rounded-md border border-neutral-200 bg-white p-4 dark:border-[#3a332a] dark:bg-[#221d18]">
							<h3 class="text-sm font-semibold text-stone-900 dark:text-stone-100">{{ copy.schedule }}</h3>
							<div class="mt-3 grid grid-cols-2 gap-3">
								<UFormField :label="copy.start"><UInput v-model="form.starts_at" type="date" size="lg" color="neutral" :class="modalInputClass" /></UFormField>
								<UFormField :label="copy.end"><UInput v-model="form.ends_at" type="date" size="lg" color="neutral" :class="modalInputClass" :disabled="noEndDate" /></UFormField>
							</div>
							<UCheckbox v-model="noEndDate" class="mt-3" :label="scheduleCopy.forever" />
							<p class="mt-3 text-xs leading-5 text-stone-500 dark:text-stone-400">{{ scheduleCopy.hint }}</p>
						</section>
						<div class="rounded-md border border-primary-100 bg-primary-50 p-4 dark:border-primary-500/25 dark:bg-primary-500/10"><p class="text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">{{ copy.preview }}</p><p class="mt-1 text-sm font-medium text-primary-900 dark:text-primary-100">{{ previewText }}</p></div>
						</div>
						<div class="-mx-5 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-5 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm dark:border-[#3a332a] dark:bg-[#221d18]/95">
							<div :class="editing ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2'"><AppButton type="button" color="neutral" variant="soft" size="md" class="rounded-md" :block="true" @click="close">{{ copy.cancel }}</AppButton><AppButton v-if="editing" type="button" color="error" variant="soft" size="md" icon="i-heroicons-trash-20-solid" class="rounded-md" :block="true" @click="deleteConfirmOpen = true">{{ copy.remove }}</AppButton><AppButton type="submit" size="md" class="rounded-md" :block="true" :loading="saving" :spin-icon-on-loading="true">{{ copy.save }}</AppButton></div>
						</div>
					</form>
				</template>
			</AppResponsivePanel>

			<AppResponsivePanel v-model="deleteConfirmOpen" :title="deleteCopy.title" :description="deleteCopy.description" desktop-width="680px" close-button-size="md" compact-header full-bleed-header content-class="flex h-full flex-col overflow-hidden px-0 py-0">
				<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900 dark:text-stone-100">
					<div class="scrollbar-soft min-h-0 overflow-y-auto px-5 py-4">
						<div class="space-y-4 pb-6">
							<div class="rounded-md border border-error-200 bg-error-50 p-4 dark:border-error-500/30 dark:bg-error-500/10"><p class="text-sm font-semibold text-stone-950 dark:text-stone-100">{{ deleteCopy.warning }}</p><p class="mt-1 text-xs leading-5 text-stone-600 dark:text-stone-300">{{ deleteCopy.description }}</p></div>
							<div v-if="editing" class="rounded-md border border-neutral-200 bg-neutral-50 p-4 dark:border-[#3a332a] dark:bg-[#221d18]"><p class="text-sm font-semibold text-stone-900 dark:text-stone-100">{{ editing.name }}</p><p class="mt-1 text-xs text-stone-500 dark:text-stone-400">{{ itemCondition(editing) }}</p></div>
							<div class="rounded-md border border-neutral-200 bg-white p-4 dark:border-[#3a332a] dark:bg-[#221d18]"><p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">{{ deleteCopy.warning }}</p><p class="mt-3 text-sm text-stone-700 dark:text-stone-300">{{ deleteCopy.hint }}</p></div>
						</div>
					</div>
					<div class="-mx-5 sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-5 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm dark:border-[#3a332a] dark:bg-[#221d18]/95"><div class="grid w-full grid-cols-2 gap-2"><AppButton color="neutral" variant="soft" size="md" class="rounded-md" :block="true" :disabled="deleting" @click="deleteConfirmOpen = false">{{ deleteCopy.cancel }}</AppButton><AppButton color="error" variant="solid" size="md" icon="i-heroicons-trash-20-solid" class="rounded-md" :block="true" :loading="deleting" :disabled="deleting || !editing" :spin-icon-on-loading="true" @click="editing && remove(editing)">{{ deleteCopy.confirm }}</AppButton></div></div>
				</div>
			</AppResponsivePanel>
		</template>
	</AppSidebarShell>
</template>

<style scoped>
table tbody td:nth-child(5) > p:first-child {
	display: none;
}

table tbody td:nth-child(5) > p:last-child {
	margin-top: 0;
}
</style>
