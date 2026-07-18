// The TinySparrow mark — a small geometric bird in flight.
export default function Sparrow({ className }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16.5" cy="8.5" r="3.1" fill="currentColor" />
      <path
        d="M16.5 11 L4.5 20.5 Q13.5 18.4 16.2 15 Q18.6 18.4 27.5 20.5 Z"
        fill="currentColor"
      />
    </svg>
  )
}
