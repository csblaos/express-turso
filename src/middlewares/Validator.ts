import { NextFunction, Request, RequestHandler, Response } from "express";
import { z, ZodError, ZodTypeAny } from "zod";

import { ApiError } from "@middlewares/ApiError";

type ValidatorSchemas = {
	body?: ZodTypeAny;
	params?: ZodTypeAny;
	query?: ZodTypeAny;
};

export class ValidatorMiddleware {
	private static formatZodError(error: ZodError, segment: keyof ValidatorSchemas): string {
		const issue = error.issues[0];
		if (!issue) return `Invalid ${segment}`;

		const path = issue.path.length > 0 ? issue.path.join(".") : segment;
		return `${path}: ${issue.message}`;
	}

	private static parseSegment<T extends keyof ValidatorSchemas>(
		req: Request,
		segment: T,
		schema: ValidatorSchemas[T],
	): void {
		if (!schema) return;

		try {
			const parsedValue = schema.parse(req[segment]);
			(req as unknown as Record<string, unknown>)[segment] = parsedValue;
		} catch (error) {
			if (error instanceof z.ZodError) {
				throw ApiError.BadRequestError(this.formatZodError(error, segment));
			}
			throw error;
		}
	}

	static init(schemas: ValidatorSchemas): RequestHandler {
		return (req: Request, res: Response, next: NextFunction) => {
			try {
				this.parseSegment(req, "params", schemas.params);
				this.parseSegment(req, "query", schemas.query);
				this.parseSegment(req, "body", schemas.body);
				next();
			} catch (error) {
				next(error);
				return;
			}
		};
	}
}

export const Validator = ValidatorMiddleware;
