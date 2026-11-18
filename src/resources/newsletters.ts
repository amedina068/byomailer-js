import { segment } from "../core/query";
import { withVariables } from "../core/shape";
import type { RequestOptions, RequestSpec, Transport } from "../core/transport";
import { type PagePromise, paginate } from "../pagination";
import type {
	AudienceFilter,
	Newsletter,
	NewsletterStatus,
	NewsletterSummary,
	NewsletterVariables,
	PageParams,
} from "../types";

/** The parameters of `newsletters.list()`. */
export interface NewsletterListParams extends PageParams {
	status?: NewsletterStatus;
	/** Find a part of the title or the subject. */
	search?: string;
	/** Only newsletters of this project id. */
	project?: number;
}

/** The fields of a newsletter that `create()` and `update()` accept. */
export interface NewsletterFields {
	title?: string | null;
	subject?: string | null;
	preview_text?: string | null;
	html_content?: string | null;
	/** A verified sender identity. */
	email_identity_id?: number | null;
	email_template_id?: number | null;
	ab_test_enabled?: boolean;
	subject_b?: string | null;
	preview_text_b?: string | null;
	html_content_b?: string | null;
	/** The default of each `{{ variable }}`. */
	content_variables?: Readonly<Record<string, string | null>> | null;
	/** Up to 20 filters. No filters means each subscribed contact. */
	filters?: readonly AudienceFilter[];
	project_ids?: readonly number[];
}

/**
 * Sends the newsletter at `scheduled_at`. The server needs a subject, the
 * HTML content and a verified sender identity.
 */
export interface GoLive {
	status: "live";
	/** A time that is not in the past. A time of now sends the newsletter at once. */
	scheduled_at: string | Date;
}

/** Keeps the newsletter a draft. */
export interface StayDraft {
	status?: "draft";
	scheduled_at?: never;
}

/** The fields of `newsletters.create()`. A new newsletter is a draft unless `status` is `live`. */
export type CreateNewsletterParams = NewsletterFields &
	(
		| StayDraft
		| (GoLive & {
				subject: string;
				html_content: string;
				email_identity_id: number;
		  })
	) &
	(
		| { ab_test_enabled?: false }
		| { ab_test_enabled: true; subject_b: string; html_content_b: string }
	);

/** The fields of `newsletters.update()`. A field that you leave out does not change. */
export type UpdateNewsletterParams = NewsletterFields & (StayDraft | GoLive);

/** The result of `newsletters.sendTest()`. */
export interface TestMailResult {
	message: string;
	/** The email address of the token user. */
	sent_to: string;
}

/** `/newsletters`: read, write and test newsletters. */
export class Newsletters {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Lists the newsletters, newest first. The items have no HTML or text content. */
	list(
		params: NewsletterListParams = {},
		options: RequestOptions = {},
	): PagePromise<NewsletterSummary> {
		return paginate(
			this.#transport,
			"/newsletters",
			{ ...params },
			options,
			withVariables,
		);
	}

	/** Reads one newsletter with its content and its metrics. */
	async get(
		newsletterId: number,
		options: RequestOptions = {},
	): Promise<Newsletter> {
		return this.#newsletter(
			{ method: "GET", path: `/newsletters/${segment(newsletterId)}` },
			options,
		);
	}

	/**
	 * Creates a newsletter. With `status: 'live'`, the server schedules it and
	 * sends it to real contacts at `scheduled_at`.
	 */
	async create(
		params: CreateNewsletterParams,
		options: RequestOptions = {},
	): Promise<Newsletter> {
		return this.#newsletter(
			{ method: "POST", path: "/newsletters", json: params },
			options,
		);
	}

	/**
	 * Changes a draft or a scheduled newsletter. With `status: 'live'`, the
	 * server schedules it. With `status: 'draft'`, the server stops the schedule.
	 */
	async update(
		newsletterId: number,
		params: UpdateNewsletterParams,
		options: RequestOptions = {},
	): Promise<Newsletter> {
		return this.#newsletter(
			{
				method: "PATCH",
				path: `/newsletters/${segment(newsletterId)}`,
				json: params,
			},
			options,
		);
	}

	/** Deletes a draft newsletter. */
	async delete(
		newsletterId: number,
		options: RequestOptions = {},
	): Promise<void> {
		await this.#transport.request(
			{ method: "DELETE", path: `/newsletters/${segment(newsletterId)}` },
			options,
		);
	}

	/**
	 * Counts the contacts that match the filters. No filters counts each
	 * subscribed contact. The server allows 30 calls a minute.
	 */
	async countRecipients(
		filters: readonly AudienceFilter[] = [],
		options: RequestOptions = {},
	): Promise<number> {
		const body = await this.#transport.request<{ count: number }>(
			{
				method: "POST",
				path: "/newsletters/contacts/preview",
				json: { filters },
				// The call only reads data.
				idempotent: true,
			},
			options,
		);

		return body.count;
	}

	/**
	 * Sends a test email of the newsletter to the email address of the token
	 * user. The server allows 5 calls a minute.
	 */
	async sendTest(
		newsletterId: number,
		options: RequestOptions = {},
	): Promise<TestMailResult> {
		return this.#transport.request<TestMailResult>(
			{
				method: "POST",
				path: `/newsletters/${segment(newsletterId)}/test-mail`,
			},
			options,
		);
	}

	/**
	 * Picks the winner of an A/B test. The newsletter must have the status
	 * `ab_testing`. The server then marks it as sent.
	 */
	async pickWinner(
		newsletterId: number,
		variant: "a" | "b",
		options: RequestOptions = {},
	): Promise<Newsletter> {
		return this.#newsletter(
			{
				method: "POST",
				path: `/newsletters/${segment(newsletterId)}/ab-winner`,
				json: { winner_variant: variant },
			},
			options,
		);
	}

	/** Reads the `{{ variables }}` of the content and the default of each one. */
	async variables(
		newsletterId: number,
		options: RequestOptions = {},
	): Promise<NewsletterVariables> {
		const body = await this.#transport.request<{ data: NewsletterVariables }>(
			{
				method: "GET",
				path: `/newsletters/${segment(newsletterId)}/variables`,
			},
			options,
		);

		return withVariables(body.data);
	}

	/**
	 * Replaces all variable defaults of a draft or a scheduled newsletter. A
	 * default that you leave out is removed.
	 */
	async replaceVariables(
		newsletterId: number,
		variables: Readonly<Record<string, string | null>>,
		options: RequestOptions = {},
	): Promise<NewsletterVariables> {
		const body = await this.#transport.request<{ data: NewsletterVariables }>(
			{
				method: "PATCH",
				path: `/newsletters/${segment(newsletterId)}/variables`,
				json: { content_variables: variables },
				idempotent: true,
			},
			options,
		);

		return withVariables(body.data);
	}

	async #newsletter(
		spec: RequestSpec,
		options: RequestOptions,
	): Promise<Newsletter> {
		const body = await this.#transport.request<{ data: Newsletter }>(
			spec,
			options,
		);

		return withVariables(body.data);
	}
}
