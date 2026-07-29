import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuditJob } from "@/server/audits/types";
import type { SessionDetail as SessionDetailData } from "@/server/sessions/detail";
import { SessionDetail } from "./session-detail";

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

const session: SessionDetailData = {
  id: "2026-01-01T09-00-00-000Z_00000000-0000-7000-8000-00000000000a",
  title: "Refactor billing module",
  project: "alpha",
  startedAt: "2026-01-01T09:00:00.000Z",
  lastActivityAt: "2026-01-01T09:10:00.000Z",
  durationMs: 10 * 60 * 1000,
  costUsd: 0.015,
  inputTokens: 1500,
  outputTokens: 300,
  agentCount: 1,
  toolCallCount: 1,
  status: {
    label: "Completed",
    derived: true,
    basis: "a normal session exit event",
  },
};

function mockAuditHistoryRequests(readHistory: () => readonly AuditJob[]) {
  const fetchMock = vi.fn((input: string, init?: RequestInit) => {
    const responseBody = input.startsWith("/api/audits?") ? readHistory() : [];
    return Promise.resolve({ ok: true, json: async () => responseBody, init });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  FakeEventSource.instances = [];
  vi.unstubAllGlobals();
});

describe("SessionDetail", () => {
  it("combines the compact header with one inline metric strip (E3-S6-AC1)", () => {
    render(<SessionDetail session={session} />);

    const detail = screen.getByRole("region", { name: "Session detail" });
    expect(within(detail).getByRole("heading", { name: "Refactor billing module" })).toBeInTheDocument();
    expect(within(detail).getByText("Completed")).toBeInTheDocument();
    expect(within(detail).getByText("10m 00s")).toBeInTheDocument();
    expect(within(detail).getByText("Derived from a normal session exit event")).toBeInTheDocument();
    expect(within(detail).getByRole("region", { name: "Session metrics" })).toBeInTheDocument();
  });

  it("presents insufficient signal as too small to audit, not an error or zero findings (E4-S6-AC3)", async () => {
    const history: AuditJob[] = [
      {
        id: "audit-completed",
        sessionId: session.id,
        status: "completed",
        createdAt: "2026-01-01T09:09:00.000Z",
      },
      {
        id: "audit-insufficient-signal",
        sessionId: session.id,
        status: "insufficient_signal",
        createdAt: "2026-01-01T09:10:00.000Z",
      },
    ];
    mockAuditHistoryRequests(() => history);

    render(<SessionDetail session={session} />);

    const auditPanel = screen.getByRole("region", { name: "Audit findings" });
    expect(await within(auditPanel).findByText("Insufficient signal")).toBeInTheDocument();
    expect(within(auditPanel).getByRole("status", { name: "Audit status: Completed" })).toBeInTheDocument();
    expect(within(auditPanel).getByRole("status", { name: "Audit status: Insufficient signal" })).toBeInTheDocument();
    expect(
      within(auditPanel).getByText(
        "This session was too small to audit - there wasn't enough recorded activity for the analyzer to reach a conclusion.",
      ),
    ).toBeInTheDocument();
    expect(within(auditPanel).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(auditPanel).queryByText("This completed audit found no findings.")).not.toBeInTheDocument();
  });

  it("receives queued-to-running through the real stream and announces textual progress (E4-S6-AC5)", async () => {
    let history: AuditJob[] = [
      {
        id: "audit-in-progress",
        sessionId: session.id,
        status: "queued",
        createdAt: "2026-01-01T09:10:00.000Z",
      },
    ];
    const fetchMock = mockAuditHistoryRequests(() => history);
    vi.stubGlobal("EventSource", FakeEventSource);

    render(<SessionDetail session={session} />);

    const auditPanel = screen.getByRole("region", { name: "Audit findings" });
    await waitFor(() => expect(within(auditPanel).getByLabelText("Audit progress")).toHaveTextContent("Queued"));
    expect(within(auditPanel).getByText("Audit status: queued.")).toBeInTheDocument();
    expect(within(auditPanel).getByRole("status", { name: "Audit status: Queued" })).toBeInTheDocument();
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    history = [{ ...history[0], status: "running" }];
    FakeEventSource.instances[0].emit("audit-change", JSON.stringify({ sessionId: session.id, status: "running" }));

    await waitFor(() => expect(within(auditPanel).getByLabelText("Audit progress")).toHaveTextContent("Running"));
    expect(within(auditPanel).getByText("Audit status: running.")).toBeInTheDocument();
    expect(within(auditPanel).getByRole("status", { name: "Audit status: Running" })).toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([input, init]) =>
            input === `/api/audits?sessionId=${encodeURIComponent(session.id)}` && init?.cache === "no-store",
        ),
      ).toHaveLength(2),
    );
  });

  it("reloads failed and cancelled durable records with their reasons (E4-S6-AC2, E4-S6-AC4)", async () => {
    const history: AuditJob[] = [
      {
        id: "audit-failed",
        sessionId: session.id,
        status: "failed",
        createdAt: "2026-01-01T09:10:00.000Z",
        failureSummary: "the transcript could not be read",
      },
      {
        id: "audit-cancelled",
        sessionId: session.id,
        status: "cancelled",
        createdAt: "2026-01-01T09:11:00.000Z",
        reason: "the user stopped the analyzer",
      },
    ];
    mockAuditHistoryRequests(() => history);

    const firstLoad = render(<SessionDetail session={session} />);
    const firstPanel = screen.getByRole("region", { name: "Audit findings" });
    expect(await within(firstPanel).findByRole("alert", { name: "Audit status: Failed" })).toHaveTextContent(
      "This audit failed: the transcript could not be read",
    );
    expect(within(firstPanel).getByText("You can retry this audit from its session.")).toBeInTheDocument();
    expect(within(firstPanel).getByText("This audit was cancelled: the user stopped the analyzer")).toBeInTheDocument();
    expect(within(firstPanel).getByRole("status", { name: "Audit status: Cancelled" })).toBeInTheDocument();

    firstLoad.unmount();
    render(<SessionDetail session={session} />);

    const reloadedPanel = screen.getByRole("region", { name: "Audit findings" });
    expect(await within(reloadedPanel).findByRole("alert", { name: "Audit status: Failed" })).toHaveTextContent(
      "This audit failed: the transcript could not be read",
    );
    expect(within(reloadedPanel).getByText("This audit was cancelled: the user stopped the analyzer")).toBeInTheDocument();
  });
});
