import type { Metadata } from 'next';
import { AlertTriangle } from 'lucide-react';
import { LoginForm } from '@/components/account/LoginForm';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your Alikati Beauty Home account to see your order history.',
  robots: { index: false, follow: false },
};

/**
 * What to say when a confirmation link did not work.
 *
 * `expired` is by far the common case and is not the visitor's fault — confirmation links are valid
 * for an hour, and nobody reads email within the hour. Saying so, and telling them what to do next,
 * is the difference between a support message and a retry.
 */
const CONFIRMATION_NOTICES: Record<string, { title: string; body: string }> = {
  'link-expired': {
    title: 'That confirmation link has expired',
    body: 'Confirmation links are valid for one hour. Sign in below if your address was already confirmed, or create the account again to receive a fresh link.',
  },
  'link-invalid': {
    title: 'That confirmation link did not work',
    body: 'It may already have been used, or it may have been cut short by your email provider. Sign in below if your address was confirmed, or create the account again for a new link.',
  },
};

export default async function AccountLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawNext = params.next;
  const next = typeof rawNext === 'string' ? rawNext : undefined;

  const rawNotice = params.notice;
  const notice = typeof rawNotice === 'string' ? CONFIRMATION_NOTICES[rawNotice] : undefined;

  return (
    <section className="section">
      <div className="container">
        {notice ? (
          <div className="panel mb-6 flex items-start gap-3 p-4" role="alert">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden="true" />
            <div>
              <p className="font-medium text-charcoal">{notice.title}</p>
              <p className="mt-1 text-sm text-charcoal-soft">{notice.body}</p>
            </div>
          </div>
        ) : null}

        <LoginForm next={next} />
      </div>
    </section>
  );
}
