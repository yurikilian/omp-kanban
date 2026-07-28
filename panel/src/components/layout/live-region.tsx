interface LiveRegionProps {
  message: string;
}

export function LiveRegion({ message }: LiveRegionProps) {
  return (
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </p>
  );
}
