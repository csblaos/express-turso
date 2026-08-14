import { SuperadminOverviewInterface } from "@interfaces/SuperadminOverviewInterface";
import { ReportPeriodInput } from "@interfaces/ReportInterface";
import { ApiError } from "@middlewares/ApiError";

type Actor = { userId: string; systemRole: string };

export class SuperadminOverviewComponent {
	static async dashboard(actor: Actor, input: ReportPeriodInput & { storeId?: string }) {
		if (!actor.userId) throw ApiError.UnauthorizedError("Missing auth user");
		if (actor.systemRole !== "superadmin" && actor.systemRole !== "system_admin") {
			throw ApiError.ForbiddenError("Only superadmin can access this resource");
		}
		return SuperadminOverviewInterface.dashboard(actor.userId, input);
	}
}
