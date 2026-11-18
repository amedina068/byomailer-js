// The response types keep the field names of the API. Dates are ISO 8601
// strings, for example `2026-11-18T10:00:00.000000Z`.

/** One page of a cursor-paginated list. */
export interface CursorPage<T> {
	data: T[];
	links: {
		first: string | null;
		last: string | null;
		prev: string | null;
		next: string | null;
	};
	meta: {
		path: string;
		per_page: number;
		/** Give it as `cursor` to get the next page. `null` on the last page. */
		next_cursor: string | null;
		prev_cursor: string | null;
	};
}

/** The parameters of each cursor-paginated list. */
export interface PageParams {
	/** A cursor from `meta.next_cursor` or `meta.prev_cursor` of an earlier page. */
	cursor?: string;
	/** The number of items on a page, from 1 to 100. The default is 25. */
	per_page?: number;
}

export interface Tag {
	id: number;
	uuid: string;
	name: string;
	created_at: string | null;
}

export interface MailList {
	id: number;
	uuid: string;
	name: string;
	/** `true` when a new contact must confirm the subscription by email. */
	opt_in_enabled: boolean;
	created_at: string | null;
}

export interface Topic {
	id: number;
	uuid: string;
	list_id: number;
	name: string;
	description: string | null;
	created_at: string | null;
}

export interface Contact {
	id: number;
	uuid: string;
	name: string | null;
	email: string;
	/** The custom attributes of the contact. */
	extra_attributes: Record<string, unknown>;
	unsubscribed_at: string | null;
	/** `true` when the contact unsubscribed through a link. `false` when a user or the API did it. */
	unsubscribed_by_contact: boolean | null;
	tags: Tag[];
	lists: MailList[];
	/** The topics that the contact is subscribed to. */
	topics: Topic[];
	sequences: { id: number; name: string; status: SequenceStatus }[];
	created_at: string | null;
}

/** The match mode of a filter: the contact has all, any or none of the values. */
export type FilterMode = "all" | "any" | "none";

/** The operators of an attribute condition. */
export type AttributeOperator =
	| "equals"
	| "not_equals"
	| "contains"
	| "not_contains"
	| "gt"
	| "lt"
	| "is_set"
	| "is_not_set";

/** The operators of an engagement filter. */
export type EngagementOperator =
	| "opened"
	| "clicked"
	| "received"
	| "not_opened"
	| "not_clicked"
	| "not_received";

interface FilterBase {
	/** How the filter joins the filter before it. The default is `and`. */
	connector?: "and" | "or";
}

/**
 * One audience filter of a newsletter, a sequence or a sequence step. The
 * `category` decides the other fields.
 */
export type AudienceFilter = FilterBase &
	(
		| { category: "tags"; mode: FilterMode; values: readonly string[] }
		| {
				category: "lists" | "topics";
				mode: FilterMode;
				values: readonly number[];
		  }
		| {
				category: "attributes";
				mode: FilterMode;
				values: readonly {
					key: string;
					operator?: AttributeOperator;
					value?: string;
				}[];
		  }
		| {
				category: "location";
				field: "country" | "timezone";
				mode: "any" | "none";
				values: readonly string[];
		  }
		| {
				category: "date";
				operator: "before" | "after";
				/** `date` is `YYYY-MM-DD`. */
				values: { date: string };
		  }
		| {
				category: "date";
				operator: "in_last" | "more_than";
				/** 1 to 3650 days. */
				values: { days: number };
		  }
		| {
				category: "date";
				operator: "between";
				/** `from` and `to` are `YYYY-MM-DD`. */
				values: { from: string; to: string };
		  }
		| {
				category: "engagement";
				operator: EngagementOperator;
				values: {
					/** Limit the filter to one newsletter. Leave it out for each newsletter. */
					newsletter_id?: number | null;
					within?: "ever" | "last_n_days";
					/** The number of days for `last_n_days`, from 1 to 3650. */
					days?: number;
				};
		  }
	);

/** The verification status of a sender identity in Amazon SES. */
export type IdentityStatus = "pending" | "verifying" | "verified" | "failed";

export interface EmailIdentity {
	id: number;
	uuid: string;
	email: string;
	name: string | null;
	domain: string | null;
	identity_status: IdentityStatus | null;
	verified_at: string | null;
	created_at: string | null;
	updated_at: string | null;
}

export interface EmailTemplate {
	id: number;
	name: string;
	html_content: string;
	is_default: boolean;
	archived_at: string | null;
	created_at: string | null;
	updated_at: string | null;
}

export type NewsletterStatus =
	| "draft"
	| "scheduled"
	| "queued"
	| "ab_testing"
	| "sent"
	| "failed";

export interface NewsletterMetrics {
	total: number;
	sent: number;
	pending: number;
	opened: number;
	bounced: number;
	unsubscribed: number;
	complained: number;
	/** A percentage with one decimal. */
	open_rate: number;
	/** A percentage with one decimal. */
	unsubscribe_rate: number;
}

/** A newsletter in a list. It has no HTML or text content. */
export interface NewsletterSummary {
	id: number;
	uuid: string;
	title: string;
	status: NewsletterStatus;
	subject: string | null;
	preview_text: string | null;
	email_identity_id: number | null;
	email_identity: EmailIdentity | null;
	email_template_id: number | null;
	from_email: string | null;
	from_name: string | null;
	scheduled_at: string | null;
	sent_at: string | null;
	segment_id: number | null;
	filters: AudienceFilter[];
	/** The default value of each `{{ variable }}` of the content. */
	content_variables: Record<string, string>;
	ab_test_enabled: boolean;
	ab_test_winner_variant: "a" | "b" | null;
	subject_b: string | null;
	preview_text_b: string | null;
	total_contacts_reached: number;
	/** The ids of the projects of the newsletter. `pickWinner()` does not return it. */
	project_ids?: number[];
	metrics: NewsletterMetrics;
	created_at: string | null;
	updated_at: string | null;
}

export interface Newsletter extends NewsletterSummary {
	html_content: string | null;
	text_content: string | null;
	html_content_b: string | null;
	text_content_b: string | null;
}

/** The `{{ variables }}` of a newsletter or a sequence, and their defaults. */
export interface ContentVariables {
	/** The variables that the content uses. */
	detected_variables: string[];
	/**
	 * The default of each variable. A detected variable with no saved default
	 * has an empty string.
	 */
	content_variables: Record<string, string>;
}

export interface NewsletterVariables extends ContentVariables {
	newsletter_id: number;
}

export interface SequenceVariables extends ContentVariables {
	sequence_id: number;
}

export type SequenceStatus = "draft" | "live" | "paused";

/** A sequence in a list. */
export interface SequenceSummary {
	id: number;
	name: string;
	status: SequenceStatus;
	steps_count: number;
	contacts_count: number;
	completed_count: number;
	active_count: number;
	project_ids?: number[];
}

export interface Sequence extends SequenceSummary {
	steps: SequenceStep[];
	segment_id: number | null;
	filters: AudienceFilter[];
	content_variables: Record<string, string>;
	created_at: string | null;
}

export interface SequenceStep {
	id: number;
	sequence_id: number;
	/** The delay before the step, in the unit of `delay_type`. */
	delay_days: number | null;
	delay_type: "days" | "hours" | null;
	status: string;
	/** A contact who does not match these filters skips this step. */
	filters: AudienceFilter[];
	message: {
		id: number;
		subject: string | null;
		preview_text: string | null;
		html_content: string | null;
		text_content: string | null;
		email_identity_id: number | null;
		email_template_id: number | null;
		template_slot_content: string | null;
		email_template: EmailTemplate | null;
		email_identity: EmailIdentity | null;
	} | null;
	created_at: string | null;
}

export interface MailMetrics {
	total: number;
	sent: number;
	delivered: number;
	pending: number;
	skipped: number;
	opened: number;
	bounced: number;
	unsubscribed: number;
	complained: number;
	delivery_rate: number | null;
	open_rate: number | null;
	unsubscribe_rate: number | null;
}

export interface SequenceStats {
	id: number;
	name: string;
	status: SequenceStatus;
	stats: { contacts: number; unsubscribed: number; clicked: number };
	mail_metrics: MailMetrics;
}

/** The statistics of the contacts whose furthest progress is this step. */
export interface SequenceStepStats {
	id: number;
	sequence_id: number;
	subject: string | null;
	delay_days: number | null;
	delay_type: "days" | "hours" | null;
	status: string;
	stats: { contacts: number; unsubscribed: number; clicked: number };
	mail_metrics: MailMetrics;
}

/** A reusable piece of HTML. Content uses it as `{{ block:name }}`. */
export interface Block {
	id: number;
	uuid: string;
	name: string;
	html_content: string;
	created_at: string | null;
	updated_at: string | null;
}

/** One call from BYOMailer to Amazon SES, or one notification from SES. */
export interface EmailLog {
	id: number;
	provider: string;
	operation: string;
	recipient: string | null;
	message_id: string | null;
	status: string;
	error: string | null;
	request_payload: unknown;
	response_payload: unknown;
	sns_payload: unknown;
	logged_at: string | null;
	created_at: string | null;
}

export interface Project {
	id: number;
	uuid: string;
	name: string;
	/** Only `list()` and `get()` return the counts. */
	newsletters_count?: number;
	sequences_count?: number;
	automations_count?: number;
	visual_automations_count?: number;
	created_at: string | null;
}

/** The event types that a webhook endpoint can subscribe to. */
export type WebhookEventType =
	| "contact.subscribed"
	| "contact.unsubscribed"
	| "contact.resubscribed"
	| "newsletter.sent"
	| "sequence_step.sent"
	| "sequence.completed";

export interface WebhookEndpoint {
	id: number;
	uuid: string;
	url: string;
	description: string | null;
	events: WebhookEventType[];
	active: boolean;
	/** Why the server turned the endpoint off, for example after many failures. */
	disabled_reason: string | null;
	consecutive_failures: number;
	last_triggered_at: string | null;
	disabled_at: string | null;
	created_at: string | null;
}

/** The server shows the secret only after `create()` and `rotateSecret()`. Store it then. */
export interface WebhookEndpointWithSecret extends WebhookEndpoint {
	/** The signing secret, with its `whsec_` prefix. */
	secret: string;
}

export interface WebhookDelivery {
	id: number;
	uuid: string;
	event_type: WebhookEventType | "webhook.test";
	status: "pending" | "success" | "failed";
	attempts: number;
	response_status: number | null;
	response_body: string | null;
	error: string | null;
	payload: Record<string, unknown>;
	dispatched_at: string | null;
	delivered_at: string | null;
	created_at: string | null;
}
