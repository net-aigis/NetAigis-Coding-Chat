import { expect, it } from "vitest";
import {
	BrowserActorSessions,
	readActorCredential,
} from "./browser-actor-sessions";
import { isAuthorizedBrowserToDesktopRequest } from "./browser-auth";

function request(cookie?: string) {
	return new Request("https://fixture.invalid/actor-session", {
		headers: cookie ? { cookie } : {},
	});
}
function cookie(header: string) {
	return header.split(";")[0];
}

it("keeps persistent login and logout behind the existing invite, exact Host and same-origin checks", () => {
	const url = new URL(
		"https://192.168.178.25:8787/actor-session?roomSecret=fixture-invite",
	);
	const options = {
		bindHost: "192.168.178.25",
		port: 8787,
		publicUrl: "https://192.168.178.25:8787",
		roomSecret: "fixture-invite",
	};
	for (const method of ["POST", "DELETE"]) {
		for (const [origin, host, allowed] of [
			[options.publicUrl, "192.168.178.25:8787", true],
			["https://foreign.invalid", "192.168.178.25:8787", false],
			["", "192.168.178.25:8787", false],
			[options.publicUrl, "foreign.invalid", false],
		] as const) {
			const req = new Request(url.toString(), {
				method,
				headers: { origin, host },
			});
			expect(
				isAuthorizedBrowserToDesktopRequest(req, url, options, () => false),
			).toBe(allowed);
		}
		const withoutInvite = new URL(url);
		withoutInvite.search = "";
		const req = new Request(withoutInvite.toString(), {
			method,
			headers: { origin: options.publicUrl, host: "192.168.178.25:8787" },
		});
		expect(
			isAuthorizedBrowserToDesktopRequest(
				req,
				withoutInvite,
				options,
				() => false,
			),
		).toBe(false);
	}
});

it("retains an opaque browser ticket instead of exposing the personal key, with host-only secure HttpOnly strict flags", () => {
	const sessions = new BrowserActorSessions();
	const header = sessions.issue(request(), "Friseer", "fixture-personal-key");
	expect(header).not.toContain("fixture-personal-key");
	expect(header).toMatch(
		/^__Host-netaigis_actor=[a-f0-9]{64}; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=43200$/,
	);
	expect(sessions.read(request(cookie(header)))).toMatchObject({
		actorId: "Friseer",
		credential: "fixture-personal-key",
	});
	expect(sessions.read(request())).toBeUndefined();
});
it("expires tickets and never falls back from a missing/invalid browser key to another actor", () => {
	let now = 1000;
	const sessions = new BrowserActorSessions(() => now);
	const header = sessions.issue(request(), "jimmi", "fixture-jimmi");
	now += 43200000;
	expect(sessions.read(request(cookie(header)))).toBeUndefined();
	expect(
		sessions.read(request("__Host-netaigis_actor=invalid")),
	).toBeUndefined();
	expect(
		sessions.read(request(`${cookie(header)}; ${cookie(header)}`)),
	).toBeUndefined();
});
it("rotates a browser's previous ticket and revokes only its session", () => {
	const sessions = new BrowserActorSessions();
	const first = cookie(sessions.issue(request(), "Friseer", "fixture-one"));
	const separate = cookie(sessions.issue(request(), "jimmi", "fixture-two"));
	const second = cookie(
		sessions.issue(request(first), "Friseer", "fixture-one"),
	);
	expect(sessions.read(request(first))).toBeUndefined();
	expect(sessions.read(request(separate))?.actorId).toBe("jimmi");
	expect(sessions.remove(request(second))).toContain("Max-Age=0");
	expect(sessions.read(request(second))).toBeUndefined();
	expect(sessions.read(request(separate))?.actorId).toBe("jimmi");
});
it("bounds retained credentials and clears tickets when the dashboard closes", () => {
	const sessions = new BrowserActorSessions();
	const first = cookie(sessions.issue(request(), "Friseer", "fixture-one"));
	let latest = "";
	for (let index = 0; index < 256; index++)
		latest = cookie(sessions.issue(request(), "Friseer", "fixture-one"));
	expect(sessions.read(request(first))).toBeUndefined();
	expect(sessions.read(request(latest))?.actorId).toBe("Friseer");
	sessions.clear();
	expect(sessions.read(request(latest))).toBeUndefined();
});
it("reads bounded JSON without URL credentials or secret-bearing error messages", async () => {
	const post = (body: string, contentType = "application/json") =>
		new Request("https://fixture.invalid/actor-session", {
			method: "POST",
			headers: { "content-type": contentType },
			body,
		});
	expect(
		await readActorCredential(
			post(JSON.stringify({ credential: "fixture-private" })),
		),
	).toBe("fixture-private");
	for (const input of [
		post('{"credential":"fixture-private'),
		post(JSON.stringify({ credential: "fixture-private" }), "text/plain"),
		post(JSON.stringify({ credential: "fixture-private".repeat(1000) })),
	]) {
		try {
			await readActorCredential(input);
			throw new Error("Unexpected success");
		} catch (error) {
			expect(String(error)).toContain("Invalid browser authentication request");
			expect(String(error)).not.toContain("fixture-private");
		}
	}
});
