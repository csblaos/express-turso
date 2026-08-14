import { z } from "zod";

import { ValidatorMiddleware } from "@middlewares/ValidatorMiddleware";

const optionalTextSchema = (maxLength: number) => z.string().trim().max(maxLength).nullable().optional();

const baseSchema = z.object({
	display_name: z.string().trim().min(1, "display_name is required").max(120, "display_name is too long"),
	bank_name: optionalTextSchema(120),
	account_name: z.string().trim().min(1, "account_name is required").max(160, "account_name is too long"),
	account_number: optionalTextSchema(80),
	qr_id: optionalTextSchema(120),
	qr_image_url: z.string().trim().max(12_000_000).nullable().optional().or(z.literal("")),
	currency: z.string().trim().min(3, "currency is required").max(3, "currency must be 3 characters").optional(),
	is_default: z.coerce.number().int().min(0).max(1).optional(),
	is_active: z.coerce.number().int().min(0).max(1).optional(),
}).refine((value) => Boolean(value.account_number || value.qr_id || value.qr_image_url), {
	message: "account_number or qr_id or qr_image_url is required",
	path: [ "account_number" ],
});

const updateSchema = z.object({
	display_name: z.string().trim().min(1, "display_name is required").max(120, "display_name is too long").optional(),
	bank_name: optionalTextSchema(120),
	account_name: z.string().trim().min(1, "account_name is required").max(160, "account_name is too long").optional(),
	account_number: optionalTextSchema(80),
	qr_id: optionalTextSchema(120),
	qr_image_url: z.string().trim().max(12_000_000).nullable().optional().or(z.literal("")),
	currency: z.string().trim().min(3, "currency is required").max(3, "currency must be 3 characters").optional(),
	is_default: z.coerce.number().int().min(0).max(1).optional(),
	is_active: z.coerce.number().int().min(0).max(1).optional(),
});

export default class StorePaymentAccountValidator extends ValidatorMiddleware {
	public static readonly list = StorePaymentAccountValidator.init({});

	public static readonly create = StorePaymentAccountValidator.init({
		body: baseSchema,
	});

	public static readonly update = StorePaymentAccountValidator.init({
		body: updateSchema,
	});
}
