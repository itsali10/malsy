'use client';
import { useState } from 'react';

interface Props { defaultOn?: boolean; }

export default function Toggle({ defaultOn = false }: Props) {
  const [on, setOn] = useState(defaultOn);
  return <div className={`toggle${on ? ' on' : ''}`} onClick={() => setOn(p => !p)} />;
}
