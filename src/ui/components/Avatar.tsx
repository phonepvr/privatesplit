interface Props {
  name: string;
  color?: string | undefined;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES: Record<NonNullable<Props['size']>, string> = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
};

export function Avatar({ name, color = '#64748b', size = 'md' }: Props) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${SIZES[size]}`}
      style={{ backgroundColor: color }}
      aria-label={name}
    >
      {initials || '?'}
    </span>
  );
}
