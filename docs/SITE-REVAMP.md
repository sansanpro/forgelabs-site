# Site revamp: hero and search visibility

Plan written 2026-11-10. Goal: when someone searches for a tool that turns an app's screens into
video ads, on Google, in ChatGPT or in Claude, forgelaboratory.net is the first thing they see.

## What's realistic

Nobody can guarantee the top spot, and anyone who promises it is guessing. What we can do is make
the site the clearest, best-supported answer for the searches we can win, and get it into every
index those tools read.

| Search | Example | Can we be first? |
|---|---|---|
| Our name | "ForgeLabs App Ad Studio", "forgelaboratory" | Yes, within weeks of being indexed |
| What it does, specifically | "turn app screenshots into video ads", "app store screenshots to video ad" | Likely, over a few months. Few pages answer exactly this. |
| The category | "AI app ad generator", "video ads for my app" | Possible, but it takes months, plus links and mentions from other sites. apptovid, Hooked, Revid and InVideo already have pages here. |
| Just "ForgeLabs" | "ForgeLabs" | Hard. Forge.AI, ForgeNova Labs, Forge Robotics and others share the name. |

## Where the site stands (checked 2026-11-10)

- **Barely indexed.** A `site:forgelaboratory.net` search returned nothing from the domain. The
  site has never been submitted to Google Search Console or Bing Webmaster Tools.
- **One page.** The home page is the only page that could rank. Terms and privacy don't count.
- **The hero says little a search engine can match.** The H1 is "Video ads for your app that stop
  the scroll". It never says screenshots, AI or what the tool actually does. The lede does, but
  the H1 and title carry the most weight.
- **No structured data**: no Organization, SoftwareApplication or VideoObject markup.
- **Good basics already in place:** HTTPS, a canonical URL, www redirecting to the bare domain,
  robots.txt and sitemap.xml, meta description and Open Graph tags, and all text in the HTML.
- **Leftovers from the old product:** `/remove/` is indexable, and the sitemap dates are stale.
- **Load time:** about 2.3 s on desktop and 6 s on a phone-sized test run from the owner's Mac.
  The WebGL backdrop and the hero video are the heaviest parts. Measure properly with PageSpeed
  Insights before and after.

Screenshots of the current hero: desktop has the H1 at 282 px with the CTA in view. On a phone
the H1 is at 188 px, the CTA is in view, and the example ad starts below the fold.

## How Google, ChatGPT and Claude find sites

- **Google, including AI Overviews and AI Mode:** normal SEO. Google says there are "no additional
  requirements" and no special markup or AI text files for its AI features. The page has to be
  indexed and eligible for a snippet. ([Google](https://developers.google.com/search/docs/appearance/ai-features))
- **ChatGPT search:** OpenAI's `OAI-SearchBot` decides whether a site can appear in ChatGPT search
  answers. `GPTBot` (training) and `ChatGPT-User` (live fetches) are separate.
  ([OpenAI](https://developers.openai.com/api/docs/bots))
- **Claude:** `Claude-SearchBot` indexes for Claude's search, `Claude-User` fetches pages during a
  chat, and `ClaudeBot` collects training data. Blocking the first two "may reduce a site's
  visibility". ([Anthropic](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler))
  Several third-party sources say Claude's web search uses Brave's index, which follows Googlebot's
  robots.txt rules and has no submission tool. That isn't confirmed by Anthropic.
- **What the assistants cite:** for this category, they cite directory and review listings
  heavily. A search for "AI video ad generator for mobile apps" returned ten Capterra and GetApp
  listings for apptovid before any product site. Being listed and mentioned elsewhere matters as
  much as the site itself.

## Phase 1: hero and technical SEO

Work on the site itself, about one session.

1. **Rewrite the hero so the first line says exactly what the tool does.** It has to pass the
   "Tinder, but for stocks" clarity test. Options, recommended first:
   - **"Turn your app's screenshots into video ads."**
   - "Video ads for your app, made from your real screens."
   - "Your app's screens in. A ready-to-test set of video ads out."

   The lede keeps the specifics: hooks checked against your facts, voiceover, captions, images, ad
   copy. "AI" goes in the tag line or lede, not the H1, because every competitor leads with it.
   The title tag matches: "Turn App Screenshots into Video Ads | ForgeLabs App Ad Studio".
2. **Hero placement.**
   - **Desktop:** the H1 stays top-left, with the playing ad beside it. Cut the empty space above
     the H1 (it starts at 282 px) so the statement sits higher.
   - **Phone:** tighten the top padding and type size so the H1, the lede and the main button fit
     in the first screen, with the top of the example ad peeking in to invite a scroll.
   - **Load order:** the H1 renders before any animation, and never waits on JavaScript.
3. **Structured data (JSON-LD)**, kept consistent with the visible text:
   - `Organization`: name, logo, and `sameAs` profile links once they exist
   - `WebSite`
   - `SoftwareApplication`: web app, beta price 0
   - `VideoObject` for each example ad, for video results in Google
4. **robots.txt:**
   - **Search bots:** explicitly allow Googlebot, Bingbot, OAI-SearchBot, Claude-SearchBot,
     Claude-User and PerplexityBot.
   - **Training bots** (GPTBot, ClaudeBot, Google-Extended): allow too. Being in training data
     helps future models know the brand. This is the owner's call.
   - **Private pages:** keep `/app/` blocked.
5. **Sitemap and old pages:** add `noindex` to `/remove/` and `/unsubscribe/`, refresh the sitemap
   and add every new page.
6. **Speed:**
   - **Hero video:** lazy-start it, and preload its poster as the main image.
   - **WebGL backdrop:** start it after first paint, and skip it on slow phones.
   - **Target:** LCP under 2.5 s on mobile in PageSpeed Insights.
7. **Video text:** give each example ad its full script as text on the page. Crawlers can't watch
   video, and the scripts are strong, specific copy.
8. **llms.txt:** a short plain-text summary at `/llms.txt`. Google says it's unnecessary, but it
   costs nothing, so it's low priority.

## Phase 2: pages worth ranking and citing

Each page answers one search with real substance, so none of them is a thin keyword page.

| Page | Answers | Built from |
|---|---|---|
| `/guide/app-video-ads/` | "how to make video ads for my app" | `docs/AD-PLAYBOOK.md` and `docs/HOW-THE-ADS-ARE-MADE.md`. A long, specific guide: the thing other sites link to and assistants quote. |
| `/hooks/` | "app ad hook examples" | The hook categories and templates the app already uses, with real examples |
| `/examples/` | "app video ad examples" | The StockMatcherAI ads, each with script, hook type and why it works |
| `/faq/` (or a home section) | Direct questions: "Can I make an app ad from screenshots?", "Do I need a video editor?" | Short, direct answers, the form assistants lift |
| `/for/ios-apps/`, `/for/android-apps/` | Platform-specific searches | Only if each has real platform detail (App Store and Play rules, store-asset sizes), otherwise skip |

Later, once the facts are checked: comparison pages ("ForgeLabs vs apptovid", "vs editing in
CapCut"), with verified claims only.

## Phase 3: get found elsewhere (needs the owner's accounts)

1. **Google Search Console:** verify with a DNS TXT record in Squarespace, submit the sitemap and
   request indexing. **Bing Webmaster Tools:** import from Search Console. Bing powers Copilot and
   DuckDuckGo results. I'll add IndexNow so Bing hears about changes straight away.
2. **Profiles** for the `sameAs` links: X, LinkedIn company page, Product Hunt, GitHub.
3. **Listings** (free):
   - **Review sites:** Capterra, GetApp and G2
   - **AI-tool directories:** There's An AI For That, Futurepedia, Toolify and SaaSHub
   - **Alternatives listings:** AlternativeTo, as an alternative to apptovid and InVideo
4. **Launch posts:**
   - **Launch sites:** Product Hunt, Indie Hackers, and Show HN once it's out of beta
   - **Reddit:** r/SideProject and r/AppBusiness, following each sub's self-promotion rules
5. **Case study:** StockMatcherAI's ads ran on Meta. A write-up with the real numbers (owner's
   permission needed) is the kind of page that earns links.

## Measuring it

- **Search Console:** impressions, clicks and positions for the target searches, checked weekly.
- **Assistants:** once a month, ask ChatGPT, Claude, Perplexity and Google AI Mode the same five
  questions (for example "What's the best tool to turn my app's screenshots into video ads?") and
  log whether ForgeLabs is mentioned or linked.
- **Speed:** PageSpeed Insights mobile score and LCP, before and after Phase 1.

## Owner decisions (2026-11-10)

1. **The H1:** "Turn your app's screenshots into video ads." Approved.
2. **Training bots:** allowed.
3. **The guide:** a glimpse only, not the full playbook. `/guide/app-video-ads/` covers the four
   ideas, the clarity test, five hook patterns, the three truth rules, ad structure and the test
   protocol. It leaves out capture, voice, rendering, the motion opening, launch scripts and the
   templates.
4. **The case study:** approved, with StockMatcherAI's real Meta numbers.

## Progress

**Done 2026-11-10 (Phase 1, plus the guide and case study from Phase 2):**
- **Hero:** the new H1, a keyword tag line ("AI ad studio for app makers") and the lede naming
  Reels, TikTok and Shorts. The H1 has no word reveal, so it shows on first paint. It sits at
  201 px on desktop (was 282) and 141 px on a phone (was 188), with the example ad peeking in on a
  phone's first screen.
- **Title, description and Open Graph tags** updated, and og.png re-rendered with the new H1.
- **JSON-LD:** Organization, WebSite, SoftwareApplication and three VideoObjects on the home page;
  Article on both new pages.
- **Home page content:** a script under each example ad, a Meta results strip linking to the case
  study, two FAQ answers for direct questions, and Guide links in the nav and footer.
- **robots.txt:** one group allowing every crawler. It blocks `/app/`, and also `/docs/`,
  `/engine/`, `/supabase/` and `/tests/`: GitHub Pages serves the whole repo, so the full playbook
  was reachable at `/docs/AD-PLAYBOOK.md`. It's still public on GitHub, just not indexed.
- **noindex** on `/remove/` and `/unsubscribe/`, the sitemap refreshed, and `/llms.txt` added.
- **Speed:** the hero poster is preloaded, and the WebGL backdrop starts only after load, when the
  page is idle. It never starts with data saver on.
- **New pages:**
  - `/guide/app-video-ads/`
  - `/case-studies/stockmatcherai/`: Meta Insights read 2026-11-10, covering 5 to 10 November. It
    has $147.30 spent, 7,401 impressions, 342 link clicks, 4.6% click-through, $0.43 a click and
    280 landing page views. Refresh the numbers and dates together.

**Next:**
- **Phase 3, owner's accounts:** Search Console and Bing.
- **PageSpeed:** measure on the live site.
- **The rest of Phase 2:** `/hooks/`, `/examples/` and a full FAQ page.
