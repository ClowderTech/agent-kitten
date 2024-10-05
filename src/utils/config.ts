export interface Config {
	[key: string]: string | number | boolean | Config;
}

export function setNestedKey(
	obj: Config,
	path: string,
	value: string | number | boolean,
): Config {
	const keys = path.split(".");
	let current = obj;

	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i];
		if (!current[key] || typeof current[key] !== "object") {
			current[key] = {}; // Create an empty object if it doesn't exist
		}
		current = current[key] as Config;
	}

	current[keys[keys.length - 1]] = value;
	return obj;
}

export function getNestedKey(
	obj: Config,
	key: string,
): string | number | boolean | Config | null {
	const keys = key.split(".");
	let value: string | number | boolean | Config | null = obj;
	for (const k of keys) {
		if (value && typeof value === "object" && k in value) {
			value = (value as Config)[k];
		} else {
			value = null;
			break;
		}
	}

	return value;
}
