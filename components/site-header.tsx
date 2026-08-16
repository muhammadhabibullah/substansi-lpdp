'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GraduationCap, Languages, Menu, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/components/i18n-provider';
import { LOCALES, LOCALE_LABELS, isLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function SiteHeader() {
  const { c, locale, setLocale } = useI18n();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = React.useState(false);

  const links = React.useMemo(
    () => [
      { href: '/setup', label: c.nav.setup },
      { href: '/interview', label: c.nav.interview },
      { href: '/report', label: c.nav.report },
      { href: '/settings', label: c.nav.settings },
    ],
    [c],
  );

  const isActive = (href: string) => pathname?.startsWith(href) ?? false;

  // Close the mobile menu whenever the route changes.
  React.useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
          aria-label={c.meta.appName}
        >
          <GraduationCap aria-hidden className="size-6 text-primary" />
          <span>{c.meta.appName}</span>
        </Link>

        <nav aria-label={c.nav.home} className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive(link.href)
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 sm:flex">
            <Languages aria-hidden className="size-4 text-muted-foreground" />
            <Select
              aria-label={c.nav.languageLabel}
              value={locale}
              onChange={(event) => {
                const next = event.target.value;
                if (isLocale(next)) setLocale(next);
              }}
              className="h-9 w-[9.5rem] text-xs"
            >
              {LOCALES.map((code) => (
                <option key={code} value={code}>
                  {LOCALE_LABELS[code]}
                </option>
              ))}
            </Select>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? c.nav.closeMenu : c.nav.openMenu}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden /> : <Menu aria-hidden />}
          </Button>
        </div>
      </div>

      {menuOpen ? (
        <div className="border-t border-border md:hidden">
          <nav className="container flex flex-col gap-1 py-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className={cn(
                  'rounded-md px-3 py-2 text-sm font-medium',
                  isActive(link.href)
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 flex items-center gap-2 px-3">
              <Languages aria-hidden className="size-4 text-muted-foreground" />
              <Select
                aria-label={c.nav.languageLabel}
                value={locale}
                onChange={(event) => {
                  const next = event.target.value;
                  if (isLocale(next)) setLocale(next);
                }}
                className="h-9 text-xs"
              >
                {LOCALES.map((code) => (
                  <option key={code} value={code}>
                    {LOCALE_LABELS[code]}
                  </option>
                ))}
              </Select>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
