# Launch Research: r/sveltejs (+ HN)

## TL;DR (5 bullet recommendations)

1. **Lead with the visual, not the framework.** The original PavelDoGreat fluid demo has hit HN's front page five separate times (868, 466, 314, 213, 143 pts) over six years on the strength of the demo alone. Your wrapper inherits that visual capital — make sure the demo URL is the submitted URL, not the README.
2. **Post Show HN on a weekend, between 11:00–16:00 UTC** (~7am–noon ET). Sunday is empirically the highest-breakout day for Show HN (11.75% vs 9.45% weekday) per the 157k-post Myriade analysis. Sunday 0–2 UTC and 11–16 UTC are the strongest windows.
3. **For r/sveltejs, post Tuesday–Thursday morning ET.** Programming subs follow professional/work-hours patterns, not weekend leisure ones. First-30-minute upvote velocity is the dominant ranking signal — be on standby to reply.
4. **Cite Pavel Dobryakov prominently and early.** HN comment threads on Pavel's demo are *full* of derivative-work links (React wrappers, forks, Observable notebooks) and the tone is collaborative, not gatekeeping. Attribution helps — it's an honesty signal that pre-empts the "yet another wrapper" critique.
5. **The Show HN title formula that wins is `Show HN: <Name> – <one-line punchline>`** with an em-dash. Avoid "I built X" in the title (it's fine in the body/first comment). Submit the live demo URL in the URL field; put the description in the text field.

## What worked: 8 cited examples

| Title | Score / Comments | Why it landed |
|---|---|---|
| "WebGL Fluid Simulation" (paveldogreat) — [HN 19963640](https://news.ycombinator.com/item?id=19963640) | 868 / 102 | Direct demo link. Top comments are pure praise of mobile performance + multi-touch. No "Show HN" prefix — submitted as a regular URL. |
| "WebGL Fluid Simulation" (Pavel reposted) — [HN 42537567](https://news.ycombinator.com/item?id=42537567) | 466 / 60 | Dec 29 2024 repost, no complaints, comments referenced prior threads organically. Proves visual demos are durable on HN. |
| "Show HN: Svelte NodeGUI" — [HN 26361423](https://news.ycombinator.com/item?id=26361423) | 624 / 271 | Top Show HN: svelte ever. Clear punchline ("a lightweight Electron alternative with native UI"). Concrete metric (20MB vs 80MB). Posted Friday. |
| "Show HN: Motion One" — [HN 28616043](https://news.ycombinator.com/item?id=28616043) | 327 / 58 | "New animation library, built on the Web Animations API" — punchline format, names the standard it builds on. |
| "Show HN: Marble Madness-inspired WebGL game" — [HN 42212644](https://news.ycombinator.com/item?id=42212644) | 616 / 230 | Visual + nostalgia + interactive. Demo carries the post. |
| "Show HN: Mafs – React components for interactive math" — [HN 34214896](https://news.ycombinator.com/item?id=34214896) | 196 / 37 | Em-dash format. Top React component Show HN. Concrete domain (math), visual. |
| "Show HN: Svader – GPU-rendered Svelte components" — [HN 42416230](https://news.ycombinator.com/item?id=42416230) | 189 / 41 | Closest analog to svelte-fluid (Svelte + GPU). Body led with use case. Author replied to nearly every comment within hours. |
| "Show HN: Svelte Flow – library for node-based UIs" — [HN 38197731](https://news.ycombinator.com/item?id=38197731) | 81 / 17 | Em-dash punchline. Established team behind it (xyflow/React Flow). |

Pattern: **All winners pair a one-line punchline with an interactive demo as the URL.** None lead with "I built". First comments from the author seed discussion with backstory + technical decisions.

## What flopped: 4 cited examples

| Title | Score / Comments | Why |
|---|---|---|
| "Show HN: Skeleton – an open source UI component library for Svelte and Tailwind" — [HN 32242781](https://news.ycombinator.com/item?id=32242781) | 4 / 2 | Generic title, "yet another component library" framing. Skeleton later became massively popular but the launch post died. |
| "Show HN: Threlte – A Three.js component library for Svelte" — [HN 30026356](https://news.ycombinator.com/item?id=30026356) | 11 / 1 | Threlte is now *the* Svelte 3D library. Launch flopped anyway — posted Friday afternoon, body was technical-comparison-heavy without a hook. Lesson: even great libraries die at launch from positioning errors. |
| "Show HN: Svelte Flow 1.0 is out!" — [HN 44038818](https://news.ycombinator.com/item?id=44038818) | 20 / 1 | Update post (1.0). HN doesn't reward incremental version posts. |
| "Show HN: Sparkline-Svelte" — [HN 42193705](https://news.ycombinator.com/item?id=42193705) | 7 / 0 | Too narrow ("a small line chart for dashboards"). No visual hook in title. |

Pattern: Generic UI-library framing, low-novelty pitches, and update posts all underperform regardless of project quality. Threlte is the cautionary tale — your library can be excellent and still die at launch.

## Subreddit-specific rules and norms

I could not directly access Reddit content during this research (`reddit.com` and `old.reddit.com` are blocked from the fetch tool, and Google's `site:reddit.com` index returned almost nothing usable). What I could verify from secondary sources:

- **r/sveltejs has no widely-cited "Showoff Friday" megathread**, unlike r/javascript and r/webdev which restrict promo to weekly threads. The Svelte team's official guidance ([svelte.dev blog](https://svelte.dev/blog)) explicitly encourages community posts on Reddit and Discord, suggesting the sub is permissive of "I built" library posts.
- **General Reddit self-promo norm is the 9:1 rule** ([teract.ai](https://www.teract.ai/resources/reddit-subreddit-marketing-2026)): 9 non-promotional interactions per 1 promotional. As a first-time poster with no karma, this is a real liability — expect mods/users to scrutinize your account history.
- **First-30-minutes velocity is the dominant Reddit ranking signal** ([upvotemax.com](https://upvotemax.com/reddit-algorithm-explained), [redaccs.com](https://redaccs.com/reddits-ranking-algorithm/)). Posts that don't gain early velocity rarely recover.

**Action item the maintainer should do manually before posting:** open r/sveltejs in a browser, read the sidebar rules verbatim, check for a pinned "share your project" thread, and confirm there's no current ban on launch posts. I could not do this from the research tools.

## Show HN performance patterns

**Title formula that wins:** `Show HN: <Name> – <one-line punchline naming the differentiator>`. Em-dash, not colon. Examples that landed: Svelte NodeGUI (624 pts), Mafs (196), Svader (189), Motion One (327), Svelte Flow (81). Examples that died: Skeleton (4), Sparkline-Svelte (7). The differentiator should name the *novel* thing — "GPU-rendered" beat "component library."

**Body structure of winners** ([HN guidelines](https://news.ycombinator.com/showhn.html), [pithandpip.com](https://pithandpip.com/blog/hacker-news)):
- URL field: live demo (NOT GitHub, NOT npm)
- Text field: 1–3 paragraphs explaining what it is, what's novel, and one technical decision
- First comment from author: backstory, prior art, attribution. This is where you cite Pavel Dobryakov.

**Why visual/UI libraries die on HN:** the "yet another wrapper" critique is real. The Svader thread shows it explicitly — top commenters questioned whether re-implementing UI in shaders was worth losing accessibility ([HN 42416230](https://news.ycombinator.com/item?id=42416230)). Pre-empt this by showing the demo solves something CSS can't (fluid distortion *is* that thing).

**Common death-spiral causes:**
- Posting a GitHub or npm URL instead of a live demo
- Title without a differentiator
- Author absent during the first hour
- Generic positioning ("UI component library for X")

## Best posting times (Reddit + HN, with sources)

**Hacker News (Show HN specifically):** Sunday is the highest-breakout day at 11.75%, vs 9.45% weekday average — analysis of 157k posts since 2009 ([myriade.ai](https://www.myriade.ai/blogs/when-is-it-the-best-time-to-post-on-show-hn)). Best windows:
- Sunday 0–2 UTC (Sat 7–9pm ET) → up to 15.7% breakout
- Sunday 11–16 UTC (7am–noon ET) → 12–14%
- Saturday 14–20 UTC (10am–4pm ET) → 12–14%

A separate 23k-post analysis ([blog.alcazarsec.com](https://blog.alcazarsec.com/tech/posts/best-time-to-post-on-hacker-news)) confirms Sunday 6am UTC is **2.5x more likely** to hit the front page than Wednesday 9am UTC. The mechanism: lower competition in the new-page queue, not more readers.

Tradeoff: Sunday morning gets you on the front page more easily but with fewer total eyeballs once there. For a visual demo that snowballs on its own merit, Sunday wins.

**Reddit (r/sveltejs):** No subreddit-specific data is publicly available. General programming-subreddit pattern from multiple aggregators ([conbersa.ai](https://www.conbersa.ai/learn/best-time-to-post-on-reddit), [redship.io](https://redship.io/free-tools/best-time-to-post-on-reddit)) is **Tuesday–Thursday, 9–11am ET or 2–4pm ET**, because these are professional-audience subs that peak during US work hours. Monday morning is also strong.

**Recommended sequence:** Post Show HN Sunday ~12:00 UTC (8am ET / 5am PT). If it lands, repost the same demo to r/sveltejs Tuesday morning ET with different framing (Svelte-specific angle).

## Do's and don'ts for our first post

**Title:**
- DO: `Show HN: svelte-fluid – WebGL fluid simulation as a Svelte 5 component` (under 80 char, em-dash, names the framework + the novel surface)
- DON'T: "I built a Svelte component for fluid simulation" — author-centric titles consistently underperform on HN
- DON'T: "svelte-fluid: a Svelte component library for WebGL fluid simulation" — colon format is weaker than em-dash

**URL field on HN:** Submit `https://tommyyzhao.github.io/svelte-fluid/` (the demo). Not GitHub, not npm.

**Body (text field):**
- 1 paragraph: what it is + the novel claim ("hot-reloadable simulation params", "Svelte 5 runes API", whatever the strongest hook is)
- 1 paragraph: attribution to PavelDoGreat, MIT license, what *you* added (Svelte 5 component model, prop-based control, presets, container shapes)
- Skip "feedback welcome" — it's filler. The post format implies it.

**First comment from author (post immediately after submission):**
- Backstory: why you wrote the wrapper (1–2 sentences)
- Cite Pavel explicitly with link to upstream repo
- One concrete technical decision worth discussing (e.g., the 4-bucket setConfig system, or container-shape SDF approach)
- This is the right place to seed `r/programming`-style attribution discussion before someone else makes it adversarial

**Mention of Pavel Dobryakov: helps, doesn't hurt.** The HN derivative-work culture is collaborative, not gatekeeping — Pavel's threads are full of non-flame links to forks. r/programming is more sensitive but the MIT license + explicit attribution covers you.

**Image attachment vs text-only:** Reddit specifically rewards image/video posts in visual subs. r/sveltejs allows external links, so post the demo URL with the 4-panel hero gif as the link preview. Don't post text-only.

**First 30 minutes doctrine:** confirmed across [redaccs.com](https://redaccs.com/reddits-ranking-algorithm/) and [upvotemax.com](https://upvotemax.com/reddit-algorithm-explained). Be at your keyboard. Reply to every comment in the first hour, even one-liners. Don't ask friends to upvote — HN explicitly bans this and will shadow-flag posts ([news.ycombinator.com/showhn.html](https://news.ycombinator.com/showhn.html)).

**Comment-engagement strategy of top performers:** The Svader author replied to nearly every comment within hours, including the accessibility critique he disagreed with. Tone was acknowledging-then-clarifying, never defensive. This kept the thread alive past the algorithm's velocity-decay window.

## Open questions / things I couldn't verify

- **Direct r/sveltejs subreddit rules.** Reddit access was blocked across all attempted endpoints (www, old, Google site search returned no usable results). The maintainer must read the sidebar manually before posting. Specifically check: (a) any rule against launch posts, (b) whether a weekly project-share thread exists, (c) flair requirements.
- **Top r/sveltejs posts of 2024–2025 by score.** Could not enumerate. The Threlte and Svelte Flow projects exist but I couldn't find their original Reddit launch threads to compare structure.
- **Whether r/programming is worth posting to at all.** Historically very downvote-prone for "I built a wrapper." If used, post AFTER an HN front-page hit, never as the first venue.
- **HN second-chance pool eligibility** ([indiehackers post](https://www.indiehackers.com/post/my-show-hn-reached-hacker-news-front-page-here-is-how-you-can-do-it-44c73fbdc6)) — if the first post dies, you can email hn@ycombinator.com and ask for a re-up. This is a real, undocumented escape hatch.
- **The exact title-character cutoff** for HN (officially 80, but front-page winners average ~50–60). Couldn't verify a specific length sweet spot from the data I gathered.
