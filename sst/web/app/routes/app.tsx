import { NavLink, Outlet } from '@remix-run/react';
import type { LinksFunction } from '@remix-run/node';
import parlaStyles from '~/styles/parla.css?url';

export const links: LinksFunction = () => [{ rel: 'stylesheet', href: parlaStyles }];

// The Parla web UI shell — header + bottom tab bar, mirroring the iOS and
// desktop layout. Child routes render the individual screens.
//
// SCAFFOLD: static shell only. Settings/theme/i18n are not wired to the
// providers yet (app/core/i18n/I18nContext.tsx exists and is ready to use).
const TABS = [
  { to: '/app', label: 'Dialog', end: true },
  { to: '/app/vocab', label: 'Vokabular', end: false },
  { to: '/app/phrases', label: 'Phrasen', end: false },
  { to: '/app/settings', label: 'Einstellungen', end: false },
];

export default function AppShell() {
  return (
    <div className="app">
      <header className="header">
        <div className="logo-mark">
          <span className="logo-mark-text">文</span>
          <span className="logo-dot" />
        </div>
        <div className="header-text">
          <div className="logo">
            Parl<span className="logo-a">a</span>
          </div>
          <div className="tagline">SPRECHEN · TRANSKRIBIEREN · LERNEN</div>
        </div>
      </header>

      <div className="body">
        <Outlet />
      </div>

      <nav className="tabbar">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => `tab${isActive ? ' active' : ''}`}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
