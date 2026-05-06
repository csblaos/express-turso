import { SystemConfigInterface } from "@interfaces/SystemConfigInterface";
import { SystemConfig, SystemConfigUpdateInput } from "@models/SystemConfig";

const UPDATABLE_FIELDS: Array<keyof SystemConfigUpdateInput> = [
	"default_can_create_branches",
	"default_max_branches_per_store",
	"default_session_limit",
	"store_logo_max_size_mb",
	"store_logo_auto_resize",
	"store_logo_resize_max_width",
	"payment_max_accounts_per_store",
	"payment_require_slip_for_lao_qr",
	"app_latest_build",
	"app_min_required_build",
	"app_update_message",
	"auth_access_token_ttl_minutes",
	"auth_refresh_token_ttl_days",
	"auth_remember_me_refresh_ttl_days",
	"auth_max_failed_attempts",
	"auth_lockout_minutes",
	"auth_allow_multi_session",
];

function pickUpdateFields(input: Record<string, unknown>): SystemConfigUpdateInput {
	const result: Partial<SystemConfigUpdateInput> = {};

	for (const key of UPDATABLE_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(input, key)) {
			result[key] = input[key] as never;
		}
	}

	return result as SystemConfigUpdateInput;
}

export class SystemConfigComponent {
	static async getConfig(requestId: string): Promise<SystemConfig> {
		void requestId;
		return SystemConfigInterface.getConfig();
	}

	static async updateConfig(requestId: string, data: Record<string, unknown>): Promise<SystemConfig> {
		void requestId;
		const updateData = pickUpdateFields(data || {});
		return SystemConfigInterface.updateConfig(updateData);
	}
}
