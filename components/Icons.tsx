export function PhoneIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor">
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
    </svg>
  );
}

export function MailIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor">
      <path d="M12 2a10 10 0 1 0 4.9 18.7l-.9-1.7A8 8 0 1 1 20 12v1.2c0 1-.8 1.8-1.8 1.8s-1.7-.8-1.7-1.8V12a4.5 4.5 0 1 0-1.3 3.2A3.7 3.7 0 0 0 18.2 17 3.8 3.8 0 0 0 22 13.2V12A10 10 0 0 0 12 2zm0 12.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
    </svg>
  );
}

export function PersonIcon({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor">
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21v-1a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v1z" />
    </svg>
  );
}

export function PeopleIcon({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor">
      <circle cx="8" cy="7" r="3.2" />
      <circle cx="16.5" cy="8.5" r="2.7" />
      <path d="M1.5 20v-.5A5.5 5.5 0 0 1 7 14h2a5.5 5.5 0 0 1 5.5 5.5v.5z" />
      <path d="M15.5 20v-.6a7 7 0 0 0-1.6-4.5 4.6 4.6 0 0 1 1.7-.4h1.8a4.6 4.6 0 0 1 4.6 4.6v.9z" />
    </svg>
  );
}

export function StampIcon({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M4 8v12h12" />
      <path d="M10 4h10v10" />
      <path d="m9 15 1-4 8-8 3 3-8 8z" />
    </svg>
  );
}
