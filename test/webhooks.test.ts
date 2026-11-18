import { describe, expect, it } from "vitest";
import {
	verifyWebhook,
	type WebhookEvent,
	WebhookVerificationError,
} from "../src/index";
import vectors from "./fixtures/webhook-signature-vectors.json" with {
	type: "json",
};

const VALID = vectors.cases.find((item) => item.valid);

if (VALID === undefined) {
	throw new Error("The vectors have no valid case.");
}

function headersOf(item: { timestamp: string; signature: string }) {
	return {
		"X-Byomailer-Event": "newsletter.sent",
		"X-Byomailer-Delivery": "0b8f2c4e-6a1d-4e3b-9c7f-1a2b3c4d5e6f",
		"X-Byomailer-Timestamp": item.timestamp,
		"X-Byomailer-Signature": item.signature,
	};
}

async function failure(
	promise: Promise<unknown>,
): Promise<WebhookVerificationError> {
	const error = await promise.then(
		() => {
			throw new Error("The verification did not fail.");
		},
		(error: unknown) => error,
	);

	expect(error).toBeInstanceOf(WebhookVerificationError);

	return error as WebhookVerificationError;
}

describe("signature vectors", () => {
	for (const item of vectors.cases) {
		it(`${item.valid ? "accepts" : "rejects"}: ${item.name}`, async () => {
			const verify = verifyWebhook({
				body: item.body,
				headers: headersOf(item),
				secret: item.secret,
				now: new Date(item.now * 1000),
				tolerance: vectors.tolerance_seconds,
			});

			if (item.valid) {
				expect(await verify).toEqual(JSON.parse(item.body));
				return;
			}

			const error = await failure(verify);
			expect(error.reason).toBe(item.reason);
			expect(error.code).toBe("webhook_verification_error");
		});
	}
});

describe("verifyWebhook", () => {
	const valid = {
		body: VALID.body,
		headers: headersOf(VALID),
		secret: VALID.secret,
		now: new Date(VALID.now * 1000),
	};

	it("accepts the body as bytes, an ArrayBuffer or a Buffer", async () => {
		const bytes = new TextEncoder().encode(VALID.body);
		const expected = JSON.parse(VALID.body);

		expect(await verifyWebhook({ ...valid, body: bytes })).toEqual(expected);
		expect(
			await verifyWebhook({ ...valid, body: bytes.buffer as ArrayBuffer }),
		).toEqual(expected);
		expect(
			await verifyWebhook({ ...valid, body: Buffer.from(VALID.body) }),
		).toEqual(expected);
	});

	it("reads a Headers object and lowercase header names", async () => {
		const lower = Object.fromEntries(
			Object.entries(valid.headers).map(([name, value]) => [
				name.toLowerCase(),
				value,
			]),
		);

		expect(await verifyWebhook({ ...valid, headers: lower })).toBeDefined();
		expect(
			await verifyWebhook({ ...valid, headers: new Headers(valid.headers) }),
		).toBeDefined();
	});

	it("rejects a body that was parsed and encoded again", async () => {
		// The app escapes Unicode as \uXXXX. JSON.stringify does not.
		const item = vectors.cases.find((each) => each.body.includes("\\u00e9"));
		expect(item).toBeDefined();

		const error = await failure(
			verifyWebhook({
				body: JSON.stringify(JSON.parse(item?.body ?? "")),
				headers: headersOf(item ?? VALID),
				secret: VALID.secret,
				now: valid.now,
			}),
		);

		expect(error.reason).toBe("signature");
	});

	it("rejects a missing signature header", async () => {
		const { "X-Byomailer-Signature": _, ...headers } = valid.headers;

		expect((await failure(verifyWebhook({ ...valid, headers }))).reason).toBe(
			"signature",
		);
	});

	it("rejects a signature that is not hex", async () => {
		const headers = {
			...valid.headers,
			"X-Byomailer-Signature": `sha256=${"z".repeat(64)}`,
		};

		expect((await failure(verifyWebhook({ ...valid, headers }))).reason).toBe(
			"signature",
		);
	});

	it("rejects a missing or bad timestamp header", async () => {
		const { "X-Byomailer-Timestamp": _, ...missing } = valid.headers;
		const bad = { ...valid.headers, "X-Byomailer-Timestamp": "soon" };

		expect(
			(await failure(verifyWebhook({ ...valid, headers: missing }))).reason,
		).toBe("timestamp");
		expect(
			(await failure(verifyWebhook({ ...valid, headers: bad }))).reason,
		).toBe("timestamp");
	});

	it("lets the caller change the tolerance", async () => {
		const late = new Date((Number(VALID.timestamp) + 600) * 1000);

		await failure(verifyWebhook({ ...valid, now: late }));
		expect(
			await verifyWebhook({ ...valid, now: late, tolerance: 600 }),
		).toBeDefined();
	});

	it("accepts an event type that the SDK does not know", async () => {
		const body =
			'{"event":"contact.deleted","occurred_at":"2026-11-18T10:00:00+00:00"}';
		const timestamp = "1763460000";
		const signature = await sign(VALID.secret, `${timestamp}.${body}`);

		const event = await verifyWebhook({
			body,
			headers: {
				"x-byomailer-timestamp": timestamp,
				"x-byomailer-signature": signature,
			},
			secret: VALID.secret,
			now: new Date(Number(timestamp) * 1000),
		});

		expect(event.event).toBe("contact.deleted");
	});

	it("rejects a tolerance that is not a number", async () => {
		await expect(
			verifyWebhook({ ...valid, tolerance: Number.NaN }),
		).rejects.toThrow(/tolerance/);
	});

	it("rejects an empty secret before it reads the request", async () => {
		await expect(verifyWebhook({ ...valid, secret: "" })).rejects.toThrow(
			TypeError,
		);
	});

	it("narrows the payload with a switch on event", async () => {
		const event: WebhookEvent = await verifyWebhook(valid);

		switch (event.event) {
			case "webhook.test":
				expect(event.message).toContain("test delivery");
				break;
			default:
				throw new Error(`The first vector is ${event.event}.`);
		}
	});
});

describe("framework integration", () => {
	it("verifies a Next.js route handler request", async () => {
		const request = new Request("https://example.com/api/byomailer", {
			method: "POST",
			headers: headersOf(VALID),
			body: VALID.body,
		});

		const event = await verifyWebhook({
			body: await request.text(),
			headers: request.headers,
			secret: VALID.secret,
			now: new Date(VALID.now * 1000),
		});

		expect(event.event).toBe("webhook.test");
	});

	it("verifies an Express request with express.raw()", async () => {
		// express.raw() gives a Buffer. Node.js gives the headers in lowercase.
		const req = {
			body: Buffer.from(VALID.body),
			headers: {
				"x-byomailer-timestamp": VALID.timestamp,
				"x-byomailer-signature": VALID.signature,
				"content-type": "application/json",
			},
		};

		const event = await verifyWebhook({
			body: req.body,
			headers: req.headers,
			secret: VALID.secret,
			now: new Date(VALID.now * 1000),
		});

		expect(event.event).toBe("webhook.test");
	});
});

async function sign(secret: string, payload: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const digest = new Uint8Array(
		await crypto.subtle.sign("HMAC", key, encoder.encode(payload)),
	);

	return `sha256=${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
