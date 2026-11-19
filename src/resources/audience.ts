import { segment } from "../core/query";
import { record } from "../core/shape";
import type { RequestOptions, Transport } from "../core/transport";
import { type PagePromise, paginate } from "../pagination";
import type { Contact, MailList, PageParams, Tag, Topic } from "../types";

/** The parameters of `contacts.list()`. */
export interface ContactListParams extends PageParams {
	/** Find a part of the name or the email. */
	search?: string;
	/** Only contacts on one of these lists. */
	lists?: readonly number[];
	/** Only contacts with one of these tags, by tag id. */
	tags?: readonly number[];
	/** Only contacts subscribed to one of these topics. */
	topics?: readonly number[];
	/** Also return unsubscribed contacts. The default is `false`. */
	include_unsubscribed?: boolean;
}

interface ContactFields {
	name?: string | null;
	/** Tag names to add. The server creates a tag that does not exist. */
	tags?: readonly string[];
	/**
	 * Custom attributes. The SDK sends each key at the top level of the body.
	 * The keys `email`, `name`, `tags` and `remove_tags` are not allowed.
	 */
	attributes?: Readonly<Record<string, unknown>>;
}

/** The fields of `contacts.add()`. */
export interface AddContactParams extends ContactFields {
	email: string;
}

/** The fields of `contacts.update()`. A field that you leave out does not change. */
export interface UpdateContactParams extends ContactFields {
	email?: string;
	/** Tag names to remove. */
	remove_tags?: readonly string[];
}

/** The result of `contacts.add()`. */
export interface AddedContact {
	contact: Contact;
	/** `true` when the server made a new contact (201). `false` when the email was already a contact (200). */
	created: boolean;
}

const RESERVED_FIELDS = new Set(["email", "name", "tags", "remove_tags"]);

/** `/contacts`: read, add, change, unsubscribe and subscribe contacts. */
export class Contacts {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Lists the contacts, newest first. Unsubscribed contacts are left out by default. */
	list(
		params: ContactListParams = {},
		options: RequestOptions = {},
	): PagePromise<Contact> {
		return paginate(
			this.#transport,
			"/contacts",
			{ ...params },
			options,
			contact,
		);
	}

	/** Reads one contact with its tags, lists, topics and sequences. */
	async get(contactId: number, options: RequestOptions = {}): Promise<Contact> {
		const body = await this.#transport.request<{ data: Contact }>(
			{ method: "GET", path: `/contacts/${segment(contactId)}` },
			options,
		);

		return contact(body.data);
	}

	/**
	 * Adds a contact to a list. If the email is already a contact, the server
	 * updates that contact. Read `created` to know which one happened.
	 *
	 * If an admin or the API unsubscribed the contact, the server subscribes
	 * the contact again. An unsubscribe through an email link stays. On an
	 * opt-in list, the server sends the opt-in email only when the contact is
	 * new on the list.
	 */
	async add(
		listId: number,
		params: AddContactParams,
		options: RequestOptions = {},
	): Promise<AddedContact> {
		const { status, body } = await this.#transport.response<{ data: Contact }>(
			{
				method: "POST",
				path: `/lists/${segment(listId)}/contacts`,
				json: contactBody(params),
			},
			options,
		);

		return { contact: contact(body.data), created: status === 201 };
	}

	/**
	 * Changes a contact. The server merges `attributes` into the saved
	 * attributes. An update never changes the subscription. Use `subscribe()`
	 * to subscribe a contact again.
	 */
	async update(
		contactId: number,
		params: UpdateContactParams,
		options: RequestOptions = {},
	): Promise<Contact> {
		const body = await this.#transport.request<{ data: Contact }>(
			{
				method: "PATCH",
				path: `/contacts/${segment(contactId)}`,
				json: contactBody(params),
			},
			options,
		);

		return contact(body.data);
	}

	/** Unsubscribes a contact from all email. A repeat keeps the first date. */
	async unsubscribe(
		contactId: number,
		options: RequestOptions = {},
	): Promise<Contact> {
		const body = await this.#transport.request<{ data: Contact }>(
			{
				method: "POST",
				path: `/contacts/${segment(contactId)}/unsubscribe`,
				idempotent: true,
			},
			options,
		);

		return contact(body.data);
	}

	/**
	 * Subscribes a contact again after an admin or the API unsubscribed it. A
	 * subscribed contact does not change. The server rejects a contact that
	 * unsubscribed through an email link (field `contact`) and a blacklisted
	 * address (field `email`) with a `ValidationError`.
	 */
	async subscribe(
		contactId: number,
		options: RequestOptions = {},
	): Promise<Contact> {
		const body = await this.#transport.request<{ data: Contact }>(
			{
				method: "POST",
				path: `/contacts/${segment(contactId)}/subscribe`,
				idempotent: true,
			},
			options,
		);

		return contact(body.data);
	}

	/** Removes a contact from one list. The contact stays in the other lists. */
	async removeFromList(
		listId: number,
		contactId: number,
		options: RequestOptions = {},
	): Promise<Contact> {
		const body = await this.#transport.request<{ data: Contact }>(
			{
				method: "DELETE",
				path: `/lists/${segment(listId)}/contacts/${segment(contactId)}`,
			},
			options,
		);

		return contact(body.data);
	}
}

/** `/lists`: the mailing lists. */
export class Lists {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Lists the mailing lists, newest first. */
	list(
		params: PageParams = {},
		options: RequestOptions = {},
	): PagePromise<MailList> {
		return paginate(this.#transport, "/lists", { ...params }, options);
	}

	/** Creates a mailing list. */
	async create(name: string, options: RequestOptions = {}): Promise<MailList> {
		const body = await this.#transport.request<{ data: MailList }>(
			{ method: "POST", path: "/lists", json: { name } },
			options,
		);

		return body.data;
	}

	/** Gives a mailing list a new name. */
	async rename(
		listId: number,
		name: string,
		options: RequestOptions = {},
	): Promise<MailList> {
		const body = await this.#transport.request<{ data: MailList }>(
			{
				method: "PATCH",
				path: `/lists/${segment(listId)}`,
				json: { name },
				idempotent: true,
			},
			options,
		);

		return body.data;
	}

	/** Deletes a mailing list. */
	async delete(listId: number, options: RequestOptions = {}): Promise<void> {
		await this.#transport.request(
			{ method: "DELETE", path: `/lists/${segment(listId)}` },
			options,
		);
	}
}

/** The fields of a topic. */
export interface TopicParams {
	name: string;
	description?: string | null;
}

/** `/lists/{listId}/topics`: the topics that the contacts of a list can choose. */
export class Topics {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Lists all topics of a list, newest first. This list has no pages. */
	async list(listId: number, options: RequestOptions = {}): Promise<Topic[]> {
		const body = await this.#transport.request<{ data: Topic[] }>(
			{ method: "GET", path: `/lists/${segment(listId)}/topics` },
			options,
		);

		return body.data;
	}

	/** Creates a topic. The server subscribes each contact of the list to it. */
	async create(
		listId: number,
		params: TopicParams,
		options: RequestOptions = {},
	): Promise<Topic> {
		const body = await this.#transport.request<{ data: Topic }>(
			{
				method: "POST",
				path: `/lists/${segment(listId)}/topics`,
				json: params,
			},
			options,
		);

		return body.data;
	}

	/**
	 * Replaces the name and the description of a topic. The server clears a
	 * description that you leave out, so the type requires it.
	 */
	async update(
		listId: number,
		topicId: number,
		params: Required<TopicParams>,
		options: RequestOptions = {},
	): Promise<Topic> {
		const body = await this.#transport.request<{ data: Topic }>(
			{
				method: "PATCH",
				path: `/lists/${segment(listId)}/topics/${segment(topicId)}`,
				json: params,
				idempotent: true,
			},
			options,
		);

		return body.data;
	}

	/** Deletes a topic. */
	async delete(
		listId: number,
		topicId: number,
		options: RequestOptions = {},
	): Promise<void> {
		await this.#transport.request(
			{
				method: "DELETE",
				path: `/lists/${segment(listId)}/topics/${segment(topicId)}`,
			},
			options,
		);
	}
}

/** `/tags`: the labels of contacts. */
export class Tags {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Lists all tags, newest first. This list has no pages. */
	async list(options: RequestOptions = {}): Promise<Tag[]> {
		const body = await this.#transport.request<{ data: Tag[] }>(
			{ method: "GET", path: "/tags" },
			options,
		);

		return body.data;
	}

	/** Creates a tag. A tag name is unique. */
	async create(name: string, options: RequestOptions = {}): Promise<Tag> {
		const body = await this.#transport.request<{ data: Tag }>(
			{ method: "POST", path: "/tags", json: { name } },
			options,
		);

		return body.data;
	}

	/** Gives a tag a new name. */
	async rename(
		tagId: number,
		name: string,
		options: RequestOptions = {},
	): Promise<Tag> {
		const body = await this.#transport.request<{ data: Tag }>(
			{
				method: "PATCH",
				path: `/tags/${segment(tagId)}`,
				json: { name },
				idempotent: true,
			},
			options,
		);

		return body.data;
	}

	/** Deletes a tag. */
	async delete(tagId: number, options: RequestOptions = {}): Promise<void> {
		await this.#transport.request(
			{ method: "DELETE", path: `/tags/${segment(tagId)}` },
			options,
		);
	}
}

// The server reads each body field that is not a known field as a custom
// attribute, so the attributes go at the top level.
function contactBody({
	attributes = {},
	...fields
}: AddContactParams | UpdateContactParams): Record<string, unknown> {
	for (const key of Object.keys(attributes)) {
		if (RESERVED_FIELDS.has(key)) {
			throw new TypeError(
				`The attribute \`${key}\` is not allowed. Use the \`${key}\` field.`,
			);
		}
	}

	return { ...attributes, ...fields };
}

function contact(value: Contact): Contact {
	return { ...value, extra_attributes: record(value.extra_attributes) };
}
