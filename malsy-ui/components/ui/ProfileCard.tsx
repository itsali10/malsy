interface ProfileCardProps {
  initials: string;
  name: string;
  email?: string;
  gradeLevel?: number | null;
}

export default function ProfileCard({ initials, name, email, gradeLevel }: ProfileCardProps) {
  return (
    <div className="profile-card">
      <div className="profile-card__avatar" aria-hidden="true">
        {initials}
      </div>
      <div className="profile-card__body">
        <div className="profile-card__name">{name}</div>
        {email ? <div className="profile-card__email">{email}</div> : null}
        {gradeLevel ? <div className="profile-card__grade">Grade {gradeLevel}</div> : null}
      </div>
    </div>
  );
}
