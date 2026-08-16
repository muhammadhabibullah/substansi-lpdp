'use client';

import { AlertTriangle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useI18n } from '@/components/i18n-provider';
import { cn } from '@/lib/utils';

/**
 * The "unofficial tool" disclaimer (hard constraint #6). Must stay visible on
 * the landing and report pages; the footer renders the compact variant on every
 * page.
 */
export function Disclaimer({
  variant = 'full',
  className,
}: {
  variant?: 'full' | 'compact';
  className?: string;
}) {
  const { c } = useI18n();

  if (variant === 'compact') {
    return (
      <p
        className={cn(
          'flex items-start gap-2 text-xs text-muted-foreground',
          className,
        )}
      >
        <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span>{c.disclaimer.short}</span>
      </p>
    );
  }

  return (
    <Alert variant="warning" className={className}>
      <AlertTriangle aria-hidden />
      <AlertTitle>{c.disclaimer.title}</AlertTitle>
      <AlertDescription>{c.disclaimer.body}</AlertDescription>
    </Alert>
  );
}
