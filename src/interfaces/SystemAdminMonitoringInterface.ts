import { DbConn } from "@connections/DbConn";

type MonitoringSummaryCounts = {
	users_total: number;
	users_active: number;
	users_suspended: number;
	stores_total: number;
	products_total: number;
	inventory_balances_total: number;
	purchase_orders_total: number;
	fb_connections_total: number;
	fb_connections_online: number;
	wa_connections_total: number;
	wa_connections_online: number;
	integrations_total: number;
};

function toCount(value: unknown): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

export class SystemAdminMonitoringInterface {
	private static async count(sql: string, args: Array<string | number | null> = []): Promise<number> {
		const db = DbConn.getClient();
		const result = await db.execute({ sql, args });
		return toCount(result.rows[0]?.total);
	}

	static async getSummaryCounts(): Promise<MonitoringSummaryCounts> {
		const [
			usersTotal,
			usersActive,
			usersSuspended,
			storesTotal,
			productsTotal,
			inventoryBalancesTotal,
			purchaseOrdersTotal,
			fbConnectionsTotal,
			fbConnectionsOnline,
			waConnectionsTotal,
			waConnectionsOnline,
			integrationsTotal,
		] = await Promise.all([
			SystemAdminMonitoringInterface.count("SELECT COUNT(*) AS total FROM users"),
			SystemAdminMonitoringInterface.count("SELECT COUNT(*) AS total FROM users WHERE COALESCE(client_suspended, 0) = 0"),
			SystemAdminMonitoringInterface.count("SELECT COUNT(*) AS total FROM users WHERE COALESCE(client_suspended, 0) = 1"),
			SystemAdminMonitoringInterface.count("SELECT COUNT(*) AS total FROM stores"),
			SystemAdminMonitoringInterface.count("SELECT COUNT(*) AS total FROM products"),
			SystemAdminMonitoringInterface.count("SELECT COUNT(*) AS total FROM inventory_balances"),
			SystemAdminMonitoringInterface.count("SELECT COUNT(*) AS total FROM purchase_orders"),
			SystemAdminMonitoringInterface.count("SELECT COUNT(*) AS total FROM fb_connections"),
			SystemAdminMonitoringInterface.count("SELECT COUNT(*) AS total FROM fb_connections WHERE LOWER(COALESCE(status, '')) IN ('connected', 'active', 'ok')"),
			SystemAdminMonitoringInterface.count("SELECT COUNT(*) AS total FROM wa_connections"),
			SystemAdminMonitoringInterface.count("SELECT COUNT(*) AS total FROM wa_connections WHERE LOWER(COALESCE(status, '')) IN ('connected', 'active', 'ok')"),
			SystemAdminMonitoringInterface.count("SELECT COUNT(*) AS total FROM store_integrations"),
		]);

		return {
			users_total: usersTotal,
			users_active: usersActive,
			users_suspended: usersSuspended,
			stores_total: storesTotal,
			products_total: productsTotal,
			inventory_balances_total: inventoryBalancesTotal,
			purchase_orders_total: purchaseOrdersTotal,
			fb_connections_total: fbConnectionsTotal,
			fb_connections_online: fbConnectionsOnline,
			wa_connections_total: waConnectionsTotal,
			wa_connections_online: waConnectionsOnline,
			integrations_total: integrationsTotal,
		};
	}
}
