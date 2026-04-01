import { NextFunction, Request, Response } from "express";

import { ApiError } from "@middlewares/ApiError";

export type ValidatorFn = (req: Request) => string | null;

export class Validator {
	static validate(validator: ValidatorFn) {
		return (req: Request, res: Response, next: NextFunction) => {
			const errorMessage = validator(req);
			if (errorMessage) {
				next(ApiError.BadRequestError(errorMessage));
				return;
			}
			next();
		};
	}
}

