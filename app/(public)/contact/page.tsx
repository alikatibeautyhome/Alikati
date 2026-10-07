import type { Metadata } from 'next';
import Link from 'next/link';
import { Clock, MapPin, MessageCircle, Phone } from 'lucide-react';
import { getSalonSettings } from '@/lib/api';
import { createGeneralContactLink } from '@/lib/whatsapp';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatPhoneDisplay, normalizeWhatsAppNumber, to12Hour } from '@/lib/utils';

export const revalidate = 300;

/**
 * Generated rather than static so the phone number in the description stays true.
 *
 * The number lives in `salon_settings` and is editable from the console. Writing it into a static
 * metadata object would mean the description silently advertises an old number the first time it
 * changes — the kind of drift nobody notices until a customer calls it.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSalonSettings();
  return {
    title: { absolute: 'Contact & Visit Alikati Beauty Home | Attariya Chowk' },
    description: `Get in touch with Alikati Beauty Home in Attariya Chowk, Kailali. Call ${formatPhoneDisplay(settings.phone)} for appointment bookings, parlor directions, and product inquiries.`,
  };
}

const MAP_SRC =
  'https://www.google.com/maps?q=Attariya%20Chowk%2C%20Kailali%2C%20Nepal&output=embed';

export default async function ContactPage() {
  const settings = await getSalonSettings();

  const telHref = `tel:${settings.phone.replace(/[^+\d]/g, '')}`;
  const whatsappHref = createGeneralContactLink({
    business_whatsapp: settings.whatsapp_number,
    context: 'नमस्ते! I would like to ask about services at Alikati Beauty Home.',
  });
  const waFormAction = `https://wa.me/${normalizeWhatsAppNumber(settings.whatsapp_number)}`;

  return (
    <>
      <section className="section gradient-warm">
        <div className="container">
          <header className="mx-auto max-w-2xl space-y-3 text-center">
            <p className="eyebrow">Contact</p>
            <h1 className="font-display text-3xl text-charcoal sm:text-4xl">
              Contact Alikati Beauty Home in Attariya Chowk
            </h1>
            <p className="text-charcoal-soft">
              We are on Mahendranagar Road at Attariya Chowk, Kailali. Call, message on WhatsApp, or send
              us a note below.
            </p>
          </header>
        </div>
      </section>

      <section className="section">
        <div className="container grid gap-8 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="panel flex items-start gap-3 p-5">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-rose-gold" aria-hidden="true" />
              <div>
                <h2 className="font-display text-lg text-charcoal">Studio address</h2>
                <p className="mt-1 text-sm text-charcoal-soft">{settings.address}</p>
              </div>
            </div>

            <div className="panel flex items-start gap-3 p-5">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-rose-gold" aria-hidden="true" />
              <div>
                <h2 className="font-display text-lg text-charcoal">Opening hours</h2>
                <p className="mt-1 text-sm text-charcoal-soft">
                  Every day, {to12Hour(settings.opening_time)} – {to12Hour(settings.closing_time)}
                </p>
                <p className="mt-1 text-xs text-charcoal-soft">
                  Walk-ins welcome, but a booked slot always gets priority.
                </p>
              </div>
            </div>

            <div className="panel space-y-3 p-5">
              <h2 className="font-display text-lg text-charcoal">Talk to us</h2>
              <p className="text-sm text-charcoal-soft">{formatPhoneDisplay(settings.phone)}</p>
              {/* Full-width and stacked on phones: two side-by-side pills in a 390px column left
                  the WhatsApp one sitting under the floating chat button. */}
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a
                  href={telHref}
                  className={buttonVariants({
                    variant: 'outline',
                    className: 'min-h-11 w-full justify-center sm:w-auto',
                  })}
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  Call now
                </a>
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({
                    className: 'min-h-11 w-full justify-center sm:w-auto',
                  })}
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  WhatsApp us
                </a>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-charcoal/10 shadow-soft">
              <iframe
                title="Map showing Alikati Beauty Home at Attariya Chowk, Kailali"
                src={MAP_SRC}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-72 w-full border-0 sm:h-80"
              />
            </div>

            <form
              action={waFormAction}
              method="get"
              target="_blank"
              rel="noopener noreferrer"
              className="panel space-y-4 p-5"
            >
              <div>
                <h2 className="font-display text-lg text-charcoal">Send us a WhatsApp message</h2>
                <p className="mt-1 text-sm text-charcoal-soft">
                  Write your note and we will open WhatsApp with it ready to send.
                </p>
              </div>

              <Field label="Your name" htmlFor="contact-name">
                <Input
                  id="contact-name"
                  name="name"
                  autoComplete="name"
                  placeholder="e.g. Sita Joshi"
                />
              </Field>

              <Field label="Mobile number" htmlFor="contact-phone" hint="So we can call you back.">
                <Input
                  id="contact-phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="98XXXXXXXX"
                />
              </Field>

              <Field label="Message" htmlFor="contact-message">
                <Textarea
                  id="contact-message"
                  name="text"
                  rows={4}
                  defaultValue="नमस्ते! I would like to ask about "
                />
              </Field>

              <Button type="submit" className="w-full sm:w-auto">
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                Open WhatsApp
              </Button>
            </form>

            <p className="text-center text-xs text-charcoal-soft">
              Prefer to browse first?{' '}
              <Link href="/services" className="font-medium text-rose-gold underline-offset-4 hover:underline">
                See the full price list
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
