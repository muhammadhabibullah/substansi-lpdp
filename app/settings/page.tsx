import type { Metadata } from 'next';

import { SettingsScreen } from './settings-screen';
import { getCopy } from '@/lib/i18n';

const copy = getCopy('id');

export const metadata: Metadata = {
  title: copy.settings.title,
  description: copy.settings.subtitle,
};

export default function Page() {
  return <SettingsScreen />;
}
