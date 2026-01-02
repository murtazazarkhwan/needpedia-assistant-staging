import { Suspense } from 'react';
import PageContent from './page-content';

export default function Home() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center bg-gray-50">Loading...</div>}>
      <PageContent />
    </Suspense>
  );
}
