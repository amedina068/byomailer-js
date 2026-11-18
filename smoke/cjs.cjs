// Loads the CJS build through the `exports` map of package.json.
const sdk = require("byomailer");

import("./check.mjs")
	.then(({ check }) => check(sdk, `Node ${process.version} (CJS)`))
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
