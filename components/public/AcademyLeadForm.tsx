'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle2, MessageCircle } from 'lucide-react';
import { createAcademyLead } from '@/lib/api-client';
import { createAcademyInquiryLink } from '@/lib/whatsapp';
import { FALLBACK_CONTACT } from '@/lib/supabase/config';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatNPR, isValidNepaliPhone } from '@/lib/utils';
import type { AcademyCourse } from '@/types/database.types';

/**
 * Academy admission inquiry form — the only public component that writes through
 * `lib/api-client.ts` (`createAcademyLead`). On success it hands the student to WhatsApp with a
 * pre-filled inquiry built by `createAcademyInquiryLink`.
 */
export function AcademyLeadForm({
  courses,
  initialCourseId,
  whatsapp,
}: {
  courses: AcademyCourse[];
  initialCourseId?: string;
  whatsapp?: string;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [courseId, setCourseId] = useState(initialCourseId ?? courses[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [successLink, setSuccessLink] = useState<string | null>(null);

  const businessWhatsapp = whatsapp ?? FALLBACK_CONTACT.whatsapp;

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.student_name = 'Please enter your full name.';
    if (!isValidNepaliPhone(phone)) next.student_phone = 'Enter a valid 10-digit Nepali mobile number.';
    if (courses.length > 0 && !courseId) next.course_id = 'Please choose a course.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setFormError(null);

    const selected = courses.find((course) => course.id === courseId) ?? null;

    try {
      await createAcademyLead({
        student_name: name.trim(),
        student_phone: phone.trim(),
        course_id: courseId || null,
        notes: note.trim() || undefined,
      });

      setSuccessLink(
        createAcademyInquiryLink({
          student_name: name.trim(),
          student_phone: phone.trim(),
          course_title: selected?.title ?? 'Beautician course',
          duration_weeks: selected?.duration_weeks ?? 0,
          fee_npr: selected?.fee_npr ?? 0,
          business_whatsapp: businessWhatsapp,
          notes: note.trim() || undefined,
        })
      );
      setSubmitted(true);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'We could not save your inquiry. Please try again or call us directly.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="panel space-y-4 p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden="true" />
        <div>
          <p className="font-display text-xl text-charcoal">धन्यवाद! Your inquiry is saved</p>
          <p className="mt-1 text-sm text-charcoal-soft">
            We have your details. Continue on WhatsApp and we will share the next batch date and fee
            breakdown right away.
          </p>
        </div>

        {successLink && (
          <a
            href={successLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rose-gold px-7 text-base font-medium text-white shadow-soft transition-colors hover:bg-rose-600"
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            Continue on WhatsApp
          </a>
        )}

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => {
            setSubmitted(false);
            setSuccessLink(null);
            setName('');
            setPhone('');
            setNote('');
          }}
        >
          Send another inquiry
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="panel space-y-4 p-6">
      <Field label="Full name" htmlFor="lead-name" error={errors.student_name ?? null}>
        <Input
          id="lead-name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={Boolean(errors.student_name)}
          placeholder="e.g. Sunita Bista"
        />
      </Field>

      <Field
        label="Mobile number"
        htmlFor="lead-phone"
        error={errors.student_phone ?? null}
        hint="Nepali mobile, e.g. 98XXXXXXXX"
      >
        <Input
          id="lead-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          aria-invalid={Boolean(errors.student_phone)}
          placeholder="98XXXXXXXX"
        />
      </Field>

      <Field label="Which course?" htmlFor="lead-course" error={errors.course_id ?? null}>
        {courses.length > 0 ? (
          <Select
            id="lead-course"
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
            aria-invalid={Boolean(errors.course_id)}
          >
            <option value="">Choose a course…</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title} · {course.duration_weeks} weeks · {formatNPR(course.fee_npr)}
              </option>
            ))}
          </Select>
        ) : (
          <Input id="lead-course" value="Course details coming soon" readOnly disabled />
        )}
      </Field>

      <Field label="Anything else? (optional)" htmlFor="lead-note">
        <Textarea
          id="lead-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Preferred batch timing, questions about fees or instalments…"
        />
      </Field>

      {formError && (
        <p role="alert" className="text-sm font-medium text-danger">
          {formError}
        </p>
      )}

      <Button type="submit" loading={submitting} className="w-full">
        Send my inquiry
      </Button>

      <p className="text-center text-xs text-charcoal-soft">
        We only use your number to reply about admission.
      </p>
    </form>
  );
}
