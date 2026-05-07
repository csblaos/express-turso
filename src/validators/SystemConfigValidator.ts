import { z } from "zod";

import { ValidatorMiddleware } from "@middlewares/ValidatorMiddleware";

const finiteNumber = z.preprocess((value) => {
	if (typeof value === "string") {
		const trimmedValue = value.trim();
		if (trimmedValue === "") return value;
		const parsedValue = Number(trimmedValue);
		return Number.isFinite(parsedValue) ? parsedValue : value;
	}

	return value;
}, z.number().finite("must be a number"));

const positiveInteger = z.preprocess((value) => {
	if (typeof value === "string") {
		const trimmedValue = value.trim();
		if (trimmedValue === "") return value;
		const parsedValue = Number(trimmedValue);
		return Number.isFinite(parsedValue) ? parsedValue : value;
	}

	return value;
}, z.number().int("must be an integer").positive("must be greater than 0"));

const nonNegativeInteger = z.preprocess((value) => {
	if (typeof value === "string") {
		const trimmedValue = value.trim();
		if (trimmedValue === "") return value;
		const parsedValue = Number(trimmedValue);
		return Number.isFinite(parsedValue) ? parsedValue : value;
	}

	return value;
}, z.number().int("must be an integer").nonnegative("must be greater than or equal to 0"));

const integerNumber = z.preprocess((value) => {
	if (typeof value === "string") {
		const trimmedValue = value.trim();
		if (trimmedValue === "") return value;
		const parsedValue = Number(trimmedValue);
		return Number.isFinite(parsedValue) ? parsedValue : value;
	}

	return value;
}, z.number().int("must be an integer"));

const optionalInteger = integerNumber.nullish();
const optionalPositiveInteger = z.preprocess((value) => {
	if (typeof value === "string") {
		const trimmedValue = value.trim();
		if (trimmedValue === "") return null;
		const parsedValue = Number(trimmedValue);
		return Number.isFinite(parsedValue) ? parsedValue : value;
	}

	return value;
}, z.number().int("must be an integer").positive("must be greater than 0").nullish());

export default class SystemConfigValidator extends ValidatorMiddleware {
	private static readonly updateBodySchema = z.object({
		default_can_create_branches: optionalInteger,
		default_max_branches_per_store: optionalPositiveInteger,
		default_session_limit: positiveInteger.optional(),
		store_logo_max_size_mb: positiveInteger.optional(),
		store_logo_auto_resize: optionalInteger,
		store_logo_resize_max_width: positiveInteger.optional(),
		payment_max_accounts_per_store: positiveInteger.optional(),
		payment_require_slip_for_lao_qr: optionalInteger,
		app_latest_build: nonNegativeInteger.optional(),
		app_min_required_build: nonNegativeInteger.optional(),
		app_update_message: z.string().trim().nullish(),
		auth_access_token_ttl_minutes: positiveInteger.optional(),
		auth_refresh_token_ttl_days: positiveInteger.optional(),
		auth_remember_me_refresh_ttl_days: positiveInteger.optional(),
		auth_max_failed_attempts: positiveInteger.optional(),
		auth_lockout_minutes: positiveInteger.optional(),
		auth_allow_multi_session: optionalInteger,
	});

	public static readonly update = SystemConfigValidator.init({
		body: SystemConfigValidator.updateBodySchema,
	});
}
