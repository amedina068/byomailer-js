import { segment } from "../core/query";
import type { RequestOptions, Transport } from "../core/transport";
import { type PagePromise, paginate } from "../pagination";
import type {
	PageParams,
	WebhookDelivery,
	WebhookEndpoint,
	WebhookEndpointWithSecret,
	WebhookEventType,
} from "../types";

/** The fields of `webhookEndpoints.create()`. */
export interface CreateWebhookEndpointParams {
	/** A public `https` URL. */
	url: string;
	/** One or more event types. */
	events: readonly WebhookEventType[];
	description?: string | null;
}

/**
 * The fields of `webhookEndpoints.update()`. The URL and the events do not
 * change. To change them, delete the endpoint and create a new one.
 */
export interface UpdateWebhookEndpointParams {
	active?: boolean;
	description?: string | null;
}

/**
 * `/webhook-endpoints`: the URLs that get a signed POST for each event. Only
 * a token of an admin user can use these calls.
 */
export class WebhookEndpoints {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Lists the webhook endpoints, newest first. */
	list(
		params: PageParams = {},
		options: RequestOptions = {},
	): PagePromise<WebhookEndpoint> {
		return paginate(
			this.#transport,
			"/webhook-endpoints",
			{ ...params },
			options,
		);
	}

	/** Reads one webhook endpoint. The result has no secret. */
	async get(
		endpointId: number,
		options: RequestOptions = {},
	): Promise<WebhookEndpoint> {
		const body = await this.#transport.request<{ data: WebhookEndpoint }>(
			{ method: "GET", path: `/webhook-endpoints/${segment(endpointId)}` },
			options,
		);

		return body.data;
	}

	/**
	 * Creates a webhook endpoint. The result has the signing secret. Store it,
	 * because no other call shows it again.
	 */
	async create(
		params: CreateWebhookEndpointParams,
		options: RequestOptions = {},
	): Promise<WebhookEndpointWithSecret> {
		const body = await this.#transport.request<{
			data: WebhookEndpointWithSecret;
		}>({ method: "POST", path: "/webhook-endpoints", json: params }, options);

		return body.data;
	}

	/** Turns an endpoint on or off, or changes its description. */
	async update(
		endpointId: number,
		params: UpdateWebhookEndpointParams,
		options: RequestOptions = {},
	): Promise<WebhookEndpoint> {
		const body = await this.#transport.request<{ data: WebhookEndpoint }>(
			{
				method: "PATCH",
				path: `/webhook-endpoints/${segment(endpointId)}`,
				json: params,
				idempotent: true,
			},
			options,
		);

		return body.data;
	}

	/** Deletes a webhook endpoint. */
	async delete(
		endpointId: number,
		options: RequestOptions = {},
	): Promise<void> {
		await this.#transport.request(
			{ method: "DELETE", path: `/webhook-endpoints/${segment(endpointId)}` },
			options,
		);
	}

	/** Lists the deliveries of an endpoint, newest first. */
	deliveries(
		endpointId: number,
		params: PageParams = {},
		options: RequestOptions = {},
	): PagePromise<WebhookDelivery> {
		return paginate(
			this.#transport,
			`/webhook-endpoints/${segment(endpointId)}/deliveries`,
			{ ...params },
			options,
		);
	}

	/**
	 * Replaces the signing secret. The old secret stops working at once.
	 * The result has the new secret. Store it.
	 */
	async rotateSecret(
		endpointId: number,
		options: RequestOptions = {},
	): Promise<WebhookEndpointWithSecret> {
		const body = await this.#transport.request<{
			data: WebhookEndpointWithSecret;
		}>(
			{
				method: "POST",
				path: `/webhook-endpoints/${segment(endpointId)}/secret`,
			},
			options,
		);

		return body.data;
	}

	/**
	 * Queues a `webhook.test` delivery to the endpoint and returns it with the
	 * status `pending`. The server allows 10 calls a minute.
	 */
	async sendTest(
		endpointId: number,
		options: RequestOptions = {},
	): Promise<WebhookDelivery> {
		const body = await this.#transport.request<{ data: WebhookDelivery }>(
			{
				method: "POST",
				path: `/webhook-endpoints/${segment(endpointId)}/test`,
			},
			options,
		);

		return body.data;
	}
}
