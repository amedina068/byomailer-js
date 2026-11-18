import { describe, expect, it } from "vitest";
import { parseRetryAfter } from "../src/errors";
import {
	ApiError,
	AuthenticationError,
	AuthorizationError,
	ByomailerError,
	ConnectionError,
	isByomailerError,
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

async function errorFor(reply: Response | Error): Promise<unknown> {
	const mailer = client(mockFetch(reply), { maxRetries: 0 });

	return mailer.tags.list().then(
		() => {
			throw new Error("The call did not fail.");
		},
		(error: unknown) => error,
	);
}

describe("HTTP errors", () => {
	const cases = [
		[401, AuthenticationError, "authentication_error", "Unauthenticated."],
		[
			403,
			AuthorizationError,
			"authorization_error",
			"You have read-only access.",
		],
		[
			404,
			NotFoundError,
			"not_found",
			"No query results for model [App\\Models\\Tag] 9",
		],
		[422, ValidationError, "validation_error", "The name field is required."],
		[429, RateLimitError, "rate_limit", "Too Many Attempts."],
		[500, ServerError, "server_error", "Server Error"],
		[503, ServerError, "server_error", "Service Unavailable"],
		[405, ApiError, "api_error", "The method is not supported."],
	] as const;

	for (const [status, ErrorClass, code, message] of cases) {
		it(`maps ${status} to ${ErrorClass.name}`, async () => {
			const body = { message };
			const error = await errorFor(json(status, body));

			expect(error).toBeInstanceOf(ErrorClass);
			expect(error).toBeInstanceOf(ApiError);
			expect(error).toBeInstanceOf(ByomailerError);
			expect(error).toMatchObject({ code, status, message, body });
			expect((error as Error).name).toBe(ErrorClass.name);
		});
	}

	it("gives the field errors of a 422", async () => {
		const error = await errorFor(
			json(422, {
				message: "The email has already been taken. (and 1 more error)",
				errors: {
					email: ["The email has already been taken."],
					"filters.0.mode": ["A match mode is required for this filter."],
				},
			}),
		);

		expect((error as ValidationError).errors).toEqual({
			email: ["The email has already been taken."],
			"filters.0.mode": ["A match mode is required for this filter."],
		});
	});

	it("gives an empty map when a 422 has no field errors", async () => {
		const error = await errorFor(json(422, { message: "Bad" }));

		expect((error as ValidationError).errors).toEqual({});
	});

	it("gives the Retry-After value and the limit of a 429", async () => {
		const error = await errorFor(
			json(
				429,
				{ message: "Too Many Attempts." },
				{ "retry-after": "17", "x-ratelimit-limit": "5" },
			),
		);

		expect(error).toMatchObject({ retryAfter: 17, limit: 5 });
	});

	it("uses the text body as the message when the body is not JSON", async () => {
		const error = await errorFor(new Response("Bad Gateway", { status: 502 }));

		expect(error).toMatchObject({
			code: "server_error",
			message: "Bad Gateway",
			body: "Bad Gateway",
		});
	});

	it("uses the status when the body is empty", async () => {
		const error = await errorFor(new Response(null, { status: 500 }));

		expect((error as Error).message).toBe("HTTP 500");
	});

	it("throws an ApiError for a 200 with a body that is not JSON", async () => {
		const error = await errorFor(
			new Response("<html>Login</html>", { status: 200 }),
		);

		expect(error).toBeInstanceOf(ApiError);
		expect((error as Error).message).toMatch(/baseUrl/);
	});
});

describe("network errors", () => {
	it("throws a ConnectionError with beforeSend for a refused connection", async () => {
		const error = await errorFor(connectionRefused());

		expect(error).toBeInstanceOf(ConnectionError);
		expect(error).toMatchObject({ code: "connection_error", beforeSend: true });
	});

	it("throws a ConnectionError without beforeSend for a reset connection", async () => {
		const error = await errorFor(connectionReset());

		expect(error).toMatchObject({
			code: "connection_error",
			beforeSend: false,
		});
		expect((error as Error).cause).toBeInstanceOf(TypeError);
	});

	it("throws a TimeoutError when one attempt takes too long", async () => {
		const fetch = mockFetch();
		fetch.mockImplementationOnce(
			(_url, init) =>
				new Promise<Response>((_resolve, reject) => {
					init.signal?.addEventListener("abort", () =>
						reject(new Error("aborted")),
					);
				}),
		);

		const error = await client(fetch, { timeout: 10, maxRetries: 0 })
			.tags.list()
			.catch((error: unknown) => error);

		expect(error).toBeInstanceOf(TimeoutError);
		expect(error).toMatchObject({ code: "timeout" });
	});
});

describe("isByomailerError", () => {
	it("narrows with a switch on code", async () => {
		const error = await errorFor(
			json(422, { message: "Bad", errors: { name: ["Required."] } }),
		);

		expect(isByomailerError(error)).toBe(true);

		if (!isByomailerError(error)) {
			return;
		}

		switch (error.code) {
			case "validation_error":
				expect(error.errors.name).toEqual(["Required."]);
				break;
			default:
				throw new Error(`Unexpected code ${error.code}`);
		}
	});

	it("returns false for other errors", () => {
		expect(isByomailerError(new Error("x"))).toBe(false);
		expect(isByomailerError("x")).toBe(false);
	});
});

describe("parseRetryAfter", () => {
	it("reads seconds and HTTP dates", () => {
		const now = Date.parse("2026-11-18T10:00:00Z");

		expect(parseRetryAfter("30", now)).toBe(30);
		expect(parseRetryAfter("Wed, 18 Nov 2026 10:00:10 GMT", now)).toBe(10);
		expect(parseRetryAfter("Wed, 18 Nov 2026 09:00:00 GMT", now)).toBe(0);
		expect(parseRetryAfter("soon", now)).toBeUndefined();
		expect(parseRetryAfter(null, now)).toBeUndefined();
	});
});
