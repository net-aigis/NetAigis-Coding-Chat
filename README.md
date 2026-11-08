# NetAigis Coding Chat

Independent coding-agent fork maintained by **NetAigis** (GitHub user `net-aigis`).

This repository is **not** part of the Cline GitHub organization. It is not a
GitHub network fork of [`cline/cline`](https://github.com/cline/cline). Upstream
Cline is only a read-only code reference. Cline cannot push here, change
settings, or publish releases for this project.

| | |
| --- | --- |
| Product | NetAigis Coding Chat |
| Extension id (target) | `netaigis.netaigis-coding-chat` |
| Fork version target | `0.1.0` (development; no Marketplace release yet) |
| Website | [net-aigis.de/coding-chat.html](https://net-aigis.de/coding-chat.html) |
| Independence note | [`.github/NETAIGIS_FORK.md`](.github/NETAIGIS_FORK.md) |

## Status

**Development.** There is no public VSIX, Marketplace or website download yet.
Do not treat this tree as a finished product release.

Work in progress includes a VS Code extension identity under NetAigis, a companion
hub, and local / self-hosted model use without a Cline cloud account requirement.

## Support

Voluntary support for this NetAigis project:

- [GitHub Sponsors](https://github.com/sponsors/net-aigis?metadata_project=NetAigis-Coding-Chat)
- [PayPal](https://www.paypal.com/ncp/payment/CH7T8EWYR7C4W)

## What this is (and is not)

- **Is:** a NetAigis-maintained fork based on the open-source Cline coding agent.
- **Is not:** the official Cline product, Discord, docs site, Marketplace listing
  (`saoudrizwan.claude-dev`), JetBrains plugin store entry, or `cline.bot` cloud service.
- **Does not** ship Cline org install links or “Join us / careers” pages from this README.

## Layout (this repository)

| Area | Path |
| --- | --- |
| VS Code extension | [`apps/vscode/`](apps/vscode/) |
| Hub | [`apps/cline-hub/`](apps/cline-hub/) |
| Shared agent / SDK packages | [`sdk/`](sdk/) |
| Provenance | [`fork-provenance.json`](fork-provenance.json) |

Exact CLI / desktop / JetBrains packaging for NetAigis is not claimed as released
here. Follow commits and product pages for what is actually ready.

## Upstream attribution

Substantial code originates from [cline/cline](https://github.com/cline/cline)
(Apache-2.0). License and copyright notices in [`LICENSE`](./LICENSE) and the
source tree remain authoritative. Pulling upstream changes is a deliberate local
decision; nothing from Cline is applied automatically to this repository.

## Bugs, feedback and security

- **Bugs and feature ideas:** open a GitHub Issue on **this** repository
  ([New issue](https://github.com/net-aigis/NetAigis-Coding-Chat/issues/new/choose)).
  Use the Bug report or Feature request templates.
- **Security vulnerabilities:** do **not** file a public issue. Use
  [private vulnerability reporting](https://github.com/net-aigis/NetAigis-Coding-Chat/security/advisories/new)
  or email info@net-aigis.de (see [`SECURITY.md`](SECURITY.md)).
- Do not open NetAigis-specific requests against the Cline organization.

## License

See [`LICENSE`](./LICENSE) (Apache-2.0, including upstream Cline Bot Inc. notices
where they appear in the inherited license text).
