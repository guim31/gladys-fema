# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration needs no account and stores no secret. It reads the public OpenFEMA API
(`www.fema.gov`, HTTPS, no key) and the houses of Gladys (the `location` access of the manifest).
When no county is typed, it sends the location of the house, rounded to three decimals (about
100 m), to the public FCC Area API (`geo.fcc.gov`, HTTPS) to find its county, once and again only
when the house moves. Under `/data` it keeps one file, `fema.json`: per followed county code, the
FEMA declarations already seen, nothing about the user. The coordinates of the house are never
written to `/data` nor to the logs.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the OpenFEMA and FCC services.
