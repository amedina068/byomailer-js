# Changelog

All notable changes to this project are in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
