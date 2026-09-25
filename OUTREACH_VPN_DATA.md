# Outreach: which ways around the filter work in Iran

What readers in Iran most want to know is which VPN or circumvention tool gets through today. Public
measurements from inside Iran cover only a few tools (OONI: Tor, Snowflake, Psiphon's own servers,
Riseup VPN, STUN; Psiphon Conduit statistics; Tor Metrics per bridge type; Cloudflare WARP via APNIC).
The tools most people use — V2Ray/Xray, Hiddify, NekoBox, commercial VPNs — have no public figures
from inside Iran. Their developers have them. This file holds the two requests.

## 1. Citizen Lab test list (Iran) — entries to submit

Submit on https://test-lists.ooni.org/ (list "Iran (ir)"), one by one, like pull request #2277.
Once merged, OONI Probe tests these pages in Iran and the dashboard shows whether people can reach
them to download the tool. All addresses were checked to exist on 25 September 2026.

| URL | Category | Note |
|---|---|---|
| `https://hiddify.com/` | ANON | Hiddify, a V2Ray/Xray client widely used in Iran |
| `https://github.com/hiddify/hiddify-app/releases` | ANON | Hiddify app downloads (GitHub releases) |
| `https://github.com/2dust/v2rayNG/releases` | ANON | v2rayNG Android client downloads |
| `https://github.com/MatsuriDayo/NekoBoxForAndroid/releases` | ANON | NekoBox Android client downloads |
| `https://windscribe.com/` | ANON | Windscribe VPN |
| `https://one.one.one.one/` | ANON | Cloudflare WARP (1.1.1.1 app) download page |
| `https://snowflake.torproject.org/` | ANON | Tor Snowflake |
| `https://conduit.psiphon.ca/` | ANON | Psiphon Conduit (46,799 stations run in Iran, Psiphon statistics) |

Already on the global list and therefore tested in Iran (no action needed): psiphon.ca,
torproject.org, bridges.torproject.org, protonvpn.com, nordvpn.com, surfshark.com, mullvad.net,
getoutline.org, www.hotspotshield.com, www.tunnelbear.com.

## 2. Request to tool developers for aggregate figures (English, ready to send)

Recipients: Psiphon (info@psiphon.ca — they already publish Conduit figures; ask for the same per
protocol), Lantern, Hiddify, ASL19 (Beepass), Windscribe. Use each project's contact form or
published address; this file does not guess addresses.

> **Subject: Aggregate, daily connection figures for Iran — for a public censorship dashboard**
>
> Hello,
>
> I run the Iran Censorship Monitor, an open-source dashboard (English and Farsi) that shows people
> in Iran and journalists abroad, in plain language, what is blocked in Iran and which ways around
> the filter work. All findings come from measurements taken inside Iran: OONI Probe tests, RIPE
> Atlas probes in Iranian networks, Tor Metrics, and — since this week — Psiphon's public Conduit
> statistics, which show about 0.9 million Conduit connections from Iran on 24 September 2026.
>
> The question readers ask most is: *which tool works today?* For [PROJECT] there is no public
> figure from inside Iran. Would you be willing to publish, or share with us, **aggregate daily
> figures for Iran**, for example:
>
> - daily successful connections or active users from Iran;
> - if possible, split by protocol or transport (e.g. VLESS/Reality, Shadowsocks, WireGuard);
> - optionally the share of connection attempts that succeed.
>
> We need nothing per user, per network or per location below country level, and we would never
> publish anything that could identify a user or a server. A public JSON endpoint like Psiphon's
> (stats.psianalytics.live) would be ideal; a weekly CSV would also work. We credit the source by
> name on the page, keep the figures dated and label them as usage, not as proof that a particular
> service can be reached. Our results are published under CC BY-NC-SA 4.0 and the code is MIT.
>
> If this is possible in principle, I am glad to agree on format, delay and wording with you.
>
> Thank you for what you do for people in Iran.
>
> [Name] · Iran Censorship Monitor · [public address once online]

## What the dashboard already shows (25 September 2026)

- OONI tests from inside Iran: Tor (partly), Tor via Snowflake (fails), Tor without bridges (too few
  tests), Psiphon's own servers (fails), Riseup VPN (too few tests), STUN (partly), encrypted DNS by
  name (fails) and by IP address (partly).
- Psiphon Conduit: daily connections from Iran and Conduit stations in Iran (Psiphon statistics).
- Tor Metrics: daily users from Iran, direct and per bridge type (obfs4, WebTunnel, Snowflake, meek).
- Cloudflare WARP: share of users in Iran (APNIC).
- Download sites of the tools (OONI website tests).
