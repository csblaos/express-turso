export const OpenApiSpec: Record<string, unknown> = {
	openapi: "3.0.3",
	info: {
		title: "Express Turso API",
		version: "1.0.0",
	},
	paths: {
		"/healthz": {
			get: {
				summary: "Health check",
				responses: {
					"200": {
						description: "OK",
					},
				},
			},
		},
		"/api/health": {
			get: {
				summary: "API health check",
				responses: {
					"200": {
						description: "OK",
					},
				},
			},
		},
		"/api/stores": {
			get: {
				summary: "List stores",
				responses: {
					"200": { description: "OK" },
				},
			},
			post: {
				summary: "Create store",
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: { $ref: "#/components/schemas/CreateStoreInput" },
						},
					},
				},
				responses: {
					"201": { description: "Created" },
					"400": { description: "Bad request" },
				},
			},
		},
		"/api/stores/{id}": {
			get: {
				summary: "Get store by id",
				parameters: [
					{
						name: "id",
						in: "path",
						required: true,
						schema: { type: "string" },
					},
				],
				responses: {
					"200": { description: "OK" },
					"404": { description: "Not found" },
				},
			},
			put: {
				summary: "Update store",
				parameters: [
					{
						name: "id",
						in: "path",
						required: true,
						schema: { type: "string" },
					},
				],
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: { $ref: "#/components/schemas/StoreUpdate" },
						},
					},
				},
				responses: {
					"200": { description: "OK" },
					"404": { description: "Not found" },
				},
			},
			delete: {
				summary: "Delete store",
				parameters: [
					{
						name: "id",
						in: "path",
						required: true,
						schema: { type: "string" },
					},
				],
				responses: {
					"200": { description: "OK" },
					"404": { description: "Not found" },
				},
			},
		},
	},
	components: {
		schemas: {
			CreateStoreInput: {
				type: "object",
				properties: {
					name: { type: "string" },
				},
				required: [ "name" ],
				additionalProperties: false,
			},
			StoreUpdate: {
				type: "object",
				additionalProperties: true,
			},
		},
	},
};

