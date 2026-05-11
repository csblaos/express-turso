import { SuperadminSecurityInterface, SuperadminSecuritySnapshot } from "@interfaces/SuperadminSecurityInterface";
import { ApiError } from "@middlewares/ApiError";

type Actor = {
	userId: string;
	systemRole: string;
};

export class SuperadminSecurityComponent {
	private static assertActor(actor: Actor) {
		if (!actor.userId) {
			throw ApiError.UnauthorizedError("Missing auth user");
		}

		if (actor.systemRole !== "superadmin" && actor.systemRole !== "system_admin") {
			throw ApiError.ForbiddenError("Only superadmin can access this resource");
		}
	}

	static async getSnapshot(
		requestId: string,
		actor: Actor,
	): Promise<SuperadminSecuritySnapshot> {
		void requestId;
		SuperadminSecurityComponent.assertActor(actor);
		return SuperadminSecurityInterface.getSnapshot(actor.userId);
	}
}
