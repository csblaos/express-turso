export function getApiErrorStatus(errorValue: unknown): number | null {
	if (typeof errorValue !== "object" || !errorValue) return null;

	const response = Reflect.get(errorValue, "response");
	if (typeof response !== "object" || !response) return null;

	const status = Reflect.get(response, "status");
	return typeof status === "number" ? status : null;
}

export function resolveApiErrorMessage(
	errorValue: unknown,
	fallback = "โปรดลองอีกครั้ง",
	options?: {
		forbiddenMessage?: string;
		unauthorizedMessage?: string;
	},
) {
	const status = getApiErrorStatus(errorValue);

	if (status === 403) {
		return options?.forbiddenMessage || "คุณไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้";
	}

	if (status === 401) {
		return options?.unauthorizedMessage || "เซสชันหมดอายุหรือยังไม่พร้อมใช้งาน กรุณาเข้าสู่ระบบใหม่";
	}

	if (typeof errorValue === "object" && errorValue) {
		const response = Reflect.get(errorValue, "response");
		if (typeof response === "object" && response) {
			const data = Reflect.get(response, "_data") || Reflect.get(response, "data");
			if (typeof data === "object" && data) {
				const message = Reflect.get(data, "message");
				if (typeof message === "string" && message.trim()) {
					return message;
				}
			}
		}
	}

	if (errorValue instanceof Error && errorValue.message.trim()) {
		return errorValue.message;
	}

	return fallback;
}
