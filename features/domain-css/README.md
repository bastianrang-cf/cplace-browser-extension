# Domain CSS injection

Inject arbitrary CSS on cplace pages, scoped by a hostname/path glob. Useful for environment labels ("DEV"/"TEST" badges), highlighting admin sessions, or any other per-tenant visual customization a team agrees on.

## Pattern syntax

Each rule has a `pattern` and a `css` string. The pattern is split on the **first** `/`:

- The half before the first `/` is matched against `location.hostname`.
- The half from the `/` onwards (if any) is matched against `location.pathname`.
- `*` is a wildcard (matches any chars including `.` and `/`). Other regex metacharacters are escaped literally.
- `?query` and `#hash` are ignored.
- `chrome://`, `chrome-extension://`, `about:`, `edge://`, `file://`, `moz-extension://` pages never match.

Patterns are evaluated only on pages where the extension's core detects `#cplace`.

| Pattern | Matches |
|---|---|
| `*` | any host, any path |
| `*.cplace.cloud` | all subdomains of `cplace.cloud`, any path |
| `test.cplace.cloud` | every tenant on `test.cplace.cloud` |
| `dev-customer.com/prefix-*` | tenants on `dev-customer.com` whose path starts with `/prefix-` |

## Examples

**Red admin border** (shipped as default seed):

```
pattern: *
css:     body.cf-cplace-admin-access #cplace { border: 3px solid red !important; }
```

**DEV corner label for a specific environment:**

```
pattern: dev.cplace.cloud
css:     body::after {
           content: "DEV";
           position: fixed;
           right: 8px;
           bottom: 8px;
           padding: 4px 10px;
           background: #d97706;
           color: white;
           font-weight: bold;
           border-radius: 4px;
           z-index: 999999;
           pointer-events: none;
         }
```

Share your rules with the team by copying the JSON shape from `chrome.storage.local`:

```
moduleOptions['domain-css'] = { rules: [ { pattern, css }, ... ] }
```

(A polished import/export UI is planned; for now copy/paste is the share mechanism.)

## How injection works

The rules are evaluated in the content script; the resulting CSS is sent to the background, which calls `browser.scripting.insertCSS` against the active tab. This keeps the page CSP clean — no inline `<style>` tags are required.

## Extending the seed

`features/domain-css/seed.js` exports a `seedRules` array. New entries here only affect **first installs** (the storage seeder leaves existing keys untouched). Existing users edit their rules via the Options page.
