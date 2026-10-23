/** Original lightweight guide: decorative SVG, no downloaded character or animation runtime. */
export function Guide({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={`journey-guide ${small ? "guide-small" : ""}`}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="48" fill="#e8eee0" />
      <path d="M25 84c1-19 10-28 25-28s24 9 25 28" fill="#305846" />
      <rect x="28" y="20" width="44" height="48" rx="21" fill="#f4c49e" />
      <path
        d="M28 39c-4-20 11-28 24-25 16 0 24 13 20 27-9-1-17-8-22-15-6 8-13 12-22 13Z"
        fill="#244e40"
      />
      <circle cx="41" cy="43" r="2.3" fill="#244e40" />
      <circle cx="59" cy="43" r="2.3" fill="#244e40" />
      <path
        d="M43 53q7 7 14 0"
        stroke="#9f452f"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path d="m75 12 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="#c55530" />
    </svg>
  );
}
