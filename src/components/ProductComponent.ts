import { ErrorConfig } from "@configs/ErrorConfig";
import { AuditEventInterface } from "@interfaces/AuditEventInterface";
import { ProductModelInterface } from "@interfaces/ProductModelInterface";
import { ProductInterface } from "@interfaces/ProductInterface";
import { ApiError } from "@middlewares/ApiError";
import { CreateProductInput, Product, UpdateProductInput } from "@models/Product";
import { R2Storage } from "@storage/R2Storage";
import { randomUUID } from "crypto";

const UPDATABLE_FIELDS: Array<keyof UpdateProductInput> = [
	"store_id",
	"sku",
	"name",
	"barcode",
	"base_unit_id",
	"price_base",
	"cost_base",
	"active",
	"image_url",
	"category_id",
	"out_stock_threshold",
	"low_stock_threshold",
	"model_id",
	"variant_label",
	"variant_options_json",
	"variant_sort_order",
	"allow_base_unit_sale",
];

function pickUpdateFields(input: Record<string, unknown>): UpdateProductInput {
	const result: Partial<UpdateProductInput> = {};

	for (const key of UPDATABLE_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(input, key)) {
			result[key] = input[key] as never;
		}
	}

	return result as UpdateProductInput;
}

function isMissingCreateField(payload: CreateProductInput): boolean {
	return !payload.store_id ||
		!payload.sku ||
		!payload.name ||
		!payload.base_unit_id ||
		payload.price_base === undefined ||
		payload.cost_base === undefined;
}

export class ProductComponent {
	static async getAll(requestId: string, storeId?: string): Promise<Product[]> {
		void requestId;
		return ProductInterface.findAll(storeId);
	}

	static async getById(requestId: string, id: string): Promise<Product> {
		void requestId;
		const product = await ProductInterface.findById(id);
		if (!product) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_NOT_FOUND);
		}
		return product;
	}

	static async create(requestId: string, payload: CreateProductInput): Promise<Product> {
		void requestId;
		if (!payload || isMissingCreateField(payload)) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_REQUIRED_FIELDS);
		}

		const productId = payload.id || randomUUID();
		const nextPayload: CreateProductInput = {
			...payload,
			id: productId,
		};

		if (typeof nextPayload.image_url === "string" && nextPayload.image_url.trim().startsWith("data:")) {
			const uploaded = await R2Storage.uploadProductImage({
				storeId: nextPayload.store_id,
				productId,
				dataUrl: nextPayload.image_url,
			});
			nextPayload.image_url = uploaded.key;
		}

		return ProductInterface.create(nextPayload);
	}

	static async update(requestId: string, id: string, data: Record<string, unknown>): Promise<Product> {
		void requestId;
		const updateData = pickUpdateFields(data || {});

		if (typeof updateData.image_url === "string" && updateData.image_url.trim().startsWith("data:")) {
			const existing = await ProductInterface.findById(id);
			if (!existing) {
				throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_NOT_FOUND);
			}
			const uploaded = await R2Storage.uploadProductImage({
				storeId: existing.store_id,
				productId: id,
				dataUrl: updateData.image_url,
			});
			updateData.image_url = uploaded.key;
		}

		return ProductInterface.update(id, updateData);
	}

	static async delete(requestId: string, id: string): Promise<void> {
		void requestId;
		const ok = await ProductInterface.delete(id);
		if (!ok) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_NOT_FOUND);
		}
	}

	static async bulkCreateVariants(
		requestId: string,
		input: {
			baseProductId: string;
			modelName?: string;
			axes?: Array<{ key: string; label: string }>;
			variants: Array<{
				sku: string;
				barcode?: string | null;
				price_base: number;
				cost_base: number;
				active?: number;
				variant_label?: string | null;
				variant_options?: Record<string, string>;
			}>;
		},
	): Promise<{
		base_product: Product;
		created: Product[];
	}> {
		void requestId;
		const base = await ProductInterface.findById(input.baseProductId);
		if (!base) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_NOT_FOUND);
		}

		if (!Array.isArray(input.variants) || input.variants.length === 0) {
			throw ApiError.BadRequestError("variants is required");
		}
		if (input.variants.length > 200) {
			throw ApiError.BadRequestError("variants cannot exceed 200 items");
		}

		const storeId = base.store_id;
		const normalizedSkus = input.variants.map((item) => String(item.sku || "").trim().toUpperCase());
		if (normalizedSkus.some((sku) => !sku)) {
			throw ApiError.BadRequestError("variant sku is required");
		}
		const duplicateSku = normalizedSkus.find((sku, index) => normalizedSkus.indexOf(sku) !== index);
		if (duplicateSku) {
			throw ApiError.BadRequestError(`duplicate sku in payload: ${duplicateSku}`);
		}

		const barcodes = input.variants
			.map((item) => String(item.barcode || "").trim())
			.filter(Boolean);
		const duplicateBarcode = barcodes.find((barcode, index) => barcodes.indexOf(barcode) !== index);
		if (duplicateBarcode) {
			throw ApiError.BadRequestError(`duplicate barcode in payload: ${duplicateBarcode}`);
		}

		const existingSkuHits = await ProductInterface.findBySkus(storeId, [ ...normalizedSkus, String(base.sku || "").trim().toUpperCase() ]);
		const existingSkuSet = new Set(existingSkuHits.map((product) => String(product.sku || "").trim().toUpperCase()));
		for (const sku of normalizedSkus) {
			if (existingSkuSet.has(sku)) {
				throw ApiError.BadRequestError(`sku already exists: ${sku}`);
			}
		}

		const existingBarcodeHits = await ProductInterface.findByBarcodes(storeId, [ ...barcodes, String(base.barcode || "").trim() ].filter(Boolean));
		const existingBarcodeSet = new Set(existingBarcodeHits.map((product) => String(product.barcode || "").trim()).filter(Boolean));
		for (const barcode of barcodes) {
			if (existingBarcodeSet.has(barcode)) {
				throw ApiError.BadRequestError(`barcode already exists: ${barcode}`);
			}
		}

		let modelId = base.model_id;
		if (!modelId) {
			const model = await ProductModelInterface.create({
				store_id: storeId,
				name: (input.modelName || base.name || "").trim() || "รุ่นสินค้า",
				category_id: base.category_id,
				image_url: base.image_url,
				description: null,
				active: 1,
			});
			modelId = model.id;
		}

		let baseVariantOptions: unknown[] = [];
		if (base.variant_options_json) {
			try {
				const parsed = JSON.parse(base.variant_options_json) as unknown;
				if (Array.isArray(parsed)) baseVariantOptions = parsed;
			} catch {
				baseVariantOptions = [];
			}
		}

		const created: Product[] = [];
		const now = new Date().toISOString();
		for (let index = 0; index < input.variants.length; index += 1) {
			const item = input.variants[index];
			const variantLabel = (item.variant_label || "").trim() || null;
			const variantNameSuffix = variantLabel ? ` (${variantLabel})` : "";
			const name = `${base.name}${variantNameSuffix}`.trim();
			const variantOptions = item.variant_options ? JSON.stringify(item.variant_options) : null;

			const createdProduct = await ProductInterface.create({
				store_id: storeId,
				sku: String(item.sku).trim().toUpperCase(),
				name,
				barcode: item.barcode ? String(item.barcode).trim() : null,
				base_unit_id: base.base_unit_id,
				price_base: Number(item.price_base),
				cost_base: Number(item.cost_base),
				active: item.active === 0 ? 0 : 1,
				image_url: base.image_url,
				category_id: base.category_id,
				out_stock_threshold: base.out_stock_threshold ?? 0,
				low_stock_threshold: base.low_stock_threshold,
				model_id: modelId,
				variant_label: variantLabel,
				variant_options_json: variantOptions,
				variant_sort_order: (base.variant_sort_order ?? 0) + index + 1,
				allow_base_unit_sale: base.allow_base_unit_sale ?? 1,
				created_at: now,
			});
			created.push(createdProduct);

			baseVariantOptions.push({
				product_id: createdProduct.id,
				sku: createdProduct.sku,
				barcode: createdProduct.barcode,
				label: variantLabel,
				options: item.variant_options ?? null,
			});
		}

		const updatedBase = await ProductInterface.update(base.id, {
			model_id: modelId,
			variant_options_json: JSON.stringify(baseVariantOptions),
		});

		return {
			base_product: updatedBase,
			created,
		};
	}

	static async getCostAdjustments(
		requestId: string,
		productId: string,
		limit?: number,
	): Promise<Array<{
		id: string;
		occurred_at: string;
		actor_user_id: string | null;
		actor_role: string | null;
		reason: string | null;
		before_cost_base: number;
		after_cost_base: number;
		delta: number;
	}>> {
		void requestId;
		const events = await AuditEventInterface.findRecentByEntity({
			entityType: "product",
			entityId: productId,
			action: "cost_adjusted",
			limit,
		});

		return events.map((event) => {
			const before = (event.before as { cost_base?: number } | null) || {};
			const after = (event.after as { cost_base?: number } | null) || {};
			const beforeCost = Number(before.cost_base ?? 0);
			const afterCost = Number(after.cost_base ?? 0);
			const metadata = (event.metadata as { reason?: string } | null) || null;
			const reason = metadata?.reason ? String(metadata.reason) : null;

			return {
				id: event.id,
				occurred_at: event.occurred_at,
				actor_user_id: event.actor_user_id,
				actor_role: event.actor_role,
				reason,
				before_cost_base: beforeCost,
				after_cost_base: afterCost,
				delta: afterCost - beforeCost,
			};
		});
	}

	static async adjustCost(
		requestId: string,
		input: {
			productId: string;
			costBase: number;
			reason: string | null;
			actor: { userId: string; role: string; storeId?: string } | null;
			ipAddress: string | null;
			userAgent: string | null;
		},
	): Promise<{
		product: Product;
		adjustment: {
			id: string;
			occurred_at: string;
			actor_user_id: string | null;
			actor_role: string | null;
			reason: string | null;
			before_cost_base: number;
			after_cost_base: number;
			delta: number;
		};
	}> {
		void requestId;
		if (!Number.isFinite(input.costBase) || input.costBase < 0) {
			throw ApiError.BadRequestError("cost_base must be a number >= 0");
		}

		const product = await ProductInterface.findById(input.productId);
		if (!product) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_NOT_FOUND);
		}

		const beforeCost = Number(product.cost_base ?? 0);
		const updated = await ProductInterface.update(input.productId, {
			cost_base: input.costBase,
		});

		const event = await AuditEventInterface.create({
			scope: "products",
			store_id: input.actor?.storeId ?? product.store_id ?? null,
			actor_user_id: input.actor?.userId ?? null,
			actor_role: input.actor?.role ?? null,
			action: "cost_adjusted",
			entity_type: "product",
			entity_id: input.productId,
			ip_address: input.ipAddress,
			user_agent: input.userAgent,
			request_id: requestId,
			metadata: {
				reason: input.reason?.trim() ? input.reason.trim() : null,
			},
			before: { cost_base: beforeCost },
			after: { cost_base: updated.cost_base },
		});

		const metadata = (event.metadata as { reason?: string } | null) || null;
		const reason = metadata?.reason ? String(metadata.reason) : null;

		return {
			product: updated,
			adjustment: {
				id: event.id,
				occurred_at: event.occurred_at,
				actor_user_id: event.actor_user_id,
				actor_role: event.actor_role,
				reason,
				before_cost_base: beforeCost,
				after_cost_base: Number(updated.cost_base ?? 0),
				delta: Number(updated.cost_base ?? 0) - beforeCost,
			},
		};
	}
}
