import { Response } from "express";

function formatDuration(durationMs: number): string {
	return Math.max(0, durationMs).toFixed(1);
}

export function appendServerTiming(res: Response, name: string, durationMs: number): void {
	if (res.headersSent) return;
	const normalizedName = name.replace(/[^a-zA-Z0-9_-]/g, "-");
	const metric = `${normalizedName};dur=${formatDuration(durationMs)}`;
	const current = res.getHeader("server-timing");

	if (!current) {
		res.setHeader("server-timing", metric);
		return;
	}

	const currentValue = Array.isArray(current) ? current.join(", ") : String(current);
	res.setHeader("server-timing", `${currentValue}, ${metric}`);
}
