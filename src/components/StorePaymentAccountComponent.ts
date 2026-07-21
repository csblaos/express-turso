import { ErrorConfig } from "@configs/ErrorConfig";
import { ApiError } from "@middlewares/ApiError";
import { StorePaymentAccountCreateInput, StorePaymentAccountInterface, StorePaymentAccountRow, StorePaymentAccountUpdateInput } from "@interfaces/StorePaymentAccountInterface";
import { StoreAccessActor, StoreInterface } from "@interfaces/StoreInterface";
import { R2Storage } from "@storage/R2Storage";

function normalizeText(value?: string | null): string | null {
	const text = String(value || "").trim();
	return text ? text : null;
}

function isDataUrl(value?: string | null): boolean {
	return String(value || "").trim().startsWith("data:");
}

async function uploadQrImageIfNeeded(storeId: string, qrImageUrl?: string | null): Promise<string | null> {
	const normalized = normalizeText(qrImageUrl);
	if (!normalized) return null;
	if (!isDataUrl(normalized)) return normalized;

	const uploaded = await R2Storage.uploadStorePaymentQrImage({
		storeId,
		dataUrl: normalized,
	});
	return uploaded.key;
}

function hasPaymentIdentifier(payload: StorePaymentAccountCreateInput | StorePaymentAccountUpdateInput): boolean {
	return Boolean(
		normalizeText(payload.account_number)
		|| normalizeText(payload.qr_id)
		|| normalizeText(payload.qr_image_url),
	);
}

function pickCreatePayload(input: Record<string, unknown>): StorePaymentAccountCreateInput {
	return {
		display_name: String(input.display_name || "").trim(),
		bank_name: normalizeText(input.bank_name as string | undefined),
		account_name: String(input.account_name || "").trim(),
		account_number: normalizeText(input.account_number as string | undefined),
		qr_id: normalizeText(input.qr_id as string | undefined),
		qr_image_url: normalizeText(input.qr_image_url as string | undefined),
		currency: String(input.currency || "LAK").trim().toUpperCase() || "LAK",
		is_default: Number(input.is_default || 0) ? 1 : 0,
		is_active: input.is_active === undefined ? 1 : (Number(input.is_active) ? 1 : 0),
	};
}

function pickUpdatePayload(input: Record<string, unknown>): StorePaymentAccountUpdateInput {
	const payload: StorePaymentAccountUpdateInput = {};

	if (Object.prototype.hasOwnProperty.call(input, "display_name")) payload.display_name = String(input.display_name || "").trim();
	if (Object.prototype.hasOwnProperty.call(input, "bank_name")) payload.bank_name = normalizeText(input.bank_name as string | undefined);
	if (Object.prototype.hasOwnProperty.call(input, "account_name")) payload.account_name = String(input.account_name || "").trim();
	if (Object.prototype.hasOwnProperty.call(input, "account_number")) payload.account_number = normalizeText(input.account_number as string | undefined);
	if (Object.prototype.hasOwnProperty.call(input, "qr_id")) payload.qr_id = normalizeText(input.qr_id as string | undefined);
	if (Object.prototype.hasOwnProperty.call(input, "qr_image_url")) payload.qr_image_url = normalizeText(input.qr_image_url as string | undefined);
	if (Object.prototype.hasOwnProperty.call(input, "currency")) payload.currency = String(input.currency || "LAK").trim().toUpperCase() || "LAK";
	if (Object.prototype.hasOwnProperty.call(input, "is_default")) payload.is_default = Number(input.is_default) ? 1 : 0;
	if (Object.prototype.hasOwnProperty.call(input, "is_active")) payload.is_active = Number(input.is_active) ? 1 : 0;

	return payload;
}

function isMissingCreateField(payload: StorePaymentAccountCreateInput): boolean {
	return !payload.display_name || !payload.account_name || !hasPaymentIdentifier(payload);
}

async function getStorePaymentAccountOrThrow(storeId: string, id: string): Promise<StorePaymentAccountRow> {
	const account = await StorePaymentAccountInterface.findById(storeId, id);
	if (!account) {
		throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_PAYMENT_ACCOUNT_NOT_FOUND);
	}
	return account;
}

async function assertStoreAccess(storeId: string, actor: StoreAccessActor): Promise<void> {
	const store = await StoreInterface.findAccessibleById(storeId, actor);
	if (!store) {
		throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_NOT_FOUND);
	}
}

export class StorePaymentAccountComponent {
	static async getAll(requestId: string, storeId: string, actor: StoreAccessActor): Promise<StorePaymentAccountRow[]> {
		void requestId;
		await assertStoreAccess(storeId, actor);

		return StorePaymentAccountInterface.findAllByStoreId(storeId);
	}

	static async create(requestId: string, storeId: string, input: Record<string, unknown>, actor: StoreAccessActor): Promise<StorePaymentAccountRow> {
		void requestId;
		await assertStoreAccess(storeId, actor);

		const payload = pickCreatePayload(input);
		if (isMissingCreateField(payload)) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_PAYMENT_ACCOUNT_REQUIRED_FIELDS);
		}

		payload.qr_image_url = await uploadQrImageIfNeeded(storeId, payload.qr_image_url);

		return StorePaymentAccountInterface.create(storeId, payload);
	}

	static async update(requestId: string, storeId: string, id: string, input: Record<string, unknown>, actor: StoreAccessActor): Promise<StorePaymentAccountRow> {
		void requestId;
		await assertStoreAccess(storeId, actor);

		const payload = pickUpdatePayload(input);
		if (Object.keys(payload).length === 0) {
			throw ApiError.BadRequestError("No data to update");
		}

		await getStorePaymentAccountOrThrow(storeId, id);
		if (Object.prototype.hasOwnProperty.call(payload, "qr_image_url")) {
			payload.qr_image_url = await uploadQrImageIfNeeded(storeId, payload.qr_image_url);
		}
		return StorePaymentAccountInterface.update(storeId, id, payload);
	}

	static async setDefault(requestId: string, storeId: string, id: string, actor: StoreAccessActor): Promise<StorePaymentAccountRow> {
		void requestId;
		await assertStoreAccess(storeId, actor);

		await getStorePaymentAccountOrThrow(storeId, id);
		return StorePaymentAccountInterface.setDefault(storeId, id);
	}

	static async delete(requestId: string, storeId: string, id: string, actor: StoreAccessActor): Promise<void> {
		void requestId;
		await assertStoreAccess(storeId, actor);

		await getStorePaymentAccountOrThrow(storeId, id);
		const ok = await StorePaymentAccountInterface.delete(storeId, id);
		if (!ok) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_PAYMENT_ACCOUNT_NOT_FOUND);
		}
	}
}
