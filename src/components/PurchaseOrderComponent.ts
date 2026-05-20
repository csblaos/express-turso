import { ErrorConfig } from "@configs/ErrorConfig";
import { ProductInterface } from "@interfaces/ProductInterface";
import {
	PurchaseOrderCreatePayload,
	PurchaseOrderDetail,
	PurchaseOrderInterface,
	PurchaseOrderListFilters,
	PurchaseOrderListItem,
	PurchaseOrderReceiveLineInput,
	PurchaseOrderUpdatePayload,
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

function normalizePurchaseOrderLine(item: PurchaseOrderCreatePayload["items"][number], exchangeRate: number) {
	const unitCostPurchase = item.unit_cost_purchase === undefined ? 0 : Number(item.unit_cost_purchase);
	return {
		...item,
		product_id: item.product_id.trim(),
		unit_id: normalizeOptionalString(item.unit_id),
		qty_ordered: Number(item.qty_ordered),
		unit_cost_purchase: unitCostPurchase,
		unit_cost_base: item.unit_cost_base === undefined ? unitCostPurchase * exchangeRate : Number(item.unit_cost_base),
		landed_cost_per_unit: item.landed_cost_per_unit === undefined ? unitCostPurchase * exchangeRate : Number(item.landed_cost_per_unit),
		multiplier_to_base: item.multiplier_to_base === undefined ? 1 : Number(item.multiplier_to_base),
		qty_base_ordered: item.qty_base_ordered === undefined ? undefined : Number(item.qty_base_ordered),
	};
}

function normalizePurchaseOrderPayload(payload: PurchaseOrderCreatePayload | PurchaseOrderUpdatePayload, status: string) {
	const exchangeRate = Number(payload.exchange_rate ?? 1) || 1;
	return {
		store_id: payload.store_id.trim(),
		po_number: payload.po_number?.trim() || generatePoNumber(),
		supplier_name: normalizeOptionalString(payload.supplier_name),
		supplier_contact: normalizeOptionalString(payload.supplier_contact),
		purchase_currency: payload.purchase_currency?.trim() || "LAK",
		exchange_rate: exchangeRate,
		shipping_cost: payload.shipping_cost === undefined ? 0 : Number(payload.shipping_cost) * exchangeRate,
		other_cost: payload.other_cost === undefined ? 0 : Number(payload.other_cost) * exchangeRate,
		other_cost_note: normalizeOptionalString(payload.other_cost_note),
		status,
		ordered_at: payload.ordered_at ?? null,
		expected_at: payload.expected_at ?? null,
		shipped_at: payload.shipped_at ?? null,
		received_at: payload.received_at ?? null,
		tracking_info: normalizeOptionalString(payload.tracking_info),
		note: normalizeOptionalString(payload.note),
		created_by: normalizeOptionalString(payload.created_by),
		updated_by: normalizeOptionalString((payload as PurchaseOrderUpdatePayload).updated_by),
		exchange_rate_initial: payload.exchange_rate_initial === undefined ? exchangeRate : Number(payload.exchange_rate_initial),
		payment_status: payload.payment_status?.trim() || "unpaid",
		paid_at: payload.paid_at ?? null,
		paid_by: normalizeOptionalString(payload.paid_by),
		payment_reference: normalizeOptionalString(payload.payment_reference),
		payment_note: normalizeOptionalString(payload.payment_note),
		due_date: payload.due_date ?? null,
		shipping_cost_original: payload.shipping_cost_original === undefined
			? payload.shipping_cost === undefined ? 0 : Number(payload.shipping_cost)
			: Number(payload.shipping_cost_original),
		shipping_cost_currency: payload.shipping_cost_currency?.trim() || payload.purchase_currency?.trim() || "LAK",
		other_cost_original: payload.other_cost_original === undefined
			? payload.other_cost === undefined ? 0 : Number(payload.other_cost)
			: Number(payload.other_cost_original),
		other_cost_currency: payload.other_cost_currency?.trim() || payload.purchase_currency?.trim() || "LAK",
		items: payload.items.map((item) => normalizePurchaseOrderLine(item, exchangeRate)),
	};
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

		const normalized = normalizePurchaseOrderPayload(payload, payload.status?.trim() || "draft");

		return PurchaseOrderInterface.create(normalized);
	}

	static async update(requestId: string, id: string, payload: PurchaseOrderUpdatePayload): Promise<PurchaseOrderDetail> {
		void requestId;

		if (!payload.store_id?.trim()) {
			throw ApiError.BadRequestError("store_id is required");
		}

		if (!Array.isArray(payload.items) || payload.items.length === 0) {
			throw ApiError.BadRequestError("items must have at least one line");
		}

		const existing = await PurchaseOrderInterface.findById(id);
		if (!existing) {
			throw ApiError.NotFoundError("Purchase order not found");
		}

		const canEditItems = existing.order.status === "draft";

		if (canEditItems) {
			for (const item of payload.items) {
				if (!item.product_id?.trim()) {
					throw ApiError.BadRequestError("each item requires product_id");
				}

				if (!Number.isFinite(Number(item.qty_ordered)) || Number(item.qty_ordered) <= 0) {
					throw ApiError.BadRequestError("qty_ordered must be greater than 0");
				}

				const product = await ProductInterface.findById(item.product_id);
				if (!product || product.store_id !== existing.order.store_id) {
					throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_NOT_FOUND);
				}
			}
		}

		const normalized = normalizePurchaseOrderPayload(
			{
				...payload,
				store_id: existing.order.store_id,
				po_number: existing.order.po_number,
				status: existing.order.status,
				payment_status: existing.order.payment_status,
			},
			existing.order.status,
		);

		const updated = await PurchaseOrderInterface.update(id, normalized);
		if (!updated) {
			throw new Error("Failed to update purchase order");
		}

		return updated;
	}

	static async markOrdered(requestId: string, id: string, orderedBy: string | null): Promise<PurchaseOrderDetail> {
		void requestId;
		const existing = await PurchaseOrderInterface.findById(id);
		if (!existing) {
			throw ApiError.NotFoundError("Purchase order not found");
		}
		if (existing.order.status !== "draft") {
			throw ApiError.BadRequestError("only draft purchase order can be marked as ordered");
		}

		const updated = await PurchaseOrderInterface.markOrdered(id, orderedBy);
		if (!updated) {
			throw new Error("Failed to mark purchase order as ordered");
		}

		return updated;
	}

	static async markArrived(requestId: string, id: string, arrivedBy: string | null): Promise<PurchaseOrderDetail> {
		void requestId;
		const existing = await PurchaseOrderInterface.findById(id);
		if (!existing) {
			throw ApiError.NotFoundError("Purchase order not found");
		}
		if (existing.order.status === "received" || existing.order.status === "partial") {
			throw ApiError.BadRequestError("purchase order that already received cannot be marked as arrived");
		}
		if (existing.order.status === "cancelled") {
			throw ApiError.BadRequestError("cancelled purchase order cannot be marked as arrived");
		}
		if (existing.order.status === "draft") {
			throw ApiError.BadRequestError("draft purchase order cannot be marked as arrived");
		}
		if (existing.order.status === "arrived") {
			return existing;
		}

		const updated = await PurchaseOrderInterface.markArrived(id, arrivedBy);
		if (!updated) {
			throw new Error("Failed to mark purchase order as arrived");
		}

		return updated;
	}

	static async receive(
		requestId: string,
		id: string,
		receivedBy: string | null,
		lineReceipts: PurchaseOrderReceiveLineInput[] = [],
	): Promise<PurchaseOrderDetail> {
		void requestId;
		const detail = await PurchaseOrderInterface.findById(id);
		if (!detail) {
			throw ApiError.NotFoundError("Purchase order not found");
		}

		if (detail.order.status === "received") {
			return detail;
		}

		if (detail.order.status === "cancelled") {
			throw ApiError.BadRequestError("cancelled purchase order cannot be received");
		}

		const receiptMap = new Map(lineReceipts.map((line) => [line.item_id, Number(line.qty_received)]));
		const normalizedReceipts = detail.items
			.map((item) => {
				const remainingQty = Math.max(0, Number(item.qty_ordered || 0) - Number(item.qty_received || 0));
				const requestedQty = lineReceipts.length === 0
					? remainingQty
					: Number(receiptMap.get(item.id) ?? 0);
				if (!Number.isFinite(requestedQty) || requestedQty < 0) {
					throw ApiError.BadRequestError("qty_received must be a valid number");
				}
				if (!receiptMap.has(item.id) && lineReceipts.length > 0) {
					return null;
				}
				if (requestedQty > remainingQty) {
					throw ApiError.BadRequestError("qty_received cannot exceed remaining quantity");
				}
				return requestedQty > 0
					? {
							item_id: item.id,
							qty_received: requestedQty,
						}
					: null;
			})
			.filter((line): line is PurchaseOrderReceiveLineInput => !!line);

		if (!normalizedReceipts.length) {
			throw ApiError.BadRequestError("receive quantity must be greater than 0");
		}

		const receivedAt = new Date().toISOString();
		const updated = await PurchaseOrderInterface.markReceived(detail.order.id, receivedAt, receivedBy, normalizedReceipts);
		if (!updated) {
			throw new Error("Failed to mark purchase order as received");
		}

		return updated;
	}
}
