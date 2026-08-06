export type AppNavItem = {
	id: string;
	label: string;
	labelKey?: string;
	icon: string;
	to: string;
	permission?: string;
};

export const appNavItems: AppNavItem[] = [
	{ id: "pos", label: "ขายหน้าร้าน", labelKey: "nav.pos", icon: "i-heroicons-building-storefront-20-solid", to: "/" },
	{ id: "dashboard", label: "Dashboard", labelKey: "nav.dashboard", icon: "i-heroicons-rectangle-group-20-solid", to: "/dashboard", permission: "dashboard.view" },
	{ id: "orders", label: "ออเดอร์", labelKey: "nav.orders", icon: "i-heroicons-shopping-cart-20-solid", to: "/orders", permission: "pos.create_order" },
	{ id: "products", label: "สินค้า", labelKey: "nav.products", icon: "i-heroicons-squares-2x2-20-solid", to: "/products", permission: "products.view" },
	{ id: "stock", label: "สต็อก", labelKey: "nav.inventory", icon: "i-heroicons-cube-20-solid", to: "/inventory", permission: "inventory.view" },
	{ id: "purchase", label: "สั่งซื้อ", labelKey: "nav.purchaseOrders", icon: "i-heroicons-clipboard-document-list-20-solid", to: "/purchase-orders", permission: "purchase_orders.view" },
	{ id: "promotions", label: "โปรโมชั่น", labelKey: "nav.promotions", icon: "i-heroicons-gift-20-solid", to: "/promotions", permission: "promotions.view" },
	{ id: "reports", label: "รายงาน", labelKey: "nav.reports", icon: "i-heroicons-chart-bar-square-20-solid", to: "/reports", permission: "reports.view" },
	{ id: "activity", label: "กิจกรรม", labelKey: "nav.activity", icon: "i-heroicons-clock-20-solid", to: "/activity", permission: "activity.view" },
	{ id: "settings", label: "ตั้งค่า", labelKey: "nav.settings", icon: "i-heroicons-cog-6-tooth-20-solid", to: "/settings", permission: "settings.view" },
	{ id: "superadmin", label: "Super Admin", labelKey: "nav.superadmin", icon: "i-heroicons-building-office-2-20-solid", to: "/superadmin" },
	{ id: "system-dashboard", label: "Dashboard", labelKey: "nav.dashboard", icon: "i-heroicons-chart-pie-20-solid", to: "/system-admin/dashboard", permission: "system_admin.dashboard.view" },
	{ id: "system-clients", label: "Clients", labelKey: "nav.clients", icon: "i-heroicons-briefcase-20-solid", to: "/system-admin/clients", permission: "system_admin.clients.view" },
	{ id: "system-policy", label: "System Policy", labelKey: "nav.policy", icon: "i-heroicons-cog-8-tooth-20-solid", to: "/system-admin/system", permission: "system_admin.config.update" },
	{ id: "system-monitoring", label: "Monitoring", labelKey: "nav.monitoring", icon: "i-heroicons-signal-20-solid", to: "/system-admin/monitoring", permission: "system_admin.monitoring.view" },
	{ id: "system-security", label: "Security", labelKey: "nav.security", icon: "i-heroicons-shield-check-20-solid", to: "/system-admin/security", permission: "system_admin.security.view" },
	{ id: "system-reports", label: "ລາຍງານ", icon: "i-heroicons-chart-bar-square-20-solid", to: "/system-admin/reports", permission: "system_admin.reports.view" },
	{ id: "system-thirdparty-usage", label: "Third-party Usage", labelKey: "nav.thirdParty", icon: "i-heroicons-cloud-20-solid", to: "/system-admin/thirdparty-usage", permission: "system_admin.monitoring.view" },
];
