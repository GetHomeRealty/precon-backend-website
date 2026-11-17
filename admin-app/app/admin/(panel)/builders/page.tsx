import { Suspense } from 'react';
import { BuilderList } from '@/components/Builders';

export const metadata = { title: 'Builders' };

export default function BuildersPage() {
  return <Suspense><BuilderList /></Suspense>;
}
