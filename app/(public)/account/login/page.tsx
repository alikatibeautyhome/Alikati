import type { Metadata } from 'next';
import { LoginForm } from '@/components/account/LoginForm';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your Alikati Beauty Home account to see your order history.',
  robots: { index: false, follow: false },
};

export default async function AccountLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawNext = params.next;
  const next = typeof rawNext === 'string' ? rawNext : undefined;

  return (
    <section className="section">
      <div className="container">
        <LoginForm next={next} />
      </div>
    </section>
  );
}
