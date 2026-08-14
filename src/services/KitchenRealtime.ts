import { Server as HttpServer } from "http";

import { Server, Socket } from "socket.io";

import { ENV } from "@configs/ENV";
import { RedisConn } from "@connections/RedisConn";
import { RbacInterface } from "@interfaces/RbacInterface";
import { AuthToken } from "@utils/AuthToken";
import { onKitchenRevision } from "@utils/KitchenDelivery";
import { hasPermissionByKey } from "@utils/PermissionCompat";

type SessionRecord = { id: string; userId: string; systemRole: string };
type SubscribeAck = (response: { ok: boolean; error?: string }) => void;

function room(storeId: string): string {
	return `store:${storeId}`;
}

async function sessionRecord(sessionId: string): Promise<SessionRecord | null> {
	const raw = await RedisConn.get(`auth:session:${sessionId}`);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as SessionRecord;
	} catch {
		return null;
	}
}

export class KitchenRealtime {
	private static io: Server | null = null;
	private static removeRevisionListener: (() => void) | null = null;

	static attach(server: HttpServer): Server {
		if (KitchenRealtime.io) return KitchenRealtime.io;
		const allowedOrigins = new Set(ENV.SERVER.FRONTEND_ORIGINS);
		const allowAnyOrigin = allowedOrigins.has("*");
		const io = new Server(server, {
			path: "/socket.io",
			transports: [ "websocket" ],
			cors: {
				origin(origin, callback) {
					if (!origin || allowAnyOrigin || allowedOrigins.has(origin.replace(/\/$/u, ""))) callback(null, true);
					else callback(new Error("Origin is not allowed"));
				},
				methods: [ "GET", "POST" ],
			},
		});

		io.use(async (socket, next) => {
			try {
				const accessToken = String(socket.handshake.auth?.accessToken || "").trim();
				const token = accessToken ? AuthToken.verify(accessToken, ENV.AUTH.JWT_SECRET) : null;
				if (!token || token.typ !== "access") throw new Error("Invalid access token");
				const session = await sessionRecord(token.sid);
				if (!session || session.userId !== token.sub) throw new Error("Session expired or revoked");
				socket.data.userId = token.sub;
				socket.data.sessionId = token.sid;
				next();
			} catch (error) {
				console.warn("[realtime] authentication rejected", error instanceof Error ? error.message : "unknown error");
				next(new Error("Unauthorized"));
			}
		});

		io.on("connection", (socket) => KitchenRealtime.handleConnection(socket));
		KitchenRealtime.removeRevisionListener = onKitchenRevision((event) => {
			io.to(room(event.storeId)).emit("kitchen:changed", event);
		});
		KitchenRealtime.io = io;
		console.log(`[realtime] Socket.IO ready; allowed origins: ${ENV.SERVER.FRONTEND_ORIGINS.join(", ")}`);
		return io;
	}

	static health(): { enabled: boolean; connectedClients: number } {
		return {
			enabled: Boolean(KitchenRealtime.io),
			connectedClients: KitchenRealtime.io?.engine.clientsCount || 0,
		};
	}

	static async close(): Promise<void> {
		KitchenRealtime.removeRevisionListener?.();
		KitchenRealtime.removeRevisionListener = null;
		const io = KitchenRealtime.io;
		KitchenRealtime.io = null;
		if (!io) return;
		await new Promise<void>((resolve) => io.close(() => resolve()));
	}

	private static handleConnection(socket: Socket): void {
		console.log(`[realtime] connected ${socket.id}; clients=${KitchenRealtime.io?.engine.clientsCount || 0}`);
		socket.on("kitchen:subscribe", async (payload: unknown, acknowledge?: SubscribeAck) => {
			try {
				const storeId = typeof payload === "object" && payload && "storeId" in payload
					? String((payload as { storeId?: unknown }).storeId || "").trim()
					: "";
				if (!storeId) throw new Error("Store is required");
				const access = await RbacInterface.getRequestAccess(String(socket.data.userId), storeId);
				const user = access.user;
				const role = String(user?.system_role || "").toLowerCase();
				if (!user || user.client_suspended || role === "system_admin") throw new Error("Store access denied");
				if (role !== "superadmin" && !hasPermissionByKey(access.permissionKeys, "pos.create_order")) {
					throw new Error("Missing permission: pos.create_order");
				}

				const previousStoreId = String(socket.data.storeId || "");
				if (previousStoreId && previousStoreId !== storeId) await socket.leave(room(previousStoreId));
				await socket.join(room(storeId));
				socket.data.storeId = storeId;
				acknowledge?.({ ok: true });
			} catch (error) {
				const message = error instanceof Error ? error.message : "Subscription failed";
				console.warn(`[realtime] subscription rejected socket=${socket.id}: ${message}`);
				acknowledge?.({ ok: false, error: message });
			}
		});
		socket.on("disconnect", (reason) => {
			console.log(`[realtime] disconnected ${socket.id}; reason=${reason}; clients=${KitchenRealtime.io?.engine.clientsCount || 0}`);
		});
	}
}
