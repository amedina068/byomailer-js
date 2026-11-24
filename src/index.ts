export { Byomailer, type ByomailerOptions } from "./client";
export type { FetchLike, RequestOptions } from "./core/transport";
export {
	type AnyByomailerError,
	ApiError,
	type ApiErrorCode,
	AuthenticationError,
	AuthorizationError,
	ByomailerError,
	type ByomailerErrorCode,
	ConnectionError,
	isByomailerError,
	NotFoundError,
	RateLimitError,
	ServerError,
	TimeoutError,
	ValidationError,
	type WebhookFailureReason,
	WebhookVerificationError,
} from "./errors";
export { PagePromise } from "./pagination";
export type {
	AddContactParams,
	AddedContact,
	ContactListParams,
	Contacts,
	Lists,
	Tags,
	TopicParams,
	Topics,
	UpdateContactParams,
} from "./resources/audience";
export type {
	BlockParams,
	Blocks,
	EmailIdentities,
	EmailIdentityListParams,
	EmailLogListParams,
	EmailLogs,
	EmailTemplateListParams,
	EmailTemplates,
	Projects,
} from "./resources/library";
export type {
	CreateNewsletterParams,
	GoLive,
	NewsletterFields,
	NewsletterListParams,
	Newsletters,
	StayDraft,
	TestMailResult,
	UpdateNewsletterParams,
} from "./resources/newsletters";
export type {
	ContactMailStatus,
	SequenceListParams,
	Sequences,
	StepMailExportParams,
} from "./resources/sequences";
export type {
	CreateWebhookEndpointParams,
	UpdateWebhookEndpointParams,
	WebhookEndpoints,
} from "./resources/webhook-endpoints";
export type * from "./types";
export {
	type ContactEvent,
	type NewsletterSentEvent,
	type SequenceCompletedEvent,
	type SequenceStepSentEvent,
	type VerifiedWebhook,
	type VerifyWebhookOptions,
	verifyWebhook,
	WEBHOOK_HEADERS,
	type WebhookContact,
	type WebhookEvent,
	type WebhookHeaders,
	type WebhookTestEvent,
} from "./webhooks";
