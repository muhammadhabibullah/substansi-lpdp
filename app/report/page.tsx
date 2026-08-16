import type { Metadata } from 'next';

import { ReportScreen } from './report-screen';
import { getCopy } from '@/lib/i18n';

const copy = getCopy('id');

export const metadata: Metadata = {
  title: copy.report.title,
  description: copy.report.subtitle,
};

export default function Page() {
  return <ReportScreen />;
}
