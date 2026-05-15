import { createHash, createHmac, randomUUID } from "crypto";

import { ApiError } from "@middlewares/ApiError";

type R2Config = {
	accountId: string;
	accessKeyId: string;
	secretAccessKey: string;
	bucket: string;
	publicBaseUrl?: string;
	productImagePrefix: string;
	region: string;
};

function sha256Hex(data: string | Buffer): string {
	return createHash("sha256").update(data).digest("hex");
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
	return createHmac("sha256", key).update(data).digest();
}

function getAwsSignatureKey(secretAccessKey: string, dateStamp: string, region: string, service: string): Buffer {
	const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
	const kRegion = hmacSha256(kDate, region);
	const kService = hmacSha256(kRegion, service);
	return hmacSha256(kService, "aws4_request");
}

function encodeRfc3986(input: string): string {
	return encodeURIComponent(input).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildCanonicalUri(pathname: string): string {
	const parts = pathname.split("/").filter((part) => part.length > 0);
	return `/${parts.map(encodeRfc3986).join("/")}`;
}

function parseImageDataUrl(raw: string): { mime: string; bytes: Buffer } | null {
	const match = /^data:([^;]+);base64,(.+)$/i.exec(raw.trim());
	if (!match) return null;
	const mime = match[1]?.toLowerCase() || "";
	const bytes = Buffer.from(match[2], "base64");
	if (!bytes.length) return null;
	return { mime, bytes };
}

function getR2Config(): R2Config {
	const accountId = String(process.env.R2_ACCOUNT_ID || "").trim();
	const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || "").trim();
	const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || "").trim();
	const bucket = String(process.env.R2_BUCKET || "").trim();
	const publicBaseUrl = String(process.env.R2_PUBLIC_BASE_URL || "").trim() || undefined;
	const productImagePrefix = String(process.env.R2_PRODUCT_IMAGE_PREFIX || "product-images").trim() || "product-images";
	const region = String(process.env.R2_REGION || "auto").trim() || "auto";

	if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
		throw ApiError.InternalError("R2 config is missing (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET)");
	}

	return {
		accountId,
		accessKeyId,
		secretAccessKey,
		bucket,
		publicBaseUrl,
		productImagePrefix,
		region,
	};
}

export class R2Storage {
	static buildPublicUrl(key: string): string | null {
		const config = getR2Config();
		if (!config.publicBaseUrl) return null;
		const base = config.publicBaseUrl.replace(/\/$/, "");
		const path = key.startsWith("/") ? key : `/${key}`;
		return `${base}${path}`;
	}

	static async uploadProductImage(input: {
		storeId: string;
		productId: string;
		dataUrl: string;
	}): Promise<{ key: string; bytes: number; mime: string }> {
		const config = getR2Config();
		const parsed = parseImageDataUrl(input.dataUrl);
		if (!parsed) {
			throw ApiError.BadRequestError("image_url must be a data URL (base64)");
		}

		// Backend enforce WebP for best performance. Frontend already converts to WebP.
		if (parsed.mime !== "image/webp") {
			throw ApiError.BadRequestError("image_url must be image/webp");
		}

		if (parsed.bytes.length > 3 * 1024 * 1024) {
			throw ApiError.BadRequestError("image_url exceeds 3 MB");
		}

		const storeToken = input.storeId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "store";
		const objectId = randomUUID().slice(0, 12);
		const key = `${config.productImagePrefix}/${storeToken}/products/${input.productId}/${Date.now()}-${objectId}.webp`;

		const host = `${config.accountId}.r2.cloudflarestorage.com`;
		const pathname = `/${config.bucket}/${key}`;
		const url = `https://${host}${pathname}`;

		const method = "PUT";
		const service = "s3";
		const now = new Date();
		const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
		const dateStamp = amzDate.slice(0, 8);
		const payloadHash = sha256Hex(parsed.bytes);

		const headers: Record<string, string> = {
			host,
			"content-type": parsed.mime,
			"cache-control": "public, max-age=31536000, immutable",
			"x-amz-content-sha256": payloadHash,
			"x-amz-date": amzDate,
		};

		const signedHeaderKeys = Object.keys(headers)
			.map((keyName) => keyName.toLowerCase())
			.sort();
		const canonicalHeaders = signedHeaderKeys
			.map((keyName) => `${keyName}:${String(headers[keyName]).trim()}\n`)
			.join("");
		const signedHeaders = signedHeaderKeys.join(";");

		const canonicalRequest = [
			method,
			buildCanonicalUri(pathname),
			"",
			canonicalHeaders,
			signedHeaders,
			payloadHash,
		].join("\n");

		const credentialScope = `${dateStamp}/${config.region}/${service}/aws4_request`;
		const stringToSign = [
			"AWS4-HMAC-SHA256",
			amzDate,
			credentialScope,
			sha256Hex(canonicalRequest),
		].join("\n");

		const signingKey = getAwsSignatureKey(config.secretAccessKey, dateStamp, config.region, service);
		const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

		const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

		const response = await fetch(url, {
			method,
			headers: {
				...headers,
				authorization,
			},
			body: new Blob([ new Uint8Array(parsed.bytes) ], { type: parsed.mime }),
		});

		if (!response.ok) {
			const text = await response.text().catch(() => "");
			throw ApiError.InternalError(`R2 upload failed (${response.status}): ${text || response.statusText}`);
		}

		return {
			key,
			bytes: parsed.bytes.length,
			mime: parsed.mime,
		};
	}
}
