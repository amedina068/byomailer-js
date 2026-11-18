import { describe, expect, it } from "vitest";
import type { Byomailer } from "../src/index";
import {
	API,
	callOf,
	client,
	json,
	mockFetch,
	noContent,
	page,
	TOKEN,
} from "./helpers";

const CONTACT = {
	id: 42,
	uuid: "9b2f6c1e-4a7d-4f3b-8c55-0d6e2a1b3c4d",
	name: "Ana",
	email: "ana@example.com",
	extra_attributes: { company: "Example" },
	unsubscribed_at: null,
	unsubscribed_by_contact: null,
	tags: [],
	lists: [],
	topics: [],
	sequences: [],
	created_at: "2026-11-18T10:00:00.000000Z",
};
const NEWSLETTER = {
	id: 7,
	title: "November news",
	status: "draft",
	content_variables: { first_name: "friend" },
};
const VARIABLES = {
	newsletter_id: 7,
	detected_variables: ["first_name"],
	content_variables: { first_name: "" },
};
const STEP = { id: 11, sequence_id: 3, filters: [], message: null };
const ENDPOINT = {
	id: 5,
	url: "https://hooks.example.com/byomailer",
	events: ["contact.subscribed"],
	active: true,
};
const FILTER = { category: "tags", mode: "any", values: ["vip"] } as const;

interface Case {
	name: string;
	call: (mailer: Byomailer) => Promise<unknown>;
	reply: Response;
	method: string;
	path: string;
	body?: unknown;
	result: unknown;
}

const data = (value: unknown) => json(200, { data: value });
const created = (value: unknown) => json(201, { data: value });

const cases: Case[] = [
	// Contacts
	{
		name: "contacts.get",
		call: (m) => m.contacts.get(42),
		reply: data(CONTACT),
		method: "GET",
		path: "/contacts/42",
		result: CONTACT,
	},
	{
		name: "contacts.update sends attributes at the top level with PATCH",
		call: (m) =>
			m.contacts.update(42, {
				name: "Ana P.",
				tags: ["vip"],
				remove_tags: ["trial"],
				attributes: { company: "Example", plan: "pro" },
			}),
		reply: data(CONTACT),
		method: "PATCH",
		path: "/contacts/42",
		body: {
			company: "Example",
			plan: "pro",
			name: "Ana P.",
			tags: ["vip"],
			remove_tags: ["trial"],
		},
		result: CONTACT,
	},
	{
		name: "contacts.unsubscribe",
		call: (m) => m.contacts.unsubscribe(42),
		reply: data(CONTACT),
		method: "POST",
		path: "/contacts/42/unsubscribe",
		result: CONTACT,
	},
	{
		name: "contacts.removeFromList",
		call: (m) => m.contacts.removeFromList(3, 42),
		reply: data(CONTACT),
		method: "DELETE",
		path: "/lists/3/contacts/42",
		result: CONTACT,
	},
	// Lists
	{
		name: "lists.create",
		call: (m) => m.lists.create("Customers"),
		reply: created({ id: 3, name: "Customers" }),
		method: "POST",
		path: "/lists",
		body: { name: "Customers" },
		result: { id: 3, name: "Customers" },
	},
	{
		name: "lists.rename",
		call: (m) => m.lists.rename(3, "Clients"),
		reply: data({ id: 3, name: "Clients" }),
		method: "PATCH",
		path: "/lists/3",
		body: { name: "Clients" },
		result: { id: 3, name: "Clients" },
	},
	{
		name: "lists.delete",
		call: (m) => m.lists.delete(3),
		reply: noContent(),
		method: "DELETE",
		path: "/lists/3",
		result: undefined,
	},
	// Topics
	{
		name: "topics.list returns all items",
		call: (m) => m.topics.list(3),
		reply: data([{ id: 1, name: "Product news" }]),
		method: "GET",
		path: "/lists/3/topics",
		result: [{ id: 1, name: "Product news" }],
	},
	{
		name: "topics.create",
		call: (m) => m.topics.create(3, { name: "Events" }),
		reply: created({ id: 2, name: "Events" }),
		method: "POST",
		path: "/lists/3/topics",
		body: { name: "Events" },
		result: { id: 2, name: "Events" },
	},
	{
		name: "topics.update",
		call: (m) => m.topics.update(3, 2, { name: "Events", description: null }),
		reply: data({ id: 2, name: "Events" }),
		method: "PATCH",
		path: "/lists/3/topics/2",
		body: { name: "Events", description: null },
		result: { id: 2, name: "Events" },
	},
	{
		name: "topics.delete",
		call: (m) => m.topics.delete(3, 2),
		reply: noContent(),
		method: "DELETE",
		path: "/lists/3/topics/2",
		result: undefined,
	},
	// Tags
	{
		name: "tags.list returns all items",
		call: (m) => m.tags.list(),
		reply: data([{ id: 1, name: "vip" }]),
		method: "GET",
		path: "/tags",
		result: [{ id: 1, name: "vip" }],
	},
	{
		name: "tags.create",
		call: (m) => m.tags.create("vip"),
		reply: created({ id: 1, name: "vip" }),
		method: "POST",
		path: "/tags",
		body: { name: "vip" },
		result: { id: 1, name: "vip" },
	},
	{
		name: "tags.rename",
		call: (m) => m.tags.rename(1, "gold"),
		reply: data({ id: 1, name: "gold" }),
		method: "PATCH",
		path: "/tags/1",
		body: { name: "gold" },
		result: { id: 1, name: "gold" },
	},
	{
		name: "tags.delete",
		call: (m) => m.tags.delete(1),
		reply: noContent(),
		method: "DELETE",
		path: "/tags/1",
		result: undefined,
	},
	// Newsletters
	{
		name: "newsletters.get",
		call: (m) => m.newsletters.get(7),
		reply: data(NEWSLETTER),
		method: "GET",
		path: "/newsletters/7",
		result: NEWSLETTER,
	},
	{
		name: "newsletters.create makes a draft",
		call: (m) =>
			m.newsletters.create({
				title: "November news",
				subject: "News",
				html_content: "<p>Hello {{ first_name }}</p>",
				filters: [FILTER],
			}),
		reply: created(NEWSLETTER),
		method: "POST",
		path: "/newsletters",
		body: {
			title: "November news",
			subject: "News",
			html_content: "<p>Hello {{ first_name }}</p>",
			filters: [FILTER],
		},
		result: NEWSLETTER,
	},
	{
		name: "newsletters.update sends a Date as ISO 8601",
		call: (m) =>
			m.newsletters.update(7, {
				status: "live",
				scheduled_at: new Date("2026-12-01T09:00:00Z"),
			}),
		reply: data({ ...NEWSLETTER, status: "scheduled" }),
		method: "PATCH",
		path: "/newsletters/7",
		body: { status: "live", scheduled_at: "2026-12-01T09:00:00.000Z" },
		result: { ...NEWSLETTER, status: "scheduled" },
	},
	{
		name: "newsletters.delete",
		call: (m) => m.newsletters.delete(7),
		reply: noContent(),
		method: "DELETE",
		path: "/newsletters/7",
		result: undefined,
	},
	{
		name: "newsletters.countRecipients",
		call: (m) => m.newsletters.countRecipients([FILTER]),
		reply: json(200, { count: 128 }),
		method: "POST",
		path: "/newsletters/contacts/preview",
		body: { filters: [FILTER] },
		result: 128,
	},
	{
		name: "newsletters.sendTest",
		call: (m) => m.newsletters.sendTest(7),
		reply: json(200, {
			message: "Test email sent to dev@example.com",
			sent_to: "dev@example.com",
		}),
		method: "POST",
		path: "/newsletters/7/test-mail",
		result: {
			message: "Test email sent to dev@example.com",
			sent_to: "dev@example.com",
		},
	},
	{
		name: "newsletters.pickWinner",
		call: (m) => m.newsletters.pickWinner(7, "b"),
		reply: data({ ...NEWSLETTER, status: "sent" }),
		method: "POST",
		path: "/newsletters/7/ab-winner",
		body: { winner_variant: "b" },
		result: { ...NEWSLETTER, status: "sent" },
	},
	{
		name: "newsletters.variables",
		call: (m) => m.newsletters.variables(7),
		reply: data(VARIABLES),
		method: "GET",
		path: "/newsletters/7/variables",
		result: VARIABLES,
	},
	{
		name: "newsletters.replaceVariables",
		call: (m) => m.newsletters.replaceVariables(7, { first_name: "friend" }),
		reply: data(VARIABLES),
		method: "PATCH",
		path: "/newsletters/7/variables",
		body: { content_variables: { first_name: "friend" } },
		result: VARIABLES,
	},
	// Sequences
	{
		name: "sequences.get",
		call: (m) => m.sequences.get(3),
		reply: data({ id: 3, steps: [], content_variables: {} }),
		method: "GET",
		path: "/sequences/3",
		result: { id: 3, steps: [], content_variables: {} },
	},
	{
		name: "sequences.stats",
		call: (m) => m.sequences.stats(3),
		reply: data({ id: 3, stats: { contacts: 10 } }),
		method: "GET",
		path: "/sequences/3/stats",
		result: { id: 3, stats: { contacts: 10 } },
	},
	{
		name: "sequences.step",
		call: (m) => m.sequences.step(3, 11),
		reply: data(STEP),
		method: "GET",
		path: "/sequences/3/steps/11",
		result: STEP,
	},
	{
		name: "sequences.stepStats",
		call: (m) => m.sequences.stepStats(3, 11),
		reply: data({ id: 11, sequence_id: 3 }),
		method: "GET",
		path: "/sequences/3/steps/11/stats",
		result: { id: 11, sequence_id: 3 },
	},
	{
		name: "sequences.replaceStepFilters",
		call: (m) => m.sequences.replaceStepFilters(3, 11, [FILTER]),
		reply: data({ ...STEP, filters: [FILTER] }),
		method: "PATCH",
		path: "/sequences/3/steps/11/filters",
		body: { filters: [FILTER] },
		result: { ...STEP, filters: [FILTER] },
	},
	{
		name: "sequences.variables",
		call: (m) => m.sequences.variables(3),
		reply: data({
			sequence_id: 3,
			detected_variables: [],
			content_variables: [],
		}),
		method: "GET",
		path: "/sequences/3/variables",
		result: { sequence_id: 3, detected_variables: [], content_variables: {} },
	},
	{
		name: "sequences.replaceVariables",
		call: (m) => m.sequences.replaceVariables(3, {}),
		reply: data({
			sequence_id: 3,
			detected_variables: [],
			content_variables: [],
		}),
		method: "PATCH",
		path: "/sequences/3/variables",
		body: { content_variables: {} },
		result: { sequence_id: 3, detected_variables: [], content_variables: {} },
	},
	// Blocks
	{
		name: "blocks.list returns all items",
		call: (m) => m.blocks.list(),
		reply: data([{ id: 1, name: "footer" }]),
		method: "GET",
		path: "/blocks",
		result: [{ id: 1, name: "footer" }],
	},
	{
		name: "blocks.get",
		call: (m) => m.blocks.get(1),
		reply: data({ id: 1, name: "footer" }),
		method: "GET",
		path: "/blocks/1",
		result: { id: 1, name: "footer" },
	},
	{
		name: "blocks.create",
		call: (m) =>
			m.blocks.create({ name: "footer", html_content: "<p>Bye</p>" }),
		reply: created({ id: 1, name: "footer" }),
		method: "POST",
		path: "/blocks",
		body: { name: "footer", html_content: "<p>Bye</p>" },
		result: { id: 1, name: "footer" },
	},
	{
		name: "blocks.update",
		call: (m) =>
			m.blocks.update(1, { name: "footer", html_content: "<p>Ciao</p>" }),
		reply: data({ id: 1, name: "footer" }),
		method: "PATCH",
		path: "/blocks/1",
		body: { name: "footer", html_content: "<p>Ciao</p>" },
		result: { id: 1, name: "footer" },
	},
	{
		name: "blocks.delete",
		call: (m) => m.blocks.delete(1),
		reply: noContent(),
		method: "DELETE",
		path: "/blocks/1",
		result: undefined,
	},
	// Email templates
	{
		name: "emailTemplates.get",
		call: (m) => m.emailTemplates.get(2),
		reply: data({ id: 2, name: "Plain" }),
		method: "GET",
		path: "/email-templates/2",
		result: { id: 2, name: "Plain" },
	},
	{
		name: "emailTemplates.default",
		call: (m) => m.emailTemplates.default(),
		reply: data({ id: 2, is_default: true }),
		method: "GET",
		path: "/email-templates/default",
		result: { id: 2, is_default: true },
	},
	// Email identities and logs
	{
		name: "emailIdentities.get",
		call: (m) => m.emailIdentities.get(4),
		reply: data({ id: 4, email: "news@example.com" }),
		method: "GET",
		path: "/email-identities/4",
		result: { id: 4, email: "news@example.com" },
	},
	{
		name: "emailLogs.get",
		call: (m) => m.emailLogs.get(9),
		reply: data({ id: 9, operation: "SendEmail" }),
		method: "GET",
		path: "/email-logs/9",
		result: { id: 9, operation: "SendEmail" },
	},
	// Projects
	{
		name: "projects.get",
		call: (m) => m.projects.get(6),
		reply: data({ id: 6, name: "Launch" }),
		method: "GET",
		path: "/projects/6",
		result: { id: 6, name: "Launch" },
	},
	{
		name: "projects.create",
		call: (m) => m.projects.create("Launch"),
		reply: created({ id: 6, name: "Launch" }),
		method: "POST",
		path: "/projects",
		body: { name: "Launch" },
		result: { id: 6, name: "Launch" },
	},
	{
		name: "projects.rename",
		call: (m) => m.projects.rename(6, "Relaunch"),
		reply: data({ id: 6, name: "Relaunch" }),
		method: "PATCH",
		path: "/projects/6",
		body: { name: "Relaunch" },
		result: { id: 6, name: "Relaunch" },
	},
	{
		name: "projects.delete",
		call: (m) => m.projects.delete(6),
		reply: noContent(),
		method: "DELETE",
		path: "/projects/6",
		result: undefined,
	},
	// Webhook endpoints
	{
		name: "webhookEndpoints.get",
		call: (m) => m.webhookEndpoints.get(5),
		reply: data(ENDPOINT),
		method: "GET",
		path: "/webhook-endpoints/5",
		result: ENDPOINT,
	},
	{
		name: "webhookEndpoints.create returns the secret",
		call: (m) =>
			m.webhookEndpoints.create({
				url: "https://hooks.example.com/byomailer",
				events: ["contact.subscribed"],
			}),
		reply: created({ ...ENDPOINT, secret: "whsec_example" }),
		method: "POST",
		path: "/webhook-endpoints",
		body: {
			url: "https://hooks.example.com/byomailer",
			events: ["contact.subscribed"],
		},
		result: { ...ENDPOINT, secret: "whsec_example" },
	},
	{
		name: "webhookEndpoints.update",
		call: (m) => m.webhookEndpoints.update(5, { active: false }),
		reply: data({ ...ENDPOINT, active: false }),
		method: "PATCH",
		path: "/webhook-endpoints/5",
		body: { active: false },
		result: { ...ENDPOINT, active: false },
	},
	{
		name: "webhookEndpoints.delete",
		call: (m) => m.webhookEndpoints.delete(5),
		reply: noContent(),
		method: "DELETE",
		path: "/webhook-endpoints/5",
		result: undefined,
	},
	{
		name: "webhookEndpoints.rotateSecret",
		call: (m) => m.webhookEndpoints.rotateSecret(5),
		reply: data({ ...ENDPOINT, secret: "whsec_new" }),
		method: "POST",
		path: "/webhook-endpoints/5/secret",
		result: { ...ENDPOINT, secret: "whsec_new" },
	},
	{
		name: "webhookEndpoints.test",
		call: (m) => m.webhookEndpoints.test(5),
		reply: json(202, { data: { id: 1, event_type: "webhook.test" } }),
		method: "POST",
		path: "/webhook-endpoints/5/test",
		result: { id: 1, event_type: "webhook.test" },
	},
];

describe("each endpoint", () => {
	it.each(cases)("$name", async (item) => {
		const fetch = mockFetch(item.reply);

		expect(await item.call(client(fetch))).toEqual(item.result);

		const call = callOf(fetch);
		expect(call.method).toBe(item.method);
		expect(call.path).toBe(item.path);
		expect(call.body).toEqual(item.body);
	});
});

describe("list endpoints with cursor pagination", () => {
	const lists: [string, (m: Byomailer) => PromiseLike<unknown>, string][] = [
		[
			"contacts.list",
			(m) =>
				m.contacts.list({
					search: "ana",
					lists: [3, 4],
					tags: [1],
					include_unsubscribed: true,
					per_page: 50,
				}),
			"/contacts?search=ana&lists[0]=3&lists[1]=4&tags[0]=1&include_unsubscribed=1&per_page=50",
		],
		["lists.list", (m) => m.lists.list({ cursor: "abc" }), "/lists?cursor=abc"],
		[
			"newsletters.list",
			(m) => m.newsletters.list({ status: "sent", project: 6 }),
			"/newsletters?status=sent&project=6",
		],
		[
			"sequences.list",
			(m) => m.sequences.list({ status: "live", search: "welcome" }),
			"/sequences?status=live&search=welcome",
		],
		[
			"emailTemplates.list",
			(m) => m.emailTemplates.list({ archived: false, is_default: true }),
			"/email-templates?archived=0&is_default=1",
		],
		[
			"emailIdentities.list",
			(m) => m.emailIdentities.list({ identity_status: "verified" }),
			"/email-identities?identity_status=verified",
		],
		[
			"emailLogs.list",
			(m) => m.emailLogs.list({ recipient: "example.com", status: "Delivery" }),
			"/email-logs?recipient=example.com&status=Delivery",
		],
		["projects.list", (m) => m.projects.list(), "/projects"],
		[
			"webhookEndpoints.list",
			(m) => m.webhookEndpoints.list({ per_page: 10 }),
			"/webhook-endpoints?per_page=10",
		],
		[
			"webhookEndpoints.deliveries",
			(m) => m.webhookEndpoints.deliveries(5),
			"/webhook-endpoints/5/deliveries",
		],
	];

	it.each(lists)(
		"%s sends the filters as query parameters",
		async (_name, call, path) => {
			const fetch = mockFetch(page([{ id: 1 }]));

			const first = (await call(client(fetch))) as { data: unknown[] };

			expect(first.data).toEqual([{ id: 1 }]);
			expect(callOf(fetch).method).toBe("GET");
			expect(callOf(fetch).path).toBe(path);
		},
	);
});

describe("request basics", () => {
	it("sends the token, the Accept header and the /api/v1 prefix", async () => {
		const fetch = mockFetch(data(CONTACT));

		await client(fetch).contacts.get(42);

		const call = callOf(fetch);
		expect(call.url.href).toBe(`${API}/contacts/42`);
		expect(call.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
		expect(call.headers.get("accept")).toBe("application/json");
		expect(call.headers.get("content-type")).toBeNull();
	});

	it("sends a JSON body with a content type", async () => {
		const fetch = mockFetch(created({ id: 1 }));

		await client(fetch).tags.create("vip");

		expect(callOf(fetch).headers.get("content-type")).toBe("application/json");
	});

	it("keeps a path in the base URL", async () => {
		const fetch = mockFetch(data([]));

		await client(fetch, { baseUrl: "https://example.com/mailer/" }).tags.list();

		expect(callOf(fetch).url.href).toBe(
			"https://example.com/mailer/api/v1/tags",
		);
	});

	it("encodes an id in the path", async () => {
		const fetch = mockFetch(data(CONTACT));

		await client(fetch).contacts.get("4/2" as unknown as number);

		expect(callOf(fetch).url.pathname).toBe("/api/v1/contacts/4%2F2");
	});
});

describe("contacts.add", () => {
	it("returns created: true for a 201", async () => {
		const fetch = mockFetch(created(CONTACT));

		const result = await client(fetch).contacts.add(3, {
			email: "ana@example.com",
			name: "Ana",
			tags: ["vip"],
			attributes: { company: "Example" },
		});

		expect(result).toEqual({ contact: CONTACT, created: true });
		expect(callOf(fetch).path).toBe("/lists/3/contacts");
		expect(callOf(fetch).body).toEqual({
			company: "Example",
			email: "ana@example.com",
			name: "Ana",
			tags: ["vip"],
		});
	});

	it("returns created: false for a 200", async () => {
		const fetch = mockFetch(data(CONTACT));

		const result = await client(fetch).contacts.add(3, {
			email: "ana@example.com",
		});

		expect(result.created).toBe(false);
	});

	it("rejects an attribute with the name of a field", async () => {
		const fetch = mockFetch();

		await expect(
			client(fetch).contacts.add(3, {
				email: "ana@example.com",
				attributes: { email: "other@example.com" },
			}),
		).rejects.toThrow(/attribute `email`/);
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe("PHP empty arrays", () => {
	it("turns empty extra_attributes into an object", async () => {
		const fetch = mockFetch(data({ ...CONTACT, extra_attributes: [] }));

		const contact = await client(fetch).contacts.get(42);

		expect(contact.extra_attributes).toEqual({});
	});

	it("turns empty content_variables into an object in a list", async () => {
		const fetch = mockFetch(page([{ ...NEWSLETTER, content_variables: [] }]));

		const [newsletter] = await client(fetch).newsletters.list().toArray();

		expect(newsletter?.content_variables).toEqual({});
	});
});

describe("sequences.exportStepMails", () => {
	it("returns the CSV text", async () => {
		const csv = "email,subject,status\nana@example.com,Welcome,sent\n";
		const fetch = mockFetch(
			new Response(csv, {
				status: 200,
				headers: { "content-type": "text/csv; charset=UTF-8" },
			}),
		);

		const text = await client(fetch).sequences.exportStepMails(3, 11, {
			status: "sent",
			sort: "sent_at",
			direction: "desc",
		});

		expect(text).toBe(csv);
		const call = callOf(fetch);
		expect(call.path).toBe(
			"/sequences/3/steps/11/contact-mails/export?status=sent&sort=sent_at&direction=desc",
		);
		expect(call.headers.get("accept")).toBe("application/json, text/csv");
	});
});
