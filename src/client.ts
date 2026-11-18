import { type FetchLike, Transport } from "./core/transport";
import { Contacts, Lists, Tags, Topics } from "./resources/audience";
import {
	Blocks,
	EmailIdentities,
	EmailLogs,
	EmailTemplates,
	Projects,
} from "./resources/library";
import { Newsletters } from "./resources/newsletters";
import { Sequences } from "./resources/sequences";
import { WebhookEndpoints } from "./resources/webhook-endpoints";

/** The settings of a `Byomailer` client. */
export interface ByomailerOptions {
	/**
	 * The root URL of your BYOMailer instance, for example
	 * `https://mail.example.com`. The SDK adds `/api/v1` to it.
	 */
	baseUrl: string | URL;
	/** A personal API token. Make it in Settings, API Tokens. */
	token: string;
	/** The time limit for one attempt, in milliseconds. The default is 30000. */
	timeout?: number;
	/** The maximum number of retries after the first attempt. The default is 2. Use 0 to stop retries. */
	maxRetries?: number;
	/** A `fetch` function for tests or a proxy. The global `fetch` is the default. */
	fetch?: FetchLike;
}

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_RETRIES = 2;
// `setTimeout` runs a longer delay at once.
const MAX_TIMEOUT = 2_147_483_647;

/**
 * A client for one BYOMailer instance.
 *
 * @example
 * const mailer = new Byomailer({ baseUrl: 'https://mail.example.com', token: process.env.BYOMAILER_TOKEN })
 * const { contact, created } = await mailer.contacts.add(3, { email: 'ana@example.com' })
 */
export class Byomailer {
	readonly contacts: Contacts;
	readonly lists: Lists;
	readonly topics: Topics;
	readonly tags: Tags;
	readonly newsletters: Newsletters;
	readonly sequences: Sequences;
	readonly blocks: Blocks;
	readonly emailTemplates: EmailTemplates;
	readonly emailIdentities: EmailIdentities;
	readonly emailLogs: EmailLogs;
	readonly projects: Projects;
	/** Only a token of an admin user can use these calls. */
	readonly webhookEndpoints: WebhookEndpoints;

	constructor(options: ByomailerOptions) {
		if (typeof options.token !== "string" || options.token.trim() === "") {
			throw new TypeError("`token` must be an API token that is not empty.");
		}

		const transport = new Transport({
			baseUrl: options.baseUrl,
			token: options.token,
			timeout: checked("timeout", options.timeout ?? DEFAULT_TIMEOUT),
			maxRetries: checked(
				"maxRetries",
				options.maxRetries ?? DEFAULT_MAX_RETRIES,
				true,
			),
			fetch: options.fetch,
		});

		this.contacts = new Contacts(transport);
		this.lists = new Lists(transport);
		this.topics = new Topics(transport);
		this.tags = new Tags(transport);
		this.newsletters = new Newsletters(transport);
		this.sequences = new Sequences(transport);
		this.blocks = new Blocks(transport);
		this.emailTemplates = new EmailTemplates(transport);
		this.emailIdentities = new EmailIdentities(transport);
		this.emailLogs = new EmailLogs(transport);
		this.projects = new Projects(transport);
		this.webhookEndpoints = new WebhookEndpoints(transport);
	}
}

function checked(name: string, value: number, allowZero = false): number {
	const valid =
		Number.isFinite(value) &&
		value <= MAX_TIMEOUT &&
		(allowZero ? value >= 0 : value > 0);

	if (!valid) {
		throw new TypeError(
			`\`${name}\` must be a ${allowZero ? "number that is 0 or more" : "positive number"}.`,
		);
	}

	return value;
}
