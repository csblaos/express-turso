module.exports = {
	root: true,
	env: {
		node: true,
		es2020: true,
	},
	parser: "@typescript-eslint/parser",
	parserOptions: {
		ecmaVersion: 2020,
		sourceType: "module",
	},
	plugins: [ "@typescript-eslint", "unused-imports" ],
	extends: [ "eslint:recommended", "plugin:@typescript-eslint/recommended" ],
	ignorePatterns: [ "dist", "node_modules" ],
	rules: {
		indent: [ "error", "tab" ],
		quotes: [ "error", "double" ],
		semi: [ "error", "always" ],
		"no-unused-vars": "off",
		"@typescript-eslint/no-unused-vars": "off",
		"unused-imports/no-unused-imports": "error",
		"unused-imports/no-unused-vars": [
			"warn",
			{
				vars: "all",
				varsIgnorePattern: "^_",
				args: "after-used",
				argsIgnorePattern: "^_",
			},
		],
		"array-bracket-spacing": [ "error", "always" ],
		"object-curly-spacing": [ "error", "always" ],
	},
};
