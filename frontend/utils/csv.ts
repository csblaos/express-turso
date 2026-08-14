export type CsvCell = string | number | null | undefined;

// RFC 4180 quoting: wrap in quotes when the value carries a delimiter, quote or
// newline, and double any embedded quote.
export function escapeCsvValue(value: unknown) {
	if (value === null || value === undefined) return "";
	const stringValue = String(value);
	const escaped = stringValue.replace(/"/g, '""');
	return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}

export function toCsv(headers: string[], rows: CsvCell[][]) {
	return [
		headers.map(escapeCsvValue).join(","),
		...rows.map((row) => row.map(escapeCsvValue).join(",")),
	].join("\r\n");
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
	if (!import.meta.client) return;
	const blob = new Blob([ content ], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

// The BOM is what makes Excel read the file as UTF-8; without it Lao and Thai
// text arrives as mojibake.
export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]) {
	downloadTextFile(filename, `\ufeff${toCsv(headers, rows)}\r\n`, "text/csv;charset=utf-8");
}

// Reports are period-scoped, so the range belongs in the filename rather than in
// a header row that would break spreadsheet parsing.
export function csvFilename(base: string, from?: string, to?: string) {
	const parts = [ base ];
	if (from && to) parts.push(from === to ? from : `${from}_${to}`);
	else parts.push(new Date().toISOString().slice(0, 10));
	return `${parts.join("_")}.csv`;
}
