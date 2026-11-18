import { segment } from "../core/query";
import type { RequestOptions, Transport } from "../core/transport";
import { type PagePromise, paginate } from "../pagination";
import type {
	Block,
	EmailIdentity,
	EmailLog,
	EmailTemplate,
	IdentityStatus,
	PageParams,
	Project,
} from "../types";

/** The fields of a block. */
export interface BlockParams {
	/** Lowercase letters, digits and `_`. The name is unique. */
	name: string;
	html_content: string;
}

/** `/blocks`: reusable pieces of HTML. */
export class Blocks {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Lists all blocks, newest first. This list has no pages. */
	async list(options: RequestOptions = {}): Promise<Block[]> {
		const body = await this.#transport.request<{ data: Block[] }>(
			{ method: "GET", path: "/blocks" },
			options,
		);

		return body.data;
	}

	/** Reads one block. */
	async get(blockId: number, options: RequestOptions = {}): Promise<Block> {
		const body = await this.#transport.request<{ data: Block }>(
			{ method: "GET", path: `/blocks/${segment(blockId)}` },
			options,
		);

		return body.data;
	}

	/** Creates a block. */
	async create(
		params: BlockParams,
		options: RequestOptions = {},
	): Promise<Block> {
		const body = await this.#transport.request<{ data: Block }>(
			{ method: "POST", path: "/blocks", json: params },
			options,
		);

		return body.data;
	}

	/** Replaces the name and the HTML of a block. The server requires both. */
	async update(
		blockId: number,
		params: BlockParams,
		options: RequestOptions = {},
	): Promise<Block> {
		const body = await this.#transport.request<{ data: Block }>(
			{
				method: "PATCH",
				path: `/blocks/${segment(blockId)}`,
				json: params,
				idempotent: true,
			},
			options,
		);

		return body.data;
	}

	/** Deletes a block. */
	async delete(blockId: number, options: RequestOptions = {}): Promise<void> {
		await this.#transport.request(
			{ method: "DELETE", path: `/blocks/${segment(blockId)}` },
			options,
		);
	}
}

/** The parameters of `emailTemplates.list()`. */
export interface EmailTemplateListParams extends PageParams {
	/** `true` lists only archived templates. The default lists only active templates. */
	archived?: boolean;
	is_default?: boolean;
}

/** `/email-templates`: the layouts around the content of an email. */
export class EmailTemplates {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Lists the email templates, newest first. */
	list(
		params: EmailTemplateListParams = {},
		options: RequestOptions = {},
	): PagePromise<EmailTemplate> {
		return paginate(
			this.#transport,
			"/email-templates",
			{ ...params },
			options,
		);
	}

	/** Reads one email template. */
	async get(
		templateId: number,
		options: RequestOptions = {},
	): Promise<EmailTemplate> {
		const body = await this.#transport.request<{ data: EmailTemplate }>(
			{ method: "GET", path: `/email-templates/${segment(templateId)}` },
			options,
		);

		return body.data;
	}

	/** Reads the default template. Throws a `NotFoundError` when no active template is the default. */
	async default(options: RequestOptions = {}): Promise<EmailTemplate> {
		const body = await this.#transport.request<{ data: EmailTemplate }>(
			{ method: "GET", path: "/email-templates/default" },
			options,
		);

		return body.data;
	}
}

/** The parameters of `emailIdentities.list()`. */
export interface EmailIdentityListParams extends PageParams {
	identity_status?: IdentityStatus;
}

/** `/email-identities`: the sender addresses and domains in Amazon SES. */
export class EmailIdentities {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Lists the sender identities, newest first. */
	list(
		params: EmailIdentityListParams = {},
		options: RequestOptions = {},
	): PagePromise<EmailIdentity> {
		return paginate(
			this.#transport,
			"/email-identities",
			{ ...params },
			options,
		);
	}

	/** Reads one sender identity. */
	async get(
		identityId: number,
		options: RequestOptions = {},
	): Promise<EmailIdentity> {
		const body = await this.#transport.request<{ data: EmailIdentity }>(
			{ method: "GET", path: `/email-identities/${segment(identityId)}` },
			options,
		);

		return body.data;
	}
}

/** The parameters of `emailLogs.list()`. */
export interface EmailLogListParams extends PageParams {
	status?: string;
	operation?: string;
	/** Find a part of the recipient address. */
	recipient?: string;
}

/** `/email-logs`: the log of the calls to Amazon SES. */
export class EmailLogs {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Lists the log entries, newest first. */
	list(
		params: EmailLogListParams = {},
		options: RequestOptions = {},
	): PagePromise<EmailLog> {
		return paginate(this.#transport, "/email-logs", { ...params }, options);
	}

	/** Reads one log entry. */
	async get(logId: number, options: RequestOptions = {}): Promise<EmailLog> {
		const body = await this.#transport.request<{ data: EmailLog }>(
			{ method: "GET", path: `/email-logs/${segment(logId)}` },
			options,
		);

		return body.data;
	}
}

/** `/projects`: groups of newsletters, sequences and automations. */
export class Projects {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Lists the projects, newest first, with their counts. */
	list(
		params: PageParams = {},
		options: RequestOptions = {},
	): PagePromise<Project> {
		return paginate(this.#transport, "/projects", { ...params }, options);
	}

	/** Reads one project with its counts. */
	async get(projectId: number, options: RequestOptions = {}): Promise<Project> {
		const body = await this.#transport.request<{ data: Project }>(
			{ method: "GET", path: `/projects/${segment(projectId)}` },
			options,
		);

		return body.data;
	}

	/** Creates a project. A project name is unique. */
	async create(name: string, options: RequestOptions = {}): Promise<Project> {
		const body = await this.#transport.request<{ data: Project }>(
			{ method: "POST", path: "/projects", json: { name } },
			options,
		);

		return body.data;
	}

	/** Gives a project a new name. */
	async rename(
		projectId: number,
		name: string,
		options: RequestOptions = {},
	): Promise<Project> {
		const body = await this.#transport.request<{ data: Project }>(
			{
				method: "PATCH",
				path: `/projects/${segment(projectId)}`,
				json: { name },
				idempotent: true,
			},
			options,
		);

		return body.data;
	}

	/** Deletes a project. */
	async delete(projectId: number, options: RequestOptions = {}): Promise<void> {
		await this.#transport.request(
			{ method: "DELETE", path: `/projects/${segment(projectId)}` },
			options,
		);
	}
}
