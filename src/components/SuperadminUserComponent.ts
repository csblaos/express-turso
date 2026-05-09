import {
	SuperadminScopedUserListParams,
	SuperadminScopedUserListResult,
	SuperadminUserInterface,
} from "@interfaces/SuperadminUserInterface";
import { SuperadminStoreInterface } from "@interfaces/SuperadminStoreInterface";
import { ApiError } from "@middlewares/ApiError";
import { Store } from "@models/Store";

type Actor = {
	userId: string;
	systemRole: string;
};

export class SuperadminUserComponent {
	private static assertActor(actor: Actor) {
		if (!actor.userId) {
			throw ApiError.UnauthorizedError("Missing auth user");
		}

		if (actor.systemRole !== "superadmin" && actor.systemRole !== "system_admin") {
			throw ApiError.ForbiddenError("Only superadmin can access this resource");
		}
	}

	static async listUsers(
		requestId: string,
		actor: Actor,
		params: SuperadminScopedUserListParams,
	): Promise<SuperadminScopedUserListResult> {
		void requestId;
		SuperadminUserComponent.assertActor(actor);

		return SuperadminUserInterface.listByOwner(actor.userId, params);
	}

	static async listStores(requestId: string, actor: Actor): Promise<Store[]> {
		void requestId;
		SuperadminUserComponent.assertActor(actor);
		return SuperadminStoreInterface.listByOwner(actor.userId);
	}
}
