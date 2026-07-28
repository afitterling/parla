/**
 * Catch-all for URLs no route matches.
 *
 * Two separate things had to be silenced to stop the SST alert emails:
 *
 * 1. The router's own 404 carries an inner `Error("No route matches URL ...")`.
 *    Remix only skips `handleError` for ErrorResponses whose `.error` is unset,
 *    so that inner Error made every scanner probe a console.error. Throwing a
 *    bare Response below leaves `.error` undefined.
 * 2. Remix's default root ErrorBoundary console.errors whatever it renders
 *    (@remix-run/react errorBoundaries.js). Exporting an ErrorBoundary here
 *    keeps the throw from ever reaching it.
 */

// Paths that only ever come from vulnerability scanners. Answered 403 so the
// intent is visible in access logs, and never routed into the app.
const FORBIDDEN = [
  /^\/\./, // /.env, /.git/config, /.aws/credentials, /.ssh/id_rsa
  /^\/(wp-|wordpress\b)/,
  /^\/(vendor|phpmyadmin|pma|adminer|cgi-bin|actuator)(\/|$)/,
  /\.(php|phtml|asp|aspx|jsp|cgi|sh|bak|old|sql|zip|tar|gz)$/,
  /^\/(config|credentials|secret|secrets|backup|dump|database)\.(json|ya?ml|xml|txt|env)$/,
];

export function loader({ request }: { request: Request }) {
  const { pathname } = new URL(request.url);
  const forbidden = FORBIDDEN.some((pattern) => pattern.test(pathname));

  throw new Response(null, {
    status: forbidden ? 403 : 404,
    headers: { "X-Robots-Tag": "noindex, nofollow" },
  });
}

export default function CatchAll() {
  // The loader always throws, so this never renders. It exists so the route is
  // treated as a page route rather than a resource route.
  return null;
}

// Inline styles so the page stands on its own if the app's CSS never loads.
export function ErrorBoundary() {
  return (
    <main
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
        padding: "2rem",
        textAlign: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
        Page not found
      </h1>
      <p style={{ margin: 0, opacity: 0.7 }}>
        That address doesn&rsquo;t exist.
      </p>
      <a href="/" style={{ textDecoration: "underline" }}>
        Go to the homepage
      </a>
    </main>
  );
}
