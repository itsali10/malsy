type Variant = 'v' | 'm' | 'o';

interface Props {
  variant?: Variant;
  small?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
  disabled?: boolean;
}

export default function Button({ variant = 'v', small, children, onClick, style, disabled }: Props) {
  return (
    <button
      className={`btn btn-${variant}${small ? ' btn-sm' : ''}`}
      onClick={onClick}
      style={style}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
