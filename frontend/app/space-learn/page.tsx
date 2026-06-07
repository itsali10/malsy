import dynamic from 'next/dynamic';

const SpaceLearnApp = dynamic(() => import('@/components/space-learn/SpaceLearnApp'), { ssr: false });

export default function SpaceLearnPage() {
  return <SpaceLearnApp />;
}
