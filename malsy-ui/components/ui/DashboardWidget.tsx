interface DashboardWidgetProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function DashboardWidget({ title, subtitle, children, className = '', style }: DashboardWidgetProps) {
  return (
    <div className={`card dashboard-widget ${className}`.trim()} style={style}>
      <div className="card-title">{title}</div>
      {subtitle ? <div className="card-sub">{subtitle}</div> : null}
      {children}
    </div>
  );
}
