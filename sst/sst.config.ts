/// <reference path="./.sst/platform/config.d.ts" />

// Parla on AWS — the marketing landing page and the Parla web UI served by one
// Remix app (landing at `/`, the app itself under `/app`).
//
// SCAFFOLD: infrastructure is declared but has not been deployed or verified
// against AWS. See sst/README.md for what is still open.
export default $config({
  app() {
    return {
      name: 'parla-web',
      removal: $app.stage === 'production' ? 'retain' : 'remove',
      home: 'aws',
    };
  },
  async run() {
    // The OpenAI key stays server-side. The mobile/desktop builds bake an
    // EXPO_PUBLIC_/VITE_ key into the client; on the web that key would be
    // trivially extractable by any visitor, so the browser never sees it — it
    // is read only inside the resource routes in web/app/routes/api.*.
    // Set with: `npx sst secret set OpenAiApiKey sk-... --stage <stage>`
    const openAiApiKey = new sst.Secret('OpenAiApiKey');

    // Vocab / phrases / settings, mirroring the JSON files the iOS + desktop
    // apps keep in the iCloud container. Single-table, partitioned per user.
    // TODO: this shape assumes an authenticated `userId`; revisit once auth is
    // decided (README, open question 1).
    const table = new sst.aws.Dynamo('ParlaData', {
      fields: {
        userId: 'string', // PK — owner of the record
        sk: 'string', // SK — e.g. `vocab#<id>`, `phrase#<id>`, `settings`
      },
      primaryIndex: { hashKey: 'userId', rangeKey: 'sk' },
    });

    new sst.aws.Remix('ParlaWeb', {
      path: 'web',
      link: [openAiApiKey, table],
      // TODO: attach a custom domain once one is chosen.
      // domain: { name: 'parla.app', redirects: ['www.parla.app'] },
    });
  },
});
