type Variant = 'v' | 'm' | 'o';

interface Props {
  variant?: Variant;
  small?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

export default function Button({
  variant = 'v',
  small,
  children,
  onClick,
  style,
  disabled,
  type = 'button',
  className = '',
}: Props) {
  return (
    <button
      type={type}
      className={`btn btn-${variant}${small ? ' btn-sm' : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      style={style}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
