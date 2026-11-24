import { vi } from "vitest";
import { Byomailer, type ByomailerOptions, type FetchLike } from "../src/index";

export const BASE_URL = "https://mail.example.com";
export const API = `${BASE_URL}/api/v1`;
export const TOKEN = "test-token";

/** One mocked reply: a `Response`, or an error that `fetch` throws. */
export type Reply = Response | Error | (() => Response | Error);

/** A JSON response. */
export function json(
	status: number,
	body: unknown,
	headers: Record<string, string> = {},
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

/** A 204 response with no body. */
export function noContent(): Response {
	return new Response(null, { status: 204 });
}

/** A `fetch` error like the one undici throws when the connection is refused. */
export function connectionRefused(): TypeError {
	return new TypeError("fetch failed", {
		cause: Object.assign(new Error("connect ECONNREFUSED"), {
			code: "ECONNREFUSED",
		}),
	});
}

/** A `fetch` error like the one undici throws for a connection error with this code. */
export function connectionFailure(code: string): TypeError {
	return new TypeError("fetch failed", {
		cause: Object.assign(new Error(code), { code }),
	});
}

/** A `fetch` error like the one undici throws when the server resets the connection. */
export function connectionReset(): TypeError {
	return new TypeError("fetch failed", {
		cause: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }),
	});
}

/** Makes a mocked `fetch` that gives the replies in order. */
export function mockFetch(...replies: Reply[]) {
	const queue = [...replies];

	return vi.fn<FetchLike>(async () => {
		const next = queue.shift();

		if (next === undefined) {
			throw new Error("The test made more requests than it expected.");
		}

		const reply = typeof next === "function" ? next() : next;

		if (reply instanceof Error) {
			throw reply;
		}

		return reply;
	});
}

/** Makes a client with a mocked `fetch`. */
export function client(
	fetch: FetchLike,
	options: Partial<ByomailerOptions> = {},
): Byomailer {
	return new Byomailer({ baseUrl: BASE_URL, token: TOKEN, fetch, ...options });
}

/** The details of one call to the mocked `fetch`. */
export interface Call {
	method: string;
	url: URL;
	/** The URL without the API root, with the query. */
	path: string;
	headers: Headers;
	body: unknown;
}

/** Reads the call with the given index. */
export function callOf(fetch: ReturnType<typeof mockFetch>, index = 0): Call {
	const call = fetch.mock.calls[index];

	if (call === undefined) {
		throw new Error(`fetch has no call ${index}.`);
	}

	const [url, init] = call;
	const parsed = new URL(url);

	return {
		method: init.method ?? "GET",
		url: parsed,
		path: decodeURIComponent(parsed.href.slice(API.length)),
		headers: new Headers(init.headers),
		body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
	};
}

/** An empty cursor page. */
export function page(data: unknown[], next: string | null = null): Response {
	return json(200, {
		data,
		links: { first: null, last: null, prev: null, next: null },
		meta: {
			path: `${API}/x`,
			per_page: 25,
			next_cursor: next,
			prev_cursor: null,
		},
	});
}
