import { StoreInterface } from "@interfaces/StoreInterface";
import { Store } from "@models/Store";

export class SuperadminStoreInterface {
	static async listByOwner(ownerUserId: string): Promise<Store[]> {
		return StoreInterface.findAll(ownerUserId);
	}
}
