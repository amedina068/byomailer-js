import { readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Byomailer, type CreateNewsletterParams } from "../src/index";
import { callOf, client, json, mockFetch, page } from "./helpers";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("constructor", () => {
	it("rejects a missing token", () => {
		expect(
			() => new Byomailer({ baseUrl: "https://mail.example.com", token: "" }),
		).toThrow(/token/);
		expect(
			() => new Byomailer({ baseUrl: "https://mail.example.com", token: " " }),
		).toThrow(/token/);
	});

	it("rejects a base URL that is not absolute or not http", () => {
		expect(
			() => new Byomailer({ baseUrl: "mail.example.com", token: "t" }),
		).toThrow(/absolute/);
		expect(
			() => new Byomailer({ baseUrl: "ftp://mail.example.com", token: "t" }),
		).toThrow(/http/);
	});

	it("rejects a bad timeout or retry count", () => {
		const base = { baseUrl: "https://mail.example.com", token: "t" };

		expect(() => new Byomailer({ ...base, timeout: 0 })).toThrow(/timeout/);
		expect(() => new Byomailer({ ...base, maxRetries: -1 })).toThrow(
			/maxRetries/,
		);
		expect(() => new Byomailer({ ...base, timeout: 2 ** 31 })).toThrow(
			/timeout/,
		);
		expect(() => new Byomailer({ ...base, maxRetries: 0 })).not.toThrow();
	});

	it("uses the global fetch when no fetch is given", async () => {
		const fetch = mockFetch(json(200, { data: [] }));
		vi.stubGlobal("fetch", fetch);

		await new Byomailer({
			baseUrl: "https://mail.example.com",
			token: "t",
		}).tags.list();

		expect(fetch).toHaveBeenCalledOnce();
	});
});

describe("abort", () => {
	it("throws the reason of the signal when it aborts during a request", async () => {
		const fetch = vi.fn(
			(_url: string, init: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init.signal?.addEventListener("abort", () =>
						reject(new DOMException("aborted", "AbortError")),
					);
				}),
		);
		const controller = new AbortController();
		const promise = client(fetch).tags.list({ signal: controller.signal });
		controller.abort(new Error("user stop"));

		await expect(promise).rejects.toThrow("user stop");
		expect(fetch).toHaveBeenCalledOnce();
	});

	it("does not send a request when the signal is already aborted", async () => {
		const fetch = mockFetch();
		const signal = AbortSignal.abort(new Error("early"));

		await expect(client(fetch).tags.list({ signal })).rejects.toThrow("early");
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe("pagination", () => {
	const contact = (id: number) => ({ id, email: `c${id}@example.com` });

	it("walks each page with the cursor of the page before", async () => {
		const fetch = mockFetch(
			page([contact(1), contact(2)], "c2"),
			page([contact(3)], "c3"),
			page([], null),
		);
		const ids: number[] = [];

		for await (const item of client(fetch).contacts.list({ per_page: 2 })) {
			ids.push(item.id);
		}

		expect(ids).toEqual([1, 2, 3]);
		expect(callOf(fetch, 0).url.searchParams.get("cursor")).toBeNull();
		expect(callOf(fetch, 1).url.searchParams.get("cursor")).toBe("c2");
		expect(callOf(fetch, 2).url.searchParams.get("cursor")).toBe("c3");
		expect(callOf(fetch, 2).url.searchParams.get("per_page")).toBe("2");
	});

	it("starts at the given cursor", async () => {
		const fetch = mockFetch(page([contact(9)]));

		await client(fetch).contacts.list({ cursor: "start" }).toArray();

		expect(callOf(fetch).url.searchParams.get("cursor")).toBe("start");
	});

	it("loads the next page only when the loop needs it", async () => {
		const fetch = mockFetch(page([contact(1), contact(2)], "c2"));

		for await (const item of client(fetch).contacts.list()) {
			expect(item.id).toBe(1);
			break;
		}

		expect(fetch).toHaveBeenCalledOnce();
	});

	it("yields pages and collects items", async () => {
		const mailer = client(
			mockFetch(
				page([contact(1)], "c2"),
				page([contact(2)]),
				page([contact(1)], "c2"),
				page([contact(2)]),
			),
		);
		const pages: number[][] = [];

		for await (const each of mailer.contacts.list().pages()) {
			pages.push(each.data.map((item) => item.id));
		}

		expect(pages).toEqual([[1], [2]]);
		expect(
			(await mailer.contacts.list().toArray()).map((item) => item.id),
		).toEqual([1, 2]);
	});

	it("reuses the first page after an await", async () => {
		const fetch = mockFetch(page([contact(1)]));
		const list = client(fetch).contacts.list();

		expect((await list).meta.next_cursor).toBeNull();
		expect(await list.toArray()).toHaveLength(1);
		expect(fetch).toHaveBeenCalledOnce();
	});
});

describe("portability", () => {
	const sourceDir = join(import.meta.dirname, "..", "src");
	const files = readdirSync(sourceDir, {
		recursive: true,
		encoding: "utf8",
	}).filter((file) => file.endsWith(".ts"));
	const nodeModules = new Set(builtinModules);

	it.each(files)("%s imports no Node module and no dependency", (file) => {
		const source = readFileSync(join(sourceDir, file), "utf8");
		const specifiers = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
			(match) => match[1] ?? "",
		);

		for (const specifier of specifiers) {
			expect(
				specifier.startsWith("node:") || nodeModules.has(specifier),
				specifier,
			).toBe(false);
			expect(specifier.startsWith("."), `${specifier} is a dependency`).toBe(
				true,
			);
		}

		const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
		expect(code).not.toMatch(/\b(process|Buffer|require|__dirname)\b/);
	});
});

describe("types", () => {
	it("requires the fields of a live newsletter", () => {
		const draft: CreateNewsletterParams = { title: "Draft" };
		const live: CreateNewsletterParams = {
			status: "live",
			scheduled_at: new Date(),
			subject: "News",
			html_content: "<p>Hi</p>",
			email_identity_id: 4,
		};
		// @ts-expect-error A live newsletter needs a schedule and a sender.
		const noSchedule: CreateNewsletterParams = {
			status: "live",
			subject: "News",
		};
		// @ts-expect-error A draft takes no schedule.
		const draftSchedule: CreateNewsletterParams = {
			scheduled_at: "2026-12-01",
		};
		// @ts-expect-error An A/B test needs the B subject and content.
		const abTest: CreateNewsletterParams = { ab_test_enabled: true };

		expect([draft, live, noSchedule, draftSchedule, abTest]).toHaveLength(5);
	});

	it("requires the description on a topic update", () => {
		const mailer = client(mockFetch(json(200, { data: {} })));
		// @ts-expect-error The server clears a description that is left out.
		const call = mailer.topics.update(1, 2, { name: "News" });

		expect(call).toBeInstanceOf(Promise);
	});
});
