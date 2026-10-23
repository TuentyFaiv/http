# Security policy

## Supported versions

Only the latest published version receives security fixes while the package is in the 0.x
series.

The `0.2.0-beta` line is prerelease software intended for evaluation, not a
production stability guarantee. Report security issues in beta builds through
the same private channel below. Do not include credentials or private user data.

Public documentation demos must not act as an unrestricted HTTP proxy. Before
deployment, maintainers must verify request/body limits, timeouts, rate limiting,
origin policy, and safe error/log redaction.

## Reporting a vulnerability

Please do not open a public issue for a security vulnerability. Use GitHub's private
[security advisory](https://github.com/TuentyFaiv/http/security/advisories/new) flow when
available. You can also contact `contact@tuentyfaiv.com` with the subject `Security report`.

Please include:

- the affected version;
- a clear description of the impact;
- reproduction steps or a proof of concept; and
- any suggested mitigation.

You should receive an acknowledgement within seven days. Once a fix is available, we will
coordinate disclosure timing and credit reporters who want to be named.
