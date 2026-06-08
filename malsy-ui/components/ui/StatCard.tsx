interface Props {
  value: string;
  label: string;
  color?: string;
}

export default function StatCard({ value, label, color = 'var(--vl)' }: Props) {
  return (
    <div className="stat-c">
      <div className="stat-n" style={{ color }}>{value}</div>
      <div className="stat-l">{label}</div>
    </div>
  );
}
