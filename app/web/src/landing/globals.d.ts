// Build-time flags injected by `define` in vite.config.ts and src/landing/vite.landing.config.mjs.
// True only when the corresponding file is really present in public/ at build time, so the landing
// page never links a download that does not exist.
declare const __HAS_APK__: boolean;
declare const __HAS_NOTICES__: boolean;
