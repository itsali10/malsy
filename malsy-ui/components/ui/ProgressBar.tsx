interface Props {
  value: number; // 0–100
  color?: string;
}

export default function ProgressBar({ value, color = 'var(--vl)' }: Props) {
  return (
    <div className="pbar-wrap">
      <div className="pbar" style={{ width: `${value}%`, background: color }} />
    </div>
  );
}
