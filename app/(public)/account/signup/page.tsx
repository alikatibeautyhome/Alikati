import type { Metadata } from 'next';
import { SignupForm } from '@/components/account/SignupForm';

export const metadata: Metadata = {
  title: 'Create your account',
  description:
    'Create an optional Alikati Beauty Home account to save your delivery details and track your orders.',
  robots: { index: false, follow: false },
};

export default function AccountSignupPage() {
  return (
    <section className="section">
      <div className="container">
        <SignupForm />
      </div>
    </section>
  );
}
