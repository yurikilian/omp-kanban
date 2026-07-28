"use client";

import { useEffect } from "react";
import { subscribeToSessionChanges } from "@/lib/live-stream";

export function useLiveSessions(onSessionChange: (sessionId: string) => void) {
  useEffect(
    () => subscribeToSessionChanges(({ sessionId }) => onSessionChange(sessionId)),
    [onSessionChange],
  );
}