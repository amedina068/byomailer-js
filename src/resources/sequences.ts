import { segment } from "../core/query";
import { withVariables } from "../core/shape";
import type { RequestOptions, Transport } from "../core/transport";
import { type PagePromise, paginate } from "../pagination";
import type {
	AudienceFilter,
	PageParams,
	Sequence,
	SequenceStats,
	SequenceStatus,
	SequenceStep,
	SequenceStepStats,
	SequenceSummary,
	SequenceVariables,
} from "../types";

/** The parameters of `sequences.list()`. */
export interface SequenceListParams extends PageParams {
	status?: SequenceStatus;
	/** Find a part of the name. */
	search?: string;
	/** Only sequences of this project id. */
	project?: number;
}

/** The status of one mail. */
export type ContactMailStatus =
	| "pending"
	| "sent"
	| "delivered"
	| "opened"
	| "bounced"
	| "rejected"
	| "complained"
	| "unsubscribed"
	| "failed"
	| "skipped";

/** The parameters of `sequences.exportStepMails()`. */
export interface StepMailExportParams {
	contact_id?: number;
	status?: ContactMailStatus;
	/** Like `status`, and `clicked` for mails with a click. */
	filter?: "all" | "clicked" | ContactMailStatus;
	/** Find a part of the email, the name or the subject. */
	search?: string;
	/** A date, for example `2026-11-01`. */
	sent_after?: string;
	/** A date that is not before `sent_after`. */
	sent_before?: string;
	sort?:
		| "id"
		| "email"
		| "name"
		| "subject"
		| "status"
		| "scheduled_at"
		| "sent_at"
		| "delivered_at"
		| "opened_at"
		| "clicked_at"
		| "bounced_at"
		| "rejected_at"
		| "complained_at"
		| "unsubscribed_at"
		| "created_at";
	direction?: "asc" | "desc";
}

/** `/sequences`: read sequences and their steps, and change filters and variables. */
export class Sequences {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Lists the sequences. Live sequences come first, then the others by name. */
	list(
		params: SequenceListParams = {},
		options: RequestOptions = {},
	): PagePromise<SequenceSummary> {
		return paginate(this.#transport, "/sequences", { ...params }, options);
	}

	/** Reads one sequence with its steps. */
	async get(
		sequenceId: number,
		options: RequestOptions = {},
	): Promise<Sequence> {
		const body = await this.#transport.request<{ data: Sequence }>(
			{ method: "GET", path: `/sequences/${segment(sequenceId)}` },
			options,
		);

		return withVariables(body.data);
	}

	/** Reads the statistics of a sequence. */
	async stats(
		sequenceId: number,
		options: RequestOptions = {},
	): Promise<SequenceStats> {
		const body = await this.#transport.request<{ data: SequenceStats }>(
			{ method: "GET", path: `/sequences/${segment(sequenceId)}/stats` },
			options,
		);

		return body.data;
	}

	/** Reads one step of a sequence with its message. */
	async step(
		sequenceId: number,
		stepId: number,
		options: RequestOptions = {},
	): Promise<SequenceStep> {
		const body = await this.#transport.request<{ data: SequenceStep }>(
			{ method: "GET", path: stepPath(sequenceId, stepId) },
			options,
		);

		return body.data;
	}

	/** Reads the statistics of the contacts whose furthest progress is this step. */
	async stepStats(
		sequenceId: number,
		stepId: number,
		options: RequestOptions = {},
	): Promise<SequenceStepStats> {
		const body = await this.#transport.request<{ data: SequenceStepStats }>(
			{ method: "GET", path: `${stepPath(sequenceId, stepId)}/stats` },
			options,
		);

		return body.data;
	}

	/**
	 * Replaces the filters of one step. A contact who does not match them
	 * skips only this step. An empty list removes each filter.
	 */
	async replaceStepFilters(
		sequenceId: number,
		stepId: number,
		filters: readonly AudienceFilter[],
		options: RequestOptions = {},
	): Promise<SequenceStep> {
		const body = await this.#transport.request<{ data: SequenceStep }>(
			{
				method: "PATCH",
				path: `${stepPath(sequenceId, stepId)}/filters`,
				json: { filters },
				idempotent: true,
			},
			options,
		);

		return body.data;
	}

	/** Reads the `{{ variables }}` of the steps and the default of each one. */
	async variables(
		sequenceId: number,
		options: RequestOptions = {},
	): Promise<SequenceVariables> {
		const body = await this.#transport.request<{ data: SequenceVariables }>(
			{ method: "GET", path: `/sequences/${segment(sequenceId)}/variables` },
			options,
		);

		return withVariables(body.data);
	}

	/** Replaces all variable defaults of a sequence. A default that you leave out is removed. */
	async replaceVariables(
		sequenceId: number,
		variables: Readonly<Record<string, string | null>>,
		options: RequestOptions = {},
	): Promise<SequenceVariables> {
		const body = await this.#transport.request<{ data: SequenceVariables }>(
			{
				method: "PATCH",
				path: `/sequences/${segment(sequenceId)}/variables`,
				json: { content_variables: variables },
				idempotent: true,
			},
			options,
		);

		return withVariables(body.data);
	}

	/**
	 * Exports the mails of one step as CSV text. The first line has the
	 * column names. Parse it with a CSV library.
	 */
	async exportStepMails(
		sequenceId: number,
		stepId: number,
		params: StepMailExportParams = {},
		options: RequestOptions = {},
	): Promise<string> {
		return this.#transport.request<string>(
			{
				method: "GET",
				path: `${stepPath(sequenceId, stepId)}/contact-mails/export`,
				query: { ...params },
				text: true,
			},
			options,
		);
	}
}

function stepPath(sequenceId: number, stepId: number): string {
	return `/sequences/${segment(sequenceId)}/steps/${segment(stepId)}`;
}
