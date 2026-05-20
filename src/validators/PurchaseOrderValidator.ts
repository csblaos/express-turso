import { z } from "zod";

import { ValidatorMiddleware } from "@middlewares/ValidatorMiddleware";

const nonEmptyString = z.string().trim().min(1, "must be a non-empty string");

const finiteNumber = z.preprocess((value) => {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed === "") return value;
		const parsed = Number(trimmed);
		return Number.isFinite(parsed) ? parsed : value;
	}
	return value;
}, z.number().finite("must be a number"));

const positiveNumber = z.preprocess((value) => {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed === "") return value;
		const parsed = Number(trimmed);
		return Number.isFinite(parsed) ? parsed : value;
	}
	return value;
}, z.number().finite("must be a number").positive("must be greater than 0"));

const nonNegativeNumber = z.preprocess((value) => {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed === "") return value;
		const parsed = Number(trimmed);
		return Number.isFinite(parsed) ? parsed : value;
	}
	return value;
}, z.number().finite("must be a number").min(0, "must be at least 0"));

const optionalString = z.string().trim().nullish();
const optionalNumber = finiteNumber.nullish();

export default class PurchaseOrderValidator extends ValidatorMiddleware {
	private static readonly listQuerySchema = z.object({
		store_id: optionalString,
		query: optionalString,
		status: optionalString,
		payment_status: optionalString,
	});

	private static readonly createLineSchema = z.object({
		product_id: nonEmptyString,
		qty_ordered: positiveNumber,
		unit_cost_purchase: optionalNumber,
		unit_cost_base: optionalNumber,
		landed_cost_per_unit: optionalNumber,
		unit_id: optionalString,
		multiplier_to_base: optionalNumber,
		qty_base_ordered: optionalNumber,
	});

	private static readonly createBodySchema = z.object({
		store_id: nonEmptyString,
		po_number: optionalString,
		supplier_name: optionalString,
		supplier_contact: optionalString,
		purchase_currency: optionalString,
		exchange_rate: optionalNumber,
		shipping_cost: optionalNumber,
		other_cost: optionalNumber,
		other_cost_note: optionalString,
		status: optionalString,
		ordered_at: optionalString,
		expected_at: optionalString,
		shipped_at: optionalString,
		received_at: optionalString,
		tracking_info: optionalString,
		note: optionalString,
		created_by: optionalString,
		cancelled_at: optionalString,
		updated_by: optionalString,
		updated_at: optionalString,
		exchange_rate_locked_at: optionalString,
		exchange_rate_locked_by: optionalString,
		exchange_rate_lock_note: optionalString,
		exchange_rate_initial: optionalNumber,
		payment_status: optionalString,
		paid_at: optionalString,
		paid_by: optionalString,
		payment_reference: optionalString,
		payment_note: optionalString,
		due_date: optionalString,
		shipping_cost_original: optionalNumber,
		shipping_cost_currency: optionalString,
		other_cost_original: optionalNumber,
		other_cost_currency: optionalString,
		items: z.array(PurchaseOrderValidator.createLineSchema).min(1, "items must have at least one line"),
	});

	private static readonly receiveBodySchema = z.object({
		note: optionalString,
		items: z.array(z.object({
			item_id: nonEmptyString,
			qty_received: nonNegativeNumber,
		})).optional(),
	});

	public static readonly list = PurchaseOrderValidator.init({
		query: PurchaseOrderValidator.listQuerySchema,
	});

	public static readonly getById = PurchaseOrderValidator.init({
		params: z.object({
			id: nonEmptyString,
		}),
	});

	public static readonly markOrdered = PurchaseOrderValidator.init({
		params: z.object({
			id: nonEmptyString,
		}),
	});

	public static readonly markArrived = PurchaseOrderValidator.init({
		params: z.object({
			id: nonEmptyString,
		}),
	});

	public static readonly create = PurchaseOrderValidator.init({
		body: PurchaseOrderValidator.createBodySchema,
	});

	public static readonly update = PurchaseOrderValidator.init({
		params: z.object({
			id: nonEmptyString,
		}),
		body: PurchaseOrderValidator.createBodySchema,
	});

	public static readonly receive = PurchaseOrderValidator.init({
		params: z.object({
			id: nonEmptyString,
		}),
		body: PurchaseOrderValidator.receiveBodySchema,
	});
}
