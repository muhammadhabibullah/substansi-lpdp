import type { Metadata } from 'next';

import { SetupScreen } from './setup-screen';
import { getCopy } from '@/lib/i18n';

const copy = getCopy('id');

export const metadata: Metadata = {
  title: copy.setup.title,
  description: copy.setup.subtitle,
};

export default function Page() {
  return <SetupScreen />;
}
