export type AppNavItem = {
	id: string;
	label: string;
	icon: string;
	to: string;
};

export const appNavItems: AppNavItem[] = [
	{ id: "pos", label: "ขายหน้าร้าน", icon: "i-heroicons-building-storefront-20-solid", to: "/" },
	{ id: "products", label: "สินค้า", icon: "i-heroicons-squares-2x2-20-solid", to: "/products" },
	{ id: "orders", label: "ออเดอร์", icon: "i-heroicons-shopping-cart-20-solid", to: "/orders" },
	{ id: "stock", label: "สต็อก", icon: "i-heroicons-cube-20-solid", to: "/inventory" },
	{ id: "purchase", label: "สั่งซื้อ", icon: "i-heroicons-clipboard-document-list-20-solid", to: "/purchase-orders" },
	{ id: "reports", label: "รายงาน", icon: "i-heroicons-chart-bar-square-20-solid", to: "/reports" },
	{ id: "activity", label: "กิจกรรม", icon: "i-heroicons-clock-20-solid", to: "/activity" },
	{ id: "settings", label: "ตั้งค่า", icon: "i-heroicons-cog-6-tooth-20-solid", to: "/settings" },
	{ id: "superadmin", label: "Superadmin", icon: "i-heroicons-building-office-2-20-solid", to: "/superadmin" },
	{ id: "system-dashboard", label: "Dashboard", icon: "i-heroicons-chart-pie-20-solid", to: "/system-admin/dashboard" },
	{ id: "system-clients", label: "Clients", icon: "i-heroicons-briefcase-20-solid", to: "/system-admin/clients" },
	{ id: "system-policy", label: "System Policy", icon: "i-heroicons-cog-8-tooth-20-solid", to: "/system-admin/system" },
	{ id: "system-monitoring", label: "Monitoring", icon: "i-heroicons-signal-20-solid", to: "/system-admin/monitoring" },
	{ id: "system-security", label: "Security", icon: "i-heroicons-shield-check-20-solid", to: "/system-admin/security" },
];
