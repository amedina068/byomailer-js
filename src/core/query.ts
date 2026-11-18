/** A query value. Arrays use the PHP bracket form: `lists[0]=3`. */
export type QueryValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| readonly (string | number)[];

export type QueryParams = Readonly<Record<string, QueryValue>>;

/**
 * Appends parameters in the form that Laravel reads. `undefined` and `null`
 * are left out. A boolean becomes `1` or `0`, because the Laravel `boolean`
 * rule does not accept the strings `true` and `false`.
 */
export function appendQuery(
	search: URLSearchParams,
	params: QueryParams,
): void {
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === null) {
			continue;
		}

		if (typeof value === "boolean") {
			search.append(key, value ? "1" : "0");
			continue;
		}

		if (Array.isArray(value)) {
			value.forEach((item, index) => {
				search.append(`${key}[${index}]`, String(item));
			});
			continue;
		}

		search.append(key, String(value));
	}
}

/** Encodes one path segment. An empty value throws, because it changes the route. */
export function segment(value: string | number): string {
	const text = String(value);

	if (text === "") {
		throw new TypeError("An id must not be empty.");
	}

	return encodeURIComponent(text);
}
