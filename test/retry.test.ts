import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { retryDelay } from "../src/core/transport";
import {
	ConnectionError,
	NotFoundError,
	RateLimitError,
	ServerError,
	TimeoutError,
	ValidationError,
} from "../src/index";
import {
	client,
	connectionRefused,
	connectionReset,
	json,
	mockFetch,
} from "./helpers";

const TAGS = { data: [{ id: 1, name: "vip" }] };
const TAG = { data: { id: 1, name: "vip" } };
const COUNT = { count: 12 };
const SENT = { message: "Test email sent", sent_to: "dev@example.com" };

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

/** Starts a call, runs each timer, and returns the result or the error. */
async function settle<T>(promise: Promise<T>): Promise<T | unknown> {
	const result = promise.catch((error: unknown) => error);
	await vi.runAllTimersAsync();

	return result;
}

/** Makes the next call of `fetch` wait until the SDK aborts it. */
function hangOnce(fetch: ReturnType<typeof mockFetch>): void {
	fetch.mockImplementationOnce(
		(_url, init) =>
			new Promise<Response>((_resolve, reject) => {
				init.signal?.addEventListener("abort", () =>
					reject(new Error("aborted")),
				);
			}),
	);
}

describe("retries of an idempotent request", () => {
	it("retries a 5xx and then succeeds", async () => {
		const fetch = mockFetch(json(500, {}), json(503, {}), json(200, TAGS));

		expect(await settle(client(fetch).tags.list())).toEqual(TAGS.data);
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it("retries a reset connection", async () => {
		const fetch = mockFetch(connectionReset(), json(200, TAGS));

		expect(await settle(client(fetch).tags.list())).toEqual(TAGS.data);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("retries a timeout", async () => {
		const fetch = mockFetch(json(200, TAGS));
		hangOnce(fetch);

		expect(await settle(client(fetch, { timeout: 1000 }).tags.list())).toEqual(
			TAGS.data,
		);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("stops after maxRetries and throws the last error", async () => {
		const fetch = mockFetch(
			json(500, {}),
			json(502, {}),
			json(503, { message: "Down" }),
		);

		const error = await settle(client(fetch).tags.list());

		expect(error).toBeInstanceOf(ServerError);
		expect(error).toMatchObject({ status: 503, message: "Down" });
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it("does not retry when maxRetries is 0", async () => {
		const fetch = mockFetch(json(500, {}));

		expect(
			await settle(client(fetch, { maxRetries: 0 }).tags.list()),
		).toBeInstanceOf(ServerError);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("lets one call override maxRetries", async () => {
		const fetch = mockFetch(json(500, {}), json(200, TAGS));

		expect(
			await settle(
				client(fetch, { maxRetries: 0 }).tags.list({ maxRetries: 1 }),
			),
		).toEqual(TAGS.data);
	});

	it("does not retry a 4xx other than 429", async () => {
		const fetch = mockFetch(json(404, { message: "Not found." }));

		expect(await settle(client(fetch).contacts.get(1))).toBeInstanceOf(
			NotFoundError,
		);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("retries a DELETE after a 5xx", async () => {
		const fetch = mockFetch(json(503, {}), new Response(null, { status: 204 }));

		expect(await settle(client(fetch).tags.delete(1))).toBeUndefined();
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("retries a PATCH that replaces a value", async () => {
		const fetch = mockFetch(json(500, {}), json(200, TAG));

		expect(await settle(client(fetch).tags.rename(1, "vip"))).toEqual(TAG.data);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("retries countRecipients after a 5xx, because it only reads", async () => {
		const fetch = mockFetch(json(500, {}), json(200, COUNT));

		expect(await settle(client(fetch).newsletters.countRecipients())).toBe(12);
		expect(fetch).toHaveBeenCalledTimes(2);
	});
});

describe("retries of a request that is not idempotent", () => {
	it("does not retry a 5xx", async () => {
		const fetch = mockFetch(json(500, {}));

		expect(await settle(client(fetch).tags.create("vip"))).toBeInstanceOf(
			ServerError,
		);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("does not retry a reset connection", async () => {
		const fetch = mockFetch(connectionReset());

		expect(await settle(client(fetch).newsletters.sendTest(7))).toBeInstanceOf(
			ConnectionError,
		);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("does not retry a timeout", async () => {
		const fetch = mockFetch();
		hangOnce(fetch);

		expect(
			await settle(client(fetch, { timeout: 1000 }).webhookEndpoints.test(5)),
		).toBeInstanceOf(TimeoutError);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("does not retry a 422", async () => {
		const fetch = mockFetch(json(422, { message: "Bad", errors: {} }));

		expect(
			await settle(client(fetch).newsletters.pickWinner(7, "a")),
		).toBeInstanceOf(ValidationError);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("retries a refused connection, because the server did not get the request", async () => {
		const fetch = mockFetch(connectionRefused(), json(201, TAG));

		expect(await settle(client(fetch).tags.create("vip"))).toEqual(TAG.data);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("retries a 429, because the server did not do the work", async () => {
		const fetch = mockFetch(
			json(429, { message: "Too Many Attempts." }, { "retry-after": "1" }),
			json(200, SENT),
		);

		expect(await settle(client(fetch).newsletters.sendTest(7))).toEqual(SENT);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("sends the same body again", async () => {
		const fetch = mockFetch(connectionRefused(), json(201, TAG));

		await settle(client(fetch).tags.create("vip"));

		const bodies = fetch.mock.calls.map(([, init]) => init.body);
		expect(bodies[1]).toBe(bodies[0]);
	});
});

describe("Retry-After", () => {
	it("waits for the time in Retry-After", async () => {
		const fetch = mockFetch(
			json(429, {}, { "retry-after": "3" }),
			json(200, TAGS),
		);
		const promise = client(fetch).tags.list();

		await vi.advanceTimersByTimeAsync(2999);
		expect(fetch).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1);
		expect(await promise).toEqual(TAGS.data);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("reads Retry-After on a 503", async () => {
		const fetch = mockFetch(
			json(503, {}, { "retry-after": "2" }),
			json(200, TAGS),
		);
		const promise = client(fetch).tags.list();

		await vi.advanceTimersByTimeAsync(1999);
		expect(fetch).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1);
		expect(await promise).toEqual(TAGS.data);
	});

	it("reads an HTTP date in Retry-After on a 503", () => {
		const date = new Date(Date.now() + 5000).toUTCString();
		const failure = new ServerError(
			503,
			{},
			new Headers({ "retry-after": date }),
		);
		const delay = retryDelay(failure, 0, true) ?? 0;

		expect(delay).toBeGreaterThan(3000);
		expect(delay).toBeLessThanOrEqual(5000);
	});

	it("does not wait more than 60 seconds", async () => {
		const fetch = mockFetch(json(429, {}, { "retry-after": "61" }));

		const error = await settle(client(fetch).tags.list());

		expect(error).toBeInstanceOf(RateLimitError);
		expect(error).toMatchObject({ retryAfter: 61 });
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});

describe("backoff", () => {
	it("doubles the delay and adds jitter", async () => {
		const fetch = mockFetch(json(500, {}), json(500, {}), json(200, TAGS));
		vi.spyOn(Math, "random").mockReturnValue(0);
		const promise = client(fetch).tags.list();

		// Equal jitter with a random value of 0: 250 ms, then 500 ms.
		await vi.advanceTimersByTimeAsync(249);
		expect(fetch).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(fetch).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(499);
		expect(fetch).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(1);

		expect(await promise).toEqual(TAGS.data);
	});

	it("keeps each delay between half and all of the base delay, up to 8 seconds", () => {
		const failure = new ServerError(500, {}, new Headers());

		expect(retryDelay(failure, 0, true, () => 0)).toBe(250);
		expect(retryDelay(failure, 0, true, () => 1)).toBe(500);
		expect(retryDelay(failure, 3, true, () => 1)).toBe(4000);
		expect(retryDelay(failure, 10, true, () => 1)).toBe(8000);
		expect(retryDelay(failure, 10, true, () => 0)).toBe(4000);
		expect(retryDelay(failure, 0, false)).toBeUndefined();
	});

	it("stops the delay when the signal aborts", async () => {
		const fetch = mockFetch(json(500, {}), json(200, TAGS));
		const controller = new AbortController();
		const promise = client(fetch)
			.tags.list({ signal: controller.signal })
			.catch((error: unknown) => error);

		await vi.advanceTimersByTimeAsync(10);
		controller.abort(new Error("stop"));

		expect(await promise).toMatchObject({ message: "stop" });
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});
