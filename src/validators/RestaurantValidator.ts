import { z } from "zod";

import { ValidatorMiddleware } from "@middlewares/ValidatorMiddleware";

const store = z.object({ store_id: z.string().trim().min(1).optional() });
const version = z.coerce.number().int().positive();

export default class RestaurantValidator extends ValidatorMiddleware {
	static readonly zone = RestaurantValidator.init({ body: z.object({ store_id: z.string().optional(), name: z.string().trim().min(1).max(80), sort_order: z.coerce.number().int().optional(), is_active: z.union([z.boolean(), z.coerce.number().int().min(0).max(1)]).optional() }) });
	static readonly table = RestaurantValidator.init({ body: z.object({ store_id: z.string().optional(), zone_id: z.string().trim().min(1), name: z.string().trim().min(1).max(80), code: z.string().trim().max(40).nullable().optional(), capacity: z.coerce.number().int().positive().max(100).optional(), sort_order: z.coerce.number().int().optional(), is_active: z.union([z.boolean(), z.coerce.number().int().min(0).max(1)]).optional() }) });
	static readonly open = RestaurantValidator.init({ body: z.object({
		store_id: z.string().optional(),
		service_mode: z.enum(["pickup", "dine-in"]).optional(),
		table_id: z.string().trim().min(1).optional(),
		guest_count: z.coerce.number().int().positive().max(100).optional(),
		initial_item: z.object({ product_id: z.string().trim().min(1), qty: z.coerce.number().int().positive(), note: z.string().trim().max(280).nullable().optional() }).optional(),
	}).superRefine((value, context) => {
		if ((value.service_mode || (value.table_id ? "dine-in" : "pickup")) === "dine-in" && !value.table_id) context.addIssue({ code: "custom", path: ["table_id"], message: "table_id is required for dine-in" });
	}) });
	static readonly availability = RestaurantValidator.init({ body: z.object({ store_id: z.string().optional(), sold_out: z.boolean() }) });
	static readonly addItem = RestaurantValidator.init({ body: z.object({ store_id: z.string().optional(), product_id: z.string().trim().min(1), qty: z.coerce.number().int().positive().optional(), note: z.string().trim().max(280).nullable().optional(), expected_version: version }) });
	static readonly updateItem = RestaurantValidator.init({ body: z.object({ store_id: z.string().optional(), qty: z.coerce.number().int().positive(), note: z.string().trim().max(280).nullable().optional(), expected_version: version }) });
	static readonly version = RestaurantValidator.init({ body: z.object({ store_id: z.string().optional(), expected_version: version }) });
	static readonly transfer = RestaurantValidator.init({ body: z.object({ store_id: z.string().optional(), table_id: z.string().trim().min(1), expected_version: version }) });
	static readonly serviceMode = RestaurantValidator.init({ body: z.object({ store_id: z.string().optional(), service_mode: z.enum(["pickup", "dine-in"]), table_id: z.string().trim().min(1).optional(), guest_count: z.coerce.number().int().positive().max(100).optional(), expected_version: version }).superRefine((value, context) => { if (value.service_mode === "dine-in" && !value.table_id) context.addIssue({ code: "custom", path: ["table_id"], message: "table_id is required for dine-in" }); }) });
	static readonly cancel = RestaurantValidator.init({ body: z.object({ store_id: z.string().optional(), expected_version: version, reason: z.string().trim().min(1).max(280) }) });
	static readonly cancelOrder = RestaurantValidator.init({ body: z.object({ store_id: z.string().optional(), expected_version: version, reason: z.string().trim().max(280).optional() }) });
	static readonly checkout = RestaurantValidator.init({ body: z.object({ store_id: z.string().optional(), expected_version: version, payment_method: z.enum(["cash", "qr_transfer", "credit_card"]), dispatch_mode: z.enum(["existing", "direct"]).optional(), amount_tendered: z.coerce.number().nonnegative().nullable().optional(), payment_reference: z.string().trim().max(160).nullable().optional(), note: z.string().trim().max(500).nullable().optional() }) });
	static readonly query = RestaurantValidator.init({ query: store });
	static readonly reportQuery = RestaurantValidator.init({ query: store.extend({ from: z.string().datetime().optional() }) });
}
