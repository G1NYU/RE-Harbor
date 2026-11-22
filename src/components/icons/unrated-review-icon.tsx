export function UnratedReviewIcon({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7 4h18a4 4 0 0 1 4 4v13a4 4 0 0 1-4 4h-7l-7 4v-4H7a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Z" />
      <path d="m16 8 2.1 4.3 4.8.7-3.5 3.4.8 4.8-4.2-2.3-4.2 2.3.8-4.8L9.1 13l4.8-.7Z" />
      <path d="m5 3 23 26" stroke="var(--color-canvas)" strokeWidth={4.5} />
      <path d="m5 3 23 26" />
    </svg>
  );
}
