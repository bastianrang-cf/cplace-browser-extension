# Security Policy

We take the security of the cplace browser extension seriously. This
document describes how to report a vulnerability and what to expect after
you do.

## Supported Versions

Only the latest released version of the extension (the most recent tag on
the [Releases page](https://github.com/bastianrang-cf/cplace-browser-extension/releases))
receives security updates. If you are running an older build, please
update before filing a report so we can confirm the issue still
reproduces.

| Version | Supported |
|---------|-----------|
| Latest release | ✅ |
| Older releases | ❌ |

## Reporting a Vulnerability

**Please do not report security issues through public GitHub issues,
pull requests, or discussions.**

Use one of the following private channels instead:

1. **GitHub Private Vulnerability Reporting (preferred).** Open a report
   via the repository's
   [Security advisories → Report a vulnerability](https://github.com/bastianrang-cf/cplace-browser-extension/security/advisories/new)
   page. This keeps the conversation private between you and the
   maintainers.
2. **Email.** Send the details to
   [bastian.rang@cplace.com](mailto:bastian.rang@cplace.com). If you
   want to encrypt the message, request a PGP key in your first email
   and one will be provided.

Please include as much of the following as you can:

- A description of the issue and its impact.
- The extension version, browser (Chrome/Edge/Firefox/Safari) and
  browser version where you observed it.
- Step-by-step instructions to reproduce, ideally with a minimal test
  page or screen recording.
- Any proof-of-concept code, logs, or screenshots.
- Whether the issue is already public or known to other parties.

## What to Expect

- **Acknowledgement:** within **3 business days** of receiving your
  report.
- **Triage and initial assessment:** within **7 business days**, with a
  severity classification and an indication of next steps.
- **Status updates:** at least every 14 days while the report is open.
- **Fix and disclosure:** once a fix is ready, a new release will be
  published and — if appropriate — a GitHub Security Advisory will be
  issued. We are happy to credit reporters in the advisory unless you
  prefer to remain anonymous.

We aim to resolve confirmed high-severity issues within **30 days** of
acknowledgement; less severe issues may take longer depending on
complexity.

## Scope

In scope:

- The extension code in this repository (background, content scripts,
  popup, options page, feature modules under `features/`).
- The build and release pipeline configured in `.github/workflows/`.
- The extension as published on the Chrome Web Store, Edge Add-ons,
  Firefox Add-ons, and Safari Extensions galleries.

Out of scope:

- Vulnerabilities in the cplace product itself — please report those
  through cplace's standard support channels.
- Issues in third-party browsers, operating systems, or unrelated
  websites the extension happens to run on.
- Reports based solely on automated scanner output without a
  demonstrated impact.
- Social-engineering, physical-access, or denial-of-service attacks
  against repository maintainers.

## Safe Harbor

We will not pursue or support legal action against researchers who:

- Make a good-faith effort to comply with this policy.
- Avoid privacy violations, data destruction, and service degradation.
- Give us a reasonable amount of time to fix the issue before any
  public disclosure.

Thank you for helping keep the cplace browser extension and its users
safe.
