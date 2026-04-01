export type StoreType = "ONLINE_RETAIL" | "RESTAURANT" | "OTHER";
export type Currency = "LAK" | "THB" | "USD";
export type VatMode = "EXCLUSIVE" | "INCLUSIVE";

export type Store = {
	id: string;
	name: string;
	logo_name?: string;
	logo_url?: string;
	address?: string;
	phone_number?: string;

	store_type: StoreType;
	currency: Currency;
	supported_currencies: string;

	vat_enabled: boolean;
	vat_rate: number;
	vat_mode: VatMode;

	out_stock_threshold: number;
	low_stock_threshold: number;
	max_branches_override?: number;

	pdf_show_logo: boolean;
	pdf_show_signature: boolean;
	pdf_show_note: boolean;
	pdf_header_color: string;

	pdf_company_name?: string;
	pdf_company_address?: string;
	pdf_company_phone?: string;

	created_at: string;
};

export type CreateStoreInput = {
	name: string;
};

