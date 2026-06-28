import type { ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";

export const meta: MetaFunction = () => [
  { title: "Parla — Sprich eine neue Sprache, vom ersten Tag an" },
  {
    name: "description",
    content:
      "Parla ist deine KI-Sprachlern-App: sprich per Stimme, sieh die Transkription, lerne mit Phrasen-Trainer und Pinyin-Lesehilfe.",
  },
];

type ActionData =
  | { ok: true }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();

  if (!email || !EMAIL_RE.test(email)) {
    return json<ActionData>(
      { ok: false, error: "Bitte gib eine gültige E-Mail-Adresse ein." },
      { status: 400 },
    );
  }

  // In a real deployment this is where the email would be persisted.
  return json<ActionData>({ ok: true });
}

type Feature = {
  title: string;
  description: string;
  badge: string;
};

const FEATURES: Feature[] = [
  {
    title: "Voice-Dialog",
    badge: "01",
    description:
      "Sprich frei oder lass dich von Parla mit Fragen herausfordern. Ein natürliches Gespräch in deiner Zielsprache.",
  },
  {
    title: "Sofort-Transkription",
    badge: "02",
    description:
      "Deine Stimme wird in Echtzeit per Whisper transkribiert — du siehst genau, was du gesagt hast.",
  },
  {
    title: "Pinyin-Lesehilfe",
    badge: "03",
    description:
      "Für Chinesisch, Taiwanesisch & Japanisch: Umschrift unter jedem Satz, ein Tipp schaltet sie an und aus.",
  },
  {
    title: "Phrasen-Trainer",
    badge: "04",
    description:
      "Merke dir ganze Sätze, tagge sie und trainiere sie als Karteikarten — in der Original-Sprache.",
  },
  {
    title: "Vokabular",
    badge: "05",
    description:
      "Nützliche Wörter werden automatisch vorgeschlagen — mit Übersetzung und Pinyin, ein Tipp zum Speichern.",
  },
  {
    title: "Input- & Ziel-Sprache",
    badge: "06",
    description:
      "Sprich in deiner Sprache, lerne eine andere. Frei kombinierbar aus Deutsch, Englisch, Chinesisch & mehr.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Sprechen",
    text: "Tippe aufs Mikro und sag, was dir einfällt — in deiner Sprache oder der Zielsprache.",
  },
  {
    n: "2",
    title: "Transkribieren",
    text: "Parla wandelt deine Stimme in Text und antwortet natürlich in deiner Zielsprache.",
  },
  {
    n: "3",
    title: "Lernen",
    text: "Speichere Wörter und Phrasen und festige sie mit dem eingebauten Trainer.",
  },
];

const SHOTS = [
  { src: "/shot-1.svg", label: "Dialog" },
  { src: "/shot-2.svg", label: "Phrasen-Trainer" },
  { src: "/shot-3.svg", label: "Vokabular" },
];

const LANGS = [
  "Deutsch",
  "English",
  "中文",
  "繁體中文",
  "日本語",
  "Español",
  "Français",
  "Italiano",
];

export default function Index() {
  const actionData = useActionData<typeof action>();

  return (
    <>
      <nav>
        <div className="wrap">
          <a className="brand" href="#top">
            Parla
          </a>
          <div className="navlinks">
            <a href="#features">Features</a>
            <a href="#how">So funktioniert&apos;s</a>
            <a className="btn" href="#waitlist">
              Warteliste
            </a>
          </div>
        </div>
      </nav>

      <header className="wrap hero" id="top">
        <div>
          <span className="pill">Sprechen · Transkribieren · Lernen</span>
          <h1>
            Sprich eine neue Sprache —{" "}
            <span className="grad">vom ersten Tag an.</span>
          </h1>
          <p className="sub">
            Parla ist dein KI-Gesprächspartner. Sprich einfach drauflos, sieh
            sofort die Transkription, und lerne mit Phrasen-Trainer und
            Pinyin-Lesehilfe — alles per Stimme.
          </p>
          <div className="cta">
            <a className="btn" href="#waitlist">
              Auf die Warteliste
            </a>
            <a className="btn ghost" href="#features">
              Features ansehen
            </a>
          </div>
          <div className="herobullets">
            <span>
              <span className="dot" style={{ background: "var(--accent)" }} />{" "}
              Voice-first
            </span>
            <span>
              <span className="dot" style={{ background: "var(--accent2)" }} />{" "}
              8 Sprachen + Pinyin
            </span>
            <span>
              <span className="dot" style={{ background: "var(--success)" }} />{" "}
              Phrasen-Trainer
            </span>
          </div>
        </div>

        <div className="hero-shot">
          <img src="/hero.svg" alt="App-Screenshot von Parla" width={360} height={520} />
        </div>
      </header>

      <section id="features" className="wrap">
        <span className="eyebrow">Features</span>
        <h2>Lernen, indem du sprichst.</h2>
        <p className="lead">
          Kein Pauken von Listen. Du führst echte Gespräche — Parla hört zu,
          korrigiert sanft und gibt dir alles an die Hand, um es zu behalten.
        </p>
        <div className="grid">
          {FEATURES.map((f, i) => (
            <article
              className={`feat ${i % 2 === 0 ? "feat-accent" : "feat-accent2"}`}
              key={f.title}
            >
              <span className="bar" />
              <span className="badge">{f.badge}</span>
              <h3>{f.title}</h3>
              <p>{f.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="wrap" id="gallery">
        <span className="eyebrow">Einblick</span>
        <h2>So fühlt sich Parla an.</h2>
        <p className="lead">
          Ein klarer, ruhiger Look — gebaut fürs Sprechen. Hier ein paar
          Eindrücke aus der App.
        </p>
        <div className="gallery">
          {SHOTS.map((s) => (
            <figure className="shot" key={s.src}>
              <img src={s.src} alt={`${s.label} – Screenshot`} width={320} height={220} />
              <figcaption>{s.label}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section id="how" className="wrap">
        <span className="eyebrow">So funktioniert&apos;s</span>
        <h2>In drei Schritten.</h2>
        <div className="steps">
          {STEPS.map((s) => (
            <div className="step" key={s.n}>
              <div className="stepnum">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap" id="waitlist">
        <div className="cta-band">
          <h2>Sei von Anfang an dabei.</h2>
          <p>
            Parla kommt für iOS und Desktop. Trag dich ein und erfahre als
            Erste:r, wenn es losgeht.
          </p>
          {actionData?.ok ? (
            <p className="success" role="status">
              Danke! Du bist auf der Warteliste.
            </p>
          ) : (
            <Form className="form" method="post">
              <input
                type="email"
                name="email"
                placeholder="deine@email.de"
                aria-label="E-Mail-Adresse"
                required
              />
              <button className="btn" type="submit">
                Eintragen
              </button>
            </Form>
          )}
          {actionData && !actionData.ok ? (
            <p className="error" role="alert">
              {actionData.error}
            </p>
          ) : null}
        </div>
      </section>

      <footer>
        <div className="wrap footer-inner">
          <div className="footer-top">
            <a className="brand" href="#top">
              Parla
            </a>
            <span>© 2026 Parla · Sprechen · Transkribieren · Lernen</span>
          </div>
          <div className="langs">
            {LANGS.map((l, i) => (
              <span key={l}>
                {i > 0 ? <span className="langsep"> · </span> : null}
                <span className="langtag">{l}</span>
              </span>
            ))}
          </div>
        </div>
      </footer>
    </>
  );
}
