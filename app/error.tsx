'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * Route-level error boundary. Deliberately does not report the error anywhere:
 * hard constraint #3 forbids telemetry that could capture request contents.
 */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  const { c } = useI18n();

  return (
    <div className="container max-w-xl py-24">
      <Alert variant="destructive">
        <AlertTriangle aria-hidden />
        <AlertTitle>{c.errors.genericTitle}</AlertTitle>
        <AlertDescription>
          <p>{c.errors.genericBody}</p>
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="secondary" onClick={reset}>
              {c.common.retry}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.location.reload()}
            >
              {c.errors.reload}
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
