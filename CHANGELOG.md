# Changelog

All notable changes to this project are in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - Unreleased

The server changes of BYOMailer PRs #114 and #115, and the same behavior as the PHP, Python and Ruby SDKs.

### Added

- The MIT license: a `LICENSE` file and the `license` field in `package.json`.
- A `prepare` script that builds `dist/`. `npm install github:amedina068/byomailer-js` now installs working code.
- The `payload` reason of `WebhookVerificationError`: the signature is valid, but the body is not a JSON object.
- The `VerifiedWebhook` type.

- `contacts.subscribe()` subscribes a contact again after an admin or the API unsubscribed it. The SDK retries it, because a repeat does not change the contact. A contact that unsubscribed through an email link gives a `ValidationError` with the field `contact`. A blacklisted address gives the field `email`.

### Changed

- **Breaking:** `verifyWebhook()` returns a verified event: `{ type, payload, timestamp, deliveryId }`. Before, it returned the payload only. Read the payload from `payload`. `deliveryId` is `null` when the `X-Byomailer-Delivery` header is missing.
- **Breaking:** `webhookEndpoints.test()` is now `webhookEndpoints.sendTest()`, the same name as in the other SDKs.
- The SDK retries each call after a connection error before the send: a DNS failure, a refused connection or a connect timeout. The server did not get the request. A call that is not idempotent is not retried after a timeout or a reset after the send.
- The SDK retries `contacts.update()` after a 5xx, a timeout or a connection error, because a repeat gives the same contact.
- `verifyWebhook()` changes the signature header to lowercase before the compare. This rule is the same in the 4 SDKs.
- The README gives the git install command, the idempotent list and a "License" section.
- The docs of `contacts.update()` say that an update never changes the subscription.
- The docs of `contacts.add()` say that it subscribes again a contact that an admin unsubscribed.
- The docs of `contacts.add()` say that an opt-in list sends the opt-in email only to a contact that is new on the list.
- The docs of `SequenceSummary` explain `completed_count` and `active_count`. The server now sends real values.
- The docs of the `newsletter.sent` webhook say that an A/B newsletter sends it one time, when the server picks the winner.

## [0.1.0] - Unreleased

### Added

- `Byomailer` client with `baseUrl`, `token`, `timeout`, `maxRetries` and a custom `fetch`.
- Resources for each tag of the API: `contacts`, `lists`, `topics`, `tags`, `newsletters`, `sequences`, `blocks`, `emailTemplates`, `emailIdentities`, `emailLogs`, `projects` and `webhookEndpoints`.
- `contacts.add()` returns `created`, so the caller knows if the server made a new contact.
- Custom attributes of a contact as one `attributes` map.
- `sequences.exportStepMails()` returns the CSV export as text.
- `verifyWebhook()` verifies the signature and the timestamp of a webhook delivery with Web Crypto. It throws a `WebhookVerificationError` with a `reason`.
- `PagePromise` for cursor lists: `await` one page, or `for await` each item.
- Typed errors with a `code` for each case: authentication, authorization, not found, validation, rate limit, server, connection and timeout.
- Retries with exponential backoff and jitter. The SDK obeys `Retry-After` and does not retry a request that is not idempotent after a 5xx or a timeout.
- `AbortSignal` support on each call.
- ESM and CommonJS builds with types for both.
