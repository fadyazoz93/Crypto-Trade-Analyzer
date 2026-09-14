/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly APP_URL?: string;
  readonly CRON_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
