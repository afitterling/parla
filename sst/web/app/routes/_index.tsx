import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";

type Locale = "de" | "en" | "zh" | "ms" | "da" | "sv";

const LOCALES: { code: Locale; label: string }[] = [
  { code: "de", label: "DE" },
  { code: "en", label: "EN" },
  { code: "zh", label: "中文" },
  { code: "ms", label: "MS" },
  { code: "da", label: "DA" },
  { code: "sv", label: "SV" },
];

function resolveLocale(value: string | null): Locale {
  return LOCALES.some((l) => l.code === value) ? (value as Locale) : "de";
}

type Strings = {
  meta: { title: string; description: string };
  nav: { story: string; features: string; how: string; waitlist: string };
  hero: {
    pill: string;
    h1a: string;
    h1b: string;
    sub: string;
    ctaPrimary: string;
    ctaSecondary: string;
    bullets: string[];
  };
  story: {
    eyebrow: string;
    h2: string;
    quote: string;
    paragraphs: string[];
    close: string;
  };
  features: {
    eyebrow: string;
    h2: string;
    lead: string;
    items: { title: string; description: string }[];
  };
  gallery: { eyebrow: string; h2: string; lead: string; shots: string[] };
  how: {
    eyebrow: string;
    h2: string;
    steps: { title: string; text: string }[];
  };
  waitlist: {
    h2: string;
    p: string;
    placeholder: string;
    button: string;
    success: string;
    error: string;
  };
  footer: { tagline: string };
};

const CONTENT: Record<Locale, Strings> = {
  de: {
    meta: {
      title: "Parla — Sprich eine neue Sprache, vom ersten Tag an",
      description:
        "Parla ist deine KI-Sprachlern-App: sprich per Stimme, sieh die Transkription, lerne mit Phrasen-Trainer und Pinyin-Lesehilfe.",
    },
    nav: {
      story: "Story",
      features: "Features",
      how: "So funktioniert's",
      waitlist: "Warteliste",
    },
    hero: {
      pill: "Sprechen · Transkribieren · Lernen",
      h1a: "Sprich eine neue Sprache —",
      h1b: "vom ersten Tag an.",
      sub: "Parla ist dein KI-Gesprächspartner. Sprich einfach drauflos, sieh sofort die Transkription, und lerne mit Phrasen-Trainer und Pinyin-Lesehilfe — alles per Stimme.",
      ctaPrimary: "Auf die Warteliste",
      ctaSecondary: "Features ansehen",
      bullets: ["Voice-first", "8 Sprachen + Pinyin", "Phrasen-Trainer"],
    },
    story: {
      eyebrow: "Die Idee",
      h2: "Warum Parla?",
      quote: "„Sprache ist immer Dialog.",
      paragraphs: [
        "Gerade in Asien habe ich gelernt: Wenn du wirklich ankommen willst, brauchst du ein Werkzeug an deiner Seite, mit dem du im richtigen Moment schnell reagieren kannst.",
        "Aber ich wollte kein blindes Tool, das stumpf für dich übersetzt — sondern eines, das dich wirklich besser macht. Parla kann beides: Es hilft dir, im Moment zu antworten, und trainiert gleichzeitig deine eigenen Sprachfähigkeiten.",
        "Dafür merkt sich Parla, was dir wirklich begegnet: deine Wörter, deine Sätze, deine Situationen. So lernst du aus echten, selbst erlebten Momenten — nicht aus abstrakten Vokabellisten.",
      ],
      close:
        "Parla ist für alle, die mit minimalem Aufwand eine Sprache lernen wollen. Für alle, die schnell kommunizieren und sich vom ersten Moment an mit einer neuen Sprache verbinden möchten.",
    },
    features: {
      eyebrow: "Features",
      h2: "Lernen, indem du sprichst.",
      lead: "Kein Pauken von Listen. Du führst echte Gespräche — Parla hört zu, korrigiert sanft und gibt dir alles an die Hand, um es zu behalten.",
      items: [
        {
          title: "Voice-Dialog",
          description:
            "Sprich frei oder lass dich von Parla mit Fragen herausfordern. Ein natürliches Gespräch in deiner Zielsprache.",
        },
        {
          title: "Sofort-Transkription",
          description:
            "Deine Stimme wird in Echtzeit per Whisper transkribiert — du siehst genau, was du gesagt hast.",
        },
        {
          title: "Pinyin-Lesehilfe",
          description:
            "Für Chinesisch, Taiwanesisch & Japanisch: Umschrift unter jedem Satz, ein Tipp schaltet sie an und aus.",
        },
        {
          title: "Phrasen-Trainer",
          description:
            "Merke dir ganze Sätze, tagge sie und trainiere sie als Karteikarten — in der Original-Sprache.",
        },
        {
          title: "Vokabular",
          description:
            "Nützliche Wörter werden automatisch vorgeschlagen — mit Übersetzung und Pinyin, ein Tipp zum Speichern.",
        },
        {
          title: "Input- & Ziel-Sprache",
          description:
            "Sprich in deiner Sprache, lerne eine andere. Frei kombinierbar aus Deutsch, Englisch, Chinesisch & mehr.",
        },
      ],
    },
    gallery: {
      eyebrow: "Einblick",
      h2: "So fühlt sich Parla an.",
      lead: "Ein klarer, ruhiger Look — gebaut fürs Sprechen. Hier ein paar Eindrücke aus der App.",
      shots: ["Dialog", "Phrasen-Trainer", "Vokabular"],
    },
    how: {
      eyebrow: "So funktioniert's",
      h2: "In drei Schritten.",
      steps: [
        {
          title: "Sprechen",
          text: "Tippe aufs Mikro und sag, was dir einfällt — in deiner Sprache oder der Zielsprache.",
        },
        {
          title: "Transkribieren",
          text: "Parla wandelt deine Stimme in Text und antwortet natürlich in deiner Zielsprache.",
        },
        {
          title: "Lernen",
          text: "Speichere Wörter und Phrasen und festige sie mit dem eingebauten Trainer.",
        },
      ],
    },
    waitlist: {
      h2: "Sei von Anfang an dabei.",
      p: "Parla kommt für iOS und Desktop. Trag dich ein und erfahre als Erste:r, wenn es losgeht.",
      placeholder: "deine@email.de",
      button: "Eintragen",
      success: "Danke! Du bist auf der Warteliste.",
      error: "Bitte gib eine gültige E-Mail-Adresse ein.",
    },
    footer: { tagline: "© 2026 Parla · Sprechen · Transkribieren · Lernen" },
  },

  en: {
    meta: {
      title: "Parla — Speak a new language, from day one",
      description:
        "Parla is your AI language-learning app: speak out loud, see the transcription, and learn with a phrase trainer and Pinyin reading aid.",
    },
    nav: {
      story: "Story",
      features: "Features",
      how: "How it works",
      waitlist: "Waitlist",
    },
    hero: {
      pill: "Speak · Transcribe · Learn",
      h1a: "Speak a new language —",
      h1b: "from day one.",
      sub: "Parla is your AI conversation partner. Just start talking, see the transcription instantly, and learn with a phrase trainer and Pinyin reading aid — all by voice.",
      ctaPrimary: "Join the waitlist",
      ctaSecondary: "See features",
      bullets: ["Voice-first", "8 languages + Pinyin", "Phrase trainer"],
    },
    story: {
      eyebrow: "The idea",
      h2: "Why Parla?",
      quote: "“Language is always a dialogue.”",
      paragraphs: [
        "Especially in Asia, I learned this: if you really want to connect, you need a tool at your side that lets you react quickly in the right moment.",
        "But I didn't want a blind tool that just translates for you — I wanted one that actually makes you better. Parla does both: it helps you respond in the moment, and trains your own language skills along the way.",
        "To do that, Parla remembers what you actually encounter: your words, your sentences, your situations. So you learn from real, lived moments — not from abstract vocabulary lists.",
      ],
      close:
        "Parla is for everyone who wants to learn a language with minimal effort. For everyone who wants to communicate quickly and start getting entangled with a new language from the very first moment.",
    },
    features: {
      eyebrow: "Features",
      h2: "Learn by speaking.",
      lead: "No cramming lists. You have real conversations — Parla listens, corrects gently, and gives you everything you need to remember it.",
      items: [
        {
          title: "Voice dialogue",
          description:
            "Speak freely or let Parla challenge you with questions. A natural conversation in your target language.",
        },
        {
          title: "Instant transcription",
          description:
            "Your voice is transcribed in real time with Whisper — you see exactly what you said.",
        },
        {
          title: "Pinyin reading aid",
          description:
            "For Chinese, Taiwanese & Japanese: romanization under every sentence, one tap toggles it on and off.",
        },
        {
          title: "Phrase trainer",
          description:
            "Save whole sentences, tag them, and train them as flashcards — in the original language.",
        },
        {
          title: "Vocabulary",
          description:
            "Useful words are suggested automatically — with translation and Pinyin, one tap to save.",
        },
        {
          title: "Input & target language",
          description:
            "Speak in your language, learn another. Freely combine German, English, Chinese & more.",
        },
      ],
    },
    gallery: {
      eyebrow: "A look inside",
      h2: "How Parla feels.",
      lead: "A clear, calm look — built for speaking. Here are a few impressions from the app.",
      shots: ["Dialogue", "Phrase trainer", "Vocabulary"],
    },
    how: {
      eyebrow: "How it works",
      h2: "In three steps.",
      steps: [
        {
          title: "Speak",
          text: "Tap the mic and say whatever comes to mind — in your language or the target one.",
        },
        {
          title: "Transcribe",
          text: "Parla turns your voice into text and replies naturally in your target language.",
        },
        {
          title: "Learn",
          text: "Save words and phrases and lock them in with the built-in trainer.",
        },
      ],
    },
    waitlist: {
      h2: "Be there from the start.",
      p: "Parla is coming for iOS and desktop. Sign up and be the first to know when it launches.",
      placeholder: "you@email.com",
      button: "Sign up",
      success: "Thanks! You're on the waitlist.",
      error: "Please enter a valid email address.",
    },
    footer: { tagline: "© 2026 Parla · Speak · Transcribe · Learn" },
  },

  zh: {
    meta: {
      title: "Parla — 从第一天起，开口说新语言",
      description:
        "Parla 是你的 AI 语言学习应用：开口说话、即时看到转写，用短语训练器和拼音辅助学习。",
    },
    nav: {
      story: "故事",
      features: "功能",
      how: "使用方法",
      waitlist: "等候名单",
    },
    hero: {
      pill: "说话 · 转写 · 学习",
      h1a: "开口说一门新语言 —",
      h1b: "从第一天起。",
      sub: "Parla 是你的 AI 对话伙伴。直接开口说，即时看到转写，用短语训练器和拼音辅助学习 —— 全程用语音。",
      ctaPrimary: "加入等候名单",
      ctaSecondary: "查看功能",
      bullets: ["语音优先", "8 种语言 + 拼音", "短语训练器"],
    },
    story: {
      eyebrow: "理念",
      h2: "为什么是 Parla？",
      quote: "「语言永远是对话。」",
      paragraphs: [
        "尤其在亚洲，我体会到：如果你真的想融入，就需要一个随身的工具，让你在关键时刻迅速反应。",
        "但我不想要一个只会盲目替你翻译的工具，而是一个真正让你变得更好的工具。Parla 两者兼顾：它帮你在当下回应，同时也一步步训练你自己的语言能力。",
        "为此，Parla 会记住你真正遇到的东西：你的词、你的句子、你的情境。于是你从真实、亲历的时刻中学习 —— 而不是死记抽象的单词表。",
      ],
      close:
        "Parla 适合每一个想用最少精力学语言的人。适合每一个想要快速沟通、从第一刻起就与一门新语言紧密相连的人。",
    },
    features: {
      eyebrow: "功能",
      h2: "在开口中学习。",
      lead: "不再死背清单。你进行真实的对话 —— Parla 倾听、温和地纠正，并给你记住它所需的一切。",
      items: [
        {
          title: "语音对话",
          description:
            "自由开口，或让 Parla 用问题挑战你。用你的目标语言进行自然的交谈。",
        },
        {
          title: "即时转写",
          description: "你的声音由 Whisper 实时转写 —— 你能清楚看到自己说了什么。",
        },
        {
          title: "拼音辅助",
          description:
            "针对中文、繁体中文和日语：每句下方显示注音，一点即可开关。",
        },
        {
          title: "短语训练器",
          description: "保存整句话、加标签，并以闪卡形式训练 —— 用原文语言。",
        },
        {
          title: "词汇",
          description: "自动推荐有用的词 —— 附翻译和拼音，一点即可保存。",
        },
        {
          title: "输入与目标语言",
          description:
            "用你的语言说，学另一门语言。德语、英语、中文等可自由组合。",
        },
      ],
    },
    gallery: {
      eyebrow: "抢先看",
      h2: "Parla 的感觉。",
      lead: "清晰、沉静的界面 —— 为开口而生。这里是应用的几处一瞥。",
      shots: ["对话", "短语训练器", "词汇"],
    },
    how: {
      eyebrow: "使用方法",
      h2: "三步搞定。",
      steps: [
        {
          title: "说",
          text: "点一下麦克风，想到什么就说什么 —— 用你的语言或目标语言。",
        },
        {
          title: "转写",
          text: "Parla 把你的声音转成文字，并用你的目标语言自然回应。",
        },
        {
          title: "学",
          text: "保存单词和短语，用内置训练器把它们牢牢记住。",
        },
      ],
    },
    waitlist: {
      h2: "从一开始就加入。",
      p: "Parla 即将登陆 iOS 和桌面端。留下邮箱，第一时间获知上线消息。",
      placeholder: "你的@邮箱.com",
      button: "提交",
      success: "谢谢！你已加入等候名单。",
      error: "请输入有效的电子邮件地址。",
    },
    footer: { tagline: "© 2026 Parla · 说话 · 转写 · 学习" },
  },

  ms: {
    meta: {
      title: "Parla — Tutur bahasa baharu, dari hari pertama",
      description:
        "Parla ialah apl pembelajaran bahasa AI anda: bertutur dengan suara, lihat transkripsi, dan belajar dengan pelatih frasa serta bantuan bacaan Pinyin.",
    },
    nav: {
      story: "Kisah",
      features: "Ciri",
      how: "Cara ia berfungsi",
      waitlist: "Senarai menunggu",
    },
    hero: {
      pill: "Bertutur · Transkripsi · Belajar",
      h1a: "Tutur bahasa baharu —",
      h1b: "dari hari pertama.",
      sub: "Parla ialah rakan perbualan AI anda. Mula bertutur sahaja, lihat transkripsi serta-merta, dan belajar dengan pelatih frasa serta bantuan bacaan Pinyin — semuanya melalui suara.",
      ctaPrimary: "Sertai senarai menunggu",
      ctaSecondary: "Lihat ciri",
      bullets: ["Suara dahulu", "8 bahasa + Pinyin", "Pelatih frasa"],
    },
    story: {
      eyebrow: "Ideanya",
      h2: "Mengapa Parla?",
      quote: "“Bahasa sentiasa satu dialog.”",
      paragraphs: [
        "Terutama di Asia, saya belajar: jika anda benar-benar mahu menyertai, anda perlukan alat di sisi anda yang membolehkan anda bertindak balas dengan cepat pada saat yang tepat.",
        "Tetapi saya tidak mahu alat buta yang sekadar menterjemah untuk anda — saya mahu yang benar-benar menjadikan anda lebih baik. Parla melakukan kedua-duanya: ia membantu anda menjawab pada masa itu, dan melatih kemahiran bahasa anda sendiri sepanjang perjalanan.",
        "Untuk itu, Parla mengingati apa yang benar-benar anda temui: perkataan anda, ayat anda, situasi anda. Maka anda belajar daripada saat sebenar yang dialami sendiri — bukan daripada senarai perbendaharaan kata yang abstrak.",
      ],
      close:
        "Parla untuk semua yang mahu belajar bahasa dengan usaha minimum. Untuk semua yang mahu berkomunikasi dengan cepat dan mula terikat dengan bahasa baharu sejak saat pertama.",
    },
    features: {
      eyebrow: "Ciri",
      h2: "Belajar sambil bertutur.",
      lead: "Tiada lagi menghafal senarai. Anda berbual secara sebenar — Parla mendengar, membetulkan dengan lembut, dan memberi anda segala yang perlu untuk mengingatinya.",
      items: [
        {
          title: "Dialog suara",
          description:
            "Bertutur bebas atau biar Parla mencabar anda dengan soalan. Perbualan semula jadi dalam bahasa sasaran anda.",
        },
        {
          title: "Transkripsi serta-merta",
          description:
            "Suara anda ditranskripsi dalam masa nyata dengan Whisper — anda nampak tepat apa yang anda kata.",
        },
        {
          title: "Bantuan bacaan Pinyin",
          description:
            "Untuk bahasa Cina, Cina Tradisional & Jepun: transliterasi di bawah setiap ayat, satu ketik untuk hidup/mati.",
        },
        {
          title: "Pelatih frasa",
          description:
            "Simpan ayat penuh, tag, dan latih sebagai kad imbas — dalam bahasa asal.",
        },
        {
          title: "Perbendaharaan kata",
          description:
            "Perkataan berguna dicadangkan secara automatik — dengan terjemahan dan Pinyin, satu ketik untuk simpan.",
        },
        {
          title: "Bahasa input & sasaran",
          description:
            "Bertutur dalam bahasa anda, belajar yang lain. Gabungkan bebas bahasa Jerman, Inggeris, Cina & lagi.",
        },
      ],
    },
    gallery: {
      eyebrow: "Intipan",
      h2: "Rasa Parla.",
      lead: "Reka bentuk yang jelas dan tenang — dibina untuk bertutur. Ini beberapa gambaran dari apl.",
      shots: ["Dialog", "Pelatih frasa", "Perbendaharaan kata"],
    },
    how: {
      eyebrow: "Cara ia berfungsi",
      h2: "Dalam tiga langkah.",
      steps: [
        {
          title: "Bertutur",
          text: "Ketik mikrofon dan sebut apa sahaja yang terlintas — dalam bahasa anda atau bahasa sasaran.",
        },
        {
          title: "Transkripsi",
          text: "Parla menukar suara anda kepada teks dan menjawab secara semula jadi dalam bahasa sasaran anda.",
        },
        {
          title: "Belajar",
          text: "Simpan perkataan dan frasa serta kukuhkannya dengan pelatih terbina dalam.",
        },
      ],
    },
    waitlist: {
      h2: "Sertai dari mula.",
      p: "Parla akan datang untuk iOS dan desktop. Daftar dan jadi yang pertama tahu apabila ia dilancarkan.",
      placeholder: "anda@email.com",
      button: "Daftar",
      success: "Terima kasih! Anda dalam senarai menunggu.",
      error: "Sila masukkan alamat e-mel yang sah.",
    },
    footer: { tagline: "© 2026 Parla · Bertutur · Transkripsi · Belajar" },
  },

  da: {
    meta: {
      title: "Parla — Tal et nyt sprog, fra dag ét",
      description:
        "Parla er din AI-sprogapp: tal højt, se transskriptionen, og lær med frasetræner og Pinyin-læsehjælp.",
    },
    nav: {
      story: "Historie",
      features: "Funktioner",
      how: "Sådan virker det",
      waitlist: "Venteliste",
    },
    hero: {
      pill: "Tal · Transskriber · Lær",
      h1a: "Tal et nyt sprog —",
      h1b: "fra dag ét.",
      sub: "Parla er din AI-samtalepartner. Bare begynd at tale, se transskriptionen med det samme, og lær med frasetræner og Pinyin-læsehjælp — alt sammen med stemmen.",
      ctaPrimary: "Kom på ventelisten",
      ctaSecondary: "Se funktioner",
      bullets: ["Stemme først", "8 sprog + Pinyin", "Frasetræner"],
    },
    story: {
      eyebrow: "Idéen",
      h2: "Hvorfor Parla?",
      quote: "“Sprog er altid dialog.”",
      paragraphs: [
        "Især i Asien lærte jeg det: Hvis du virkelig vil falde ind, har du brug for et værktøj ved din side, der lader dig reagere hurtigt i det rette øjeblik.",
        "Men jeg ville ikke have et blindt værktøj, der bare oversætter for dig — jeg ville have et, der faktisk gør dig bedre. Parla gør begge dele: Det hjælper dig med at svare i nuet og træner samtidig dine egne sprogfærdigheder.",
        "Derfor husker Parla det, du rent faktisk møder: dine ord, dine sætninger, dine situationer. Så du lærer af virkelige, selvoplevede øjeblikke — ikke af abstrakte gloselister.",
      ],
      close:
        "Parla er for alle, der vil lære et sprog med minimal indsats. For alle, der vil kommunikere hurtigt og begynde at væve sig sammen med et nyt sprog fra første øjeblik.",
    },
    features: {
      eyebrow: "Funktioner",
      h2: "Lær ved at tale.",
      lead: "Ingen udenadslæren af lister. Du fører rigtige samtaler — Parla lytter, retter blidt og giver dig alt, hvad du skal bruge for at huske det.",
      items: [
        {
          title: "Stemmedialog",
          description:
            "Tal frit, eller lad Parla udfordre dig med spørgsmål. En naturlig samtale på dit målsprog.",
        },
        {
          title: "Øjeblikkelig transskription",
          description:
            "Din stemme transskriberes i realtid med Whisper — du ser præcis, hvad du sagde.",
        },
        {
          title: "Pinyin-læsehjælp",
          description:
            "Til kinesisk, taiwansk og japansk: omskrift under hver sætning, ét tryk slår den til og fra.",
        },
        {
          title: "Frasetræner",
          description:
            "Gem hele sætninger, tag dem, og træn dem som flashcards — på originalsproget.",
        },
        {
          title: "Ordforråd",
          description:
            "Nyttige ord foreslås automatisk — med oversættelse og Pinyin, ét tryk for at gemme.",
        },
        {
          title: "Input- & målsprog",
          description:
            "Tal dit sprog, lær et andet. Kombinér frit tysk, engelsk, kinesisk og mere.",
        },
      ],
    },
    gallery: {
      eyebrow: "Et kig indenfor",
      h2: "Sådan føles Parla.",
      lead: "Et klart, roligt look — bygget til at tale. Her er et par indtryk fra appen.",
      shots: ["Dialog", "Frasetræner", "Ordforråd"],
    },
    how: {
      eyebrow: "Sådan virker det",
      h2: "I tre trin.",
      steps: [
        {
          title: "Tal",
          text: "Tryk på mikrofonen og sig, hvad der falder dig ind — på dit sprog eller målsproget.",
        },
        {
          title: "Transskriber",
          text: "Parla laver din stemme om til tekst og svarer naturligt på dit målsprog.",
        },
        {
          title: "Lær",
          text: "Gem ord og fraser, og forankr dem med den indbyggede træner.",
        },
      ],
    },
    waitlist: {
      h2: "Vær med fra starten.",
      p: "Parla er på vej til iOS og desktop. Skriv dig op, og vær den første til at vide, når det går i luften.",
      placeholder: "dig@email.dk",
      button: "Tilmeld",
      success: "Tak! Du er på ventelisten.",
      error: "Indtast venligst en gyldig e-mailadresse.",
    },
    footer: { tagline: "© 2026 Parla · Tal · Transskriber · Lær" },
  },

  sv: {
    meta: {
      title: "Parla — Tala ett nytt språk, från dag ett",
      description:
        "Parla är din AI-språkapp: tala högt, se transkriberingen och lär dig med frastränare och Pinyin-läshjälp.",
    },
    nav: {
      story: "Berättelse",
      features: "Funktioner",
      how: "Så fungerar det",
      waitlist: "Väntelista",
    },
    hero: {
      pill: "Tala · Transkribera · Lär",
      h1a: "Tala ett nytt språk —",
      h1b: "från dag ett.",
      sub: "Parla är din AI-samtalspartner. Börja bara prata, se transkriberingen direkt och lär dig med frastränare och Pinyin-läshjälp — allt med rösten.",
      ctaPrimary: "Gå med i väntelistan",
      ctaSecondary: "Se funktioner",
      bullets: ["Röst först", "8 språk + Pinyin", "Frastränare"],
    },
    story: {
      eyebrow: "Idén",
      h2: "Varför Parla?",
      quote: "“Språk är alltid en dialog.”",
      paragraphs: [
        "Särskilt i Asien lärde jag mig: Om du verkligen vill komma in behöver du ett verktyg vid din sida som låter dig reagera snabbt i rätt ögonblick.",
        "Men jag ville inte ha ett blint verktyg som bara översätter åt dig — jag ville ha ett som faktiskt gör dig bättre. Parla gör båda: det hjälper dig att svara i stunden och tränar samtidigt dina egna språkfärdigheter.",
        "För det minns Parla vad du faktiskt möter: dina ord, dina meningar, dina situationer. Så du lär dig av verkliga, självupplevda ögonblick — inte av abstrakta ordlistor.",
      ],
      close:
        "Parla är för alla som vill lära sig ett språk med minimal ansträngning. För alla som vill kommunicera snabbt och börja flätas samman med ett nytt språk från första stund.",
    },
    features: {
      eyebrow: "Funktioner",
      h2: "Lär dig genom att tala.",
      lead: "Inget pluggande av listor. Du för riktiga samtal — Parla lyssnar, rättar varsamt och ger dig allt du behöver för att minnas det.",
      items: [
        {
          title: "Röstdialog",
          description:
            "Tala fritt eller låt Parla utmana dig med frågor. Ett naturligt samtal på ditt målspråk.",
        },
        {
          title: "Direkt transkribering",
          description:
            "Din röst transkriberas i realtid med Whisper — du ser exakt vad du sa.",
        },
        {
          title: "Pinyin-läshjälp",
          description:
            "För kinesiska, taiwanesiska och japanska: omskrift under varje mening, en knapptryckning slår på och av den.",
        },
        {
          title: "Frastränare",
          description:
            "Spara hela meningar, tagga dem och träna dem som flashcards — på originalspråket.",
        },
        {
          title: "Ordförråd",
          description:
            "Användbara ord föreslås automatiskt — med översättning och Pinyin, ett tryck för att spara.",
        },
        {
          title: "Käll- & målspråk",
          description:
            "Tala ditt språk, lär dig ett annat. Kombinera fritt tyska, engelska, kinesiska och mer.",
        },
      ],
    },
    gallery: {
      eyebrow: "En titt inuti",
      h2: "Så känns Parla.",
      lead: "En tydlig, lugn känsla — byggd för att tala. Här är några intryck från appen.",
      shots: ["Dialog", "Frastränare", "Ordförråd"],
    },
    how: {
      eyebrow: "Så fungerar det",
      h2: "I tre steg.",
      steps: [
        {
          title: "Tala",
          text: "Tryck på mikrofonen och säg vad som faller dig in — på ditt språk eller målspråket.",
        },
        {
          title: "Transkribera",
          text: "Parla gör om din röst till text och svarar naturligt på ditt målspråk.",
        },
        {
          title: "Lär",
          text: "Spara ord och fraser och befäst dem med den inbyggda tränaren.",
        },
      ],
    },
    waitlist: {
      h2: "Var med från början.",
      p: "Parla kommer till iOS och desktop. Anmäl dig och bli först att veta när det drar igång.",
      placeholder: "du@email.se",
      button: "Anmäl",
      success: "Tack! Du är på väntelistan.",
      error: "Ange en giltig e-postadress.",
    },
    footer: { tagline: "© 2026 Parla · Tala · Transkribera · Lär" },
  },
};

const SHOT_SRCS = ["/shot-1.svg", "/shot-2.svg", "/shot-3.svg"];
const BULLET_COLORS = ["var(--accent)", "var(--accent2)", "var(--success)"];

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

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const c = CONTENT[data?.locale ?? "de"];
  return [
    { title: c.meta.title },
    { name: "description", content: c.meta.description },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const locale = resolveLocale(new URL(request.url).searchParams.get("lang"));
  return json({ locale });
}

type ActionData = { ok: boolean };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();

  if (!email || !EMAIL_RE.test(email)) {
    return json<ActionData>({ ok: false }, { status: 400 });
  }

  // In a real deployment this is where the email would be persisted.
  return json<ActionData>({ ok: true });
}

export default function Index() {
  const { locale } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const c = CONTENT[locale];
  const q = `?lang=${locale}`;

  return (
    <>
      <nav>
        <div className="wrap">
          <a className="brand" href={`${q}#top`}>
            Parla
          </a>
          <div className="navlinks">
            <a href="#story">{c.nav.story}</a>
            <a href="#features">{c.nav.features}</a>
            <a href="#how">{c.nav.how}</a>
            <a className="btn" href="#waitlist">
              {c.nav.waitlist}
            </a>
            <span className="langswitch">
              {LOCALES.map((l) => (
                <a
                  key={l.code}
                  className={`lang${l.code === locale ? " active" : ""}`}
                  href={`?lang=${l.code}`}
                >
                  {l.label}
                </a>
              ))}
            </span>
          </div>
        </div>
      </nav>

      <header className="wrap hero" id="top">
        <div>
          <span className="pill">{c.hero.pill}</span>
          <h1>
            {c.hero.h1a} <span className="grad">{c.hero.h1b}</span>
          </h1>
          <p className="sub">{c.hero.sub}</p>
          <div className="cta">
            <a className="btn" href="#waitlist">
              {c.hero.ctaPrimary}
            </a>
            <a className="btn ghost" href="#features">
              {c.hero.ctaSecondary}
            </a>
          </div>
          <div className="herobullets">
            {c.hero.bullets.map((b, i) => (
              <span key={b}>
                <span className="dot" style={{ background: BULLET_COLORS[i] }} />{" "}
                {b}
              </span>
            ))}
          </div>
        </div>

        <div className="hero-shot">
          <img src="/hero.svg" alt="Parla app screenshot" width={360} height={520} />
        </div>
      </header>

      <section id="story" className="wrap">
        <span className="eyebrow">{c.story.eyebrow}</span>
        <h2>{c.story.h2}</h2>
        <div className="story">
          <p className="storyquote">{c.story.quote}</p>
          {c.story.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p className="storyclose">{c.story.close}</p>
        </div>
      </section>

      <section id="features" className="wrap">
        <span className="eyebrow">{c.features.eyebrow}</span>
        <h2>{c.features.h2}</h2>
        <p className="lead">{c.features.lead}</p>
        <div className="grid">
          {c.features.items.map((f, i) => (
            <article
              className={`feat ${i % 2 === 0 ? "feat-accent" : "feat-accent2"}`}
              key={f.title}
            >
              <span className="bar" />
              <span className="badge">{String(i + 1).padStart(2, "0")}</span>
              <h3>{f.title}</h3>
              <p>{f.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="wrap" id="gallery">
        <span className="eyebrow">{c.gallery.eyebrow}</span>
        <h2>{c.gallery.h2}</h2>
        <p className="lead">{c.gallery.lead}</p>
        <div className="gallery">
          {c.gallery.shots.map((label, i) => (
            <figure className="shot" key={label}>
              <img
                src={SHOT_SRCS[i]}
                alt={`${label} – screenshot`}
                width={320}
                height={220}
              />
              <figcaption>{label}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section id="how" className="wrap">
        <span className="eyebrow">{c.how.eyebrow}</span>
        <h2>{c.how.h2}</h2>
        <div className="steps">
          {c.how.steps.map((s, i) => (
            <div className="step" key={s.title}>
              <div className="stepnum">{i + 1}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap" id="waitlist">
        <div className="cta-band">
          <h2>{c.waitlist.h2}</h2>
          <p>{c.waitlist.p}</p>
          {actionData?.ok ? (
            <p className="success" role="status">
              {c.waitlist.success}
            </p>
          ) : (
            <Form className="form" method="post" action={q}>
              <input
                type="email"
                name="email"
                placeholder={c.waitlist.placeholder}
                aria-label="E-Mail"
                required
              />
              <button className="btn" type="submit">
                {c.waitlist.button}
              </button>
            </Form>
          )}
          {actionData && !actionData.ok ? (
            <p className="error" role="alert">
              {c.waitlist.error}
            </p>
          ) : null}
        </div>
      </section>

      <footer>
        <div className="wrap footer-inner">
          <div className="footer-top">
            <a className="brand" href={`${q}#top`}>
              Parla
            </a>
            <span>{c.footer.tagline}</span>
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
