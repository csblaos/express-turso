import { z } from "zod";

import { ValidatorMiddleware } from "@middlewares/ValidatorMiddleware";

export default class PrintQueueValidator extends ValidatorMiddleware {
	static readonly query = PrintQueueValidator.init({ query: z.object({ store_id: z.string().trim().min(1).optional() }) });
	static readonly printer = PrintQueueValidator.init({ body: z.object({
		store_id: z.string().optional(),
		name: z.string().trim().min(1).max(80),
		// host:port the agent opens a socket to. Kept as text because a shop may
		// also point it at a queue name on the counter PC rather than an address.
		address: z.string().trim().min(1).max(160),
		station_id: z.string().trim().min(1).nullable().optional(),
		paper_width: z.union([ z.literal(58), z.literal(80) ]).optional(),
		sort_order: z.coerce.number().int().optional(),
		is_active: z.union([ z.boolean(), z.coerce.number().int().min(0).max(1) ]).optional(),
	}) });
	static readonly agent = PrintQueueValidator.init({ body: z.object({ store_id: z.string().optional(), name: z.string().trim().min(1).max(80) }) });
	static readonly claim = PrintQueueValidator.init({ body: z.object({ limit: z.coerce.number().int().min(1).max(20).optional() }) });
	static readonly complete = PrintQueueValidator.init({ body: z.object({ ok: z.boolean().optional(), error: z.string().trim().max(400).optional() }) });
}
