import "express";

declare module "express-serve-static-core" {
	interface Request {
		requestId: string;
		isSeamless?: boolean;
		auth?: {
			userId: string;
			sessionId: string;
			systemRole: string;
			storeId?: string;
			permissions: string[];
		};
	}
}
