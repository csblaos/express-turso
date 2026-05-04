import crypto from "crypto";

export class Utils {
	static genUUID(): string {
		return crypto.randomUUID();
	}

	static jsonStringParse(input: unknown): unknown {
		if (typeof input !== "string") return input;
		try {
			return JSON.parse(input);
		} catch {
			return input;
		}
	}

	static stringify(input: unknown): string {
		const seen = new WeakSet<object>();

		return JSON.stringify(
			input,
			(key, value) => {
				if (value instanceof Error) {
					return {
						name: value.name,
						message: value.message,
						stack: value.stack,
					};
				}

				if (value && typeof value === "object") {
					if (seen.has(value as object)) return "[Circular]";
					seen.add(value as object);
				}

				return value;
			},
			2,
		);
	}
}
