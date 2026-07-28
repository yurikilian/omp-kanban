"use client";

import { Pin, PinOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PinControlProps {
  pinned: boolean;
  sessionTitle: string;
  onToggle: () => void;
}

/**
 * Toggles a session's pinned state. The pinned/unpinned distinction is
 * carried by the accessible name and `aria-pressed`, not by icon colour
 * alone (E3-S4-AC1) - a screen reader announces "Unpin <title>, pressed"
 * versus "Pin <title>" regardless of how the icon renders.
 */
export function PinControl({ pinned, sessionTitle, onToggle }: PinControlProps) {
  const label = pinned ? `Unpin ${sessionTitle}` : `Pin ${sessionTitle}`;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={pinned}
      onClick={onToggle}
    >
      {pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
    </Button>
  );
}
