'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Trash2, Upload } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ACCEPT_ATTRIBUTE,
  DOC_CHAR_LIMITS,
  DocumentError,
  fromPastedText,
  MAX_FILE_BYTES,
  parseFile,
} from '@/lib/documents';
import { formatBytes } from '@/lib/storage';
import type { DocKind, ParsedDoc } from '@/lib/types';
import { cn, countWords, formatNumber } from '@/lib/utils';

type Mode = 'upload' | 'paste';

interface DocumentSlotProps {
  kind: DocKind;
  label: string;
  help: string;
  required: boolean;
  doc: ParsedDoc | undefined;
  onChange: (doc: ParsedDoc | undefined) => void;
}

/**
 * One document slot: drag-and-drop / file-picker upload with a parse preview, or
 * a paste-text fallback for scanned PDFs (M2-3).
 *
 * Parsing happens entirely in the browser via `lib/documents.ts`.
 */
export function DocumentSlot({
  kind,
  label,
  help,
  required,
  doc,
  onChange,
}: DocumentSlotProps) {
  const { c, f, locale } = useI18n();
  const [mode, setMode] = React.useState<Mode>('upload');
  const [parsing, setParsing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [showPreview, setShowPreview] = React.useState(false);
  const [pasted, setPasted] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Keep the paste box in sync when a pasted doc is restored from storage.
  React.useEffect(() => {
    if (doc?.source === 'paste') {
      setPasted(doc.text);
      setMode('paste');
    }
  }, [doc?.source, doc?.parsedAt, doc?.text]);

  const describeDocError = React.useCallback(
    (docError: DocumentError): string => {
      switch (docError.kind) {
        case 'too-large':
          return f(c.setup.dropzoneHint, { size: formatBytes(MAX_FILE_BYTES) });
        case 'unsupported-type':
          return f(c.setup.dropzoneHint, { size: formatBytes(MAX_FILE_BYTES) });
        case 'scanned-pdf':
          return c.setup.scannedPdfHint;
        case 'empty-text':
          return c.setup.emptyTextWarning;
        default:
          return `${c.setup.parseFailed}: ${docError.message}`;
      }
    },
    [c, f],
  );

  const handleFile = React.useCallback(
    async (file: File) => {
      setError(null);
      setParsing(true);
      try {
        const parsed = await parseFile(file, kind);
        onChange(parsed);
      } catch (caught) {
        if (caught instanceof DocumentError) {
          setError(describeDocError(caught));
          // A scan has no text layer — steer the user to the paste tab.
          if (caught.kind === 'scanned-pdf' || caught.kind === 'empty-text') {
            setMode('paste');
          }
        } else {
          setError(c.setup.parseFailed);
        }
      } finally {
        setParsing(false);
      }
    },
    [c.setup.parseFailed, describeDocError, kind, onChange],
  );

  const commitPaste = React.useCallback(
    (text: string) => {
      setError(null);
      if (text.trim().length === 0) {
        onChange(undefined);
        return;
      }
      try {
        onChange(fromPastedText(text, kind));
      } catch (caught) {
        setError(
          caught instanceof DocumentError
            ? describeDocError(caught)
            : c.setup.parseFailed,
        );
      }
    },
    [c.setup.parseFailed, describeDocError, kind, onChange],
  );

  const limit = DOC_CHAR_LIMITS[kind];
  const over = doc ? doc.charCount > limit : false;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Label className="text-sm font-semibold">
            {label}{' '}
            {required ? (
              <span className="text-destructive" aria-label={c.common.required}>
                *
              </span>
            ) : (
              <span className="text-xs font-normal text-muted-foreground">
                ({c.common.optional})
              </span>
            )}
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">{help}</p>
        </div>
        {doc ? (
          <Badge variant="success" className="shrink-0">
            <CheckCircle2 aria-hidden className="size-3" />
            {doc.pageCount
              ? f(c.setup.parsedOk, {
                  words: formatNumber(countWords(doc.text), locale),
                  pages: doc.pageCount,
                })
              : f(c.setup.parsedOkNoPages, {
                  words: formatNumber(countWords(doc.text), locale),
                })}
          </Badge>
        ) : null}
      </div>

      {/* Mode tabs */}
      <div
        role="tablist"
        aria-label={label}
        className="mt-4 inline-flex rounded-md border border-border p-0.5"
      >
        {(['upload', 'paste'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={mode === option}
            onClick={() => setMode(option)}
            className={cn(
              'rounded px-3 py-1.5 text-xs font-medium transition-colors',
              mode === option
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option === 'upload' ? c.setup.uploadTab : c.setup.pasteTab}
          </button>
        ))}
      </div>

      {mode === 'upload' ? (
        <div className="mt-3">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            className={cn(
              'flex flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-border',
            )}
          >
            {parsing ? (
              <>
                <Loader2 aria-hidden className="size-5 animate-spin text-primary" />
                <p className="mt-2 text-sm text-muted-foreground">{c.setup.parsing}</p>
              </>
            ) : (
              <>
                <Upload aria-hidden className="size-5 text-muted-foreground" />
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="mt-2 text-sm font-medium text-primary underline"
                >
                  {c.setup.dropzoneLabel}
                </button>
                <p className="mt-1 text-xs text-muted-foreground">
                  {f(c.setup.dropzoneHint, { size: formatBytes(MAX_FILE_BYTES) })}
                </p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                // Allow re-picking the same filename.
                event.target.value = '';
              }}
            />
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <Textarea
            value={pasted}
            placeholder={c.setup.pastePlaceholder}
            rows={6}
            onChange={(event) => setPasted(event.target.value)}
            onBlur={(event) => commitPaste(event.target.value)}
            aria-label={label}
          />
          <p className="text-xs text-muted-foreground">
            {formatNumber(pasted.length, locale)} {c.common.characters}
          </p>
        </div>
      )}

      {error ? (
        <Alert variant="destructive" className="mt-3">
          <AlertTriangle aria-hidden />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {over ? (
        <Alert variant="warning" className="mt-3">
          <AlertTriangle aria-hidden />
          <AlertDescription>
            {f(c.setup.truncatedNotice, { limit: formatNumber(limit, locale) })}
          </AlertDescription>
        </Alert>
      ) : null}

      {doc ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {doc.fileName ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileText aria-hidden className="size-3.5" />
              {doc.fileName}
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPreview((visible) => !visible)}
          >
            {showPreview ? c.setup.previewToggleHide : c.setup.previewToggleShow}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(undefined);
              setPasted('');
              setError(null);
            }}
          >
            <Trash2 aria-hidden />
            {c.common.remove}
          </Button>
        </div>
      ) : null}

      {doc && showPreview ? (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium">{c.setup.previewTitle}</p>
          <div className="max-h-48 overflow-y-auto rounded-md bg-muted/50 p-3 text-xs prose-plain">
            {doc.text.slice(0, 4000)}
            {doc.text.length > 4000 ? '…' : ''}
          </div>
        </div>
      ) : null}
    </div>
  );
}
