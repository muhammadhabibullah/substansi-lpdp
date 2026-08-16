import type { Metadata } from 'next';

import { LandingPage } from './landing-page';
import { getCopy } from '@/lib/i18n';

const copy = getCopy('id');

export const metadata: Metadata = {
  title: `${copy.meta.appName} — ${copy.meta.tagline}`,
  description: copy.meta.description,
};

export default function Page() {
  return <LandingPage />;
}
