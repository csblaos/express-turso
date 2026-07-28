import { ApiError } from "@middlewares/ApiError";
import { ProductCategoryInterface } from "@interfaces/ProductCategoryInterface";
import { ProductInterface } from "@interfaces/ProductInterface";
import { StoreInterface } from "@interfaces/StoreInterface";
import { UnitInterface } from "@interfaces/UnitInterface";
import { InventoryComponent } from "@components/InventoryComponent";

type PosCatalogStore = {
	id: string;
	name: string;
	address: string | null;
	phone_number: string | null;
	pdf_company_name: string | null;
	pdf_company_address: string | null;
	pdf_company_phone: string | null;
	receipt_show_store_address: number;
	receipt_show_store_phone: number;
	receipt_show_tendered: number;
	receipt_show_change: number;
	receipt_show_queue: number;
	pickup_queue_enabled: number;
	currency: string | null;
	vat_enabled: number;
	vat_rate: number;
	vat_mode: string;
	store_type: string;
};

type PosCatalogCategory = {
	id: string;
	name: string;
	count: number;
};

export type PosCatalogItem = {
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
	stock_state: "ready" | "low" | "out" | "negative" | "inactive";
	inventory_mode: "tracked" | "untracked";
	cost_source: "purchase" | "manual" | "unknown";
	manual_sold_out: number;
};

export type PosCatalogResponse = {
	store: PosCatalogStore;
	categories: PosCatalogCategory[];
	items: PosCatalogItem[];
};

function resolvePublicProductImageUrl(imageUrl: string | null): string | null {
	if (!imageUrl) return null;
	const normalized = imageUrl.trim();
	if (!normalized) return null;
	if (/^(https?:\/\/|data:|blob:)/i.test(normalized) || normalized.startsWith("//")) return normalized;
	const base = String(process.env.R2_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
	if (!base) return normalized;
	const path = normalized.startsWith("/") ? normalized : `/${normalized}`;
	return `${base}${path}`;
}

function resolveStockState(active: number, available: number, lowStockThreshold: number | null): PosCatalogItem["stock_state"] {
	if (!active) return "inactive";
	if (available < 0) return "negative";
	if (available <= 0) return "out";
	if (lowStockThreshold !== null && lowStockThreshold > 0 && available <= lowStockThreshold) return "low";
	return "ready";
}

export class PosComponent {
	static async getCatalog(requestId: string, storeId: string | undefined | null): Promise<PosCatalogResponse> {
		void requestId;
		const normalizedStoreId = String(storeId || "").trim();
		if (!normalizedStoreId) {
			throw ApiError.BadRequestError("store_id is required");
		}

		const [products, balances, categories, units, store] = await Promise.all([
			ProductInterface.findAll(normalizedStoreId),
			InventoryComponent.getBalances(requestId, { storeId: normalizedStoreId }),
			ProductCategoryInterface.findAll(normalizedStoreId),
			UnitInterface.findAll({ storeId: normalizedStoreId }),
			StoreInterface.findById(normalizedStoreId),
		]);

		const balanceMap = new Map(balances.map((balance) => [balance.product_id, balance]));
		const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
		const unitMap = new Map(units.map((unit) => [unit.id, unit.name_th || unit.code]));

		const items = products
			.map((product) => {
				const balance = balanceMap.get(product.id);
				const categoryId = product.category_id || balance?.category_id || null;
				const categoryName = balance?.category_name
					|| (categoryId ? categoryMap.get(categoryId) : null)
					|| null;
				const unitName = balance?.unit_name
					|| unitMap.get(product.base_unit_id)
					|| null;
				const availableBase = Number(balance?.available_base ?? 0);
				const lowStockThreshold = product.low_stock_threshold ?? balance?.low_stock_threshold ?? null;
				const inventoryMode: PosCatalogItem["inventory_mode"] = product.inventory_mode === "untracked" ? "untracked" : "tracked";
				const stockState = inventoryMode === "untracked"
					? (!Number(product.active ?? 1) || Number(product.manual_sold_out ?? 0) ? "inactive" : "ready")
					: resolveStockState(Number(product.active ?? 1), availableBase, lowStockThreshold);

				return {
					id: product.id,
					store_id: product.store_id,
					sku: product.sku,
					name: product.name,
					barcode: product.barcode,
					location: product.location,
					category_id: categoryId,
					category_name: categoryName,
					base_unit_id: product.base_unit_id,
					unit_name: unitName,
					price_base: Number(product.price_base ?? 0),
					cost_base: Number(product.cost_base ?? 0),
					active: Number(product.active ?? 1),
					low_stock_threshold: lowStockThreshold,
					out_stock_threshold: product.out_stock_threshold ?? balance?.out_stock_threshold ?? null,
					on_hand_base: Number(balance?.on_hand_base ?? 0),
					reserved_base: Number(balance?.reserved_base ?? 0),
					available_base: availableBase,
					image_url: resolvePublicProductImageUrl(product.image_url || balance?.image_url || null),
					updated_at: balance?.updated_at || product.created_at,
					stock_state: stockState,
					inventory_mode: inventoryMode,
					cost_source: (product.cost_source === "manual" || product.cost_source === "unknown" ? product.cost_source : "purchase") as PosCatalogItem["cost_source"],
					manual_sold_out: Number(product.manual_sold_out ?? 0),
				};
			})
			.sort((left, right) => {
				const stockOrder: Record<PosCatalogItem["stock_state"], number> = {
					ready: 0,
					low: 1,
					out: 2,
					negative: 3,
					inactive: 4,
				};
				const activeDiff = Number(right.active ?? 1) - Number(left.active ?? 1);
				if (activeDiff !== 0) return activeDiff;
				const stockDiff = stockOrder[left.stock_state] - stockOrder[right.stock_state];
				if (stockDiff !== 0) return stockDiff;
				return left.name.localeCompare(right.name, "th");
			});

		const categoryCounts = new Map<string, number>();
		for (const item of items) {
			const categoryId = item.category_id || "uncategorized";
			categoryCounts.set(categoryId, (categoryCounts.get(categoryId) || 0) + 1);
		}

		const responseCategories = categories
			.map((category) => ({
				id: category.id,
				name: category.name,
				count: categoryCounts.get(category.id) || 0,
			}))
			.filter((category) => category.count > 0);

		const uncategorizedCount = categoryCounts.get("uncategorized") || 0;
		if (uncategorizedCount > 0) {
			responseCategories.push({
				id: "uncategorized",
				name: "ไม่ระบุหมวด",
				count: uncategorizedCount,
			});
		}

		return {
			store: {
				id: store?.id || normalizedStoreId,
				name: store?.name || "ร้านค้า",
				address: store?.address || null,
				phone_number: store?.phone_number || null,
				pdf_company_name: store?.pdf_company_name || null,
				pdf_company_address: store?.pdf_company_address || null,
				pdf_company_phone: store?.pdf_company_phone || null,
				receipt_show_store_address: Number(store?.receipt_show_store_address ?? 1),
				receipt_show_store_phone: Number(store?.receipt_show_store_phone ?? 1),
				receipt_show_tendered: Number(store?.receipt_show_tendered ?? 1),
				receipt_show_change: Number(store?.receipt_show_change ?? 1),
				receipt_show_queue: Number(store?.receipt_show_queue ?? 1),
				pickup_queue_enabled: Number(store?.pickup_queue_enabled ?? 0),
				currency: store?.currency || null,
				vat_enabled: Number(store?.vat_enabled ?? 0),
				vat_rate: Number(store?.vat_rate ?? 0),
				vat_mode: String(store?.vat_mode || "EXCLUSIVE"),
				store_type: String(store?.store_type || "OTHER"),
			},
			categories: responseCategories,
			items,
		};
	}
}
