// Smoke check for the built package. Each runtime entry point imports the
// package in its own way, then calls `check()` with the module.
const SECRET = "whsec_test0123456789abcdefghijklmnopqrstuvwxyz";
const TIMESTAMP = "1763460000";
const BODY =
	'{"event":"webhook.test","occurred_at":"2025-11-18T10:00:00+00:00","message":"This is a test delivery from BYOMailer."}';
const SIGNATURE =
	"sha256=2bbcce6a57f70cc24e7302fd45fe31785c1fa002cdc0e8d2da3385b5710a65f6";

export async function check(sdk, runtime) {
	const event = await sdk.verifyWebhook({
		body: BODY,
		headers: {
			"x-byomailer-timestamp": TIMESTAMP,
			"x-byomailer-signature": SIGNATURE,
		},
		secret: SECRET,
		now: new Date(Number(TIMESTAMP) * 1000),
	});

	if (event.type !== "webhook.test" || event.deliveryId !== null) {
		throw new Error(`${runtime}: the webhook vector did not verify.`);
	}

	const mailer = new sdk.Byomailer({
		baseUrl: "https://mail.example.com",
		token: "smoke-token",
		maxRetries: 0,
		fetch: async () =>
			new Response(JSON.stringify({ message: "Not found." }), {
				status: 404,
				headers: { "content-type": "application/json" },
			}),
	});

	try {
		await mailer.contacts.get(1);
		throw new Error(`${runtime}: the call did not fail.`);
	} catch (error) {
		if (!(error instanceof sdk.NotFoundError) || error.code !== "not_found") {
			throw error;
		}
	}

	console.log(`${runtime}: the smoke check passed.`);
}
