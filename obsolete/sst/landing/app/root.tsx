import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";
import type { LinksFunction, MetaFunction } from "@remix-run/node";
import styles from "~/styles/app.css?url";

export const links: LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "stylesheet", href: styles },
];

export const meta: MetaFunction = () => [
  { title: "Parla — Sprich eine neue Sprache, vom ersten Tag an" },
  {
    name: "description",
    content:
      "Parla ist deine KI-Sprachlern-App: sprich per Stimme, sieh die Transkription, lerne mit Phrasen-Trainer und Pinyin-Lesehilfe.",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
