import { WebhookVerificationError } from "./errors";

/**
 * The request headers: a `Headers` object (Fetch API, Next.js) or a plain
 * object (Node.js `IncomingHttpHeaders`, Express).
 */
export type WebhookHeaders =
	| Headers
	| Readonly<Record<string, string | readonly string[] | undefined>>;

/** The options of `verifyWebhook()`. */
export interface VerifyWebhookOptions {
	/**
	 * The raw request body, byte for byte. Do not parse the JSON and encode it
	 * again: a new encoding gives other bytes, and the signature fails.
	 */
	body: string | Uint8Array | ArrayBuffer;
	headers: WebhookHeaders;
	/** The signing secret of the endpoint, with its `whsec_` prefix. */
	secret: string;
	/** The maximum age of the timestamp, in seconds, before or after now. The default is 300. */
	tolerance?: number;
	/** The current time. Use it in tests. */
	now?: Date;
}

/** The contact in a webhook payload: its custom attributes and its fields. */
export interface WebhookContact {
	id: number;
	uuid: string;
	email: string;
	name: string | null;
	[attribute: string]: unknown;
}

interface EventBase {
	/** The time of the event, ISO 8601. */
	occurred_at: string;
}

export interface ContactEvent extends EventBase {
	event: "contact.subscribed" | "contact.unsubscribed" | "contact.resubscribed";
	contact: WebhookContact;
}

/**
 * The server sent a newsletter. For an A/B newsletter, the event arrives one
 * time, when the server picks the winner.
 */
export interface NewsletterSentEvent extends EventBase {
	event: "newsletter.sent";
	newsletter: {
		id: number;
		uuid: string;
		title: string;
		sent_at: string | null;
	};
}

export interface SequenceStepSentEvent extends EventBase {
	event: "sequence_step.sent";
	contact: WebhookContact;
	sequence: { id: number | null; name: string | null };
	sequence_step: { id: number };
}

export interface SequenceCompletedEvent extends EventBase {
	event: "sequence.completed";
	contact: WebhookContact;
	sequence: { id: number; name: string };
}

/** The event of `webhookEndpoints.test()`. */
export interface WebhookTestEvent extends EventBase {
	event: "webhook.test";
	message: string;
}

/**
 * The payload of a verified delivery. A `switch (payload.event)` narrows it.
 * A new server version can send an event type that is not in this union, so
 * keep a `default` branch.
 */
export type WebhookEvent =
	| ContactEvent
	| NewsletterSentEvent
	| SequenceStepSentEvent
	| SequenceCompletedEvent
	| WebhookTestEvent;

/** The headers of a delivery. The `X-Byomailer-Event` header also gives the type. */
export const WEBHOOK_HEADERS = {
	event: "x-byomailer-event",
	delivery: "x-byomailer-delivery",
	timestamp: "x-byomailer-timestamp",
	signature: "x-byomailer-signature",
} as const;

const DEFAULT_TOLERANCE = 300;

/**
 * Verifies a webhook delivery and returns its payload. Throws a
 * `WebhookVerificationError` when the signature does not match or the
 * timestamp is too old or too new. Call it only on the server: the secret
 * must stay secret.
 *
 * @example
 * const event = await verifyWebhook({
 * 	body: await request.text(),
 * 	headers: request.headers,
 * 	secret: process.env.BYOMAILER_WEBHOOK_SECRET,
 * })
 */
export async function verifyWebhook(
	options: VerifyWebhookOptions,
): Promise<WebhookEvent> {
	const { secret, tolerance = DEFAULT_TOLERANCE, now = new Date() } = options;

	if (typeof secret !== "string" || secret === "") {
		throw new TypeError("`secret` must be the signing secret of the endpoint.");
	}

	// A tolerance of NaN makes each age check false, so it turns the replay check off.
	if (!Number.isFinite(tolerance) || tolerance < 0) {
		throw new TypeError(
			"`tolerance` must be a number of seconds that is 0 or more.",
		);
	}

	const timestamp = header(options.headers, WEBHOOK_HEADERS.timestamp);
	const signature = header(options.headers, WEBHOOK_HEADERS.signature);

	if (signature === undefined) {
		throw new WebhookVerificationError(
			"signature",
			"The X-Byomailer-Signature header is missing.",
		);
	}

	if (timestamp === undefined || !/^\d+$/.test(timestamp)) {
		throw new WebhookVerificationError(
			"timestamp",
			"The X-Byomailer-Timestamp header is missing or is not a number.",
		);
	}

	const body = bytesOf(options.body);

	if (!(await signatureMatches(secret, timestamp, body, signature))) {
		throw new WebhookVerificationError(
			"signature",
			"The signature does not match the body. Check the secret and use the raw body.",
		);
	}

	const age = Math.floor(now.getTime() / 1000) - Number(timestamp);

	if (Math.abs(age) > tolerance) {
		throw new WebhookVerificationError(
			"timestamp",
			`The timestamp is ${Math.abs(age)} seconds from now. The tolerance is ${tolerance} seconds.`,
		);
	}

	return JSON.parse(new TextDecoder().decode(body));
}

// The server signs `timestamp.body` with HMAC-SHA256. `subtle.verify`
// compares the digests in constant time.
async function signatureMatches(
	secret: string,
	timestamp: string,
	body: Uint8Array,
	signature: string,
): Promise<boolean> {
	const match = /^sha256=([0-9a-f]{64})$/i.exec(signature.trim());

	if (match?.[1] === undefined) {
		return false;
	}

	const encoder = new TextEncoder();
	const prefix = encoder.encode(`${timestamp}.`);
	const payload = new Uint8Array(prefix.length + body.length);
	payload.set(prefix);
	payload.set(body, prefix.length);

	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);

	return crypto.subtle.verify("HMAC", key, hexBytes(match[1]), payload);
}

function header(headers: WebhookHeaders, name: string): string | undefined {
	if (isHeaders(headers)) {
		return headers.get(name) ?? undefined;
	}

	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === name) {
			return typeof value === "string" ? value : value?.[0];
		}
	}

	return undefined;
}

// A duck-type check, because a framework can bring its own `Headers` class.
function isHeaders(headers: WebhookHeaders): headers is Headers {
	return typeof (headers as Headers).get === "function";
}

function bytesOf(body: string | Uint8Array | ArrayBuffer): Uint8Array {
	if (typeof body === "string") {
		return new TextEncoder().encode(body);
	}

	return body instanceof Uint8Array ? body : new Uint8Array(body);
}

function hexBytes(hex: string): Uint8Array<ArrayBuffer> {
	const bytes = new Uint8Array(hex.length / 2);

	for (let index = 0; index < bytes.length; index++) {
		bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
	}

	return bytes;
}
