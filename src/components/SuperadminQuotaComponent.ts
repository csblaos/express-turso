import {
	SuperadminQuotaInterface,
	SuperadminQuotaListParams,
	SuperadminQuotaListResult,
} from "@interfaces/SuperadminQuotaInterface";
import { ApiError } from "@middlewares/ApiError";

type Actor = {
	userId: string;
	systemRole: string;
};

export class SuperadminQuotaComponent {
	private static assertActor(actor: Actor) {
		if (!actor.userId) {
			throw ApiError.UnauthorizedError("Missing auth user");
		}

		if (actor.systemRole !== "superadmin" && actor.systemRole !== "system_admin") {
			throw ApiError.ForbiddenError("Only superadmin can access this resource");
		}
	}

	static async listQuotas(
		requestId: string,
		actor: Actor,
		params: SuperadminQuotaListParams,
	): Promise<SuperadminQuotaListResult> {
		void requestId;
		SuperadminQuotaComponent.assertActor(actor);
		return SuperadminQuotaInterface.listByOwner(actor.userId, params);
	}
}
