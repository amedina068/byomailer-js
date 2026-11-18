/**
 * Returns `{}` for an empty map. PHP encodes an empty array as `[]`, so the
 * server sends a map with no keys as an empty list.
 */
export function record<T>(
	value: Record<string, T> | readonly unknown[] | null,
): Record<string, T> {
	return value === null || Array.isArray(value)
		? {}
		: (value as Record<string, T>);
}

/** Returns a copy of `item` with `content_variables` as a map. */
export function withVariables<
	T extends { content_variables: Record<string, string> },
>(item: T): T {
	return { ...item, content_variables: record(item.content_variables) };
}
