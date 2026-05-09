export const PERMISSION_COMPAT_ALIASES: Record<string, string[]> = {
	"products.read": [ "products.view" ],
	"products.view": [ "products.read" ],
	"products.deactivate": [ "products.archive" ],
	"products.archive": [ "products.deactivate" ],
	"inventory.read": [ "inventory.view" ],
	"inventory.view": [ "inventory.read" ],
	"activity.read": [ "activity.view" ],
	"activity.view": [ "activity.read" ],
	"purchase_orders.read": [ "purchase_orders.view" ],
	"purchase_orders.view": [ "purchase_orders.read" ],
	"reports.read": [ "reports.view" ],
	"reports.view": [ "reports.read" ],
	"stores.read": [ "stores.view" ],
	"stores.view": [ "stores.read" ],
	"settings.read": [ "settings.view" ],
	"settings.view": [ "settings.read" ],

	"settings.manage_users": [
		"settings.users.create",
		"settings.users.update",
		"settings.users.suspend",
		"settings.users.assign_role",
		"settings.users.reset_password",
	],
	"settings.users.view": [ "settings.manage_users" ],
	"settings.users.create": [ "settings.manage_users" ],
	"settings.users.update": [ "settings.manage_users" ],
	"settings.users.suspend": [ "settings.manage_users" ],
	"settings.users.assign_role": [ "settings.manage_users" ],
	"settings.users.reset_password": [ "settings.manage_users" ],

	"settings.manage_roles": [
		"settings.roles.create",
		"settings.roles.update",
		"settings.roles.archive",
	],
	"settings.roles.view": [ "settings.manage_roles" ],
	"settings.roles.create": [ "settings.manage_roles" ],
	"settings.roles.update": [ "settings.manage_roles" ],
	"settings.roles.archive": [ "settings.manage_roles" ],

	"settings.manage_store": [
		"settings.store.create",
		"settings.store.update",
		"settings.store.archive",
	],
	"settings.store.view": [ "settings.manage_store" ],
	"settings.store.create": [ "settings.manage_store" ],
	"settings.store.update": [ "settings.manage_store" ],
	"settings.store.archive": [ "settings.manage_store" ],

	"superadmin.manage": [
		"superadmin.view",
		"superadmin.users.view",
		"superadmin.stores.view",
		"superadmin.roles.view",
	],
	"superadmin.view": [ "superadmin.manage" ],
	"superadmin.users.view": [ "superadmin.manage" ],
	"superadmin.users.create": [ "superadmin.manage" ],
	"superadmin.users.update": [ "superadmin.manage" ],
	"superadmin.users.archive": [ "superadmin.manage" ],
	"superadmin.stores.view": [ "superadmin.manage" ],
	"superadmin.stores.create": [ "superadmin.manage" ],
	"superadmin.stores.update": [ "superadmin.manage" ],
	"superadmin.stores.archive": [ "superadmin.manage" ],
	"superadmin.roles.view": [ "superadmin.manage" ],
	"superadmin.roles.create": [ "superadmin.manage" ],
	"superadmin.roles.update": [ "superadmin.manage" ],
	"superadmin.roles.archive": [ "superadmin.manage" ],

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
	"system_admin.dashboard.view": [ "system_admin.manage" ],
	"system_admin.monitoring.view": [ "system_admin.manage" ],
	"system_admin.security.view": [ "system_admin.manage" ],
	"system_admin.clients.view": [ "system_admin.manage" ],
	"system_admin.clients.create": [ "system_admin.manage" ],
	"system_admin.clients.update": [ "system_admin.manage" ],
	"system_admin.clients.delete": [ "system_admin.manage" ],
	"system_admin.config.update": [ "system_admin.manage" ],
};

export function resolveAcceptedPermissionKeys(permissionKey: string): string[] {
	const aliasKeys = PERMISSION_COMPAT_ALIASES[permissionKey] || [];
	return [ permissionKey, ...aliasKeys ];
}

export function hasPermissionByKey(grantedPermissions: string[], permissionKey: string): boolean {
	const accepted = resolveAcceptedPermissionKeys(permissionKey);
	return accepted.some((key) => grantedPermissions.includes(key));
}
