# SEO keyword map

Research basis: web searches on 2026-09-30 for the phrases people use when comparing API
clients (results pages for "postman alternative", "open source api client", "offline api
client", "git api client", "bruno alternative", "insomnia alternative", "mcp api client",
and "import postman collection"). The results are dominated by roundup lists
("Best N Postman alternatives"), GitHub topic pages (`postman-alternative`,
`bruno-alternative`) and tool sites such as Bruno's own comparison and migration pages.
Searchers pair "alternative" with the word for what they dislike about Postman:
account, cloud, price, bloat. Tiger's honest differentiators are the matching words:
offline, no account, git, open source, MCP.

One primary keyword per page, so the pages do not compete with each other.
Titles are at most 60 characters, descriptions at most 155 (enforced by
`node scripts/check-site.mjs`).

## Keyword to page

| Page | Primary keyword | Secondary keywords |
|---|---|---|
| `/` | postman alternative | open source api client, git api client, api client mac windows linux |
| `/alternatives/postman/` | postman alternative no account | free postman alternative, offline postman alternative |
| `/compare/` | postman vs bruno vs insomnia | api client comparison, best api client |
| `/compare/tiger-vs-postman/` | tiger vs postman | postman open source alternative |
| `/compare/tiger-vs-bruno/` | bruno alternative | bruno vs tiger, git native api client |
| `/compare/tiger-vs-insomnia/` | insomnia alternative | insomnia open source alternative |
| `/compare/tiger-vs-hoppscotch/` | hoppscotch alternative | desktop api client |
| `/guides/postman-to-tiger/` | migrate from postman | import postman collection |
| `/docs/importing/` (not edited here) | import postman collection | import insomnia, import openapi, import wsdl |
| `/use-cases/mcp-api-client/` | mcp api client | ai api testing, claude api client |
| `/docs/mcp/` | mcp server api client | claude desktop mcp, cursor mcp |
| `/docs/getting-started/` | git api client | git native api client, what is tiger |
| `/docs/install/` | api client for windows | api client mac, api client linux, portable api client |
| `/docs/first-request/` | api client quickstart | send first api request |
| `/docs/tiger-format/` | api requests as plain text files | .tiger format |
| `/docs/collections/` | api collections in git | api collection folder |
| `/docs/variables/` | api variables and environments | dynamic variables |
| `/docs/requests-auth/` | oauth 2.0 api client | api client mtls, graphql client |
| `/docs/environments/` | offline api client environments | api secrets |
| `/docs/scripts/` | api tests and scripts | api request chaining |
| `/docs/runner/` | api collection runner | api load test, p95 latency |
| `/docs/response/` | api response viewer | search json response |
| `/docs/git/` | git api client team sync | share api collection git |
| `/docs/faq/` | offline api client no account | tiger faq |
| `/privacy/` | (none, informational) | |

## GitHub README and repository

| Surface | Keywords |
|---|---|
| Repo description | free open source api client, postman alternative, bruno alternative, insomnia alternative, git-native, offline, MCP |
| README H1 and first paragraph | git-native API client, Postman alternative, offline API client, git-based API client, MCP server |
| Topics | see the `gh repo edit` command in the PR description |

## Rules for this copy

- No invented user counts, stars, reviews or "trusted by".
- Every feature claim is checked against `src/` before it is written.
- Microsoft Store and winget are "coming soon" until they are live. Do not link them.
- No em dashes.
- Use the 0.7.0 names: Save values, Scripts & tests, Load test, Team sync, AI assistants (MCP).

## Not done here

- `website/docs/importing/index.html` was left alone (another change owns it). It still lacks
  Open Graph `og:url`, `twitter:card` and breadcrumb JSON-LD; `check-site.mjs` reports these
  as warnings. Suggested title: "Import Postman, Insomnia, Bruno, OpenAPI to Tiger".
- Submit `https://jtaoufik.github.io/tiger/sitemap.xml` in Google Search Console and Bing
  Webmaster Tools (needs the owner's login).
