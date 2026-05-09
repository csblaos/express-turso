import { SystemAdminClientInterface } from "@interfaces/SystemAdminClientInterface";
import { SystemConfigInterface } from "@interfaces/SystemConfigInterface";

import { SystemAdminMonitoringComponent } from "@components/SystemAdminMonitoringComponent";
import { SystemAdminSecurityComponent } from "@components/SystemAdminSecurityComponent";

type DashboardSnapshot = {
	checked_at: string;
	client_summary: {
		total: number;
		active: number;
		suspended: number;
	};
	monitoring: {
		checked_at: string;
		services: {
			api: { status: "healthy" | "degraded" | "down"; latency_ms: number | null; message: string; checked_at: string };
			db: { status: "healthy" | "degraded" | "down"; latency_ms: number | null; message: string; checked_at: string };
			redis: { status: "healthy" | "degraded" | "down"; latency_ms: number | null; message: string; checked_at: string };
		};
		summary: {
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
		warnings: string[];
	};
	security: {
		checked_at: string;
		services: {
			api: { status: "healthy" | "degraded" | "down"; latency_ms: number | null; message: string; checked_at: string };
			db: { status: "healthy" | "degraded" | "down"; latency_ms: number | null; message: string; checked_at: string };
			redis: { status: "healthy" | "degraded" | "down"; latency_ms: number | null; message: string; checked_at: string };
		};
		auth_policy: {
			access_token_ttl_minutes: number;
			refresh_token_ttl_days: number;
			remember_me_refresh_ttl_days: number;
			max_failed_attempts: number;
			lockout_minutes: number;
			allow_multi_session: boolean;
			default_session_limit: number;
		};
		security: {
			jwt_secret_is_default: boolean;
			jwt_secret_length: number;
			node_env: string;
			redis_driver: string;
		};
		summary: {
			users_total: number;
			users_system_admin: number;
			users_superadmin: number;
			users_suspended: number;
			users_must_change_password: number;
			users_without_password_hash: number;
			stores_total: number;
			store_members_total: number;
		};
		warnings: string[];
	};
	system: {
		default_session_limit: number;
		app_latest_build: number;
		app_min_required_build: number;
		app_update_message: string | null;
		auth_access_token_ttl_minutes: number;
		auth_refresh_token_ttl_days: number;
		auth_remember_me_refresh_ttl_days: number;
		auth_max_failed_attempts: number;
		auth_lockout_minutes: number;
		auth_allow_multi_session: number;
	};
};

export class SystemAdminDashboardComponent {
	static async getSnapshot(requestId: string): Promise<DashboardSnapshot> {
		const [ clientSummary, monitoringSnapshot, securitySnapshot, systemConfig ] = await Promise.all([
			SystemAdminClientInterface.getSummary(),
			SystemAdminMonitoringComponent.getSnapshot(requestId),
			SystemAdminSecurityComponent.getSnapshot(requestId),
			SystemConfigInterface.getConfig(),
		]);

		return {
			checked_at: new Date().toISOString(),
			client_summary: clientSummary,
			monitoring: {
				checked_at: monitoringSnapshot.checked_at,
				services: monitoringSnapshot.services,
				summary: monitoringSnapshot.summary,
				warnings: monitoringSnapshot.warnings,
			},
			security: {
				checked_at: securitySnapshot.checked_at,
				services: securitySnapshot.services,
				auth_policy: securitySnapshot.auth_policy,
				security: securitySnapshot.security,
				summary: securitySnapshot.summary,
				warnings: securitySnapshot.warnings,
			},
			system: {
				default_session_limit: systemConfig.default_session_limit,
				app_latest_build: systemConfig.app_latest_build,
				app_min_required_build: systemConfig.app_min_required_build,
				app_update_message: systemConfig.app_update_message,
				auth_access_token_ttl_minutes: systemConfig.auth_access_token_ttl_minutes,
				auth_refresh_token_ttl_days: systemConfig.auth_refresh_token_ttl_days,
				auth_remember_me_refresh_ttl_days: systemConfig.auth_remember_me_refresh_ttl_days,
				auth_max_failed_attempts: systemConfig.auth_max_failed_attempts,
				auth_lockout_minutes: systemConfig.auth_lockout_minutes,
				auth_allow_multi_session: systemConfig.auth_allow_multi_session,
			},
		};
	}
}
