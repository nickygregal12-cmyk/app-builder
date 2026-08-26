/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_APP_SCENARIO?: string;
  readonly PUBLIC_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
