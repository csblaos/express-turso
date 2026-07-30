export type AppNotification = {
	id: string;
	store_id: string;
	topic: "stock" | "promotion";
	entity_type: "product" | "promotion";
	entity_id: string;
	severity: "warning" | "critical";
	due_status: "out_of_stock" | "low_stock" | "ending_soon";
	due_date: string | null;
	payload: {
		name?: string;
		sku?: string;
		available_base?: number;
		threshold?: number;
		ends_at?: string;
		target?: string;
	};
	last_detected_at: string;
	user_read_at: string | null;
	is_read: boolean;
};

type NotificationResponse = {
	items: AppNotification[];
	unread_count: number;
};

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

export function useNotificationCenter() {
	const { apiFetch } = useApiClient();
	const items = useState<AppNotification[]>("notification-center-items", () => []);
	const unreadCount = useState<number>("notification-center-unread", () => 0);
	const pending = useState<boolean>("notification-center-pending", () => false);
	const lastStoreId = useState<string>("notification-center-store", () => "");

	async function fetchNotifications(storeId: string, options: { limit?: number; status?: "all" | "unread"; topic?: "all" | "stock" | "promotion" } = {}) {
		if (!storeId) {
			items.value = [];
			unreadCount.value = 0;
			lastStoreId.value = "";
			return { items: [], unread_count: 0 } as NotificationResponse;
		}
		pending.value = true;
		try {
			const params = new URLSearchParams({
				store_id: storeId,
				limit: String(options.limit || 10),
				status: options.status || "all",
				topic: options.topic || "all",
			});
			const response = await apiFetch<ApiEnvelope<NotificationResponse>>(`/notifications?${params.toString()}`);
			items.value = response.data.items;
			unreadCount.value = response.data.unread_count;
			lastStoreId.value = storeId;
			return response.data;
		} finally {
			pending.value = false;
		}
	}

	async function markRead(storeId: string, id: string) {
		await apiFetch<ApiEnvelope<{ id: string; read_at: string }>>(`/notifications/${encodeURIComponent(id)}/read?store_id=${encodeURIComponent(storeId)}`, {
			method: "PUT",
		});
		const item = items.value.find((entry) => entry.id === id);
		if (item && !item.is_read) {
			item.is_read = true;
			item.user_read_at = new Date().toISOString();
			unreadCount.value = Math.max(0, unreadCount.value - 1);
		}
	}

	async function markAllRead(storeId: string) {
		await apiFetch<ApiEnvelope<{ read_at: string }>>(`/notifications/read-all?store_id=${encodeURIComponent(storeId)}`, {
			method: "PUT",
		});
		for (const item of items.value) {
			item.is_read = true;
			item.user_read_at ||= new Date().toISOString();
		}
		unreadCount.value = 0;
	}

	function clear() {
		items.value = [];
		unreadCount.value = 0;
		lastStoreId.value = "";
	}

	return { items, unreadCount, pending, lastStoreId, fetchNotifications, markRead, markAllRead, clear };
}
