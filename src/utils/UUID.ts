import { Utils } from "@utils/Utils";

export function uuid(): string {
	return Utils.genUUID().slice(24, 36);
}
