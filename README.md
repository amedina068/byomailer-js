# byomailer

The TypeScript client for a self-hosted [BYOMailer](https://byomailer.com) instance. BYOMailer sends newsletters and email sequences through your own Amazon SES account.

One package runs on Node.js, Bun, Deno, Cloudflare Workers and other edge runtimes. The package has no runtime dependencies. It uses the global `fetch` and Web Crypto.

> Status: 0.2.0, not released. The package is not on npm. Install it from GitHub.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Resources](#resources)
- [Pagination](#pagination)
- [Webhook verification](#webhook-verification)
- [Errors](#errors)
- [Retries](#retries)
- [Cancel a call](#cancel-a-call)
- [Framework integration](#framework-integration)
- [Supported runtimes](#supported-runtimes)
- [License](#license)

## Install

The package is not on npm. Install it from the GitHub repository:

```sh
npm install github:amedina068/byomailer-js
```

The `prepare` script builds `dist/` during the install. For Bun, use `bun add github:amedina068/byomailer-js`.

## Quick start

```ts
import { Byomailer } from "byomailer";

const mailer = new Byomailer({
	baseUrl: "https://mail.example.com",
	token: process.env.BYOMAILER_TOKEN,
});

const { contact, created } = await mailer.contacts.add(3, {
	email: "ana@example.com",
	name: "Ana",
	tags: ["trial"],
	attributes: { company: "Example Inc" },
});

console.log(created ? "New contact" : "Known contact", contact.id);
```

## Configuration

| Option       | Type                               | Default        | Description                                                                                                              |
| ------------ | ---------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `baseUrl`    | `string \| URL`                    | (required)     | The root URL of your instance. The SDK adds `/api/v1`. Each user runs their own instance, so the SDK has no default URL. |
| `token`      | `string`                           | (required)     | A personal API token. Make it in Settings, API Tokens. The SDK sends it as `Authorization: Bearer`.                      |
| `timeout`    | `number`                           | `30000`        | The time limit for one attempt, in milliseconds.                                                                         |
| `maxRetries` | `number`                           | `2`            | The maximum number of retries after the first attempt. Use `0` to stop retries.                                          |
| `fetch`      | `(url, init) => Promise<Response>` | global `fetch` | A `fetch` function for tests or a proxy.                                                                                 |

Each method also accepts `{ signal, timeout, maxRetries }` as its last argument. These values replace the client values for that call.

A token has read access, or read and write access. A read-only token gets an `AuthorizationError` on each call that changes data. Each call sees only the data of the client of the token user.

Keep the token on the server. Do not put the token in a browser bundle.

## Resources

The response types and the request fields use the field names of the API, for example `html_content` and `per_page`. Dates are ISO 8601 strings.

### Contacts

```ts
// List contacts, newest first. Unsubscribed contacts are left out by default.
const page = await mailer.contacts.list({
	search: "ana",
	lists: [3],
	per_page: 50,
});

// Read one contact with its tags, lists, topics and sequences.
const contact = await mailer.contacts.get(42);

// Add a contact to list 3. `created` is false when the email was already a contact.
// This subscribes again a contact that an admin unsubscribed.
const { contact: added, created } = await mailer.contacts.add(3, {
	email: "ana@example.com",
	attributes: { plan: "pro" },
});

// Change a contact. The server merges `attributes` into the saved attributes.
// An update never changes the subscription.
await mailer.contacts.update(42, {
	name: "Ana P.",
	tags: ["customer"],
	remove_tags: ["trial"],
	attributes: { plan: "team" },
});

// Unsubscribe a contact from all email.
await mailer.contacts.unsubscribe(42);

// Subscribe a contact again after an admin or the API unsubscribed it.
await mailer.contacts.subscribe(42);

// Remove a contact from list 3. The result is the contact.
await mailer.contacts.removeFromList(3, 42);
```

The subscription changes only through these calls:

- `unsubscribe()` unsubscribes the contact. A second call keeps the first date.
- `subscribe()` clears an unsubscribe that an admin or the API made. A subscribed contact does not change.
- `add()` also clears an unsubscribe that an admin or the API made.
- `update()` never changes the subscription.

An unsubscribe through an email link stays. Only the contact can subscribe again. For this contact, `subscribe()` throws a `ValidationError` with the field `contact`. For a blacklisted address, the field is `email`:

```ts
import { ValidationError } from "byomailer";

try {
	await mailer.contacts.subscribe(42);
} catch (error) {
	if (error instanceof ValidationError && "contact" in error.errors) {
		// The contact unsubscribed through an email link.
	}
}
```

On a list with opt-in, `add()` sends the opt-in email only when the contact is new on the list. The contact gets newsletters and sequence emails from this list only after the confirmation.

`attributes` is a map of custom attributes. The SDK sends each key at the top level of the request body, because the API reads each unknown field as a custom attribute. The keys `email`, `name`, `tags` and `remove_tags` are not allowed in `attributes`.

### Lists

```ts
const lists = await mailer.lists.list();
const list = await mailer.lists.create("Customers");
await mailer.lists.rename(list.id, "Clients");
await mailer.lists.delete(list.id);
```

### Topics

```ts
// All topics of list 3. This list has no pages.
const topics = await mailer.topics.list(3);
const topic = await mailer.topics.create(3, {
	name: "Events",
	description: "Event news",
});
// The server clears a description that you leave out, so `description` is required here.
await mailer.topics.update(3, topic.id, { name: "Events", description: null });
await mailer.topics.delete(3, topic.id);
```

### Tags

```ts
// All tags. This list has no pages.
const tags = await mailer.tags.list();
const tag = await mailer.tags.create("vip");
await mailer.tags.rename(tag.id, "gold");
await mailer.tags.delete(tag.id);
```

### Newsletters

```ts
const page = await mailer.newsletters.list({
	status: "sent",
	search: "November",
});
const newsletter = await mailer.newsletters.get(7);

// A new newsletter is a draft. A draft sends nothing.
const draft = await mailer.newsletters.create({
	title: "November news",
	subject: "Hello {{ first_name }}",
	html_content: "<p>Hello {{ first_name }}</p>",
	email_identity_id: 4,
	filters: [{ category: "tags", mode: "any", values: ["customer"] }],
});

await mailer.newsletters.update(draft.id, { subject: "News for November" });

// Delete a draft.
await mailer.newsletters.delete(draft.id);

// Count the contacts that match filters. The server allows 30 calls a minute.
const count = await mailer.newsletters.countRecipients([
	{ category: "lists", mode: "any", values: [3] },
]);

// Send a test email to the email address of the token user. The server allows 5 calls a minute.
const test = await mailer.newsletters.sendTest(7);

// Pick the winner of an A/B test. The newsletter must have the status `ab_testing`.
await mailer.newsletters.pickWinner(7, "b");

// Read and replace the defaults of the `{{ variables }}`.
const variables = await mailer.newsletters.variables(7);
await mailer.newsletters.replaceVariables(7, { first_name: "friend" });
```

CAUTION: Do not set `status: "live"` in a test. A live newsletter goes to real contacts at `scheduled_at`. A `scheduled_at` of now sends it at once.

```ts
await mailer.newsletters.update(7, {
	status: "live",
	scheduled_at: new Date("2026-12-01T09:00:00Z"),
});
```

To stop a schedule, call `update()` with `status: "draft"`. The server can change only a draft or a scheduled newsletter.

### Sequences

```ts
// The list items have the counts but no steps. `status` is "draft", "live" or "paused".
const page = await mailer.sequences.list({ status: "live" });

// One sequence with its steps, filters and variable defaults.
const sequence = await mailer.sequences.get(3);
const stats = await mailer.sequences.stats(3);

const step = await mailer.sequences.step(3, 11);
const stepStats = await mailer.sequences.stepStats(3, 11);

// A contact who does not match the step filters skips only this step. An empty list removes the filters.
await mailer.sequences.replaceStepFilters(3, 11, [
	{
		category: "attributes",
		mode: "all",
		values: [{ key: "plan", operator: "equals", value: "pro" }],
	},
]);

const variables = await mailer.sequences.variables(3);
await mailer.sequences.replaceVariables(3, { first_name: "friend" });

// The mails of one step as CSV text. The first line has the column names.
const csv = await mailer.sequences.exportStepMails(3, 11, { status: "opened" });
```

### Blocks

A block is a reusable piece of HTML.

```ts
// All blocks. This list has no pages.
const blocks = await mailer.blocks.list();
const block = await mailer.blocks.create({
	name: "footer",
	html_content: "<p>Bye</p>",
});
const same = await mailer.blocks.get(block.id);
// The server requires both fields on an update.
await mailer.blocks.update(block.id, {
	name: "footer",
	html_content: "<p>See you</p>",
});
await mailer.blocks.delete(block.id);
```

### Email templates

```ts
const page = await mailer.emailTemplates.list({ archived: false });
const template = await mailer.emailTemplates.get(2);
// Throws a NotFoundError when no active template is the default.
const defaultTemplate = await mailer.emailTemplates.default();
```

### Email identities

```ts
const page = await mailer.emailIdentities.list({ identity_status: "verified" });
const identity = await mailer.emailIdentities.get(4);
```

### Email logs

```ts
const page = await mailer.emailLogs.list({ recipient: "example.com" });
const log = await mailer.emailLogs.get(9);
```

### Projects

```ts
const page = await mailer.projects.list();
const project = await mailer.projects.create("Launch");
const same = await mailer.projects.get(project.id);
await mailer.projects.rename(project.id, "Relaunch");
await mailer.projects.delete(project.id);
```

### Webhook endpoints

Only a token of an admin user can use these calls. Other tokens get an `AuthorizationError`.

```ts
const page = await mailer.webhookEndpoints.list();

// The result of create() has the signing secret. Store it now. No other call shows it again.
const endpoint = await mailer.webhookEndpoints.create({
	url: "https://example.com/webhooks/byomailer",
	events: ["contact.subscribed", "contact.unsubscribed"],
});

const same = await mailer.webhookEndpoints.get(endpoint.id);

// Turn an endpoint off, or change its description. The URL and the events do not change.
await mailer.webhookEndpoints.update(endpoint.id, { active: false });

const deliveries = await mailer.webhookEndpoints.deliveries(endpoint.id);

// A new secret. The old secret stops working at once.
const { secret } = await mailer.webhookEndpoints.rotateSecret(endpoint.id);

// Queue a `webhook.test` delivery. The server allows 10 calls a minute.
const delivery = await mailer.webhookEndpoints.sendTest(endpoint.id);

await mailer.webhookEndpoints.delete(endpoint.id);
```

## Pagination

Most list calls use cursor pagination. They return a `PagePromise`.

- Use `await` to get one page with `data`, `links` and `meta`.
- Use `for await` to get each item of each page. The SDK loads the next page only when the loop needs it.
- Use `.pages()` to get each page.
- Use `.toArray()` to get all items in one array. Use it only for short lists.

```ts
const firstPage = await mailer.contacts.list({ per_page: 100 });
console.log(firstPage.meta.next_cursor);

for await (const contact of mailer.contacts.list({ per_page: 100 })) {
	console.log(contact.email);
}

// Continue from a saved cursor.
const next = await mailer.contacts.list({
	cursor: firstPage.meta.next_cursor ?? undefined,
});
```

`per_page` is 1 to 100. The default is 25.

`tags.list()`, `blocks.list()` and `topics.list()` return all items in one array. These lists have no pages.

## Webhook verification

BYOMailer signs each webhook delivery. `verifyWebhook()` checks the signature and the timestamp, then returns the verified event.

WARNING: Verify webhooks only on the server. The endpoint secret in browser code lets any person send you fake events.

```ts
import { verifyWebhook, WebhookVerificationError } from "byomailer";

const { payload, deliveryId } = await verifyWebhook({
	body: rawBody, // the raw request body: a string, a Uint8Array, an ArrayBuffer or a Buffer
	headers: request.headers, // a Headers object or a plain object
	secret: process.env.BYOMAILER_WEBHOOK_SECRET,
});

switch (payload.event) {
	case "contact.subscribed":
		console.log(payload.contact.email);
		break;
	case "newsletter.sent":
		console.log(payload.newsletter.title);
		break;
	default:
		// A new server version can send a new event type.
		break;
}
```

Give the raw body, byte for byte. Do not parse the JSON and encode it again. The server escapes Unicode as `\uXXXX` and does not escape `/`, so a new encoding gives other bytes. Then the signature does not match.

The verified event has these fields:

| Field        | Description                                                                             |
| ------------ | --------------------------------------------------------------------------------------- |
| `type`       | The event type: `event` of the payload, or the `X-Byomailer-Event` header.              |
| `payload`    | The decoded JSON body.                                                                  |
| `timestamp`  | The Unix time in seconds when the server signed the delivery.                           |
| `deliveryId` | The `X-Byomailer-Delivery` header (a UUID). `null` when the header is missing or empty. |

Use `deliveryId` to find a repeated delivery. An older instance does not send the delivery header. Then the verification passes and `deliveryId` is `null`.

If the delivery is not valid, `verifyWebhook()` throws a `WebhookVerificationError`. Answer the request with a 400. The `reason` tells why:

| `reason`    | Cause                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| `signature` | The signature header is missing, or the signature does not match the body.     |
| `timestamp` | The timestamp header is missing, is not a number, or is outside the tolerance. |
| `payload`   | The signature is valid, but the body is not a JSON object.                     |

The PHP, Python and Ruby SDKs give the same fields and the same reasons.

| Option      | Default      | Description                                                        |
| ----------- | ------------ | ------------------------------------------------------------------ |
| `body`      | required     | The raw request body.                                              |
| `headers`   | required     | The request headers. Header names can be in any case.              |
| `secret`    | required     | The endpoint secret, with its `whsec_` prefix.                     |
| `tolerance` | `300`        | The maximum age of the timestamp, in seconds, before or after now. |
| `now`       | `new Date()` | The current time. Use it in tests.                                 |

The algorithm:

1. Read the `X-Byomailer-Signature` header (`sha256=` and a hex digest). If it is missing, the reason is `signature`.
2. Read the `X-Byomailer-Timestamp` header (Unix seconds). If it is missing or is not a number, the reason is `timestamp`.
3. Make the signed payload: the timestamp, a dot (`.`) and the raw body.
4. Calculate the HMAC-SHA256 of the signed payload with the full secret as the key.
5. Change the signature header to lowercase. Compare it with `sha256=` and the hex digest, in constant time.
6. Reject a timestamp that is more than 300 seconds from now.
7. Parse the body. If it is not a JSON object, the reason is `payload`.

The events are `contact.subscribed`, `contact.unsubscribed`, `contact.resubscribed`, `newsletter.sent`, `sequence_step.sent`, `sequence.completed` and `webhook.test`. Each payload has `event` and `occurred_at`. The `contact` of a payload also has the custom attributes of the contact.

For an A/B newsletter, `newsletter.sent` arrives one time, when the server picks the winner.

## Errors

Each error that the SDK throws extends `ByomailerError` and has a `code`.

| Class                      | `code`                       | Cause                                                                                      |
| -------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| `AuthenticationError`      | `authentication_error`       | 401: the token is missing or not valid.                                                    |
| `AuthorizationError`       | `authorization_error`        | 403: a read-only token tried a write, or a user who is not an admin used a webhook call.   |
| `NotFoundError`            | `not_found`                  | 404: the record is not in the client of the token user.                                    |
| `ValidationError`          | `validation_error`           | 422: the server rejected a field. Read `errors` for the messages of each field.            |
| `RateLimitError`           | `rate_limit`                 | 429: too many requests. Read `retryAfter` and `limit`.                                     |
| `ServerError`              | `server_error`               | 5xx: the server failed.                                                                    |
| `ApiError`                 | `api_error`                  | Another error status. Each class above extends `ApiError`.                                 |
| `ConnectionError`          | `connection_error`           | The request did not get a response. `beforeSend` is `true` when the server did not get it. |
| `TimeoutError`             | `timeout`                    | One attempt took more time than `timeout`.                                                 |
| `WebhookVerificationError` | `webhook_verification_error` | `verifyWebhook()` rejected a delivery. Read `reason`.                                      |

Each `ApiError` has `status`, `body` and `headers`.

Use `instanceof`, or use `isByomailerError()` and a `switch` on `code`. The `switch` narrows the type:

```ts
import { isByomailerError } from "byomailer";

try {
	await mailer.contacts.add(3, { email: "ana@example.com" });
} catch (error) {
	if (!isByomailerError(error)) throw error;

	switch (error.code) {
		case "validation_error":
			console.error(error.errors.email);
			break;
		case "rate_limit":
			console.error(`Wait ${error.retryAfter} seconds.`);
			break;
		default:
			throw error;
	}
}
```

If you abort a call with your own `AbortSignal`, the SDK throws the reason of the signal. It does not wrap it.

## Retries

The SDK retries a failed call up to `maxRetries` times. The delay doubles on each attempt: 0.5, 1, 2, 4 and 8 seconds at most. Half of each delay is random (jitter). If the server sends `Retry-After`, the SDK waits that time. If `Retry-After` is more than 60 seconds, the SDK does not retry. It throws the `RateLimitError`.

The default is 2 retries. The timeout of one attempt is 30 seconds. The PHP, Python and Ruby SDKs use the same values and the same rule.

| Failure                                                     | Retry of an idempotent call | Retry of another call                    |
| ----------------------------------------------------------- | --------------------------- | ---------------------------------------- |
| 429                                                         | Yes                         | Yes. The server did not do the work.     |
| 5xx                                                         | Yes                         | No                                       |
| Timeout of the `timeout` option                             | Yes                         | No                                       |
| DNS failure, refused connection, connect timeout            | Yes                         | Yes. The server did not get the request. |
| Other connection error (for example a reset after the send) | Yes                         | No                                       |
| Other 4xx                                                   | No                          | No                                       |

These calls are idempotent:

- Each GET and each DELETE.
- `newsletters.countRecipients()`, because it only reads.
- `contacts.update()`, `contacts.unsubscribe()` and `contacts.subscribe()`.
- `lists.rename()`, `tags.rename()`, `projects.rename()`, `topics.update()`, `blocks.update()` and `webhookEndpoints.update()`.
- `newsletters.replaceVariables()`, `sequences.replaceVariables()` and `sequences.replaceStepFilters()`.

The SDK does not retry the other calls after a 5xx, a timeout or a connection error after the send, because the server can have done the work. Examples:

- `contacts.add()`: a repeat changes `created` from `true` to `false`.
- `newsletters.update()`: `status: "live"` can start the send. A repeat then gets a 422.
- `newsletters.create()`, `newsletters.sendTest()`, `newsletters.pickWinner()`, `webhookEndpoints.rotateSecret()` and `webhookEndpoints.sendTest()`.

The SDK retries a DELETE after a lost response. If the server did the first delete, the retry gets a 404. Then the SDK throws a `NotFoundError`, but the record is gone.

### Rate limits

| Call                          | Limit             |
| ----------------------------- | ----------------- |
| `newsletters.countRecipients` | 30 calls a minute |
| `newsletters.sendTest`        | 5 calls a minute  |
| `webhookEndpoints.sendTest`   | 10 calls a minute |

Over a limit, the server sends a 429 with `Retry-After`.

## Cancel a call

Each method accepts an `AbortSignal`. The signal also stops a retry delay.

```ts
const contact = await mailer.contacts.get(42, {
	signal: AbortSignal.timeout(5000),
});
```

## Framework integration

### Next.js

Use the client in a Route Handler, a Server Action or a Server Component. Do not import it in a Client Component, because the token must stay on the server.

```ts
// lib/mailer.ts
import "server-only";
import { Byomailer } from "byomailer";

export const mailer = new Byomailer({
	baseUrl: process.env.BYOMAILER_URL!,
	token: process.env.BYOMAILER_TOKEN!,
});
```

```ts
// app/actions.ts
"use server";
import { mailer } from "@/lib/mailer";

export async function subscribe(formData: FormData) {
	const email = String(formData.get("email"));
	await mailer.contacts.add(Number(process.env.BYOMAILER_LIST_ID), { email });
}
```

A Route Handler gets the raw body with `request.text()`:

```ts
// app/api/webhooks/byomailer/route.ts
import { verifyWebhook, WebhookVerificationError } from "byomailer";

export async function POST(request: Request) {
	let event;

	try {
		event = await verifyWebhook({
			body: await request.text(),
			headers: request.headers,
			secret: process.env.BYOMAILER_WEBHOOK_SECRET!,
		});
	} catch (error) {
		if (error instanceof WebhookVerificationError) {
			return new Response(error.message, { status: 400 });
		}
		throw error;
	}

	if (event.type === "contact.unsubscribed") {
		// Update your own database.
	}

	return new Response(null, { status: 204 });
}
```

### Express

Use `express.raw()` on the webhook route. `express.json()` parses the body, and then the raw bytes are lost.

```ts
import express from "express";
import { Byomailer, verifyWebhook, WebhookVerificationError } from "byomailer";

const app = express();
const mailer = new Byomailer({
	baseUrl: process.env.BYOMAILER_URL!,
	token: process.env.BYOMAILER_TOKEN!,
});

app.post(
	"/webhooks/byomailer",
	express.raw({ type: "application/json" }),
	async (req, res) => {
		try {
			const event = await verifyWebhook({
				body: req.body, // a Buffer
				headers: req.headers,
				secret: process.env.BYOMAILER_WEBHOOK_SECRET!,
			});
			console.log(event.type, event.deliveryId);
			res.sendStatus(204);
		} catch (error) {
			if (error instanceof WebhookVerificationError) {
				res.status(400).send(error.message);
				return;
			}
			throw error;
		}
	},
);

app.post("/subscribe", express.json(), async (req, res) => {
	const { contact } = await mailer.contacts.add(3, { email: req.body.email });
	res.json({ id: contact.id });
});

app.listen(3000);
```

Express 5 sends a rejected promise of a handler to the error middleware. For Express 4, catch the error in the handler.

### A custom `fetch`

Use the `fetch` option for a proxy, for logs, or for tests:

```ts
const mailer = new Byomailer({
	baseUrl,
	token,
	fetch: (url, init) => {
		console.log(init.method, url);
		return fetch(url, init);
	},
});
```

## Supported runtimes

| Runtime            | Version              | Test in CI                                            |
| ------------------ | -------------------- | ----------------------------------------------------- |
| Node.js            | 20, 22, 24 and later | Unit tests and smoke test                             |
| Bun                | 1.x                  | Smoke test                                            |
| Deno               | 2.x                  | Smoke test                                            |
| Cloudflare Workers | Current              | None. The SDK uses only Web APIs that Workers supply. |

The package ships ESM (`dist/index.js`) and CommonJS (`dist/index.cjs`), with types for both.

Node.js 20 is out of support since April 2026. The SDK still tests on it.

## License

MIT. Read [LICENSE](LICENSE).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). To report a security problem, read [SECURITY.md](SECURITY.md).
