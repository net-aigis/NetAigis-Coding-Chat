# NetAigis Coding Chat

Independently maintained VS Code coding client from [AIGIS/cline](https://git.wittmer.software/AIGIS/cline.git).

- Publisher: `netaigis`
- Extension ID: `netaigis.netaigis-coding-chat`
- Fork version: `0.1.0` (independent SemVer)
- Upstream code base: Cline `v4.1.26`

Use an existing local model or provider configuration. An external Cline account is not required. Optional external providers keep their own names and endpoints.

The Acer **NetAigis Coding Agent** backend and independent Learning-Agent / TOTAL RECALL components retain their existing identities. This extension is project independent.

Existing data must be transferred explicitly through the verified identity migration. Old native secrets require an export in their owning old extension context; changing the package ID alone does not transfer them. Source data is retained for rollback. Productive migration requires checked recovery and explicit operator approval.

This development version has not completed productive acceptance. Version `1.0.0` follows that acceptance. Publisher availability must be verified separately before publication.

Derived from the [Cline upstream source](https://github.com/cline/cline), used as an external code source under Apache-2.0. Existing license and attribution files remain applicable.
