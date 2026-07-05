import Button from './Button';

interface Props {
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
  disabled?: boolean;
  small?: boolean;
  type?: 'button' | 'submit';
}

export default function SecondaryButton({ children, onClick, style, disabled, small, type = 'button' }: Props) {
  return (
    <Button variant="o" onClick={onClick} style={style} disabled={disabled} small={small} type={type}>
      {children}
    </Button>
  );
}
