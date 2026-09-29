import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="gradient-warm flex min-h-screen items-center justify-center px-4">
      <div className="panel max-w-md p-8 text-center">
        <p className="eyebrow">404</p>
        <h1 className="mt-2 font-display text-3xl">This page has moved on</h1>
        <p className="mt-3 text-sm text-charcoal-soft">
          The page you were looking for is not here. Browse our services or message us on
          WhatsApp — we reply during salon hours.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className={buttonVariants({ variant: 'default' })}>
            Back to home
          </Link>
          <Link href="/services" className={buttonVariants({ variant: 'outline' })}>
            View services
          </Link>
        </div>
      </div>
    </main>
  );
}
