/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The site's origin, defined by vite.config.ts from the SITE_ORIGIN environment variable; see src/site.ts. */
  readonly SITE_ORIGIN: string | undefined;
}
