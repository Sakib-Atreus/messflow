# MessFlow - Dhaka Mess Management App

A bilingual (বাংলা / English) app for managing a bachelor mess: automatic daily meals, bazar costs, fixed costs, member deposits, live balances, and monthly closing. It runs on the web, Android, and iPhone and costs ৳0 to run.

---

## 1. Platforms

| Platform | How | Cost |
|---|---|---|
| **Web** (any browser, PC or phone) | Next.js site on Vercel | Free |
| **Android app** | PWA: install from Chrome ("Add to Home screen"). Optional real **APK** built with PWABuilder (Trusted Web Activity) and shared directly (WhatsApp/Drive) | Free (Play Store listing is optional, $25 one-time) |
| **iPhone / iPad** | PWA: Safari → Share → "Add to Home Screen". Push notifications work on iOS 16.4+ once installed | Free (App Store needs $99/year, so it's skipped) |

The same codebase serves all three, so a fix or update reaches every user instantly with no app-store review.

---

## 2. Tech Stack (all free tier)

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router) + TypeScript |
| UI | Tailwind CSS (small custom components), Bangla font: *Hind Siliguri* |
| Database, Auth, Storage | **Supabase** (Postgres + Row Level Security) |
| Hosting | **Vercel** Hobby |
| Scheduled jobs | Supabase `pg_cron` (nightly meals) + Vercel Cron (backup run; its API call keeps the free project awake) |
| Language | `next-intl` (bn / en), with optional Bangla numerals |
| PWA / offline | `@serwist/next` (service worker, install prompt) |
| Push notifications | Web Push (VAPID), free |
| Charts | Recharts |
| Export | PDF (`@react-pdf/renderer` with embedded Bangla font), Excel (`exceljs`) |

### Free-tier limits to remember
- **Supabase:** 500 MB DB, 1 GB file storage, 50k monthly active users. It **pauses after 7 days of no activity**; the daily Vercel cron call keeps it active.
- **Vercel Hobby:** for non-commercial use. If MessFlow is later sold to other messes, move to Cloudflare Pages (free) or Vercel Pro.
- **No SMS:** SMS gateways cost money, so notifications use push and WhatsApp share links.

---

## 3. Users & Roles

| Role | Can do |
|---|---|
| **Super admin** (platform owner) | Sees and controls every mess: approves new-mess requests, creates messes + managers, resets passwords, blocks accounts |
| **Manager** | Everything in the mess: members, meals of anyone, bazar, costs, approve deposits, close month, custom roles |
| **Custom roles** (made by the manager) | Any mix of permissions: meals, bazar, deposits, costs, members, roster, notices, month, settings. Presets: Assistant manager, Cashier, Bazar in-charge |
| **Member** | Toggle own meals before cutoff, add guest meals, submit "I paid" (bKash/Nagad txn ID), view everything read-only |

- Sign-up is open, but access needs approval: super admin approves new messes, manager approves join requests.
- Admin-created accounts get a temporary password (username login allowed) and must change it at first login.

- Login: phone/email + password (Supabase Auth). Magic link is optional.
- Members join with an **invite code / link** that the manager shares.
- **Monthly manager handover** is supported, because many messes rotate the manager each month.
- The data model has `mess_id` on every table, so multiple messes can be supported later without a redesign.

---

## 4. Features

### 4.1 Members
- Profile: name, phone, room/seat, join date, leave date, active/inactive.
- Default meal pattern per member, e.g. Lunch ✔ Dinner ✔ Breakfast ✘.
- A member who leaves mid-month is settled up to the leave date.

### 4.2 Automatic daily meals ⭐
- Every night at **00:05 Dhaka time**, a meal row is created for every active member from their default pattern, so nobody has to enter meals.
- Members turn individual meals **on/off before the cutoff**:
  - Breakfast cutoff (default: previous night 11 PM)
  - Lunch cutoff (default 10:00 AM)
  - Dinner cutoff (default 5:00 PM)
- **Meal weights** are configurable: breakfast 0.5, lunch 1, dinner 1.
- **Guest meals** are added to the host member's count.
- **Leave / off range:** a member can turn meals off for a date range (e.g. Eid at home).
- The manager can override any member's meals for any date (logged in the audit log).
- **Today's cook count:** "Lunch: 12, Dinner: 14 (+2 guest)", shareable to the bua via WhatsApp.
- If the nightly job is ever missed, the app fills in the missing days on next open (idempotent backfill).

### 4.3 Bazar
- Entry: date, shopper, amount, item list (optional), receipt photo (optional).
- **Bazar duty roster:** shopping turns are assigned by rotation, with a reminder the night before.
- **Live meal rate** = total bazar this month ÷ total weighted meals this month.

### 4.4 Fixed / shared costs
- Categories: house rent, electricity, gas, water, Wi-Fi, bua salary, cleaner, dish/TV, other.
- Split type per cost:
  - **Equal**: divided among all active members
  - **Per seat / custom**: a different amount per member (e.g. rent by room)
  - **Mid-month members**: the manager chooses per bill - doesn't pay / equal share / a set amount; others' shares rescale so the bill total stays the same
- Recurring costs auto-copy to the next month.

### 4.5 Deposits (money received)
- Method: Cash / bKash / Nagad / Rocket / Bank, plus transaction ID and note.
- A member submits "I paid ৳X via bKash, TxnID ..."; the **manager approves or rejects** it.
- The manager can also record cash directly.
- Each member gets an automatic receipt with an image or share link.

### 4.6 Live balance
For each member, updated in real time:

```
meal_cost     = member_weighted_meals × meal_rate
fixed_share   = sum of member's shares of fixed costs
balance       = previous_month_carry + approved_deposits − meal_cost − fixed_share
```
- Positive balance means the mess owes the member (shown in green). Negative means the member is due (shown in red).
- **Due reminders** are sent by push and as a WhatsApp message link.
- **Opening balance:** a mess moving from a notebook enters each person's old due or credit once (Members → Opening balance, or the optional setup-checklist step). It is added to the first month's `previous_month_carry`, labelled "from notebook", and doesn't touch the meal rate or total bills. Manager only; locked once any month is closed.

### 4.7 Month closing
- One click: freezes the meal rate, calculates every member's final bill, and **locks** the month (no more edits).
- Each balance **carries forward** to the next month, or is marked "settled" if paid out.
- Reports: per-member bill and the mess summary as **PDF (Bangla or English)** and **Excel**.
- The manager can reopen a closed month; the reopen is recorded in the audit log.

### 4.8 Transparency & communication
- Every member can see all bazar entries, meals, costs, and deposits (read-only).
- **Audit log:** who changed what and when, with old and new values.
- **Notice board**, e.g. "Gas off tomorrow", "Meeting Friday 9 PM".
- **Complaint / suggestion box**, with an anonymous option.

### 4.9 Dashboard & reports
- Manager dashboard: today's meal count, current meal rate, total bazar, total due, cash in hand.
- Member dashboard: my meals this month, my balance, today's meal toggles.
- Charts: daily meals, meal rate trend over months, cost breakdown.

### 4.10 Language & UX
- **বাংলা / English** toggle, remembered per user.
- Bangla numerals optional (৳১,২৫০ ↔ ৳1,250).
- Dhaka timezone (Asia/Dhaka, UTC+6) everywhere.
- Mobile-first, light/dark mode, fast on low-end Android phones and slow connections.
- Offline: view the last loaded data; meal toggles sync when back online.

---

## 5. Database (Supabase / Postgres)

```
profiles            (id → auth.users, full_name, phone, locale, avatar_url)
messes              (id, name, address, invite_code,
                     breakfast_weight, lunch_weight, dinner_weight,
                     breakfast_cutoff, lunch_cutoff, dinner_cutoff,
                     breakfast_enabled, created_at)
mess_members        (id, mess_id, user_id, role[manager|assistant|member],
                     room, seat, joined_on, left_on, status,
                     default_breakfast, default_lunch, default_dinner)
meals               (id, mess_id, member_id, date,
                     breakfast, lunch, dinner,                 -- 0/1
                     guest_breakfast, guest_lunch, guest_dinner, -- counts
                     source[auto|member|manager], updated_by, updated_at)
                     UNIQUE(member_id, date)
meal_off_ranges     (id, member_id, start_date, end_date, meals[])
bazar_entries       (id, mess_id, date, shopper_member_id, amount,
                     items jsonb, receipt_path, created_by)
bazar_roster        (id, mess_id, date, member_id, done)
fixed_costs         (id, mess_id, month, category, amount,
                     split_type[equal|custom|prorated], recurring, note)
fixed_cost_shares   (fixed_cost_id, member_id, amount)
deposits            (id, mess_id, member_id, month, amount,
                     method[cash|bkash|nagad|rocket|bank], txn_id,
                     status[pending|approved|rejected], approved_by, note)
months              (id, mess_id, year_month, status[open|closed],
                     total_bazar, total_meals, meal_rate, closed_at, closed_by)
member_month_bills  (month_id, member_id, meals, meal_cost, fixed_share,
                     deposits, carry_in, final_balance)
opening_balances    (id, mess_id, member_id UNIQUE, month, amount,  -- + is owed, - owes
                     updated_by, updated_at)
weekly_menus        (id, mess_id, weekday 0-6, breakfast, lunch, dinner)  -- repeats weekly
notices             (id, mess_id, title, body, pinned, created_by)
complaints          (id, mess_id, member_id null, body, status, anonymous)
push_subscriptions  (id, user_id, endpoint, keys)
audit_log           (id, mess_id, actor_id, table_name, row_id,
                     action, old jsonb, new jsonb, at)
```

**Security:** Row Level Security (RLS) on every table:
- Users only see data from messes they belong to.
- Members can only edit their own meals, and only before the cutoff (enforced in the DB, not just the UI).
- Only manager/assistant can write bazar, costs, and approvals.
- Closed months are read-only (enforced by a trigger).

**DB functions:**
- `generate_daily_meals(date)`: run by `pg_cron` at 18:05 UTC (= 00:05 Dhaka).
- `month_summary(mess_id, year_month)`: live meal rate and balances.
- `close_month(mess_id, year_month)`: freezes bills, creates the carry-forward.
- `set_opening_balances(mess_id, rows)`: manager only, first month only (`OPENING_LOCKED` after a month is closed); a 0 amount removes the entry.
- Audit triggers on all money/meal tables.

---

## 6. Project Structure

```
messflow/
├── PLAN.md
├── supabase/
│   ├── migrations/          # SQL schema, RLS, functions, cron
│   └── seed.sql             # demo mess for testing
├── messages/
│   ├── bn.json              # Bangla strings
│   └── en.json              # English strings
├── public/                  # icons, manifest, fonts
└── src/
    ├── app/[locale]/
    │   ├── (auth)/login, signup, join/[code]
    │   ├── (app)/dashboard
    │   ├── (app)/meals
    │   ├── (app)/bazar
    │   ├── (app)/costs
    │   ├── (app)/deposits
    │   ├── (app)/members
    │   ├── (app)/reports
    │   ├── (app)/notices
    │   └── (app)/settings
    ├── components/          # UI + feature components
    ├── lib/supabase/        # client/server helpers
    ├── lib/calc/            # meal rate & balance logic (unit tested)
    └── i18n/                # next-intl config, number/date formatting
```

---

## 7. Build Phases

### Phase 1: MVP
- [x] Project setup: Next.js, Tailwind, next-intl (bn/en), Supabase
- [x] Auth: sign up, login, create mess, join via invite code
- [x] Members: list, add, edit default meal pattern, roles
- [x] Meals: nightly auto-generate, member toggle with cutoff, manager override, guest meals
- [x] Bazar entries + live meal rate
- [x] Deposits: manager records, member submits, approval
- [x] Live balance per member
- [x] Dashboards (manager + member)
- [x] PWA install (Android + iOS)
- [ ] Deploy to Vercel + Supabase

### Phase 2: Money complete
- [x] Fixed costs with equal/custom split, plus per-member bill choice for mid-month joiners
- [x] Month closing + carry-forward + locking
- [~] Reports: print-to-PDF + Excel (CSV) done; dedicated PDF layout todo
- [~] Audit log: recorded in DB; viewer page todo
- [x] Meal off-ranges (leave)

### Phase 3: Convenience
- [x] Push notifications (cutoff reminder, bazar duty, due reminder, notices, deposits, duty swaps)
- [x] Bazar duty roster (weekly fixed-day schedule, rotation, swap, auto-done, monthly stats)
- [x] Notice board (pin, notify everyone). Complaint box: todo
- [ ] ~~Charts & history~~ (dropped for now)
- [x] Super admin panel, approvals, custom roles, temporary passwords, role-based dashboards
- [x] Per-person monthly bill page (meals, every bill, payments, carry-over, daily meals, bazar done), WhatsApp/PDF share
- [x] Half meals (½), sheet-style Excel export (column per bill, payments, bazar list)
- [x] Monthly sheet page (meals grid / bazar / money), month & year picker
- [x] My profile: photo upload (Supabase Storage, resized on device), name/phone, add or change login email (username keeps working)
- [x] Settings: meal-rate rounding, warning days, reminder times, new-member meals; repeating bills; undo; loading placeholders; setup checklist; notification inbox; meal calendar; search
- [x] Meal money: what's left after bills, daily chart + forecast, low/finished warnings (banner, manager list, push)
- [x] Cook (khala) login: one view-only kitchen page (meal counts, final / may change, auto refresh)
- [x] Daily menu ("what to cook") by the manager, shown in each reader's language for common dishes, plus a note for khala
- [x] Khala's leave: meal off for everyone, "I'll cook" offers with manager approval, leave record
- [x] "Need from bazar": khala taps items / writes / records voice; manager + bazar duty notified; everyone ticks "bought"
- [x] Android APK via PWABuilder (signed, with assetlinks.json)
- [x] Public landing page (rotating headline, features, 3 steps, install, footer); logged-in people skip it
- [x] Language remembered for a year and after login on a new phone; Bangla by default; theme kept when switching language
- [x] Managers reset a member's forgotten password (with safety rules); super admin for everyone else
- [x] Backups: `pnpm db:backup` (full data + logins, restore tested), backup card in the admin panel, weekly + month-close reminders
- [x] Opening balance from the old notebook (first month only, then locked)
- [x] Weekly menu (Sat → Fri, repeats every week); a day's own menu wins meal by meal
- [x] Members: "This week's menu" (read-only); khala's page: tomorrow's dishes (or her leave)
- [x] "Turn on notifications" banner after login (members, manager, khala); Later = 3 days
- [x] Automatic checks on GitHub (typecheck, lint, database tests, build), Dependabot security updates, browser tests in `tests/e2e/`
- [ ] Manager handover

---

## 8. Deployment (all free)

1. Create a **Supabase** project (region: Singapore, the closest to Dhaka) and run the migrations (`pnpm db:migrate:prod`). They also set up `pg_cron`, the storage buckets and the daily meal job.
2. Push the code to **GitHub** and import it into **Vercel** (region `sin1` is set in `vercel.json`).
3. Add environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
4. Supabase → Authentication → URL Configuration (site URL + redirect), and `private.config` (`notify_url`, `cron_secret`) for the 10-minute reminders. See README.
5. Share the link `messflow-xxx.vercel.app` with members, who install it on their phones.
6. (Optional) Build the APK with pwabuilder.com and share the file.

---

## 9. Default Assumptions (change anytime in Settings)

- Single mess to start (the schema already supports many).
- Breakfast **off** by default; lunch + dinner counted. It can be enabled with weight 0.5.
- Rent: **custom per member** (rooms differ); utilities and bua: **equal split**.
- Currency ৳ BDT, timezone Asia/Dhaka, default language বাংলা.
