# CryptoPing — personal price-watch — Bot specification

**Archetype:** finance

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A private Telegram bot that lets individual users maintain a coin watchlist, create threshold or percent-change alerts with cooldowns and quiet hours, request on-demand prices, and receive a single clear alert per firing. The owner receives anonymized aggregated usage stats and top-fired tickers; user data and alerts remain private to each user's DM.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Individual crypto traders
- Crypto hobbyists who want low-noise private alerts in Telegram

## Success criteria

- Users can add/remove coins and persist a per-user watchlist across restarts
- Users can create threshold and percent-based alerts with configurable cooldown and quiet hours
- Alerts fire correctly when price conditions are met, respect quiet hours and cooldowns, and result in a single alert message per event
- On-demand /price returns live price, 1h change and indicates whether any conditions are currently met (informational only)
- Quiet-hours suppression queues duplicate events and delivers a single summary after the quiet period
- Owner receives daily anonymized digest of user counts and top-fired tickers to ADMIN_CHAT_ID without exposing personal user identifiers
- All flows tolerate transient price-feed failures with retries; user-facing errors appear only on explicit /price or invalid-ticker operations

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open onboarding and main menu (requests timezone with quick-reply options)
  - outputs: Onboarding text, Timezone quick-reply buttons (local options, type-to-enter, or skip -> defaults to UTC), Main menu inline keyboard
- **Add coin** (button, actor: user, callback: watch:add) — Begin guided add-coin flow (seed buttons and free-text allowed)
  - inputs: callback event, optional free-text ticker input
  - outputs: Confirmation of coin added to watchlist, Updated watchlist display
- **Remove coin** (button, actor: user, callback: watch:remove) — Select a coin from the user's watchlist to remove (inline options)
  - inputs: callback selection of coin
  - outputs: Confirmation of removal, Updated watchlist display
- **Create alert** (button, actor: user, callback: alert:create:start) — Guided alert creation: choose coin -> choose alert type -> enter value -> choose percent window/cooldown -> confirm
  - inputs: coin selection (button or typed), alert type selection (threshold / percent), numeric value (typed), percent window selection (buttons, e.g. 1h) or typed, cooldown selection (buttons or typed)
  - outputs: Draft alert summary, Confirmation message and persistence of alert
- **/price** (command, actor: user, command: /price) — On-demand price: /price [ticker?] returns current price for a single ticker or entire watchlist. No alerts auto-fired.
  - inputs: optional ticker parameter
  - outputs: Current price, 1h change, and indicator if any alert conditions are currently met (informational only), Error guidance for unknown tickers
- **Settings** (button, actor: user, callback: settings:open) — Open user settings: timezone, quiet hours, morning summary time, default cooldown
  - outputs: Settings menu with inline toggles and change flows
- **/help** (command, actor: user, command: /help) — Fallback help surface describing commands and buttons
  - outputs: Short help text and quick links to Add coin, Create alert, /price

## Flows

### Onboarding & timezone selection
_Trigger:_ /start

1. Send welcome message describing features (short)
2. Offer timezone quick-reply buttons (detect local if possible) + option to type or skip
3. If user selects/enters timezone -> persist in profile; else default to UTC
4. Show main menu (Add coin, Create alert, Watchlist, Settings, /price hint)

_Data touched:_ User profile

### Add coin (seed & free-text)
_Trigger:_ button watch:add

1. Show seed buttons [Bitcoin, Ethereum, Toncoin] and an entry button 'Type ticker...'
2. If user taps seed -> validate ticker via price feed -> add to watchlist and confirm
3. If user types ticker -> validate via price feed; on success add and confirm; on failure suggest closest matches or ask to retry

_Data touched:_ Watchlist entry, Price feed (validation)

### Remove coin
_Trigger:_ button watch:remove

1. Show inline list of user's watchlist coins as buttons
2. On selection, confirm removal with a Yes/No callback
3. If confirmed, remove from persistent watchlist and delete associated alerts; confirm success

_Data touched:_ Watchlist entry, Alert

### Create alert (guided)
_Trigger:_ button alert:create:start

1. Ask user to choose coin from watchlist (buttons) or type a ticker
2. Ask for alert type (threshold or percent) with inline buttons
3. If threshold -> ask for target price (slash/typed input/ForceReply) with example quick replies
4. If percent -> ask for percent change and window (buttons for common windows like 1h, 24h) or typed window
5. Ask for cooldown duration (buttons: default 2h, 1h, 4h, custom typed)
6. Show draft summary with Confirm / Cancel buttons
7. On confirm -> persist alert, schedule checks, send confirmation message

_Data touched:_ Alert, Watchlist entry, Settings

### On-demand /price
_Trigger:_ /price

1. Parse optional ticker; if none, iterate user's watchlist
2. Query price feed for requested tickers (retry transient errors silently)
3. Return price, 1h change, and mark whether any alert conditions are currently met (informational only)
4. On unknown ticker -> suggest closest matches or ask user to retype

_Data touched:_ Price feed, Watchlist entry

### Alert evaluation and delivery
_Trigger:_ price-check scheduler or price-feed event

1. Periodically evaluate each user's alerts against current price and percent windows (percent alerts compute windowed change, default 1h)
2. If condition met and not within cooldown and not suppressed by quiet hours -> send single alert message: 'COIN moved: old $X -> new $Y (Z% change)'
3. Start cooldown timer for that user+coin; mark timestamp persisted
4. If condition met during quiet hours -> queue an aggregated suppressed event for delivery after quiet period ends (single summary per coin)
5. If multiple fires while suppressed -> coalesce into one summary message per coin when delivering

_Data touched:_ Alert, Cooldown record, Settings, Queued suppressed events

### Quiet hours summary delivery
_Trigger:_ quiet period end or morning summary time

1. For each user with queued suppressed events, compile a single summary per coin with last observed values and delta
2. Send the summary as one message (or split if very large) respecting rate limits
3. Clear queued suppressed events while preserving cooldown rules

_Data touched:_ Queued suppressed events, Cooldown record

### Morning summary (optional)
_Trigger:_ user-chosen local time daily

1. At user's local time, compile daily summary: watchlist prices, any alerts fired since last summary (coalesced), and quick link buttons to Manage alerts
2. Send summary message only if user enabled morning summary; otherwise skip

_Data touched:_ Settings, Queued suppressed events, Alert fire counters (for owner stats aggregation)

### Owner anonymized stats digest
_Trigger:_ daily schedule

1. Aggregate anonymized totals: active user count, total alerts fired (by type), top N tickers by alert-fire
2. Prepare digest without PII (no Telegram ids, no user-identifying watchlist entries linked to users)
3. Send digest to ADMIN_CHAT_ID as a single message (or file if large)

_Data touched:_ Owner stats

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Where anonymized daily stats and owner digests are sent
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **User profile** _(retention: persistent)_ — Per-user metadata persisted for features and scheduling
  - fields: telegram_id, timezone, preferred_summary_time, created_at, muted_until (if owner-admin muted)
- **Watchlist entry** _(retention: persistent)_ — One coin/ticker saved in a user's private watchlist
  - fields: ticker_symbol, display_name, added_at, source_symbol_mapping
- **Alert** _(retention: persistent)_ — Alert configuration owned by a user for a specific watchlist coin
  - fields: alert_id, user_id (telegram_id), ticker_symbol, type (threshold|percent), threshold_price (for threshold), percent_value (for percent), percent_window (e.g. 1h), enabled (bool), created_at, cooldown_seconds, last_fired_at
- **Settings** _(retention: persistent)_ — Per-user notification and behavior settings
  - fields: quiet_hours_start (local time or null), quiet_hours_end (local time or null), morning_summary_time (local time or off), default_cooldown_seconds
- **Cooldown record** _(retention: persistent)_ — State tracking to suppress repeated alerts per user+coin for cooldown period
  - fields: user_id, ticker_symbol, last_alert_at, cooldown_until
- **Queued suppressed events** _(retention: persistent)_ — Aggregated events fired during quiet hours to be summarized after quiet period
  - fields: user_id, ticker_symbol, first_fired_at, last_fired_at, min_price, max_price, count_fires
- **Owner stats (anonymized counters)** _(retention: persistent)_ — Aggregated counters for owner digest; intentionally contains no PII
  - fields: daily_active_users, total_alerts_fired_by_type, top_tickers_by_alert_fires (top 10), period_start, period_end

## Integrations

- **Telegram** (required) — Bot API messaging, inline keyboards, callbacks, and user DMs
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Set ADMIN_CHAT_ID (owner chat) where anonymized daily digest is sent
- Request immediate anonymized stats digest via a /stats-request command in owner/admin chat
- Adjust seed watchlist shown in Add coin menu (owner-level setting)
- Temporarily pause all notifications globally (for maintenance)
- Export anonymized aggregated counters (CSV) for a selected date range

## Notifications

- Immediate alert message: 'COIN moved: old $X -> new $Y (Z% change)'
- Queued/quiet-hours summary: single message per coin summarizing events occurred while quiet
- Morning summary (if enabled): watchlist prices and coalesced alerts since last summary
- On-demand /price reply with price, 1h change, and informational alert indicators
- Owner daily anonymized digest to ADMIN_CHAT_ID
- Error/suggestion messages for invalid or unknown tickers when user interacts explicitly
- Confirmation messages for add/remove alert and settings changes

## Permissions & privacy

- All user interactions, watchlists, and alerts are private in a user's DM with the bot; no sharing of watchlists between users
- Owner digest contains only aggregated anonymized counters and top tickers; no Telegram IDs, usernames, or user-specific watchlist entries included
- User can opt out of morning summary or owner-stat aggregation at any time via Settings
- Retention: user alerts, watchlist and cooldown state persisted until user deletes them or account inactivity policy is applied (policy detail missing)
- Data exported to owner (CSV) must be anonymized counters only; explicit owner requests for PII are unsupported in v1

## Edge cases

- Price feed transient outage: retry silently; if user explicitly requested /price or creating an alert, inform them of the failure after retries and suggest trying later
- Unknown ticker or ambiguous ticker mapping: suggest closest matches, require explicit re-typing, and do not create alerts until validated
- Multiple alert firings for same coin while within cooldown: suppressed by cooldown and coalesced into a single later summary if needed
- Events occurring entirely within quiet hours: queue and deliver a single summary after quiet period; ensure this does not exceed message size limits
- Daylight Saving / timezone changes: store timezone identifier; if user-provided timezone is ambiguous, ask for clarification
- User blocks or removes bot: stop delivering and mark user as inactive; owner stats should exclude blocked users
- Rapid price spikes that flip threshold back and forth inside cooldown window: only the first firing creates an alert; subsequent fluctuations suppressed until cooldown elapses
- Rate limiting from Telegram or price-feed provider: backoff and queue evaluations; ensure no duplication when resuming
- User deletes an alert or coin while there are queued suppressed events: clear related queues and do not deliver summaries for removed items

## Required tests

- Onboarding acceptance test: /start prompts for timezone and persists selection or defaults to UTC when skipped
- Add coin acceptance test: seed button adds coin; typed ticker validates and adds; invalid ticker shows suggestions
- Create threshold alert test: full guided flow results in persisted alert and correct confirmation text
- Create percent alert test: percent window selection and evaluation work (default 1h) and persisted
- On-demand /price test: single ticker and full-watchlist responses show price + 1h change and informational alert markers
- Alert firing test: when condition met, single alert delivered and cooldown prevents duplicate messages within cooldown window
- Cooldown & quiet hours test: alerts fired during quiet hours are queued, coalesced, and delivered once after quiet period ends
- Persistence test: alerts, watchlists and cooldowns survive a simulated restart
- Owner digest test: anonymized daily digest sent to ADMIN_CHAT_ID and contains only aggregated counts and top tickers
- Unknown-ticker flow test: creating an alert for an unknown ticker returns helpful suggestions and blocks creation until validated
- Rate-limit / transient failure robustness test: simulate price-feed outage and verify retries and correct user-visible error behavior only on explicit requests

## Assumptions

- Default timezone = UTC when user skips timezone selection
- Seed watchlist buttons are Bitcoin, Ethereum, Toncoin as owner-provided seed list
- Default alert cooldown = 2 hours unless user specifies otherwise
- Default percent-alert window = 1 hour unless user changes it during creation
- Quiet-hours suppressed alerts are summarized once per coin after the quiet period ends
- Unknown tickers validated against the configured price feed; bot suggests closest matches
- Owner wants daily anonymized digest (top 10 tickers) delivered to ADMIN_CHAT_ID
