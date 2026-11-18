import { describe, expect, it } from "vitest";
import { Byomailer } from "../src/index";

// These tests call a real instance. They run only when both variables are
// set. They only read: they list contacts, lists and tags. They never send
// email, never schedule a newsletter and never send a webhook test delivery.
const baseUrl = process.env.BYOMAILER_TEST_URL;
const token = process.env.BYOMAILER_TEST_TOKEN;
const enabled =
	baseUrl !== undefined &&
	baseUrl !== "" &&
	token !== undefined &&
	token !== "";

// Vitest runs the body of a skipped `describe`, so make the client only
// inside a test. In CI, a secret that is not set is an empty string.
function client(): Byomailer {
	return new Byomailer({
		baseUrl: baseUrl ?? "",
		token: token ?? "",
		maxRetries: 1,
	});
}

describe.skipIf(!enabled)("integration (read-only)", () => {
	it("lists contacts", async () => {
		const page = await client().contacts.list({ per_page: 5 });

		expect(Array.isArray(page.data)).toBe(true);
		expect(page.meta).toHaveProperty("next_cursor");

		for (const contact of page.data) {
			expect(typeof contact.email).toBe("string");
			expect(Array.isArray(contact.extra_attributes)).toBe(false);
		}
	});

	it("lists lists", async () => {
		const page = await client().lists.list({ per_page: 5 });

		expect(Array.isArray(page.data)).toBe(true);
		expect(page.meta).toHaveProperty("next_cursor");
	});

	it("lists tags", async () => {
		const tags = await client().tags.list();

		expect(Array.isArray(tags)).toBe(true);
	});
});
