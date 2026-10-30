import { createAgentRuntime } from "@cline/agents";
import type { AgentConfig, AgentModel } from "@cline/shared";
import { describe, expect, it } from "vitest";
import { SessionRuntime } from "./session-runtime-orchestrator";

function fixture(
	options: {
		calls?: number;
		loopDetection?: false;
		hooks?: AgentConfig["hooks"];
		batchSize?: number;
		toolName?: string;
		inputForCall?: (call: number) => Record<string, unknown>;
	} = {},
) {
	const executed: string[] = [];
	const sessionIds: unknown[] = [];
	let requests = 0;
	const model: AgentModel = {
		async stream(request) {
			requests++;
			const metadata = request.options?.metadata as
				| Record<string, unknown>
				| undefined;
			sessionIds.push(metadata?.sessionId);
			const call = requests;
			return (async function* () {
				if (options.calls === undefined || call <= options.calls) {
					for (let index = 0; index < (options.batchSize ?? 1); index++) {
						yield {
							type: "tool-call-delta" as const,
							toolCallId: `call-${call}-${index}`,
							toolName: options.toolName ?? "probe",
							inputText: JSON.stringify(
								options.inputForCall?.(call) ?? { value: 1 },
							),
						};
					}
					yield { type: "finish" as const, reason: "tool-calls" as const };
				} else {
					yield { type: "text-delta" as const, text: "done" };
					yield { type: "finish" as const, reason: "stop" as const };
				}
			})();
		},
	};
	const session = new SessionRuntime(
		{
			providerId: "openai-compatible",
			modelId: "configured-local-125b-fixture",
			apiKey: "fixture-key",
			sessionId: "preserved-fork-session",
			systemPrompt: "Use the fixture tool.",
			tools: [
				{
					name: options.toolName ?? "probe",
					description: "Count executions without external effects",
					inputSchema: {
						type: "object",
						properties: { value: { type: "number" } },
						required: ["value"],
					},
					execute: async (input) => {
						executed.push(JSON.stringify(input));
						return "ok";
					},
				},
			],
			execution: {
				loopDetection: options.loopDetection ?? {
					softThreshold: 2,
					hardThreshold: 3,
				},
			},
			hooks: options.hooks,
		},
		{
			createAgentRuntimeImpl: (config) =>
				createAgentRuntime({ ...config, model }),
		},
	);
	return { session, executed, sessionIds, requests: () => requests };
}

describe("fork guard composed with the v4.1.26 runtime", () => {
	it("refuses the rest of a prepared batch after the hard stop", async () => {
		const f = fixture({ batchSize: 6 });
		await f.session.run("start");
		expect(f.executed).toHaveLength(0);
		expect(f.requests()).toBe(1);
	});

	it("stops changing sleep durations before another wait executes", async () => {
		const f = fixture({
			toolName: "run_commands",
			inputForCall: (call) => ({ commands: [`sleep ${call}`] }),
		});
		await f.session.run("start");
		expect(f.executed).toHaveLength(2);
		expect(f.requests()).toBe(3);
	});

	it("stops before a repeated tool can execute at the hard threshold", async () => {
		const f = fixture();
		await f.session.run("start");
		expect(f.executed).toHaveLength(2);
		expect(f.requests()).toBe(3);
		expect(f.sessionIds).toEqual([
			"preserved-fork-session",
			"preserved-fork-session",
			"preserved-fork-session",
		]);
	});

	it("starts a fresh conversation with a fresh loop counter", async () => {
		const f = fixture();
		await f.session.run("first");
		await f.session.run("second");
		expect(f.executed).toHaveLength(4);
		expect(f.requests()).toBe(6);
	});

	it("allows the explicitly disabled guard to finish a finite tool sequence", async () => {
		const f = fixture({ calls: 4, loopDetection: false });
		const result = await f.session.run("start");
		expect(f.executed).toHaveLength(4);
		expect(result.text).toBe("done");
	});

	it("checks the input transformed by existing hooks", async () => {
		let value = 0;
		const f = fixture({
			calls: 4,
			hooks: { beforeTool: () => ({ input: { value: ++value } }) },
		});
		const result = await f.session.run("start");
		expect(f.executed).toEqual([
			'{"value":1}',
			'{"value":2}',
			'{"value":3}',
			'{"value":4}',
		]);
		expect(result.text).toBe("done");
	});
});
