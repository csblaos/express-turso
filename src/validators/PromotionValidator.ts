import { z } from "zod";
import { ValidatorMiddleware } from "@middlewares/ValidatorMiddleware";
const input = z.object({
	store_id: z.string().trim().min(1).optional(),
	name: z.string().trim().min(1).max(160),
	type: z.enum(["buy_x_get_y", "cart_total_gift", "cart_discount", "cart_threshold_discount"]),
	qualifying_product_id: z.string().trim().min(1).nullable().optional(),
	qualifying_qty: z.coerce.number().int().positive().nullable().optional(),
	minimum_subtotal: z.coerce.number().positive().nullable().optional(),
	gift_product_id: z.string().trim().min(1).nullable().optional(),
	gift_qty: z.coerce.number().int().positive().nullable().optional(),
	discount_method: z.enum(["percent", "fixed"]).nullable().optional(),
	discount_value: z.coerce.number().positive().nullable().optional(),
	max_applications_per_bill: z.coerce.number().int().positive().nullable().optional(),
	max_discount_amount_per_bill: z.coerce.number().positive().nullable().optional(),
	starts_at: z.string().datetime().nullable().optional(),
	ends_at: z.string().datetime().nullable().optional(),
	is_active: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
	apply_mode: z.enum(["automatic", "manual"]).optional(),
});
export default class PromotionValidator extends ValidatorMiddleware {
	static readonly save = PromotionValidator.init({ body: input });
	static readonly evaluate = PromotionValidator.init({ body: z.object({ store_id: z.string().trim().min(1).optional(), items: z.array(z.object({ product_id: z.string().trim().min(1), qty: z.coerce.number().int().positive(), is_gift: z.boolean().optional() })).default([]), promotion_ids: z.array(z.string().trim().min(1)).optional() }) });
}
