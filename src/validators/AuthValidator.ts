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

	private static readonly profileBodySchema = z.object({
		name: z.string().trim().min(1, "name is required").max(120, "name is too long"),
	});

	private static readonly changePasswordBodySchema = z.object({
		currentPassword: z.string().min(1, "currentPassword is required"),
		newPassword: z.string().min(6, "newPassword must be at least 6 characters"),
		confirmPassword: z.string().min(6, "confirmPassword must be at least 6 characters"),
	}).refine((value) => value.newPassword === value.confirmPassword, {
		message: "confirmPassword must match newPassword",
		path: [ "confirmPassword" ],
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

	public static readonly updateProfile = AuthValidator.init({
		body: AuthValidator.profileBodySchema,
	});

	public static readonly changePassword = AuthValidator.init({
		body: AuthValidator.changePasswordBodySchema,
	});
}
