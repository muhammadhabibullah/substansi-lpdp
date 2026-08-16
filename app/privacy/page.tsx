import type { Metadata } from 'next';

import { PrivacyScreen } from './privacy-screen';
import { getCopy } from '@/lib/i18n';

const copy = getCopy('id');

export const metadata: Metadata = {
  title: copy.privacy.title,
  description: copy.privacy.subtitle,
};

export default function Page() {
  return <PrivacyScreen />;
}
