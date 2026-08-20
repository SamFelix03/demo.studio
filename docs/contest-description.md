Build it with any agent. Verify it with Kane. Ship in three days.
​A three-day online hackathon for developers who build with AI coding agents, and want to see what happens when you put a real verification layer next to them.

​19 August to 21 August. $6,000 in prizes. Anywhere in the world. Hosted by TestMu AI.

​Why this exists
​AI coding agents have changed how software gets written. Features ship from prompts. Bugs get fixed in seconds. But one part of the loop never closed: when the agent ships something, someone still has to open a browser and click through to see if it actually works.

​That's the bottleneck now. Not writing the code, trusting it.

​Kane CLI was built for that gap. It's a plain-English browser automation tool that runs from your terminal. One command, no selectors, no framework. It opens a real local browser, runs the flow you describe, and returns a pass or fail with a video trace. It works as a developer utility. It also works as a tool that any AI coding agent can call directly.

​That second part is the interesting one. An agent that can write code but can't check its own work is running open-loop. An agent that can call Kane can see what it just shipped, read the failure, and fix it, without a human in the middle.

​We want to see what builders do when they close that loop. Which agent you use is entirely up to you.

​The challenge
​Build a working web app with an AI coding agent. Use Kane CLI to verify it works. Ship by 11:59 PM IST on 21 August.

​That's the whole brief. The app can be anything you want: a tool, a dashboard, a side project you've been meaning to start, a game, an internal utility, a weird experiment. The only constraints are:

​Any agent, any stack. Claude Code, Cursor, Copilot, Codex, Windsurf, Kiro, your own MCP setup, whatever you already build with. We don't care which one. We care that an agent is doing real work.

​Kane CLI verifies the app. At minimum in your demo. The strongest submissions wire Kane into the agent directly: a hook that fires Kane on save, an agent that reads Kane's NDJSON output and iterates, a spec that compiles down to Kane flows.

​It runs, it ships, and you can demo it on video.

​You can work solo or in teams of up to four.

​What "ready to ship" means
​Your submission needs to clear three bars. Miss any of them and the judges won't be able to score the rest of what you built.

​The app works end-to-end. A user can load it, complete the primary flow, and get a result. Not a screenshot, not a mock — the real thing, deployed or runnable locally with one command.

​Kane CLI caught something or proved something. Show one of two things: "Kane caught this bug during the build, here's the failed run," or "Kane verifies these flows pass, here's the green run." Either counts. What doesn't count: Kane installed but never run, or one trivial flow tacked on at the end to qualify.

​Your agent and Kane talked to each other. The agent's output triggered a Kane run, or a Kane result triggered the agent to do something. The cleanest version: a hook fires Kane on save, Kane fails, the agent reads the failure, edits the code, and the next save fires Kane again. Show us that moment. The tighter the loop, the higher the score.

​How we'll judge it
​Every submission is scored by a panel of TestMu AI engineers across four dimensions, weighted equally.

​Ships: a working app with a real flow that runs end-to-end. Not slides.

​Verified: Kane CLI actually exercised the app and caught or confirmed something meaningful.

​Closed loop: agent built, Kane verified, result fed back to the agent. The tighter the integration, the higher the score.

​Craft: did you reach for something interesting? Does this feel like a thing a developer would want to install tonight?

​A polished todo app with one Kane flow tacked on at the end will lose to a weirder, scrappier thing where a hook fires Kane and the agent re-prompts itself based on what Kane finds. Both are valid submissions. The second is the one we're really hoping to see.

​Three judges score every submission independently. Scores are averaged. Ties break on Verified, then Closed loop.

​Need an idea? Here are four lanes.
​You don't have to pick a lane, anything that hits the brief is fair game. But if you're staring at a blank screen on day one, this is the menu.

​Lane 1 - Apps that verify themselves

​Build a web app where the agent ships the feature and Kane proves it works, without you opening the browser to check.

​A todo app where every new feature comes with auto-generated Kane flows

​A drag-and-drop dashboard builder that re-verifies every component after edits

​A self-healing checkout flow where Kane catches a regression, the agent fixes it, and Kane re-verifies

​A "prompt-to-feature" playground where users type "add a dark mode toggle" and watch the whole loop close in real time

​An npx create-verified-app template that bakes Kane and an agent in from day one

​A GitHub bot that drops into any AI-generated repo and adds Kane verification

​A "QA-as-a-service" agent for non-technical founders — point it at a deployed app URL, get a bug report

​The demo writes itself: open the app, trigger a change, watch the loop, show the green run.

​Lane 2 - Verification baked into your workflow

​Build the tool you wish existed in your day-to-day dev loop. Something that runs Kane automatically — on save, on push, on a schedule, on a Slack message — and uses an agent to decide what's worth your attention.

​A kane-watch file watcher that re-verifies behavior on every save

​A gh kane GitHub CLI extension that runs Kane on the current PR's preview deploy and posts results in the comments

​An MCP server that gives any agent a verify_with_kane tool

​A pre-commit hook that derives Kane flows from your git diff and blocks bad commits

​Auto-bisect that walks back through commits to find the one that broke Kane

​A visual canary that tells real regressions apart from harmless pixel drift

​A conversion funnel watcher that runs your checkout every thirty minutes and pages on anomalies with the failed video attached

​A doc-vs-product drift detector that runs the steps in your README and files an issue when they no longer work

​The demo: install it on a real repo, or show the historical alerts the agent decided were worth paging on. Make the workflow getting tighter visible.

​Lane 3 - Browser agents in the wild

​Use Kane CLI as an agent's hands on the web. Not testing, the actual work the agent does for someone. This is where Kane stops being a QA tool and becomes browser infrastructure for any agent that needs to act on the web.

​A job application autopilot that takes your resume and a job posting and submits the application, pausing on essay questions so you can answer them

​A subscription killer that reads your bank statements and navigates each company's cancellation flow

​A "renew everything" agent for domains, licenses, certifications, and memberships

​A travel agent that books on real airline sites with no APIs in sight

​Lead enrichment that visits each prospect's site and returns a one-pager

​A Wikipedia speedrun bot

​An agent playing a browser game with no API access — pure vision and clicks

​A recursive ship-by-deadline where an agent writes a blog post about itself and uses Kane to publish it

​The most useful versions solve a real, weird, specific problem. The most fun versions are pure spectacle. Both win.

​Lane 4, Requirements that test themselves

​Start from the PRD, not the app. Point Kane CLI at a spec, and it proposes use cases with every claim cited back to the doc, then designs ACs, scenarios, and one test per scenario as committable _test.md files. Run them, and the evidence pack shows what was proved versus what is still owed, coverage measured against ACs, not test counts.

​A PRD-to-suite pipeline, all in the terminal: kane-cli context ingest ./prd.md, kane-cli context extract, check what it captured with kane-cli context list, then kane-cli design tests for use cases, ACs, and scenarios as _test.md files

​Run it with kane-cli testmd run ./tests/<name>_test.md and open the evidence pack: coverage against ACs, verdicts, and issues are all right there

​A drift watcher: when the PRD changes, kane-cli maintain reconciles what the suite now owes against the new requirements

​A README auditor: ingest your own README, extract every claim it makes, and check whether the product still does those things

​An agent that refuses to close a ticket until its acceptance criteria have a passing run in the evidence pack

​A changelog verifier that ingests release notes and checks each shipped claim against production

​The three days
​All times IST, with Pacific (PT) alongside. The hackathon runs alongside TestMu Conference 2026.

​Pre-hackathon details: sent over email. Bonus tip: attend the Kane CLI sessions at TestMu Conference 2026 for directly relevant prep.

​Building: 19 August to 21 August (18 August, 11:30 AM PT onwards)

​Submission deadline: 21 August, 11:59 PM IST (21 August, 11:29 AM PT)

​Winner announcement: 28 August, live on the winner stream. The stream link will be shared over email.Before you start

​Before you start
​Two things, ideally done before you write any code:

​Sign up at https://www.testmuai.com/register/ and claim your 10,000 free Kane CLI credits. Every signup gets 10,000 credits, valid for one month. This is also an eligibility requirement — entries without a TestMu AI signup can't be scored.

​Install Kane CLI and run one flow. Run npm install -g @testmuai/kane-cli, then try one of the examples from the docs: https://www.testmuai.com/support/docs/kane-cli-introduction/. Ten minutes now saves you an hour on day one. A cheat sheet goes out with your confirmation email.

​Running low on credits during the event? DM us on the Slack channel before the deadline and we'll sort you out.

​What to submit by 11:59 PM IST on 21 August
​Four ways to submit, all through one form: https://www.surveymonkey.com/r/kane-cli-hackathon-submission

​A GitHub repo: public, or invited access for the judges. Include a README with setup steps. The repo must be initialized on or after 19 August.

​A 3-minute demo video: screen recording, YouTube unlisted or Drive link. Show the app working and show Kane running. Judges watch this first, so lead with the interesting part. Set the video to Unlisted, not Private, and test your link in an incognito window before submitting.

​One paragraph: what you built, who it's for, which agent you used, and what Kane is doing in the flow.

​A live URL or runnable command: judges should be able to see the app working in under 30 seconds.

​Prizes
​$6,000 USD in cash, split across 3 winners.

​1st Place — $3,000

​2nd Place — $2,000

​3rd Place — $1,000

​Participation Certificate to every team that submits a demo/entry before the deadline.

​In addition to the cash, every winning team receives:

​A 1:1 with the TestMu AI founders

​3 months of Kane CLI Pro

​A featured post on the TestMu blog

​Amplification across TestMu channels

​Verified with Kane CLI Badge: every team that ships a working project by the deadline gets the Verified with Kane CLI. Show up, ship, get the badge.

​Who can enter
​Anyone 18 or older

​Solo or teams of up to four (one team captain receives the prize)

​Open to builders anywhere in the world

​No application, no curation, no cap, register and build

​Rules
​The app and the Kane CLI integration must be built during the event. Your repo must be initialized on or after 19 August, and we check commit history.

​Use any AI coding agent, any framework, any stack. Kane CLI is the only required dependency.

​You must be signed up on testmuai.com and must have run Kane CLI for your entry to be eligible.

​If your project depends on a login or a paid service, hand the judges working credentials. We can't score what we can't run.

​Submissions lock at the deadline. You can't push fixes after it.

​If your project depends on a third-party service, include a fallback, a recorded run or a backup deploy, so judges can still see what you built.

​One submission per team. If you want to build two things, build them with two teams.

​Code stays yours. By submitting, you grant TestMu AI permission to feature your project in marketing materials with attribution.

​The judges' decision is final.

​What's included
​10,000 free Kane CLI credits when you sign up at https://www.testmuai.com/register/, valid for one month

​A direct line to the engineers who built it, twice a day

​A Slack channel full of builders working on the same problem: https://join.slack.com/t/kaneai/shared_invite/zt-478cnz1pt-rqvZLRErunBZGyC3QRyoew

​Early access to a tool that's about to be a much bigger deal

​Contest guidelines:
​All contest decisions rest with the TestMu AI team. Judging, scoring, eligibility, and winner selection are at the team's sole discretion, and the team's decision is final and binding. No correspondence will be entered into on individual results

​You must be registered for the conference for any entry to count. This is stated explicitly for the Certification Marathon and applies across the challenge tracks.

​Your must be signed up to testmuai.com website and must have run Kane CLI to be eligible for the Kane CLI hackathon.

​TestMu AI reserves the right to verify entries and to disqualify any entry it judges to be fraudulent, automated, duplicated, or otherwise gaming the mechanics

​TestMu AI reserves the right to modify, suspend, or cancel any challenge, or to substitute a prize of equivalent value, at any point

​Prize fulfilment (delivery method, timing, and any tax or regional restrictions) is handled by the TestMu AI team; winners may need to supply details before a prize can be issued.

​Employees of TestMu AI and participating partners: would be excluded from the contests.

​The Code of Conduct applies to contests as well as sessions. Organizers enforce it throughout the event and can take any action they consider appropriate, up to removing someone from the conference. Concerns go to the TestMu AI team at the support address: support@testmuai.com.

​FAQs
​Which agent do I have to use? None in particular. Claude Code, Cursor, Copilot, Codex, Windsurf, Kiro, an MCP setup you wrote yourself, pick the one you're fastest in. Kane CLI is the only required dependency. What we're scoring is how tightly you close the loop between whatever agent you chose and Kane.

​Do I need a paid Kane CLI plan to enter? No. Sign up at https://www.testmuai.com/register/ and you get 10,000 free Kane CLI credits, valid for one month. Winners get 3 additional months of Kane CLI Pro on top. Running low during the event? DM us on Slack before the deadline.

​Is this part of the TestMu Conference? It's hosted by the same team and runs alongside TestMu Conference 2026, 19 to 21 August. You don't need to attend the conference sessions to enter, and the Kane CLI sessions during the conference are great prep.

​Can I bring a project I've already started? No. Your repo needs to be initialized on or after 19 August, and we check commit history. Building on an idea you've been sitting on is fine, that's most good hackathon projects. Pushing a codebase you wrote in July is not.

​Can I work solo? Yes. Solo entries are welcome. So are teams of up to four.

​Do I need to know Playwright or Selenium? No. Kane CLI is plain English — you describe the flow, Kane runs it. If you do know Playwright, the Playwright export feature is built in and useful for the writeup, but it isn't required.

​Can I use Kane CLI alongside Playwright or Selenium? Yes. Kane sits next to existing test setups. Many strong submissions will use Kane for flows that never made it into a Playwright suite: the quick checks, the one-offs, the things that didn't justify framework setup.

​Do the demos have to be live? No. Everything is a recorded video, which means no scheduling and no time zone problems. The top three get played during the winner stream on 28 August.

​What if my demo video is over 3 minutes? Judges stop watching at 3:00. Put the good part first.

​Where do I ask questions during the event? On the hackathon Slack channel: https://join.slack.com/t/kaneai/shared_invite/zt-478cnz1pt-rqvZLRErunBZGyC3QRyoew

​When do I find out if I won? Winners are announced live on the winner stream on 28 August, and the stream link will be shared via email. Winners are also notified directly via email.

​How do I get my free Kane CLI credits? Sign up for a TestMu AI account at [signup link]. Every new account gets 10,000 free credits, valid for one month. No code to redeem, no card required.

​I registered for the hackathon on Luma. Do I automatically have credits? Not yet. Luma registration gets you into the event; the credits come from creating your TestMu AI account. Do both: register on Luma so you get event updates, then sign up on TestMu AI so Kane CLI actually works when the kickoff starts.

​Do winners get anything extra? Yes, the top 3 winners get an additional 3 months of Kane CLI Pro on top of the cash prizes.

​When do the credits start and how long do they last? Your 10,000 credits are valid for one month.

​Are 10,000 credits enough for the hackathon? Yes. most of that 10,000 goes to building your suite; running it is free, since tests cache on first run and replay at zero cost.

​What happens if I run out of credits during the event? DM us on the hackathon Slack channel before the deadline and we'll sort you out. Don't wait until the last hour, ping us as soon as you're running low.

​What happens to my project when the month ends? Your code and repo are yours forever, they live on GitHub, not on Kane. When credits expire, you just can't run new Kane verifications until you top up or subscribe.

​Resources
​Sign up and claim 10,000 credits — https://www.testmuai.com/kane-cli/

​Docs and quickstart — https://www.testmuai.com/support/docs/kane-cli-introduction/

​AI agent integration skills — testmuai.com/kane-cli/agents.md

​Kane CLI Cookbook — https://www.testmuai.com/kane-cli-cookbook/

​Kane CLI Use Cases — https://www.testmuai.com/support/docs/kane-cli-use-cases/

​GitHub repo — github.com/LambdaTest/kane-cli

​Slack community — https://join.slack.com/t/kaneai/shared_invite/zt-478cnz1pt-rqvZLRErunBZGyC3QRyoew

​Submission form — https://www.surveymonkey.com/r/kane-cli-hackathon-submission

​Questions — support@testmuai.com

​Plain English. Real browser. Real apps. Pass or fail. Ship in three days.

​See you online!

Blasts
TestMu AI
Yesterday, 8:14 PM
Your Kane CLI Hackathon guide, everything in one doc 📋
​You're registered for the Kane CLI Hackathon, building starts 19 August.

​We've put everything you need in one guide: how to claim your 10,000 free credits, setup, what judges score, and exactly how to submit.

​Read the participant guide

​Three things worth doing before day one:

​Claim your credits at https://www.testmuai.com/kane-cli/ 

​Install Kane CLI: npm install -g @testmuai/kane-cli

​Join the Slack, it's the fastest way to reach us: https://join.slack.com/t/kaneai/shared_invite/zt-478cnz1pt-rqvZLRErunBZGyC3QRyoew