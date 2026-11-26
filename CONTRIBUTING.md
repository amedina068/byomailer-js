# Contributing

Thank you for your help. This file tells you how to set up the project and how to send a change.

## Set up

1. Install Node.js 22 or later. The build tools need Node.js 22. The package itself runs on Node.js 20.
2. Clone the repository.
3. Run `npm ci`.

## Commands

| Command                 | What it does                                                            |
| ----------------------- | ----------------------------------------------------------------------- |
| `npm test`              | Runs the unit tests with Vitest.                                        |
| `npm run typecheck`     | Runs `tsc --noEmit` on the source and on the tests.                     |
| `npm run lint`          | Runs Biome for lint and format.                                         |
| `npm run format`        | Applies the Biome format and the safe fixes.                            |
| `npm run build`         | Builds `dist/` with tsdown.                                             |
| `npm run check:package` | Runs publint and Are the Types Wrong on the package.                    |
| `npm run smoke:node`    | Imports the build in Node.js (ESM and CommonJS) and verifies a webhook. |
| `npm run smoke:bun`     | Does the same check in Bun.                                             |
| `npm run smoke:deno`    | Does the same check in Deno.                                            |

Run the smoke commands after `npm run build`.

## Integration tests

The integration tests call a real BYOMailer instance. They only read data: they list contacts, lists and tags.

1. Set `BYOMAILER_TEST_URL` to the root URL of the instance.
2. Set `BYOMAILER_TEST_TOKEN` to an API token. A read-only token is enough.
3. Run `npm test`.

If one of the two variables is not set, Vitest skips the integration tests.

Do not add an integration test that sends email, schedules a newsletter or sends a webhook test delivery.

## Webhook signature vectors

`test/fixtures/webhook-signature-vectors.json` comes from the BYOMailer app. The app script `gen-vectors.php` makes it with the signing code of the app. Do not edit the file by hand. If the app changes the signature, copy the new file.

## Rules for code

- Add no runtime dependency.
- Do not import a Node.js module in `src/`. A test in `test/client.test.ts` makes sure of this.
- Use the global `fetch` and Web Crypto only.
- Mock `fetch` in tests. Do not mock modules.
- Add a test for each change in behavior.
- Use `example.com` data in examples and tests. Do not commit a token or a secret.

## Rules for text

Write documentation, comments and commit messages in Simple English (ASD-STE100, pragmatic mode):

- Write procedures in the imperative, with 20 words or fewer in each sentence.
- Write descriptions with 25 words or fewer in each sentence.
- Use the active voice.
- Use one word for one meaning.
- Do not use contractions or semicolons.
- Do not use "should", "may", "might", "could" or "would".

## Send a change

1. Make a branch from `main`.
2. Make the change and its tests.
3. Run `npm run lint`, `npm run typecheck` and `npm test`.
4. Add a line to `CHANGELOG.md` under the next version.
5. Open a pull request and fill in the form.

## Pull request titles

The title of each pull request must follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). The `PR title` check fails when the title does not follow the format. Examples:

- `feat: add contacts.subscribe()`
- `fix(webhooks): accept a signature in upper case`
- `docs: add a Deno example to the README`

Use one of these types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` or `revert`. The scope in parentheses is optional.

GitHub makes the release notes from the titles of the merged pull requests. Write each title for a person who reads the release notes.

## Release

The `Release` workflow (`.github/workflows/release.yml`) publishes the package to npm with trusted publishing (OIDC). GitHub gives the job a short-lived token. The repository has no npm secret. The workflow runs only by hand, in the `npm` environment. This environment accepts only the `main` branch and the `v*` tags.

1. Set the new version: `npm version <version> --no-git-tag-version`. This command changes `package.json` and `package-lock.json`.
2. In `CHANGELOG.md`, move the lines under `Unreleased` to a new section `## [<version>] - <date>`.
3. Open a pull request with these changes. Merge it.
4. Start a test run: `gh workflow run release.yml --ref main`. The `dry-run` input is on by default, so the workflow packs the package but does not publish it.
5. Read the log of the test run. Make sure that the package contains the correct files.
6. Publish the package: `gh workflow run release.yml --ref main -f dry-run=false`.
7. Create the GitHub release `v<version>`. Use the section of `CHANGELOG.md` as the notes.

### First release

npm accepts a trusted publisher only for a package that exists. Thus the first version needs two more steps:

1. Publish the first version one time from a local clone: `npm publish --access public`.
2. On npmjs.com, open the settings of the package. Add a trusted publisher for GitHub Actions: owner `amedina068`, repository `byomailer-js`, workflow `release.yml`, environment `npm`.

## Triage

Each issue form adds a type label and the `needs-triage` label to a new issue. The maintainer reads each new issue, removes `needs-triage` and sets the correct type label: `bug`, `enhancement`, `documentation` or `question`.

## Code of conduct

This project uses the [Contributor Covenant](CODE_OF_CONDUCT.md). By your participation, you agree to obey it.
