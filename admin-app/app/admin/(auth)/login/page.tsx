import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/AuthForms';
import { getSession } from '@/lib/auth';

export const metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

// ?reauth=1 (the website's "Manage Website" link) always asks for the password,
// even when this browser is still signed in.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reauth?: string }> }) {
  const { next, reauth } = await searchParams;
  if (reauth !== '1' && await getSession()) redirect('/admin/dashboard');
  return <LoginForm next={typeof next === 'string' ? next : null} />;
}
