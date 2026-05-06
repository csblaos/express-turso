import { z } from "zod";

import { ValidatorMiddleware } from "@middlewares/ValidatorMiddleware";

export default class AuthValidator extends ValidatorMiddleware {
	private static readonly loginBodySchema = z.object({
		emailOrUsername: z.string().trim().min(1, "emailOrUsername is required"),
		password: z.string().min(1, "password is required"),
		rememberMe: z.boolean().optional(),
	});

	private static readonly refreshBodySchema = z.object({
		refreshToken: z.string().trim().min(1, "refreshToken is required"),
	});

	private static readonly logoutBodySchema = z.object({
		refreshToken: z.string().trim().min(1).optional(),
		sessionId: z.string().trim().min(1).optional(),
	}).refine((value) => Boolean(value.refreshToken || value.sessionId), {
		message: "refreshToken or sessionId is required",
		path: [ "refreshToken" ],
	});

	public static readonly login = AuthValidator.init({
		body: AuthValidator.loginBodySchema,
	});

	public static readonly refresh = AuthValidator.init({
		body: AuthValidator.refreshBodySchema,
	});

	public static readonly logout = AuthValidator.init({
		body: AuthValidator.logoutBodySchema,
	});
}
