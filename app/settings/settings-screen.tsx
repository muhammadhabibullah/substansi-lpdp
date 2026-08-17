'use client';

import * as React from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react';

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
import { useSettings } from '@/hooks/use-app-state';
import { LOCALES, LOCALE_LABELS, describeLlmError, isLocale } from '@/lib/i18n';
import {
  findPreset,
  LlmError,
  normalizeBaseUrl,
  parseBaseUrl,
  PROVIDER_PRESETS,
  testConnection,
  type ConnectionTestResult,
} from '@/lib/llm';
import {
  approximateUsageBytes,
  clearAllAppData,
  formatBytes,
  loadDocuments,
  loadProfile,
  loadReport,
  loadSession,
} from '@/lib/storage';
import { clamp } from '@/lib/utils';

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'done'; result: ConnectionTestResult };

export function SettingsScreen() {
  const { c, f, locale, setLocale } = useI18n();
  const { settings, setSettings, hydrated } = useSettings();

  const [showKey, setShowKey] = React.useState(false);
  const [test, setTest] = React.useState<TestState>({ status: 'idle' });
  const [cleared, setCleared] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  // Snapshot of what is stored locally, for the "data in this browser" panel.
  const [dataSnapshot, setDataSnapshot] = React.useState({
    profile: false,
    documents: false,
    session: false,
    report: false,
    bytes: 0,
  });

  const refreshSnapshot = React.useCallback(() => {
    const documents = loadDocuments();
    setDataSnapshot({
      profile: loadProfile().name.trim().length > 0,
      documents: Object.keys(documents).length > 0,
      session: loadSession() !== null,
      report: loadReport() !== null,
      bytes: approximateUsageBytes(),
    });
  }, []);

  React.useEffect(() => {
    if (hydrated) refreshSnapshot();
  }, [hydrated, refreshSnapshot]);

  React.useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const preset = findPreset(settings.presetId);
  const baseUrlValid = parseBaseUrl(settings.baseUrl) !== null;

  const applyPreset = (presetId: string) => {
    const found = findPreset(presetId);
    if (!found) {
      setSettings((current) => ({ ...current, presetId: 'custom' }));
      return;
    }
    setSettings((current) => ({
      ...current,
      presetId: found.id,
      baseUrl: found.baseUrl,
      model: found.suggestedModel,
      cheapModel: found.suggestedCheapModel,
    }));
    setTest({ status: 'idle' });
  };

  const runTest = async () => {
    if (!baseUrlValid || settings.model.trim().length === 0) {
      setTest({
        status: 'done',
        result: {
          ok: false,
          error: new LlmError('not-configured', c.settings.testMissingFields),
        },
      });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setTest({ status: 'testing' });
    const result = await testConnection(settings, controller.signal);
    setTest({ status: 'done', result });
  };

  const handleClearAll = () => {
    if (!window.confirm(c.settings.clearAllConfirm)) return;
    clearAllAppData();
    setCleared(true);
    refreshSnapshot();
    // Reload so every hook re-hydrates from the now-empty storage.
    window.setTimeout(() => window.location.reload(), 600);
  };

  return (
    <div className="container max-w-3xl py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{c.settings.title}</h1>
        <p className="mt-2 text-muted-foreground">{c.settings.subtitle}</p>
      </header>

      {cleared ? (
        <Alert variant="success" className="mb-6">
          <CheckCircle2 aria-hidden />
          <AlertDescription>{c.settings.clearedAll}</AlertDescription>
        </Alert>
      ) : null}

      {/* LLM endpoint */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{c.settings.llmSectionTitle}</CardTitle>
          <CardDescription>{c.settings.presetHelp}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="preset">{c.settings.presetLabel}</Label>
            <Select
              id="preset"
              value={settings.presetId}
              onChange={(event) => applyPreset(event.target.value)}
            >
              {PROVIDER_PRESETS.map((item) => (
                <option key={item.id} value={item.id}>
                  {c.presets[item.labelKey]}
                </option>
              ))}
              <option value="custom">{c.settings.presetCustom}</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="baseUrl">{c.settings.baseUrlLabel}</Label>
            <Input
              id="baseUrl"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://api.openai.com/v1"
              value={settings.baseUrl}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  baseUrl: event.target.value,
                  presetId: 'custom',
                }))
              }
              onBlur={(event) =>
                setSettings((current) => ({
                  ...current,
                  baseUrl: normalizeBaseUrl(event.target.value),
                }))
              }
              aria-invalid={settings.baseUrl.length > 0 && !baseUrlValid}
              aria-describedby="baseUrl-help"
            />
            <p id="baseUrl-help" className="text-xs text-muted-foreground">
              {c.settings.baseUrlHelp}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">{c.settings.apiKeyLabel}</Label>
            <div className="flex gap-2">
              <Input
                id="apiKey"
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                placeholder={c.settings.apiKeyPlaceholder}
                value={settings.apiKey}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, apiKey: event.target.value }))
                }
                aria-describedby="apiKey-help"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowKey((visible) => !visible)}
                aria-label={showKey ? c.common.hide : c.common.show}
              >
                {showKey ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              </Button>
            </div>
            <p id="apiKey-help" className="text-xs text-muted-foreground">
              {preset && !preset.keyRequired
                ? c.settings.apiKeyNotNeeded
                : c.settings.apiKeyHelp}
            </p>
            {settings.apiKey.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{c.settings.apiKeyStored}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSettings((current) => ({ ...current, apiKey: '' }))
                  }
                >
                  {c.settings.clearKey}
                </Button>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="model">{c.settings.modelLabel}</Label>
              <Input
                id="model"
                autoComplete="off"
                spellCheck={false}
                value={settings.model}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, model: event.target.value }))
                }
                aria-describedby="model-help"
              />
              <p id="model-help" className="text-xs text-muted-foreground">
                {c.settings.modelHelp}
                {preset
                  ? ` ${f(c.settings.modelSuggested, { model: preset.suggestedModel })}`
                  : ''}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cheapModel">{c.settings.cheapModelLabel}</Label>
              <Input
                id="cheapModel"
                autoComplete="off"
                spellCheck={false}
                placeholder={settings.model}
                value={settings.cheapModel}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    cheapModel: event.target.value,
                  }))
                }
                aria-describedby="cheapModel-help"
              />
              <p id="cheapModel-help" className="text-xs text-muted-foreground">
                {c.settings.cheapModelHelp}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="temperature">
              {c.settings.temperatureLabel}: {settings.temperature.toFixed(1)}
            </Label>
            <input
              id="temperature"
              type="range"
              min={0}
              max={1.5}
              step={0.1}
              value={settings.temperature}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  temperature: clamp(Number.parseFloat(event.target.value), 0, 2),
                }))
              }
              className="w-full accent-primary"
              aria-describedby="temperature-help"
            />
            <p id="temperature-help" className="text-xs text-muted-foreground">
              {c.settings.temperatureHelp}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={runTest} disabled={test.status === 'testing'}>
              {test.status === 'testing' ? (
                <>
                  <Loader2 aria-hidden className="animate-spin" />
                  {c.settings.testing}
                </>
              ) : (
                c.settings.testConnection
              )}
            </Button>
            {preset ? (
              <a
                href={preset.docsUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs text-muted-foreground underline"
              >
                {c.presets[preset.labelKey]}
              </a>
            ) : null}
          </div>

          {test.status === 'done' ? (
            test.result.ok ? (
              <Alert variant="success">
                <CheckCircle2 aria-hidden />
                <AlertDescription>
                  {f(c.settings.testSuccess, { reply: test.result.reply ?? 'OK' })}
                </AlertDescription>
              </Alert>
            ) : (
              (() => {
                const described = test.result.error
                  ? describeLlmError(
                      test.result.error,
                      c,
                      c.settings.testMissingFields,
                    )
                  : null;
                return (
                  <Alert variant="destructive">
                    <XCircle aria-hidden />
                    <AlertDescription>
                      <p>
                        {f(c.settings.testFailed, {
                          error: described?.summary ?? c.common.unknownError,
                        })}
                      </p>
                      {described?.detail ? (
                        <p className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/50 px-2 py-1.5 font-mono text-xs">
                          {described.detail}
                        </p>
                      ) : null}
                    </AlertDescription>
                  </Alert>
                );
              })()
            )
          ) : null}
        </CardContent>
      </Card>

      {/* Key safety */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert aria-hidden className="size-5 text-primary" />
            {c.settings.safetyTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2 text-sm text-muted-foreground">
            {c.settings.safetyPoints.map((point) => (
              <li key={point} className="flex items-start gap-2">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <Alert variant="info">
            <AlertTitle>{c.settings.corsNoteTitle}</AlertTitle>
            <AlertDescription>{c.settings.corsNoteBody}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Interface language */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{c.settings.localeSectionTitle}</CardTitle>
          <CardDescription>{c.settings.localeHelp}</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            aria-label={c.nav.languageLabel}
            value={locale}
            onChange={(event) => {
              const next = event.target.value;
              if (isLocale(next)) setLocale(next);
            }}
            className="max-w-xs"
          >
            {LOCALES.map((code) => (
              <option key={code} value={code}>
                {LOCALE_LABELS[code]}
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>

      {/* Local data */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{c.settings.dataSectionTitle}</CardTitle>
          <CardDescription>
            {f(c.settings.dataSizeNote, { size: formatBytes(dataSnapshot.bytes) })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            {(
              [
                [c.settings.dataProfile, dataSnapshot.profile],
                [c.settings.dataDocuments, dataSnapshot.documents],
                [c.settings.dataInterview, dataSnapshot.session],
                [c.settings.dataReport, dataSnapshot.report],
              ] as const
            ).map(([label, present]) => (
              <div key={label} className="flex items-center justify-between gap-3 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>
                  <Badge variant={present ? 'success' : 'outline'}>
                    {present ? c.settings.dataPresent : c.settings.dataAbsent}
                  </Badge>
                </dd>
              </div>
            ))}
          </dl>

          <Button variant="destructive" onClick={handleClearAll}>
            <Trash2 aria-hidden />
            {c.settings.clearAll}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
