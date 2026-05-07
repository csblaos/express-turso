import { toast } from "vue-sonner";

type AppToastInput = {
	title: string;
	description?: string;
	timeout?: number;
};

export function useAppToast() {
	function success(input: AppToastInput) {
		return toast.success(input.title, {
			description: input.description,
			duration: input.timeout ?? 2400,
		});
	}

	function error(input: AppToastInput) {
		return toast.error(input.title, {
			description: input.description,
			duration: input.timeout ?? 3600,
		});
	}

	function info(input: AppToastInput) {
		return toast.info(input.title, {
			description: input.description,
			duration: input.timeout ?? 2400,
		});
	}

	return {
		success,
		error,
		info,
		clear: () => toast.dismiss(),
	};
}
