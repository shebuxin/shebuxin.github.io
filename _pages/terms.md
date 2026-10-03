---
permalink: /terms/
title: "Terms and Privacy Policy"
modified: 2026-10-03
---

## Privacy Policy

This site is a personal academic website. It does not provide user accounts, comments, advertising, or payment forms.

### Analytics

{% if site.analytics.provider == "self-hosted" %}
This site uses an independently hosted analytics service. It records pageviews, server timestamps, referring website domains, campaign parameters, approximate device and browser types, browser language, and anonymous browser and session identifiers. If an offline GeoIP database is configured, it also records approximate country, region, and city. Raw IP addresses, full user-agent strings, URL query strings (other than the named campaign parameters), and URL fragments are not stored in the analytics database. Detailed records are accessible only through the administrator's authenticated dashboard.

The browser stores a random identifier for up to one year and a session identifier that restarts after 30 minutes without a pageview. These identifiers estimate browser counts, not actual people. Do Not Track and Global Privacy Control are respected. You can [disable analytics for this browser](/terms/?analytics=off) or [enable it again](/terms/?analytics=on). Disabling removes the stored identifiers and prevents future collection when browser storage is available. Existing server records are not erased by opting out. Records are retained until the site owner deletes them; there is no automatic retention limit.
{% else %}
This site uses GoatCounter for aggregate traffic statistics. The analytics script is configured in `_config.yml` and can be disabled in local development with `_config.dev.yml`.
{% endif %}

The homepage may display a synced country-level map derived from aggregate statistics. Self-hosted map counts represent pageviews; deduplicated browser counts remain in the private dashboard. The map does not display visitor names, IP addresses, cities, precise locations, or session data. Countries below the map's minimum aggregate threshold are omitted.

The interactive map loads version-pinned geographic rendering modules from esm.sh, so a visitor's browser may also make requests to that content delivery network.

### Contact

If you contact me by email, I use the information you send only to reply.
