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
| `https://iranopasmigirim.com/en` | POLR | "We Take Back Iran" (National Revolution TV); no OONI test so far |
| `https://copilot.microsoft.com/` | COMT | Microsoft Copilot (AI assistant); no OONI test so far |
| `https://grok.com/` | COMT | Grok (AI assistant); no OONI test so far |
| `https://www.meta.ai/` | COMT | Meta AI (AI assistant); no OONI test so far |
| `https://www.midjourney.com/` | COMT | Midjourney (AI images); no OONI test so far |
| `https://firefly.adobe.com/` | COMT | Adobe Firefly (AI images); no OONI test so far |
| `https://leonardo.ai/` | COMT | Leonardo AI (AI images); no OONI test so far |
| `https://ideogram.ai/` | COMT | Ideogram (AI images); no OONI test so far |
| `https://sora.chatgpt.com/` | COMT | Sora (AI video); no OONI test so far |
| `https://runway.com/` | COMT | Runway (AI video); no OONI test so far |
| `https://kling.ai/` | COMT | Kling AI (AI video); no OONI test so far |
| `https://pika.art/` | COMT | Pika (AI video); no OONI test so far |
| `https://lumalabs.ai/` | COMT | Luma Dream Machine (AI video); no OONI test so far |
| `https://elevenlabs.io/` | COMT | ElevenLabs (AI voice); no OONI test so far |
| `https://suno.com/` | COMT | Suno (AI music); no OONI test so far |
| `https://farahpahlavi.org/` | POLR | Official site of Queen Farah Pahlavi; no OONI test anywhere so far |

Already on the Iran list (no action needed): www.rezapahlavi.org and fa.rezapahlavi.org (710 OONI
tests from Iran since June 2026). Already on the global list and therefore tested in Iran: psiphon.ca,
torproject.org, bridges.torproject.org, protonvpn.com, nordvpn.com, surfshark.com, mullvad.net,
getoutline.org, www.hotspotshield.com, www.tunnelbear.com.

## 1b. Domestic services — entries to submit

Whether Iran's own services keep working while the country is cut off from the world (the
"National Information Network") can only be told from inside. OONI tests 175 domestic sites from
Iranian networks, mostly news and government pages, plus Digikala, Divar, Aparat, Eitaa, Bale,
iGap, Torob, Sheypoor, Varzesh3 and Telewebion (OONI aggregation, 27 June – 27 September 2026).
The everyday services below are on neither the Iran nor the global list. Submit them the same way
(list "Iran (ir)"). All names resolved on 27 September 2026; 16 of them (shaparak.ir, nine banks,
my.gov.ir, adliran.ir, tax.gov.ir, epolice.ir, post.ir, shad.ir, rightel.ir) do not answer from
abroad, which is why only a test from inside can say whether they work.

| URL | Category | Note |
|---|---|---|
| `https://www.shaparak.ir/` | COMM | Shaparak, the national card payment network |
| `https://www.cbi.ir/` | GOVT | Central Bank of Iran |
| `https://bmi.ir/` | COMM | Bank Melli Iran |
| `https://www.bankmellat.ir/` | COMM | Bank Mellat |
| `https://www.tejaratbank.ir/` | COMM | Tejarat Bank |
| `https://www.banksepah.ir/` | COMM | Bank Sepah |
| `https://www.bsi.ir/` | COMM | Bank Saderat Iran |
| `https://www.sb24.ir/` | COMM | Saman Bank |
| `https://www.parsian-bank.ir/` | COMM | Parsian Bank |
| `https://www.bki.ir/` | COMM | Bank Keshavarzi (agriculture bank) |
| `https://www.bank-maskan.ir/` | COMM | Bank Maskan (housing bank) |
| `https://www.postbank.ir/` | COMM | Post Bank of Iran |
| `https://snapp.ir/` | COMM | Snapp, ride-hailing |
| `https://tapsi.ir/` | COMM | Tapsi, ride-hailing |
| `https://snappfood.ir/` | COMM | SnappFood, food delivery |
| `https://rubika.ir/` | COMT | Rubika, domestic messenger |
| `https://splus.ir/` | COMT | Soroush Plus, domestic messenger |
| `https://cafebazaar.ir/` | COMM | Cafe Bazaar, Android app store |
| `https://myket.ir/` | COMM | Myket, Android app store |
| `https://balad.ir/` | MISC | Balad, maps and navigation |
| `https://neshan.org/` | MISC | Neshan, maps and navigation |
| `https://my.gov.ir/` | GOVT | Government e-services portal |
| `https://www.adliran.ir/` | GOVT | Judiciary e-services (Adl Iran) |
| `https://www.tax.gov.ir/` | GOVT | Iranian National Tax Administration |
| `https://epolice.ir/` | GOVT | Police e-services |
| `https://post.ir/` | GOVT | Iran Post |
| `https://www.tamin.ir/` | GOVT | Social Security Organization |
| `https://shad.ir/` | GOVT | Shad, the school platform of the Ministry of Education |
| `https://mci.ir/` | COMM | Hamrah-e Aval (MCI), mobile operator |
| `https://irancell.ir/` | COMM | Irancell, mobile operator |
| `https://www.rightel.ir/` | COMM | Rightel, mobile operator |
| `https://www.shatel.ir/` | COMM | Shatel, internet provider |
| `https://www.filimo.com/` | MMED | Filimo, video streaming |
| `https://www.namava.ir/` | MMED | Namava, video streaming |

For these sites OONI's usual verdict compares the probe's result with a control measured from
abroad. When a site answers only inside Iran, that comparison fails even though the site works, so
the dashboard will read what the probe in Iran itself received.

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
