type QueueExecutor = {
	execute: (statement: any) => Promise<any>;
};

function restaurantDate(): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: process.env.APP_TIMEZONE || "Asia/Vientiane",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

export async function allocateRestaurantQueue(executor: QueueExecutor, storeId: string): Promise<{ queueNo: string; queueDate: string }> {
	const queueDate = restaurantDate();
	const result = await executor.execute({
		sql: `INSERT INTO restaurant_daily_sequences(store_id,sequence_date,last_queue_no) VALUES(?,?,1)
			ON CONFLICT(store_id,sequence_date) DO UPDATE SET last_queue_no=last_queue_no+1
			RETURNING last_queue_no`,
		args: [ storeId, queueDate ],
	});
	const sequence = Math.max(1, Number(result.rows[0]?.last_queue_no) || 0);
	return { queueNo: `Q${String(sequence).padStart(3, "0")}`, queueDate };
}
