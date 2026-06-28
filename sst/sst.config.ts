/// <reference path="./.sst/platform/config.d.ts" />
export default $config({
  app() { return { name: "parla-landing", removal: "remove", home: "aws" }; },
  async run() { new sst.aws.Remix("ParlaLanding", { path: "landing" }); },
});
