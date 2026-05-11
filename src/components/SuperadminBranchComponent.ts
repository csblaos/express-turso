import {
	SuperadminBranchInterface,
	SuperadminBranchListParams,
	SuperadminBranchListResult,
} from "@interfaces/SuperadminBranchInterface";
import { ApiError } from "@middlewares/ApiError";

type Actor = {
	userId: string;
	systemRole: string;
};

export class SuperadminBranchComponent {
	private static assertActor(actor: Actor) {
		if (!actor.userId) {
			throw ApiError.UnauthorizedError("Missing auth user");
		}

		if (actor.systemRole !== "superadmin" && actor.systemRole !== "system_admin") {
			throw ApiError.ForbiddenError("Only superadmin can access this resource");
		}
	}

	static async listBranches(
		requestId: string,
		actor: Actor,
		params: SuperadminBranchListParams,
	): Promise<SuperadminBranchListResult> {
		void requestId;
		SuperadminBranchComponent.assertActor(actor);
		return SuperadminBranchInterface.listByOwner(actor.userId, params);
	}
}
