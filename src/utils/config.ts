import { ObjectId } from "mongodb";

export type Config =
	| string
	| number
	| boolean
	| Config[]
	| { [key: string]: Config };

export interface ServerConfig {
	_id: ObjectId;
	config: Config;
	serverid: string;
}

export interface UserConfig {
	_id: ObjectId;
	config: Config;
	userid: string;
}

export function setNestedKey(obj: Config, path: string, value: Config): Config {
	const keys = path.split(".");
	let current: Config = obj;

	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i];
		if (Array.isArray(current)) {
			const index = parseInt(key, 10);
			if (isNaN(index) || current[index] === undefined) {
				current[index] = {}; // Create an empty object if it's an undefined array element
			}
			current = current[index] as Config;
		} else if (typeof current === "object" && current !== null) {
			if (!current[key] || typeof current[key] !== "object") {
				current[key] = {}; // Create an empty object if it doesn't exist
			}
			current = current[key] as Config;
		} else {
			throw new Error(
				`Invalid path: ${path}. Encountered non-object at key ${key}`
			);
		}
	}

	const lastKey = keys[keys.length - 1];
	if (Array.isArray(current)) {
		const index = parseInt(lastKey, 10);
		if (isNaN(index)) {
			throw new Error(
				`Array index expected but found a non-numeric key: ${lastKey}`
			);
		}
		current[index] = value;
	} else if (typeof current === "object" && current !== null) {
		current[lastKey] = value;
	} else {
		throw new Error(
			`Invalid path: ${path}. Encountered non-object at key ${lastKey}`
		);
	}

	return obj;
}

export function getNestedKey(obj: Config, key: string): Config | null {
	const keys = key.split(".");
	let value: Config | null = obj;

	for (const k of keys) {
		if (value === null || value === undefined) {
			return null;
		}

		if (Array.isArray(value)) {
			const index = parseInt(k, 10);
			if (isNaN(index) || index < 0 || index >= value.length) {
				return null; // Invalid index or out of bounds
			}
			value = value[index];
		} else if (typeof value === "object") {
			if (k in value) {
				value = (value as { [key: string]: Config })[k];
			} else {
				return null; // Key not found
			}
		} else {
			return null; // Not an object or array at this point
		}
	}

	return value;
}
