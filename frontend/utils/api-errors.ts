function isObjectLike(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && (typeof value === "object" || typeof value === "function");
}

function getProp(value: unknown, key: string): unknown {
	if (!isObjectLike(value)) return undefined;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return (value as any)[key];
}

function normalizeMessage(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}

function isNetworkLikeMessage(message: string) {
	const lower = message.toLowerCase();
	return lower.includes("err_connection_refused")
		|| lower.includes("failed to fetch")
		|| lower.includes("fetch failed")
		|| lower.includes("networkerror")
		|| lower.includes("load failed")
		|| lower.includes("econnrefused")
		|| lower.includes("network request failed");
}

export function getApiErrorStatus(errorValue: unknown): number | null {
	const response = getProp(errorValue, "response");
	const status = getProp(response, "status");
	return typeof status === "number" ? status : null;
}

export function resolveApiErrorMessage(
	errorValue: unknown,
	fallback = "โปรดลองอีกครั้ง",
	options?: {
		forbiddenMessage?: string;
		unauthorizedMessage?: string;
		networkMessage?: string;
	},
) {
	const status = getApiErrorStatus(errorValue);

	if (status === 403) {
		return options?.forbiddenMessage || "คุณไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้";
	}

	if (status === 401) {
		return options?.unauthorizedMessage || "เซสชันหมดอายุหรือยังไม่พร้อมใช้งาน กรุณาเข้าสู่ระบบใหม่";
	}

	const response = getProp(errorValue, "response");
	const data = getProp(response, "_data") || getProp(response, "data");
	const messageFromData = normalizeMessage(getProp(data, "message"));
	if (messageFromData) return messageFromData;

	const messageFromError = normalizeMessage(getProp(errorValue, "message"))
		|| (errorValue instanceof Error ? normalizeMessage(errorValue.message) : null);
	if (messageFromError) {
		if (isNetworkLikeMessage(messageFromError)) {
			return options?.networkMessage || "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง";
		}
		return messageFromError;
	}

	return fallback;
}
