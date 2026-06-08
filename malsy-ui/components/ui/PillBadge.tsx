type Variant = 'v' | 'm' | 'c' | 'a' | 's';

interface Props {
  variant?: Variant;
  children: React.ReactNode;
}

export default function PillBadge({ variant = 'v', children }: Props) {
  return <span className={`pill pill-${variant}`}>{children}</span>;
}
