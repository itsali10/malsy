'use client';

import Image from 'next/image';
import { MALSY_LOGO_SRC } from '../lib/logos';

export type MalsyLogoVariant = 'sidebar' | 'auth' | 'loading' | 'header';

interface MalsyLogoProps {
  variant?: MalsyLogoVariant;
  className?: string;
}

const PRIORITY_VARIANTS: Set<MalsyLogoVariant> = new Set(['auth', 'loading']);

const SIZE_HINTS: Record<MalsyLogoVariant, { width: number; height: number }> = {
  sidebar: { width: 160, height: 66 },
  auth: { width: 360, height: 180 },
  loading: { width: 360, height: 180 },
  header: { width: 56, height: 56 },
};

const DEFAULT_VARIANT: MalsyLogoVariant = 'header';

function resolveVariant(variant?: string): MalsyLogoVariant {
  if (variant && variant in SIZE_HINTS) {
    return variant as MalsyLogoVariant;
  }
  return DEFAULT_VARIANT;
}

export default function MalsyLogo({ variant = 'auth', className = '' }: MalsyLogoProps) {
  const resolvedVariant = resolveVariant(variant);

  return (
    <div
      className={`malsy-logo-wrap malsy-logo-wrap--${resolvedVariant}${className ? ` ${className}` : ''}`}
      data-logo-variant={resolvedVariant}
    >
      <Image
        src={MALSY_LOGO_SRC}
        alt="MALSY"
        fill
        quality={100}
        sizes={
          resolvedVariant === 'sidebar'
            ? '(max-width: 480px) 140px, 160px'
            : resolvedVariant === 'header'
              ? '56px'
              : '(max-width: 480px) 300px, 360px'
        }
        className="malsy-logo"
        priority={PRIORITY_VARIANTS.has(resolvedVariant)}
        draggable={false}
      />
    </div>
  );
}
