import { notFound } from 'next/navigation';
import { BuilderProfile } from '@/components/Builders';

export const metadata = { title: 'Builder' };

type Props = { params: Promise<{ id: string }> };

export default async function BuilderPage({ params }: Props) {
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) notFound();
  return <BuilderProfile key={id} id={Number(id)} />;
}
