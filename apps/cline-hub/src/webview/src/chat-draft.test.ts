import { afterEach, expect, it, vi } from "vitest";
import { ChatDrafts, chatDraftKey, forgetActorDrafts } from "./chat-draft";
function storage(): Storage {
	const entries = new Map<string, string>();
	return {
		get length() {
			return entries.size;
		},
		getItem: (key) => entries.get(key) ?? null,
		setItem: (key, value) => {
			entries.set(key, value);
		},
		removeItem: (key) => {
			entries.delete(key);
		},
		key: (index) => [...entries.keys()][index] ?? null,
		clear: () => entries.clear(),
	};
}
afterEach(() => vi.unstubAllGlobals());
it("restores an exact unsent draft after recreation and separates actors, sessions and new workspace chats", () => {
	const store = storage(),
		saved = new ChatDrafts(() => store);
	const a = chatDraftKey("Friseer", "same"),
		b = chatDraftKey("jimmi", "same"),
		other = chatDraftKey("Friseer", "other"),
		fresh = chatDraftKey("Friseer", undefined, "/workspace");
	saved.write(a, "Ursprünglicher Auftrag\nKorrektur äöü");
	saved.write(b, "jimmi draft");
	saved.write(fresh, "New chat");
	const cold = new ChatDrafts(() => store);
	expect(cold.read(a)).toEqual({
		text: "Ursprünglicher Auftrag\nKorrektur äöü",
		persistent: true,
	});
	expect(cold.read(b).text).toBe("jimmi draft");
	expect(cold.read(other).text).toBe("");
	expect(cold.read(fresh).text).toBe("New chat");
	expect(chatDraftKey(undefined, "same")).toBeUndefined();
	expect(chatDraftKey("Friseer")).toBeUndefined();
	cold.write(a, "");
	expect(new ChatDrafts(() => store).read(a).text).toBe("");
	expect(cold.read(b).text).toBe("jimmi draft");
});
it("keeps text in memory and reports unavailable persistence instead of throwing or inventing a saved draft", () => {
	const store = storage();
	const key = chatDraftKey("Friseer", "same");
	store.setItem(key!, JSON.stringify({ version: 1, text: "Old saved draft" }));
	store.setItem = () => {
		throw new Error("Quota");
	};
	const drafts = new ChatDrafts(() => store);
	expect(drafts.write(key, "Retain me")).toBe(false);
	expect(drafts.read(key)).toEqual({ text: "Retain me", persistent: false });
	const blocked = new ChatDrafts(() => {
		throw new Error("Blocked");
	});
	expect(blocked.write(key, "Retained in this view")).toBe(false);
	expect(blocked.read(key)).toEqual({
		text: "Retained in this view",
		persistent: false,
	});
});
it("does not delete malformed drafts and purges only the confirmed actor's drafts on explicit sign-out", () => {
	const store = storage(),
		a = chatDraftKey("Friseer", "same")!,
		b = chatDraftKey("jimmi", "same")!;
	store.setItem(a, "malformed");
	store.setItem(b, JSON.stringify({ version: 1, text: "jimmi" }));
	store.setItem("unrelated", "retained");
	expect(new ChatDrafts(() => store).read(a)).toEqual({
		text: "",
		persistent: false,
	});
	expect(store.getItem(a)).toBe("malformed");
	vi.stubGlobal("window", { sessionStorage: store });
	forgetActorDrafts("Friseer");
	expect(store.getItem(a)).toBeNull();
	expect(store.getItem(b)).not.toBeNull();
	expect(store.getItem("unrelated")).toBe("retained");
});
