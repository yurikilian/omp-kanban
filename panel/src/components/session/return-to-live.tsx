interface ReturnToLiveProps {
  isVisible: boolean;
  onReturn: () => void;
}

export function ReturnToLive({ isVisible, onReturn }: ReturnToLiveProps) {
  if (!isVisible) return null;

  return (
    <button type="button" onClick={onReturn} className="rounded-md border px-3 py-2 text-sm font-medium">
      Return to live
    </button>
  );
}
