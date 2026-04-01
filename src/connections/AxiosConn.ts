import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from "axios";

type AxiosMetadata = {
	startedAt: number;
	durationMs?: number;
};

type InternalConfigWithMetadata = InternalAxiosRequestConfig & {
	metadata?: AxiosMetadata;
};

function withMetadata(config: InternalConfigWithMetadata): InternalConfigWithMetadata {
	config.metadata = { startedAt: Date.now() };
	return config;
}

function finalizeResponse(response: AxiosResponse): AxiosResponse {
	const metadata = (response.config as InternalConfigWithMetadata).metadata;
	if (metadata) {
		metadata.durationMs = Date.now() - metadata.startedAt;
	}
	return response;
}

export class AxiosConn {
	private static instance: AxiosConn;
	readonly axios: AxiosInstance;
	readonly axiosExtendedTimeout: AxiosInstance;

	private constructor() {
		this.axios = axios.create({
			timeout: 10_000,
		});

		this.axiosExtendedTimeout = axios.create({
			timeout: 30_000,
		});

		for (const instance of [ this.axios, this.axiosExtendedTimeout ]) {
			instance.interceptors.request.use(withMetadata);
			instance.interceptors.response.use(finalizeResponse);
		}
	}

	static getInstance(): AxiosConn {
		if (!AxiosConn.instance) {
			AxiosConn.instance = new AxiosConn();
		}
		return AxiosConn.instance;
	}
}
