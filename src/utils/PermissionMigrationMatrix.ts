export const LEGACY_TO_ACTION_PERMISSION_MAP: Record<string, string[]> = {
	"products.read": [ "products.view" ],
	"products.deactivate": [ "products.archive" ],
	"inventory.read": [ "inventory.view" ],
	"activity.read": [ "activity.view" ],
	"purchase_orders.read": [ "purchase_orders.view" ],
	"reports.read": [ "reports.view" ],
	"stores.read": [ "stores.view" ],
	"settings.read": [ "settings.view" ],
	"settings.manage_users": [
		"settings.users.view",
		"settings.users.create",
		"settings.users.update",
		"settings.users.suspend",
		"settings.users.assign_role",
		"settings.users.reset_password",
	],
	"settings.manage_roles": [
		"settings.roles.view",
		"settings.roles.create",
		"settings.roles.update",
		"settings.roles.archive",
	],
	"settings.manage_store": [
		"settings.store.view",
		"settings.store.create",
		"settings.store.update",
		"settings.store.archive",
	],
	"superadmin.manage": [
		"superadmin.view",
		"superadmin.users.view",
		"superadmin.users.create",
		"superadmin.users.update",
		"superadmin.users.archive",
		"superadmin.stores.view",
		"superadmin.stores.create",
		"superadmin.stores.update",
		"superadmin.stores.archive",
		"superadmin.roles.view",
		"superadmin.roles.create",
		"superadmin.roles.update",
		"superadmin.roles.archive",
	],
	"system_admin.manage": [
		"system_admin.dashboard.view",
		"system_admin.monitoring.view",
		"system_admin.security.view",
		"system_admin.clients.view",
		"system_admin.clients.create",
		"system_admin.clients.update",
		"system_admin.clients.delete",
		"system_admin.config.update",
	],
};

export function isLegacyPermissionKey(permissionKey: string): boolean {
	return Object.prototype.hasOwnProperty.call(LEGACY_TO_ACTION_PERMISSION_MAP, permissionKey);
}
