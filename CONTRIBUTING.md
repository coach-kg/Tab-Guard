# Contributing

Thanks for wanting to help.

- **Bugs:** open an issue with the browser and version, the site (if it's not private), what you expected and what happened. A screenshot helps.
- **Ideas:** open an issue first, so we can talk about it before anyone writes code. Tab Guard stays small on purpose.
- **Translations:** the in-app texts are in `extension/assets/i18n.js`, the store name and description in `extension/_locales/`. Native, friendly, non-judgmental wording matters more than literal accuracy.

## Ground rules for code

- Everything stays local: no network requests, no analytics, no remote code.
- No `innerHTML` with anything that came from a page. Build the DOM or use `textContent`.
- The user sets the rules. No hidden behaviour; anything that acts on the user can be seen and switched in the settings.
- Plain JavaScript, no build step for the extension itself.

Before opening a pull request, run `scripts/build.sh` and `npx addons-linter dist/tab-guard_v*-firefox.zip`, and load the `extension` folder unpacked to check your change in a real browser.
