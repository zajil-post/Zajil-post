# Zajil Mobile App — Android Prototype Plan

## Guardrails
- This work is isolated on `app/android-prototype`.
- Do not merge to `main`, deploy to Vercel production, or publish to either app store without the owner's explicit approval.
- Keep the existing web product available and avoid unrelated UI/feature changes.
- Do not embed admin credentials, API secrets, or production-only secrets in the mobile bundle.

## Current repository findings
- The product is a static Arabic RTL HTML/CSS/JavaScript front end with a same-origin Vercel function at `/api/zajil`.
- `package.json` currently contains only the server-side `web-push` dependency and no front-end build pipeline.
- `manifest.json` and `sw.js` already provide a PWA foundation, including an installable standalone display mode, offline cache fallback, and web push handling.
- The manifest currently advertises only an SVG icon. We should create and verify Android-compatible PNG launcher assets and iOS app icons for store builds.
- The page loads Tailwind from its CDN and uses external font/icon assets. For a reliable native package and stronger offline behavior, evaluate bundling these assets locally instead of depending on third-party CDNs at runtime.
- The API relies on same-origin `/api/zajil`; the mobile prototype must use a deliberate API base URL or a supported remote-origin strategy without breaking authentication, CORS, or production data boundaries.
- The current GitHub Actions syntax workflow still runs `node --check bank-status.js`, but that file is absent from the current main branch after the bank-status feature removal. Fix this stale check in the prototype branch so CI can provide useful signal.
- The CSP in `index.html` still allows the old bank-monitor Worker origin even though the feature was removed. Remove that unused permission in this branch.

## Proposed implementation
1. **Baseline and cleanup (this branch):** remove stale bank-monitor CSP permission; fix the stale CI reference; record baseline behavior.
2. **Build setup:** introduce a minimal web build/output directory (prefer `www/` or a build output generated from the existing frontend) while preserving the Vercel serverless `api/` function. Do not configure Capacitor to copy the repository root wholesale, because that risks bundling server-side files and repository metadata into the app.
3. **Capacitor Android shell:** add Capacitor configuration and Android platform files on this branch only. Bundle the frontend locally, keep API calls pointed to a test environment, and use a clear app ID after confirming the publisher namespace.
4. **Device QA:** install a debug APK on a physical Android device; test startup, navigation, currency calculator, rate loading, question submission, admin-only screens, push permission behavior, keyboard/input behavior, network loss, and app resume.
5. **Hardening:** review external links, safe-area layout, status/navigation bars, privacy disclosures, permissions, secrets, and error states. Add automated checks for the generated web bundle and manifest.
6. **Store preparation:** create a signed Android App Bundle only after explicit approval, verify Play Console account/policy requirements, then prepare iOS with the same shared frontend and test through TestFlight on macOS/Xcode.
7. **Release gate:** keep all work in a PR for review. No merge, production deploy, or store submission without explicit approval.

## Acceptance criteria for the Android prototype
- Builds locally/CI as a debug Android app.
- Uses a dedicated test API/backend configuration and does not silently write test traffic to production.
- Core public features work on a physical device with Arabic RTL layout.
- No bank-status feature UI or Worker calls are reintroduced.
- No secrets are packaged in the app.
- Existing web production remains unchanged until a separately approved release.

## Decisions to confirm before store release
- Final Android application ID / iOS bundle ID and publisher display name.
- Whether mobile API requests should use a dedicated staging deployment or a remote web shell for the very first prototype.
- Privacy policy URL and data disclosures, including analytics, questions/inbox, push notifications, and any identifiers collected.
- Store assets, screenshots, support contact, and account ownership.
