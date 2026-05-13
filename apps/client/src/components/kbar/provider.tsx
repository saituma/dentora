'use client';

import {
  KBarAnimator,
  KBarPortal,
  KBarPositioner,
  KBarProvider,
  KBarResults,
  KBarSearch,
  useMatches,
} from 'kbar';
import { useRouter } from 'next/navigation';

const navActions = [
  {
    id: 'overview',
    name: 'Overview',
    shortcut: ['g', 'h'],
    section: 'Navigate',
    perform: '/dashboard',
  },
  {
    id: 'ai',
    name: 'AI Receptionist',
    shortcut: ['g', 'a'],
    section: 'Navigate',
    perform: '/dashboard/ai-receptionist',
  },
  {
    id: 'calls',
    name: 'Calls',
    shortcut: ['g', 'c'],
    section: 'Navigate',
    perform: '/dashboard/calls',
  },
  {
    id: 'appointments',
    name: 'Appointments',
    shortcut: ['g', 't'],
    section: 'Navigate',
    perform: '/dashboard/appointments',
  },
  {
    id: 'patients',
    name: 'Patients',
    shortcut: ['g', 'p'],
    section: 'Navigate',
    perform: '/dashboard/patients',
  },
  {
    id: 'analytics',
    name: 'Analytics',
    shortcut: ['g', 'n'],
    section: 'Navigate',
    perform: '/dashboard/analytics',
  },
  {
    id: 'integrations',
    name: 'Integrations',
    shortcut: ['g', 'i'],
    section: 'Navigate',
    perform: '/dashboard/integrations',
  },
  {
    id: 'settings',
    name: 'Settings',
    shortcut: ['g', 's'],
    section: 'Navigate',
    perform: '/dashboard/settings',
  },
];

function Results() {
  const { results } = useMatches();
  return (
    <KBarResults
      items={results}
      onRender={({ item, active }) =>
        typeof item === 'string' ? (
          <div
            style={{
              padding: '8px 16px 4px',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--muted-foreground)',
            }}
          >
            {item}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 16px',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--accent-foreground)' : 'var(--foreground)',
              cursor: 'pointer',
              fontSize: 14,
              borderRadius: 6,
              margin: '0 4px',
            }}
          >
            <span>{item.name}</span>
            {(item.shortcut?.length ?? 0) > 0 && (
              <div style={{ display: 'flex', gap: 4 }}>
                {item.shortcut?.map((key) => (
                  <kbd
                    key={key}
                    style={{
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontSize: 11,
                      background: 'var(--muted)',
                      color: 'var(--muted-foreground)',
                      fontFamily: 'monospace',
                    }}
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            )}
          </div>
        )
      }
    />
  );
}

export function DashboardKBarProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const actions = navActions.map((a) => ({
    ...a,
    perform: () => router.push(a.perform),
  }));

  return (
    <KBarProvider actions={actions}>
      <KBarPortal>
        <KBarPositioner
          style={{ zIndex: 9999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        >
          <KBarAnimator
            style={{
              width: '100%',
              maxWidth: 560,
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
            }}
          >
            <KBarSearch
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: 15,
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                outline: 'none',
                color: 'var(--foreground)',
              }}
              placeholder="Search or navigate…"
            />
            <div style={{ paddingBottom: 8 }}>
              <Results />
            </div>
          </KBarAnimator>
        </KBarPositioner>
      </KBarPortal>
      {children}
    </KBarProvider>
  );
}
