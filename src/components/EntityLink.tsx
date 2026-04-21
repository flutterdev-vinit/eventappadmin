import { useNavigate } from 'react-router-dom';
import { useState, type CSSProperties, type MouseEvent } from 'react';

// Shared component for rendering a user or event name as a clickable link that
// navigates to the corresponding detail page (/users/:id or /events/:id).
//
// Rationale: we were repeating the same pattern — text, onClick={navigate(...)},
// cursor:pointer, dotted underline — in every table cell that showed a user
// or event name. Centralising keeps the UX identical and saves ~15 lines per
// call-site.
//
// Usage:
//   <EntityLink kind="user"  id={uid}  label={displayName} />
//   <EntityLink kind="event" id={eid}  label={eventName}  strong />
//
// If `id` is missing/empty, renders plain text (no link, no hover).

interface Props {
  kind: 'user' | 'event';
  id?: string | null | undefined;
  label: React.ReactNode;
  strong?: boolean;      // heavier font weight (default row emphasis)
  muted?: boolean;       // lighter grey (for secondary text)
  ellipsis?: boolean;    // truncate on overflow with …
  title?: string;
  style?: CSSProperties;
  onClick?: (e: MouseEvent) => void; // runs before navigation (e.g. stopPropagation)
}

const BASE: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  textAlign: 'inherit',
  cursor: 'pointer',
  textDecoration: 'none',
  textDecorationStyle: 'dotted',
  textDecorationColor: '#c7d2fe',
  textUnderlineOffset: 2,
};

export default function EntityLink({ kind, id, label, strong, muted, ellipsis, title, style, onClick }: Props) {
  const navigate = useNavigate();
  const [hover, setHover] = useState(false);

  const cleanId = (id ?? '').toString().split('/').pop() ?? '';
  const isClickable = !!cleanId;

  const textStyle: CSSProperties = {
    color: muted ? '#6b7280' : (hover ? '#4f46e5' : '#111827'),
    fontWeight: strong ? 500 : 400,
    textDecoration: isClickable && hover ? 'underline' : 'none',
    textDecorationStyle: 'dotted',
    textDecorationColor: '#818cf8',
    textUnderlineOffset: 3,
    transition: 'color 120ms',
    ...(ellipsis
      ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', maxWidth: '100%' }
      : {}),
    ...style,
  };

  if (!isClickable) {
    return <span style={textStyle} title={title}>{label}</span>;
  }

  const handleClick = (e: MouseEvent) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    navigate(`/${kind === 'user' ? 'users' : 'events'}/${cleanId}`);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title ?? `View ${kind} details`}
      style={{ ...BASE, ...textStyle }}
    >
      {label}
    </button>
  );
}
