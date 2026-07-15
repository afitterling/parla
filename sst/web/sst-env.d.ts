/* Types for the resources linked in sst.config.ts (`link: [openAiApiKey, table]`).
 *
 * SST normally generates this file itself on `sst dev` / `sst deploy`. This
 * scaffold has never been deployed, so it is hand-written to match what SST
 * would emit — it lets `npm run typecheck` pass without AWS credentials.
 * SST will overwrite it on the first real `sst dev`; that is expected, and if
 * the generated version differs, the generated one is correct.
 */
import 'sst';

declare module 'sst' {
  export interface Resource {
    OpenAiApiKey: {
      type: 'sst.sst.Secret';
      value: string;
    };
    ParlaData: {
      type: 'sst.aws.Dynamo';
      name: string;
    };
  }
}

export {};
