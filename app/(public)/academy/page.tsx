import type { Metadata } from 'next';
import { getAcademyCourses, getSalonSettings } from '@/lib/api';
import { AcademyCourseCard } from '@/components/public/AcademyCourseCard';
import { AcademyLeadForm } from '@/components/public/AcademyLeadForm';
import { formatPhoneDisplay } from '@/lib/utils';

export const revalidate = 300;

export const metadata: Metadata = {
  // "| Academy" rather than the full brand: with the brand suffix this title runs to 66 characters
  // and would be truncated in the SERP.
  title: { absolute: 'Beautician Course & Parlour Training in Attariya | Academy' },
  // Trimmed to fit the ~160-character description budget — the source copy was 161 and lost its
  // final clause to truncation.
  description:
    'Learn hair styling, skincare, nail artistry, and bridal makeup at Alikati Beauty Academy, Attariya Chowk. Hands-on professional certification in Kailali.',
};

const STEPS = [
  {
    title: 'Talk to us',
    body: 'Send an inquiry below or message us on WhatsApp. We reply during salon hours.',
  },
  {
    title: 'Visit the studio',
    body: 'Come for a short tour and a free consultation with the trainer.',
  },
  {
    title: 'Reserve your seat',
    body: 'A small advance confirms your place in the next batch.',
  },
  {
    title: 'Practise & graduate',
    body: 'Train on real clients and leave with a portfolio and a certificate.',
  },
];

export default async function AcademyPage() {
  const [courses, settings] = await Promise.all([getAcademyCourses(), getSalonSettings()]);

  return (
    <>
      <section className="section gradient-warm">
        <div className="container">
          <header className="mx-auto max-w-2xl space-y-3 text-center">
            <p className="eyebrow">Alikati Academy</p>
            <h1 className="font-display text-3xl text-charcoal sm:text-4xl">
              Professional Beautician Training &amp; Makeup Academy in Attariya
            </h1>
            <p className="text-charcoal-soft">
              Practical, career-focused training in small batches — taught on real clients here at our
              Attariya Chowk studio. Course fees are quoted in NPR and can be paid in instalments.
            </p>
          </header>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="space-y-2 text-center">
            <p className="eyebrow">How it works</p>
            <h2 className="font-display text-3xl text-charcoal">Four simple steps</h2>
          </div>

          <ol className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="panel p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-gold font-display text-sm text-white">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-display text-lg text-charcoal">{step.title}</h3>
                <p className="mt-1 text-sm text-charcoal-soft">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section bg-cream-100">
        <div className="container">
          <div className="space-y-2">
            <p className="eyebrow">Our courses</p>
            <h2 className="font-display text-3xl text-charcoal sm:text-4xl">Choose your path</h2>
            <p className="max-w-xl text-charcoal-soft">
              Every course mixes theory with hands-on practice. Seats are limited so each student gets
              individual correction time.
            </p>
          </div>

          {courses.length === 0 ? (
            <div className="panel mt-8 p-8 text-center text-charcoal-soft">
              Course details are being updated. Please call us on {formatPhoneDisplay(settings.phone)} and
              we will share the current schedule.
            </div>
          ) : (
            <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => (
                <AcademyCourseCard key={course.id} course={course} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section id="enroll" className="section">
        <div className="container">
          <div className="mx-auto max-w-2xl space-y-3 text-center">
            <p className="eyebrow">Reserve your seat</p>
            <h2 className="font-display text-3xl text-charcoal sm:text-4xl">Send an admission inquiry</h2>
            <p className="text-charcoal-soft">
              Fill this short form and continue on WhatsApp — we will share the next batch date, fee
              breakdown and instalment options.
            </p>
          </div>

          <div className="mx-auto mt-8 max-w-2xl">
            <AcademyLeadForm courses={courses} whatsapp={settings.whatsapp_number} />
          </div>
        </div>
      </section>
    </>
  );
}
