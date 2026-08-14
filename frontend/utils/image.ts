// Stored image columns hold either a full URL (uploads pasted in by hand, data
// URLs from a picker) or an R2 object key. Only the key needs the public bucket
// base prefixed, so callers can pass whatever the API gave them.
export function resolveStoredImageUrl(imageUrl: string | null | undefined, publicBaseUrl: string) {
	const normalized = String(imageUrl || "").trim();
	if (!normalized) return null;
	if (/^(https?:\/\/|data:|blob:)/i.test(normalized) || normalized.startsWith("//")) return normalized;
	const base = String(publicBaseUrl || "").replace(/\/$/, "");
	const path = normalized.startsWith("/") ? normalized : `/${normalized}`;
	return `${base}${path}`;
}
