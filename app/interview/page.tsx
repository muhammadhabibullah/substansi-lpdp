import type { Metadata } from 'next';

import { InterviewScreen } from './interview-screen';
import { getCopy } from '@/lib/i18n';

const copy = getCopy('id');

export const metadata: Metadata = {
  title: copy.interview.title,
  description: copy.meta.description,
};

export default function Page() {
  return <InterviewScreen />;
}
