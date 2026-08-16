'use client';

import { useI18n } from '@/components/i18n-provider';
import type { PanelistId } from '@/lib/types';
import { cn } from '@/lib/utils';

const TONE: Record<PanelistId | 'user', string> = {
  akademisi: 'bg-akademisi/15 text-akademisi border-akademisi/40',
  psikolog: 'bg-psikolog/15 text-psikolog border-psikolog/40',
  lpdp: 'bg-lpdp/15 text-lpdp border-lpdp/40',
  user: 'bg-secondary text-secondary-foreground border-border',
};

export function PanelistAvatar({
  speaker,
  className,
}: {
  speaker: PanelistId | 'user';
  className?: string;
}) {
  const { c } = useI18n();
  const info = speaker === 'user' ? c.panelists.you : c.panelists[speaker];

  return (
    <div
      aria-hidden
      title={info.name}
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
        TONE[speaker],
        className,
      )}
    >
      {info.initial}
    </div>
  );
}

export function panelistTone(speaker: PanelistId | 'user'): string {
  return TONE[speaker];
}
