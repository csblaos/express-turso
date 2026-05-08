import type { AppNavItem } from "~/utils/app-nav";

export type BreadcrumbItem = {
	label: string;
	to?: string;
};

const exactBreadcrumbMap: Record<string, BreadcrumbItem[]> = {
	"/": [
		{ label: "ขายหน้าร้าน" },
	],
	"/products": [
		{ label: "สินค้า" },
	],
	"/orders": [
		{ label: "ออเดอร์" },
	],
	"/inventory": [
		{ label: "สต็อก" },
	],
	"/purchase-orders": [
		{ label: "สั่งซื้อ" },
	],
	"/reports": [
		{ label: "รายงาน" },
	],
	"/activity": [
		{ label: "กิจกรรม" },
	],
	"/profile": [
		{ label: "Settings", to: "/settings" },
		{ label: "Profile" },
	],
	"/settings": [
		{ label: "Settings" },
	],
	"/settings/access/roles": [
		{ label: "Settings", to: "/settings" },
		{ label: "Access" },
		{ label: "Roles" },
	],
	"/settings/access/users": [
		{ label: "Settings", to: "/settings" },
		{ label: "Access" },
		{ label: "Users" },
	],
	"/superadmin": [
		{ label: "Superadmin" },
	],
	"/superadmin/overview": [
		{ label: "Superadmin", to: "/superadmin" },
		{ label: "Overview" },
	],
	"/superadmin/global-config": [
		{ label: "Superadmin", to: "/superadmin" },
		{ label: "Global Config" },
	],
	"/system-admin": [
		{ label: "System Admin" },
	],
	"/system-admin/clients": [
		{ label: "System Admin", to: "/system-admin" },
		{ label: "Clients" },
	],
	"/system-admin/system": [
		{ label: "System Admin", to: "/system-admin" },
		{ label: "System Policy" },
	],
	"/system-admin/config": [
		{ label: "System Admin", to: "/system-admin" },
		{ label: "Config" },
	],
	"/system-admin/config/clients": [
		{ label: "System Admin", to: "/system-admin" },
		{ label: "Config", to: "/system-admin/config" },
		{ label: "Clients" },
	],
	"/system-admin/config/system": [
		{ label: "System Admin", to: "/system-admin" },
		{ label: "Config", to: "/system-admin/config" },
		{ label: "System" },
	],
};

const segmentLabelMap: Record<string, string> = {
	settings: "Settings",
	access: "Access",
	superadmin: "Superadmin",
	"system-admin": "System Admin",
	products: "สินค้า",
	orders: "ออเดอร์",
	inventory: "สต็อก",
	"purchase-orders": "สั่งซื้อ",
	reports: "รายงาน",
	activity: "กิจกรรม",
	profile: "Profile",
	overview: "Overview",
	"global-config": "Global Config",
	clients: "Clients",
	system: "System Policy",
	config: "Config",
	roles: "Roles",
	users: "Users",
};

function formatSegmentLabel(segment: string): string {
	const mapped = segmentLabelMap[segment];
	if (mapped) return mapped;
	return segment
		.split("-")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

export function resolveBreadcrumbs(path: string, navItems: AppNavItem[]): BreadcrumbItem[] {
	const sanitizedPath = path.split("?")[0]?.split("#")[0] || "/";
	const exact = exactBreadcrumbMap[sanitizedPath];
	if (exact) return exact;

	const match = navItems
		.filter((item) => item.to !== "/" && (sanitizedPath === item.to || sanitizedPath.startsWith(`${item.to}/`)))
		.sort((left, right) => right.to.length - left.to.length)[0];

	if (!match) {
		return sanitizedPath === "/" ? [{ label: "ขายหน้าร้าน" }] : [];
	}

	const items: BreadcrumbItem[] = [{ label: match.label, to: match.to }];
	const remainder = sanitizedPath.slice(match.to.length).replace(/^\/+/, "");
	if (!remainder) {
		items[0] = { label: match.label };
		return items;
	}

	const segments = remainder.split("/").filter(Boolean);
	let currentPath = match.to;
	segments.forEach((segment, index) => {
		currentPath = `${currentPath}/${segment}`;
		items.push({
			label: formatSegmentLabel(segment),
			to: index === segments.length - 1 ? undefined : currentPath,
		});
	});

	return items;
}
