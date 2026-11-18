import type { QueryParams } from "./core/query";
import type { RequestOptions, Transport } from "./core/transport";
import type { CursorPage } from "./types";

/**
 * Makes a `PagePromise` for a GET endpoint with cursor pagination. `map`
 * changes each item, for example to fix the shape of an empty map.
 */
export function paginate<TItem>(
	transport: Transport,
	path: string,
	query: QueryParams & { cursor?: string },
	options: RequestOptions,
	map: (item: TItem) => TItem = (item) => item,
): PagePromise<TItem> {
	return new PagePromise(async (cursor) => {
		const page = await transport.request<CursorPage<TItem>>(
			{ method: "GET", path, query: { ...query, cursor } },
			options,
		);

		return { ...page, data: page.data.map(map) };
	}, query.cursor);
}

/**
 * The result of a list call. Use `await` to get the first page. Use
 * `for await` to get each item of each page. The SDK loads a page only when
 * the loop needs it.
 *
 * @example
 * const page = await mailer.contacts.list()
 * for await (const contact of mailer.contacts.list()) {
 * 	console.log(contact.email)
 * }
 */
export class PagePromise<TItem>
	implements PromiseLike<CursorPage<TItem>>, AsyncIterable<TItem>
{
	readonly #load: (cursor: string | undefined) => Promise<CursorPage<TItem>>;
	readonly #start: string | undefined;
	#first: Promise<CursorPage<TItem>> | undefined;

	constructor(
		load: (cursor: string | undefined) => Promise<CursorPage<TItem>>,
		start?: string,
	) {
		this.#load = load;
		this.#start = start;
	}

	// biome-ignore lint/suspicious/noThenProperty: The class is awaitable on purpose.
	then<TResult1 = CursorPage<TItem>, TResult2 = never>(
		onfulfilled?:
			| ((page: CursorPage<TItem>) => TResult1 | PromiseLike<TResult1>)
			| null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
	): Promise<TResult1 | TResult2> {
		return this.#firstPage().then(onfulfilled, onrejected);
	}

	/** Yields each page, from the first page to the last page. */
	async *pages(): AsyncGenerator<CursorPage<TItem>, void, undefined> {
		let page = await this.#firstPage();

		while (true) {
			yield page;

			const next = page.meta.next_cursor;

			if (next === null) {
				return;
			}

			page = await this.#load(next);
		}
	}

	/** Yields each item of each page. */
	async *[Symbol.asyncIterator](): AsyncGenerator<TItem, void, undefined> {
		for await (const page of this.pages()) {
			yield* page.data;
		}
	}

	/** Loads every item into one array. Use it only for short lists. */
	async toArray(): Promise<TItem[]> {
		const items: TItem[] = [];

		for await (const item of this) {
			items.push(item);
		}

		return items;
	}

	#firstPage(): Promise<CursorPage<TItem>> {
		this.#first ??= this.#load(this.#start);

		return this.#first;
	}
}
