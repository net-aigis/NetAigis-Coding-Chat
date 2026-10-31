import vm from "node:vm"
import { describe, expect, it } from "vitest"
import { renderRecallSessionBrowser } from "./recall-session-browser"

describe("TOTAL RECALL browser message contract", () => {
	it("runs valid script, uses the handler's exact commands and renders untrusted session text without HTML", () => {
		const html = renderRecallSessionBrowser(),
			script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1]
		expect(script).toBeDefined()
		expect(html).toContain("default-src 'none'")
		expect(html).not.toContain("onclick=")
		class Element {
			textContent = ""
			children: Element[] = []
			listeners = new Map<string, () => void>()
			set innerHTML(_value: string) {
				throw new Error("Untrusted HTML rendering")
			}
			addEventListener(name: string, handler: () => void) {
				this.listeners.set(name, handler)
			}
			append(...items: Element[]) {
				this.children.push(...items)
			}
			replaceChildren() {
				this.children = []
			}
		}
		const elements = new Map(
			["list", "status", "snapshot", "refresh", "configure", "restore"].map((id) => [id, new Element()]),
		)
		const messages: unknown[] = []
		let receive: (event: { data: unknown }) => void = () => {}
		vm.runInNewContext(script!, {
			acquireVsCodeApi: () => ({ postMessage: (message: unknown) => messages.push(message) }),
			document: { getElementById: (id: string) => elements.get(id), createElement: () => new Element() },
			window: {
				addEventListener: (_name: string, handler: typeof receive) => {
					receive = handler
				},
			},
		})
		expect(messages).toEqual([{ command: "list-sessions" }])
		const conversationId = "author's <script>alert(1)</script> session"
		receive({ data: { cmd: "render", sessions: [{ conversationId, projectId: "independent-project", eventCount: 2 }] } })
		const row = elements.get("list")!.children[0]
		expect(row.children[0].textContent).toContain(conversationId)
		row.children[1].listeners.get("click")!()
		expect(messages.at(-1)).toEqual({ command: "read-session", conversationId })
		receive({
			data: { cmd: "snapshot", snapshot: { messages: [{ actor_id: "Friseer", payload: "<img onerror=alert(1)>" }] } },
		})
		expect(elements.get("snapshot")!.textContent).toContain("Friseer")
		expect(elements.get("status")!.textContent).toContain("keine laufende Aufgabe übernommen")
		receive({ data: { cmd: "snapshot", snapshot: { conversationId, journalSeq: 11 }, canRestore: true } })
		elements.get("restore")!.listeners.get("click")!()
		expect(messages.at(-1)).toEqual({ command: "restore-session", conversationId })
		receive({ data: { cmd: "restored", sessionId: conversationId } })
		expect(elements.get("status")!.textContent).toContain("kein Prozess gestartet und kein Schreibrecht erteilt")
	})
})
