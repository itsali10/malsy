interface Props {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export default function Card({ children, style, className = '' }: Props) {
  return (
    <div className={`card ${className}`} style={style}>
      {children}
    </div>
  );
}
