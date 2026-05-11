import { SystemConfigInterface } from "@interfaces/SystemConfigInterface";
import { SystemConfig } from "@models/SystemConfig";

export type SuperadminConfigSnapshot = Pick<SystemConfig, "id" | "payment_max_accounts_per_store" | "updated_at">;

export class SuperadminConfigComponent {
	static async getConfig(requestId: string): Promise<SuperadminConfigSnapshot> {
		void requestId;
		const config = await SystemConfigInterface.getConfig();
		return {
			id: config.id,
			payment_max_accounts_per_store: config.payment_max_accounts_per_store,
			updated_at: config.updated_at,
		};
	}

	static async updateConfig(
		requestId: string,
		data: { payment_max_accounts_per_store?: number },
	): Promise<SuperadminConfigSnapshot> {
		void requestId;
		const config = await SystemConfigInterface.updateConfig({
			payment_max_accounts_per_store: data.payment_max_accounts_per_store,
		});
		return {
			id: config.id,
			payment_max_accounts_per_store: config.payment_max_accounts_per_store,
			updated_at: config.updated_at,
		};
	}
}
