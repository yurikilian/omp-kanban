import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeToSessionChanges } from "./live-stream";

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly close = vi.fn();
  readonly listeners = new Map<string, Set<(event: Event) => void>>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callback =
      typeof listener === "function" ? listener : (event: Event) => listener.handleEvent(event);
    const listeners = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    listeners.add(callback);
    this.listeners.set(type, listeners);
  }

  emit(type: string, data: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data }));
    }
  }
}

afterEach(() => {
  FakeEventSource.instances = [];
  vi.unstubAllGlobals();
});

describe("subscribeToSessionChanges", () => {
  it("shares one same-origin server-push stream across subscribers and carries only the changed session id (E3-S9-AC6)", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const firstSubscriber = vi.fn();
    const secondSubscriber = vi.fn();

    const unsubscribeFirst = subscribeToSessionChanges(firstSubscriber);
    const unsubscribeSecond = subscribeToSessionChanges(secondSubscriber);

    expect(FakeEventSource.instances).toHaveLength(1);
    const stream = FakeEventSource.instances[0];
    expect(stream.url).toBe("/api/stream");

    stream.emit("session-change", JSON.stringify({ sessionId: "session-1" }));

    expect(firstSubscriber).toHaveBeenCalledWith({ sessionId: "session-1" });
    expect(secondSubscriber).toHaveBeenCalledWith({ sessionId: "session-1" });

    unsubscribeFirst();
    expect(stream.close).not.toHaveBeenCalled();

    unsubscribeSecond();
    expect(stream.close).toHaveBeenCalledOnce();
  });
});