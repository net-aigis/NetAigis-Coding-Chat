import { afterEach, describe, expect, it, vi } from "vitest";
import { attachHub, restartHub } from "./hub";
import type { HubContext } from "./state";

const mocks = vi.hoisted(() => ({
	connection: {
		endpoint: "ws://explicit-shared-fixture.invalid/hub",
		authToken: "fixture-credential",
	},
	create: vi.fn(),
	ensure: vi.fn(async () => ({
		url: "ws://separate-fixture.invalid/hub",
		authToken: "different-fixture",
	})),
	ui: vi.fn(),
	stop: vi.fn(),
}));
vi.mock("./deps", () => ({
	workspaceRoot: "/fixture",
	options: { sessionHub: mocks.connection },
}));
vi.mock("./connectors", () => ({ configureConnectorCliLaunch: vi.fn() }));
vi.mock("./session-mapping", () => ({
	parseSessionContext: () => undefined,
	formatClientDetails: () => "fixture",
	formatSessionCreator: () => "fixture",
	trackSession: () => undefined,
}));
vi.mock("@cline/core", () => ({
	ClineCore: { create: mocks.create },
	ensureDetachedHubServer: mocks.ensure,
	stopLocalHubServerGracefully: mocks.stop,
	toHubHealthUrl: () => "http://health-fixture.invalid",
	HubUIClient: class {
		constructor(options: unknown) {
			mocks.ui(options);
		}
		async connect() {}
		subscribeUI() {}
		async listClients() {
			return [];
		}
		async listSessions() {
			return [];
		}
	},
}));
afterEach(() => {
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});
describe("browser uses the same explicitly selected runtime as VS Code", () => {
	it("uses one configured endpoint for both clients without spawning another hub", async () => {
		mocks.create.mockResolvedValueOnce({ subscribe: () => () => {} });
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("{}", { status: 200 })),
		);
		const ctx = {
			peers: new Set(),
			clients: new Map(),
			sessions: new Map(),
			pushEvent: vi.fn(),
			broadcast: vi.fn(),
		} as unknown as HubContext;
		await attachHub(ctx);
		expect(mocks.ensure).not.toHaveBeenCalled();
		expect(mocks.create).toHaveBeenCalledWith(
			expect.objectContaining({
				backendMode: "remote",
				remote: expect.objectContaining(mocks.connection),
			}),
		);
		expect(mocks.ui).toHaveBeenCalledWith(
			expect.objectContaining({
				address: mocks.connection.endpoint,
				authToken: mocks.connection.authToken,
			}),
		);
	});
	it("does not fall back to a new runtime when the selected hub cannot connect", async () => {
		mocks.create.mockRejectedValueOnce(
			new Error("fixture shared runtime unavailable"),
		);
		const ctx = {} as HubContext;
		await expect(attachHub(ctx)).rejects.toThrow(
			"fixture shared runtime unavailable",
		);
		expect(mocks.ensure).not.toHaveBeenCalled();
	});
	it("does not restart a separately managed shared runtime from the browser", async () => {
		const ctx = { externalHub: true } as unknown as HubContext;
		await expect(restartHub(ctx)).rejects.toThrow("separately");
		expect(mocks.stop).not.toHaveBeenCalled();
	});
});
