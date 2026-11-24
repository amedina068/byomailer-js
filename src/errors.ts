/** The `code` of each error class. Use it in a `switch` to narrow the error. */
export type ByomailerErrorCode =
	| "authentication_error"
	| "authorization_error"
	| "not_found"
	| "validation_error"
	| "rate_limit"
	| "server_error"
	| "api_error"
	| "connection_error"
	| "timeout"
	| "webhook_verification_error";

/**
 * The base class of every error that the SDK throws. An abort from your own
 * `AbortSignal` is not wrapped: the SDK throws the reason of the signal.
 */
export abstract class ByomailerError extends Error {
	abstract readonly code: ByomailerErrorCode;
	override name = "ByomailerError";
}

/** The `code` of each error that has an HTTP response. */
export type ApiErrorCode = Exclude<
	ByomailerErrorCode,
	"connection_error" | "timeout" | "webhook_verification_error"
>;

/** The server sent a response with an error status. */
export class ApiError extends ByomailerError {
	readonly code: ApiErrorCode = "api_error";
	override name = "ApiError";
	/** The HTTP status code. */
	readonly status: number;
	/** The parsed JSON body, or the text body when it is not JSON. */
	readonly body: unknown;
	/** The response headers. */
	readonly headers: Headers;

	constructor(status: number, body: unknown, headers: Headers) {
		super(messageOf(status, body));
		this.status = status;
		this.body = body;
		this.headers = headers;
	}
}

/** 401: the token is missing, not valid, or revoked. */
export class AuthenticationError extends ApiError {
	override readonly code = "authentication_error" as const;
	override name = "AuthenticationError";
}

/**
 * 403: the token cannot do this action. A read-only token gets this error
 * on each write. A token of a user who is not an admin gets it on each
 * webhook endpoint call.
 */
export class AuthorizationError extends ApiError {
	override readonly code = "authorization_error" as const;
	override name = "AuthorizationError";
}

/** 404: the record does not exist in the client of the token user. */
export class NotFoundError extends ApiError {
	override readonly code = "not_found" as const;
	override name = "NotFoundError";
}

/** 422: the server rejected one or more fields. */
export class ValidationError extends ApiError {
	override readonly code = "validation_error" as const;
	override name = "ValidationError";
	/** The messages for each field, for example `{ email: ['The email has already been taken.'] }`. */
	readonly errors: Readonly<Record<string, readonly string[]>>;

	constructor(status: number, body: unknown, headers: Headers) {
		super(status, body, headers);
		this.errors = fieldErrorsOf(body);
	}
}

/** 429: too many requests. */
export class RateLimitError extends ApiError {
	override readonly code = "rate_limit" as const;
	override name = "RateLimitError";
	/** The number of seconds from the `Retry-After` header, when the server sent it. */
	readonly retryAfter: number | undefined;
	/** The number of requests in one minute that the limit allows, from the `X-RateLimit-Limit` header. */
	readonly limit: number | undefined;

	constructor(status: number, body: unknown, headers: Headers) {
		super(status, body, headers);
		this.retryAfter = parseRetryAfter(headers.get("retry-after"));
		this.limit = parseCount(headers.get("x-ratelimit-limit"));
	}
}

/** 5xx: the server failed. */
export class ServerError extends ApiError {
	override readonly code = "server_error" as const;
	override name = "ServerError";
}

/** The request did not get a response: DNS, TLS, a refused or reset connection. */
export class ConnectionError extends ByomailerError {
	readonly code = "connection_error" as const;
	override name = "ConnectionError";
	/**
	 * `true` when the SDK knows that the server did not receive the request:
	 * a DNS failure, a refused connection or a connect timeout. Then the SDK
	 * retries each request, also a write that is not idempotent.
	 */
	readonly beforeSend: boolean;

	constructor(message: string, options: { cause: unknown }) {
		super(message, options);
		this.beforeSend = isBeforeSend(options.cause);
	}
}

/** One attempt took more time than the `timeout` setting. */
export class TimeoutError extends ByomailerError {
	readonly code = "timeout" as const;
	override name = "TimeoutError";
}

/** The reason that a webhook delivery failed verification. */
export type WebhookFailureReason = "signature" | "timestamp" | "payload";

/**
 * A webhook delivery failed verification. Answer the request with a 400 and
 * do not process the body.
 */
export class WebhookVerificationError extends ByomailerError {
	readonly code = "webhook_verification_error" as const;
	override name = "WebhookVerificationError";
	/**
	 * `signature`: the signature header is missing or does not match the body.
	 * `timestamp`: the timestamp header is missing, is not a number, or is
	 * outside the tolerance.
	 * `payload`: the signature is valid, but the body is not a JSON object.
	 */
	readonly reason: WebhookFailureReason;

	constructor(reason: WebhookFailureReason, message: string) {
		super(message);
		this.reason = reason;
	}
}

/** Makes the error class that matches an HTTP status. */
export function createApiError(
	status: number,
	body: unknown,
	headers: Headers,
): ApiError {
	switch (status) {
		case 401:
			return new AuthenticationError(status, body, headers);
		case 403:
			return new AuthorizationError(status, body, headers);
		case 404:
			return new NotFoundError(status, body, headers);
		case 422:
			return new ValidationError(status, body, headers);
		case 429:
			return new RateLimitError(status, body, headers);
		default:
			return status >= 500
				? new ServerError(status, body, headers)
				: new ApiError(status, body, headers);
	}
}

/** Reads a `Retry-After` value (seconds or an HTTP date) as seconds. */
export function parseRetryAfter(
	value: string | null,
	now: number = Date.now(),
): number | undefined {
	if (value === null) {
		return undefined;
	}

	const trimmed = value.trim();

	if (/^\d+$/.test(trimmed)) {
		return Number(trimmed);
	}

	const date = Date.parse(trimmed);

	return Number.isNaN(date) ? undefined : Math.max(0, (date - now) / 1000);
}

function parseCount(value: string | null): number | undefined {
	const trimmed = value?.trim();

	return trimmed !== undefined && /^\d+$/.test(trimmed)
		? Number(trimmed)
		: undefined;
}

// The codes that a runtime gives when the connection never opened. Node
// (undici) puts them on `cause.code`. Bun puts them on `code`.
const BEFORE_SEND_CODES = new Set([
	"ECONNREFUSED",
	"ENOTFOUND",
	"EAI_AGAIN",
	"EHOSTUNREACH",
	"ENETUNREACH",
	"UND_ERR_CONNECT_TIMEOUT",
	"ConnectionRefused",
	"FailedToOpenSocket",
]);

function isBeforeSend(error: unknown): boolean {
	for (
		let current = error, depth = 0;
		isRecord(current) && depth < 4;
		depth++
	) {
		if (
			typeof current.code === "string" &&
			BEFORE_SEND_CODES.has(current.code)
		) {
			return true;
		}

		current = current.cause;
	}

	return false;
}

function messageOf(status: number, body: unknown): string {
	const message = isRecord(body) ? body.message : undefined;

	if (typeof message === "string" && message !== "") {
		return message;
	}

	return typeof body === "string" && body.length > 0 && body.length <= 200
		? body
		: `HTTP ${status}`;
}

function fieldErrorsOf(body: unknown): Record<string, readonly string[]> {
	const errors = isRecord(body) ? body.errors : undefined;
	const result: Record<string, readonly string[]> = {};

	if (!isRecord(errors)) {
		return result;
	}

	for (const [field, messages] of Object.entries(errors)) {
		result[field] = Array.isArray(messages)
			? messages.filter(
					(message): message is string => typeof message === "string",
				)
			: typeof messages === "string"
				? [messages]
				: [];
	}

	return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * Each error that the SDK throws, as a discriminated union on `code`. A
 * `switch (error.code)` narrows the union to one class.
 */
export type AnyByomailerError =
	| AuthenticationError
	| AuthorizationError
	| NotFoundError
	| ValidationError
	| RateLimitError
	| ServerError
	| (ApiError & { readonly code: "api_error" })
	| ConnectionError
	| TimeoutError
	| WebhookVerificationError;

/**
 * Returns `true` for each error that the SDK throws. Use it in a `catch`
 * block, then narrow the error with `switch (error.code)`.
 */
export function isByomailerError(error: unknown): error is AnyByomailerError {
	return error instanceof ByomailerError;
}
