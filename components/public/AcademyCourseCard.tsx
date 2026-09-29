import { CalendarClock, GraduationCap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatNPR } from '@/lib/utils';
import type { AcademyCourse } from '@/types/database.types';

/**
 * Presentational academy course card. Uses a native `<details>` accordion for the syllabus so it
 * stays usable without JavaScript and renders safely inside a server component.
 */
export function AcademyCourseCard({ course }: { course: AcademyCourse }) {
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blush-200 text-rose-gold">
          <GraduationCap className="h-5 w-5" aria-hidden="true" />
        </span>
        {course.is_enrolling ? (
          <Badge className="bg-success/10 text-success ring-success/25">Enrolling now</Badge>
        ) : (
          <Badge className="bg-warn/10 text-warn ring-warn/25">Next batch — waitlist</Badge>
        )}
      </div>

      <h3 className="mt-4 break-words font-display text-xl text-charcoal">{course.title}</h3>

      <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-charcoal-soft">
        <CalendarClock className="h-4 w-4 text-rose-gold" aria-hidden="true" />
        {course.duration_weeks} weeks
      </p>

      <p className="mt-3 font-display text-2xl text-price">{formatNPR(course.fee_npr)}</p>

      {course.syllabus.length > 0 && (
        <details className="mt-4 rounded-xl border border-charcoal/10 bg-cream-100 p-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-charcoal active:text-rose-gold">
            View syllabus ({course.syllabus.length} topics)
          </summary>
          <ul className="mt-3 space-y-1.5 text-sm text-charcoal-soft">
            {course.syllabus.map((topic) => (
              <li key={topic} className="flex gap-2">
                <span aria-hidden="true" className="text-rose-gold">
                  •
                </span>
                <span className="min-w-0 break-words">{topic}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-auto pt-5">
        {course.is_enrolling ? (
          <a href="#enroll" className={buttonVariants({ className: 'w-full' })}>
            Reserve my seat
          </a>
        ) : (
          <a href="#enroll" className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
            Join the waitlist
          </a>
        )}
      </div>
    </Card>
  );
}
