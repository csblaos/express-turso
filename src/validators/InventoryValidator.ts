import { z } from "zod";

import { ValidatorMiddleware } from "@middlewares/ValidatorMiddleware";

const nonEmptyString = z.string().trim().min(1, "must be a non-empty string");

const finiteNumber = z.preprocess((value) => {
	if (typeof value === "string") {
		const trimmedValue = value.trim();
		if (trimmedValue === "") return value;
		const parsedValue = Number(trimmedValue);
		return Number.isFinite(parsedValue) ? parsedValue : value;
	}

	return value;
}, z.number().finite("must be a number"));

const finiteInteger = z.preprocess((value) => {
	if (typeof value === "string") {
		const trimmedValue = value.trim();
		if (trimmedValue === "") return value;
		const parsedValue = Number(trimmedValue);
		return Number.isFinite(parsedValue) ? parsedValue : value;
	}

	return value;
}, z.number().int("must be an integer").positive("must be greater than 0").max(100, "must be less than or equal to 100"));

function createPositiveIntegerSchema(maxValue: number) {
	return z.preprocess((value) => {
		if (typeof value === "string") {
			const trimmedValue = value.trim();
			if (trimmedValue === "") return value;
			const parsedValue = Number(trimmedValue);
			return Number.isFinite(parsedValue) ? parsedValue : value;
		}

		return value;
	}, z.number().int("must be an integer").positive("must be greater than 0").max(maxValue, `must be less than or equal to ${maxValue}`));
}

export default class InventoryValidator extends ValidatorMiddleware {
	private static readonly listQuerySchema = z.object({
		store_id: z.string().optional(),
		query: z.string().optional(),
		status: z.enum(["all", "low", "out", "negative", "active", "inactive"]).optional(),
		sort: z.enum(["updated", "name", "available"]).optional(),
	});

	private static readonly movementsQuerySchema = z.object({
		store_id: z.string().optional(),
		product_id: z.string().optional(),
		limit: createPositiveIntegerSchema(500).optional(),
		query: z.string().optional(),
		type: z.string().optional(),
		from: z.string().optional(),
		to: z.string().optional(),
	});

	private static readonly adjustmentBodySchema = z.object({
		store_id: nonEmptyString,
		product_id: nonEmptyString,
		mode: z.enum(["increment", "decrement", "set"]),
		qty_base: finiteNumber,
		note: z.string().trim().nullish(),
		created_by: z.string().trim().nullish(),
	}).superRefine((value, ctx) => {
		const qty = value.qty_base;
		if (!Number.isFinite(qty)) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: "qty_base must be a number", path: ["qty_base"] });
			return;
		}
		if (!Number.isInteger(qty)) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: "qty_base must be an integer", path: ["qty_base"] });
			return;
		}
		if (value.mode === "set") {
			if (qty < 0) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, message: "qty_base must be greater than or equal to 0", path: ["qty_base"] });
			}
			return;
		}
		if (qty <= 0) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: "qty_base must be greater than 0", path: ["qty_base"] });
		}
	});

	public static readonly list = InventoryValidator.init({
		query: InventoryValidator.listQuerySchema,
	});

	public static readonly movements = InventoryValidator.init({
		query: InventoryValidator.movementsQuerySchema,
	});

	public static readonly adjustment = InventoryValidator.init({
		body: InventoryValidator.adjustmentBodySchema,
	});
}
