import { notFound } from 'next/navigation';
import { BuilderForm } from '@/components/Builders';

export const metadata = { title: 'Edit builder' };

type Props = { params: Promise<{ id: string }> };

export default async function EditBuilderPage({ params }: Props) {
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) notFound();
  return <BuilderForm key={id} id={Number(id)} />;
}
