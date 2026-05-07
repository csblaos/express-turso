import { ErrorConfig } from "@configs/ErrorConfig";
import { ProductInterface } from "@interfaces/ProductInterface";
import {
	PurchaseOrderCreatePayload,
	PurchaseOrderDetail,
	PurchaseOrderInterface,
	PurchaseOrderListFilters,
	PurchaseOrderListItem,
} from "@interfaces/PurchaseOrderInterface";
import { ApiError } from "@middlewares/ApiError";

function normalizeOptionalString(value?: string | null): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

function generatePoNumber() {
	const now = new Date();
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, "0");
	const d = String(now.getDate()).padStart(2, "0");
	const h = String(now.getHours()).padStart(2, "0");
	const min = String(now.getMinutes()).padStart(2, "0");
	const s = String(now.getSeconds()).padStart(2, "0");
	return `PO-${y}${m}${d}-${h}${min}${s}`;
}

export class PurchaseOrderComponent {
	static async getAll(requestId: string, filters: PurchaseOrderListFilters): Promise<PurchaseOrderListItem[]> {
		void requestId;
		return PurchaseOrderInterface.findMany(filters);
	}

	static async getById(requestId: string, id: string): Promise<PurchaseOrderDetail> {
		void requestId;
		const detail = await PurchaseOrderInterface.findById(id);
		if (!detail) {
			throw ApiError.NotFoundError("Purchase order not found");
		}

		return detail;
	}

	static async create(requestId: string, payload: PurchaseOrderCreatePayload): Promise<PurchaseOrderDetail> {
		void requestId;

		if (!payload.store_id?.trim()) {
			throw ApiError.BadRequestError("store_id is required");
		}

		if (!Array.isArray(payload.items) || payload.items.length === 0) {
			throw ApiError.BadRequestError("items must have at least one line");
		}

		for (const item of payload.items) {
			if (!item.product_id?.trim()) {
				throw ApiError.BadRequestError("each item requires product_id");
			}

			if (!Number.isFinite(Number(item.qty_ordered)) || Number(item.qty_ordered) <= 0) {
				throw ApiError.BadRequestError("qty_ordered must be greater than 0");
			}

			const product = await ProductInterface.findById(item.product_id);
			if (!product || product.store_id !== payload.store_id) {
				throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_NOT_FOUND);
			}
		}

		const normalized: PurchaseOrderCreatePayload = {
			...payload,
			po_number: payload.po_number?.trim() || generatePoNumber(),
			supplier_name: normalizeOptionalString(payload.supplier_name),
			supplier_contact: normalizeOptionalString(payload.supplier_contact),
			other_cost_note: normalizeOptionalString(payload.other_cost_note),
			tracking_info: normalizeOptionalString(payload.tracking_info),
			note: normalizeOptionalString(payload.note),
			created_by: normalizeOptionalString(payload.created_by),
			payment_reference: normalizeOptionalString(payload.payment_reference),
			payment_note: normalizeOptionalString(payload.payment_note),
			items: payload.items.map((item) => ({
				...item,
				product_id: item.product_id.trim(),
				unit_id: normalizeOptionalString(item.unit_id),
				qty_ordered: Number(item.qty_ordered),
				unit_cost_purchase: item.unit_cost_purchase === undefined ? 0 : Number(item.unit_cost_purchase),
				unit_cost_base: item.unit_cost_base === undefined ? undefined : Number(item.unit_cost_base),
				landed_cost_per_unit: item.landed_cost_per_unit === undefined ? undefined : Number(item.landed_cost_per_unit),
				multiplier_to_base: item.multiplier_to_base === undefined ? 1 : Number(item.multiplier_to_base),
				qty_base_ordered: item.qty_base_ordered === undefined ? undefined : Number(item.qty_base_ordered),
			})),
			purchase_currency: payload.purchase_currency?.trim() || "LAK",
			exchange_rate: payload.exchange_rate === undefined ? 1 : Number(payload.exchange_rate),
			shipping_cost: payload.shipping_cost === undefined ? 0 : Number(payload.shipping_cost),
			other_cost: payload.other_cost === undefined ? 0 : Number(payload.other_cost),
			exchange_rate_initial: payload.exchange_rate_initial === undefined
				? payload.exchange_rate === undefined ? 1 : Number(payload.exchange_rate)
				: Number(payload.exchange_rate_initial),
			shipping_cost_original: payload.shipping_cost_original === undefined
				? payload.shipping_cost === undefined ? 0 : Number(payload.shipping_cost)
				: Number(payload.shipping_cost_original),
			other_cost_original: payload.other_cost_original === undefined
				? payload.other_cost === undefined ? 0 : Number(payload.other_cost)
				: Number(payload.other_cost_original),
			shipping_cost_currency: payload.shipping_cost_currency?.trim() || payload.purchase_currency?.trim() || "LAK",
			other_cost_currency: payload.other_cost_currency?.trim() || payload.purchase_currency?.trim() || "LAK",
			status: payload.status?.trim() || "draft",
			payment_status: payload.payment_status?.trim() || "unpaid",
		};

		return PurchaseOrderInterface.create(normalized);
	}
}
