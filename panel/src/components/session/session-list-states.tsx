"use client";

import { useEffect, useState } from "react";

export function SessionListStates() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/sessions", { cache: "no-store" }).then(
      () => setIsLoading(false),
      () => setIsLoading(false),
    );
  }, []);

  if (!isLoading) return null;

  return (
    <section role="status" aria-live="polite">
      Loading sessions
    </section>
  );
}
