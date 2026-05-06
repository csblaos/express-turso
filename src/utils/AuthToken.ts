import { createHmac, timingSafeEqual } from "crypto";

export type AuthTokenType = "access" | "refresh";

export type AuthTokenPayload = {
	sub: string;
	sid: string;
	typ: AuthTokenType;
	role: string;
	email: string;
	name: string;
	remember: boolean;
	iat: number;
	exp: number;
};

function encodeBase64Url(input: Buffer | string): string {
	return Buffer.from(input)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/u, "");
}

function decodeBase64Url(input: string): Buffer {
	const normalized = input
		.replace(/-/g, "+")
		.replace(/_/g, "/");
	const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
	return Buffer.from(padded, "base64");
}

function signSegment(input: string, secret: string): string {
	return encodeBase64Url(createHmac("sha256", secret).update(input).digest());
}

export class AuthToken {
	static sign(payload: AuthTokenPayload, secret: string): string {
		const header = {
			alg: "HS256",
			typ: "JWT",
		};
		const encodedHeader = encodeBase64Url(JSON.stringify(header));
		const encodedPayload = encodeBase64Url(JSON.stringify(payload));
		const signingInput = `${encodedHeader}.${encodedPayload}`;
		const signature = signSegment(signingInput, secret);
		return `${signingInput}.${signature}`;
	}

	static verify(token: string, secret: string): AuthTokenPayload | null {
		const segments = token.split(".");
		if (segments.length !== 3) return null;

		const [ encodedHeader, encodedPayload, encodedSignature ] = segments;
		const signingInput = `${encodedHeader}.${encodedPayload}`;
		const expectedSignature = signSegment(signingInput, secret);

		const providedBuffer = Buffer.from(encodedSignature);
		const expectedBuffer = Buffer.from(expectedSignature);
		if (
			providedBuffer.length !== expectedBuffer.length ||
			!timingSafeEqual(providedBuffer, expectedBuffer)
		) {
			return null;
		}

		try {
			const payload = JSON.parse(decodeBase64Url(encodedPayload).toString("utf8")) as AuthTokenPayload;
			if (!payload || typeof payload !== "object") return null;
			if (!payload.sub || !payload.sid || !payload.typ || !payload.exp || !payload.iat) return null;
			if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
			return payload;
		} catch {
			return null;
		}
	}
}
