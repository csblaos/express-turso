export type AppNavItem = {
	id: string;
	label: string;
	icon: string;
	to: string;
};

export const appNavItems: AppNavItem[] = [
	{ id: "pos", label: "ขายหน้าร้าน", icon: "i-heroicons-shopping-bag", to: "/" },
	{ id: "products", label: "สินค้า", icon: "i-heroicons-squares-2x2", to: "/products" },
	{ id: "orders", label: "ออเดอร์", icon: "i-heroicons-receipt-percent", to: "/orders" },
	{ id: "stock", label: "สต็อก", icon: "i-heroicons-cube", to: "/inventory" },
	{ id: "purchase", label: "สั่งซื้อ", icon: "i-heroicons-clipboard-document-list", to: "/purchase-orders" },
	{ id: "reports", label: "รายงาน", icon: "i-heroicons-chart-bar-square", to: "/reports" },
	{ id: "activity", label: "กิจกรรม", icon: "i-heroicons-clipboard-document-check", to: "/activity" },
	{ id: "settings", label: "ตั้งค่า", icon: "i-heroicons-cog-6-tooth", to: "/settings" },
	{ id: "superadmin", label: "Superadmin", icon: "i-heroicons-briefcase", to: "/superadmin" },
	{ id: "system-admin", label: "System Admin", icon: "i-heroicons-command-line", to: "/system-admin" },
];
