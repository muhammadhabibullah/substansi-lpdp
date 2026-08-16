'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Play,
} from 'lucide-react';

import { DocumentSlot } from '@/components/document-slot';
import { useI18n } from '@/components/i18n-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useDocuments, useProfile, useSettings } from '@/hooks/use-app-state';
import {
  docLabel,
  missingRequiredDocs,
  primaryAcademicDoc,
  requiredDocKinds,
  totalContextChars,
} from '@/lib/documents';
import { clearSession, isResumable, loadSession } from '@/lib/storage';
import type { DocKind, Jenjang, LoaStatus, Skema, Tujuan } from '@/lib/types';
import { cn, formatNumber } from '@/lib/utils';

type Step = 'profile' | 'documents' | 'review';

const STEPS: readonly Step[] = ['profile', 'documents', 'review'];

/** Profile fields that must be filled before the interview can start (M2-5). */
const REQUIRED_PROFILE_FIELDS = [
  'name',
  'universitas',
  'prodi',
  'bidang',
] as const;

export function SetupScreen() {
  const { c, f, locale } = useI18n();
  const router = useRouter();
  const { profile, setProfile, hydrated: profileReady } = useProfile();
  const { documents, setDocuments, hydrated: docsReady } = useDocuments();
  const { configured, hydrated: settingsReady } = useSettings();

  const [step, setStep] = React.useState<Step>('profile');
  const [hasOldSession, setHasOldSession] = React.useState(false);

  React.useEffect(() => {
    setHasOldSession(isResumable(loadSession()));
  }, []);

  const academicDoc = primaryAcademicDoc(profile.jenjang);
  const required = requiredDocKinds(profile.jenjang);

  const missingProfile = REQUIRED_PROFILE_FIELDS.filter(
    (field) => profile[field].trim().length === 0,
  );
  const missingDocs = missingRequiredDocs(documents, profile.jenjang);
  const ready =
    missingProfile.length === 0 && missingDocs.length === 0 && configured;

  const profileFieldLabel: Record<(typeof REQUIRED_PROFILE_FIELDS)[number], string> = {
    name: c.setup.fieldName,
    universitas: c.setup.fieldUniversitas,
    prodi: c.setup.fieldProdi,
    bidang: c.setup.fieldBidang,
  };

  const docCopy: Record<DocKind, { label: string; help: string }> = {
    cv: { label: c.setup.docCv, help: c.setup.docCvHelp },
    studyPlan: { label: c.setup.docStudyPlan, help: c.setup.docStudyPlanHelp },
    proposal: { label: c.setup.docProposal, help: c.setup.docProposalHelp },
    essay: { label: c.setup.docEssay, help: c.setup.docEssayHelp },
  };

  const startInterview = () => {
    if (!ready) return;
    // Starting fresh discards any half-finished session (confirmed in the UI).
    clearSession();
    router.push('/interview');
  };

  const stepLabels: Record<Step, string> = {
    profile: c.setup.stepProfile,
    documents: c.setup.stepDocuments,
    review: c.setup.stepReview,
  };

  return (
    <div className="container max-w-3xl py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{c.setup.title}</h1>
        <p className="mt-2 text-muted-foreground">{c.setup.subtitle}</p>
      </header>

      {/* Step indicator */}
      <nav aria-label={c.setup.title} className="mb-8">
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((item, index) => {
            const active = step === item;
            const done = STEPS.indexOf(step) > index;
            return (
              <li key={item}>
                <button
                  type="button"
                  onClick={() => setStep(item)}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : done
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span aria-hidden>{index + 1}</span>
                  {stepLabels[item]}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {hasOldSession ? (
        <Alert variant="warning" className="mb-6">
          <AlertTriangle aria-hidden />
          <AlertTitle>{c.setup.existingSessionWarning}</AlertTitle>
          <AlertDescription>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="secondary">
                <Link href="/interview">{c.setup.existingSessionResume}</Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  clearSession();
                  setHasOldSession(false);
                }}
              >
                {c.setup.existingSessionDiscard}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Step 1 — profile */}
      {step === 'profile' ? (
        <Card>
          <CardHeader>
            <CardTitle>{c.setup.profileTitle}</CardTitle>
            <CardDescription>{c.setup.profileSubtitle}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">{c.setup.fieldName} *</Label>
              <Input
                id="name"
                value={profile.name}
                placeholder={c.setup.fieldNamePlaceholder}
                onChange={(event) =>
                  setProfile((current) => ({ ...current, name: event.target.value }))
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="jenjang">{c.setup.fieldJenjang} *</Label>
                <Select
                  id="jenjang"
                  value={profile.jenjang}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      jenjang: event.target.value as Jenjang,
                    }))
                  }
                >
                  <option value="magister">{c.setup.fieldJenjangMagister}</option>
                  <option value="doktor">{c.setup.fieldJenjangDoktor}</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tujuan">{c.setup.fieldTujuan} *</Label>
                <Select
                  id="tujuan"
                  value={profile.tujuan}
                  onChange={(event) => {
                    const tujuan = event.target.value as Tujuan;
                    // Overseas applicants get English segments by default.
                    setProfile((current) => ({
                      ...current,
                      tujuan,
                      englishSegments: tujuan === 'ln',
                    }));
                  }}
                >
                  <option value="dn">{c.setup.fieldTujuanDN}</option>
                  <option value="ln">{c.setup.fieldTujuanLN}</option>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="universitas">{c.setup.fieldUniversitas} *</Label>
                <Input
                  id="universitas"
                  value={profile.universitas}
                  placeholder={c.setup.fieldUniversitasPlaceholder}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      universitas: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prodi">{c.setup.fieldProdi} *</Label>
                <Input
                  id="prodi"
                  value={profile.prodi}
                  placeholder={c.setup.fieldProdiPlaceholder}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, prodi: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="loa">{c.setup.fieldLoa}</Label>
                <Select
                  id="loa"
                  value={profile.loa}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      loa: event.target.value as LoaStatus,
                    }))
                  }
                >
                  <option value="none">{c.setup.loaNone}</option>
                  <option value="conditional">{c.setup.loaConditional}</option>
                  <option value="unconditional">{c.setup.loaUnconditional}</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="skema">{c.setup.fieldSkema}</Label>
                <Select
                  id="skema"
                  value={profile.skema}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      skema: event.target.value as Skema,
                    }))
                  }
                >
                  <option value="reguler">{c.setup.skemaReguler}</option>
                  <option value="ptud">{c.setup.skemaPtud}</option>
                  <option value="afirmasi">{c.setup.skemaAfirmasi}</option>
                  <option value="targeted">{c.setup.skemaTargeted}</option>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bidang">{c.setup.fieldBidang} *</Label>
              <Input
                id="bidang"
                value={profile.bidang}
                placeholder={c.setup.fieldBidangPlaceholder}
                onChange={(event) =>
                  setProfile((current) => ({ ...current, bidang: event.target.value }))
                }
                aria-describedby="bidang-help"
              />
              <p id="bidang-help" className="text-xs text-muted-foreground">
                {c.setup.fieldBidangHelp}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pekerjaan">{c.setup.fieldPekerjaan}</Label>
              <Input
                id="pekerjaan"
                value={profile.pekerjaan}
                placeholder={c.setup.fieldPekerjaanPlaceholder}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    pekerjaan: event.target.value,
                  }))
                }
                aria-describedby="pekerjaan-help"
              />
              <p id="pekerjaan-help" className="text-xs text-muted-foreground">
                {c.setup.fieldPekerjaanHelp}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lang">{c.setup.fieldTargetLanguage}</Label>
              <Select
                id="lang"
                value={profile.englishSegments ? 'mixed' : 'id'}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    englishSegments: event.target.value === 'mixed',
                  }))
                }
                aria-describedby="lang-help"
              >
                <option value="id">{c.setup.langId}</option>
                <option value="mixed">{c.setup.langMixed}</option>
              </Select>
              {profile.tujuan === 'ln' ? (
                <p id="lang-help" className="text-xs text-muted-foreground">
                  {c.setup.fieldTargetLanguageHelpLN}
                </p>
              ) : null}
            </div>

            <p className="text-xs text-muted-foreground">{c.setup.autoSavedNote}</p>

            <div className="flex justify-end">
              <Button onClick={() => setStep('documents')}>
                {c.common.next}
                <ArrowRight aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Step 2 — documents */}
      {step === 'documents' ? (
        <Card>
          <CardHeader>
            <CardTitle>{c.setup.documentsTitle}</CardTitle>
            <CardDescription>{c.setup.documentsSubtitle}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(['cv', academicDoc, 'essay'] as DocKind[]).map((kind) => (
              <DocumentSlot
                key={kind}
                kind={kind}
                label={docCopy[kind].label}
                help={docCopy[kind].help}
                required={required.includes(kind)}
                doc={documents[kind]}
                onChange={(doc) =>
                  setDocuments((current) => {
                    const next = { ...current };
                    if (doc) next[kind] = doc;
                    else delete next[kind];
                    return next;
                  })
                }
              />
            ))}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('profile')}>
                <ArrowLeft aria-hidden />
                {c.common.back}
              </Button>
              <Button onClick={() => setStep('review')}>
                {c.common.next}
                <ArrowRight aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Step 3 — review & gating */}
      {step === 'review' ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{c.setup.reviewTitle}</CardTitle>
              <CardDescription>{c.setup.reviewSubtitle}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <ReviewRow
                title={c.setup.reviewProfile}
                ok={missingProfile.length === 0}
                detail={
                  profileReady
                    ? [
                        profile.name || '—',
                        profile.jenjang === 'doktor'
                          ? c.setup.fieldJenjangDoktor
                          : c.setup.fieldJenjangMagister,
                        profile.tujuan === 'ln'
                          ? c.setup.fieldTujuanLN
                          : c.setup.fieldTujuanDN,
                        profile.universitas || '—',
                        profile.prodi || '—',
                      ].join(' · ')
                    : c.common.loading
                }
              />
              <ReviewRow
                title={c.setup.reviewDocuments}
                ok={missingDocs.length === 0}
                detail={
                  docsReady
                    ? required
                        .map(
                          (kind) =>
                            `${docLabel(kind)}: ${
                              documents[kind]
                                ? `${formatNumber(documents[kind]!.charCount, locale)} ${c.common.characters}`
                                : '—'
                            }`,
                        )
                        .join(' · ')
                    : c.common.loading
                }
              />
              <ReviewRow
                title={c.setup.reviewLlm}
                ok={configured}
                detail={
                  settingsReady
                    ? configured
                      ? c.setup.reviewLlmReady
                      : c.setup.reviewLlmMissing
                    : c.common.loading
                }
              />
              <ReviewRow
                title={c.setup.reviewBudget}
                ok
                detail={f(c.setup.reviewBudgetValue, {
                  chars: formatNumber(totalContextChars(documents, profile), locale),
                })}
              />
            </CardContent>
          </Card>

          {!ready ? (
            <Alert variant="warning">
              <AlertTriangle aria-hidden />
              <AlertTitle>{c.setup.blockedTitle}</AlertTitle>
              <AlertDescription>
                <ul className="mt-2 space-y-1">
                  {missingProfile.length > 0 ? (
                    <li>
                      {f(c.setup.missingProfileFields, {
                        fields: missingProfile
                          .map((field) => profileFieldLabel[field])
                          .join(', '),
                      })}
                    </li>
                  ) : null}
                  {missingDocs.length > 0 ? (
                    <li>
                      {f(c.setup.missingDocs, {
                        docs: missingDocs.map((kind) => docCopy[kind].label).join(', '),
                      })}
                    </li>
                  ) : null}
                  {!configured ? (
                    <li className="flex flex-wrap items-center gap-2">
                      {c.setup.missingLlm}
                      <Button asChild size="sm" variant="secondary">
                        <Link href="/settings" className="inline-flex items-center gap-1.5">
                          <KeyRound aria-hidden className="size-3.5" />
                          {c.nav.settings}
                        </Link>
                      </Button>
                    </li>
                  ) : null}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap justify-between gap-3">
            <Button variant="outline" onClick={() => setStep('documents')}>
              <ArrowLeft aria-hidden />
              {c.common.back}
            </Button>
            <Button size="lg" disabled={!ready} onClick={startInterview}>
              <Play aria-hidden />
              {c.setup.startInterview}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReviewRow({
  title,
  ok,
  detail,
}: {
  title: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-4 last:border-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 break-words text-xs text-muted-foreground">{detail}</p>
      </div>
      <Badge variant={ok ? 'success' : 'warning'} className="shrink-0">
        {ok ? <CheckCircle2 aria-hidden className="size-3" /> : <AlertTriangle aria-hidden className="size-3" />}
      </Badge>
    </div>
  );
}
