/** The mark: a civic roof over a speech bubble — a public decision, talked about. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" class="logo-mark">
      <rect width="32" height="32" rx="9" fill="var(--ink)" />
      <path d="M8 14.2L16 8.5l8 5.7" fill="none" stroke="var(--pane-solid)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" />
      <path
        d="M10 16.5h12a1.5 1.5 0 011.5 1.5v4.2a1.5 1.5 0 01-1.5 1.5h-6.2L12.4 26v-2.3H10a1.5 1.5 0 01-1.5-1.5V18a1.5 1.5 0 011.5-1.5z"
        fill="var(--pane-solid)"
      />
    </svg>
  );
}
