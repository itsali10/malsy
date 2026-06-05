'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { requireActiveStudent } from '@/lib/auth';
import { initDB } from '@/lib/database';
import type { AuthContext } from '@/lib/auth';

interface Props {
  children: (ctx: AuthContext) => React.ReactNode;
}

export default function AuthGuard({ children }: Props) {
  const router = useRouter();
  const [ctx, setCtx] = useState<AuthContext | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    initDB();
    const authCtx = requireActiveStudent();
    if (!authCtx) {
      router.replace('/login');
    } else {
      setCtx(authCtx);
    }
    setChecked(true);
  }, [router]);

  if (!checked || !ctx) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'var(--font-base)' }}>
        <p style={{ color: 'var(--clr-muted)' }}>Loading…</p>
      </div>
    );
  }

  return <>{children(ctx)}</>;
}
