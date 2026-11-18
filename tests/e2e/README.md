# End-to-end checks

These run the real API and website against throwaway servers and a development database, with fake Paystack, Claude and Resend services, so nothing is charged or emailed. They are the quickest way to find out whether a change broke a whole flow.

```bash
npm run build -w apps/api        # the API runs from dist/
node tests/e2e/run.js            # everything (about 30 minutes)
node tests/e2e/run.js api        # API suites only, no browser (about 10 minutes)
node tests/e2e/run.js ui         # browser suites only
node tests/e2e/run.js launch     # any suite with "launch" in its name
```

You need: the dev database running (`docker compose up -d postgres`), migrations applied, and Google Chrome installed for the browser suites (set `CHROME_PATH` if it is somewhere unusual).

## What it does for you
- Starts the fake services (ports 3190 to 3192), the API on **3101** and, for browser suites, the website on **3100**. Your normal servers on 3000 and 3001 are never touched.
- Restarts the API before every suite so rate limits from one never affect the next, and starts it with the right settings for the suites that need payments off, or no third-party keys at all.
- Stops everything afterwards, puts `apps/web/tsconfig.json` back as it was (Next edits it) and deletes the temporary `.next-test` folder.

## Safety
The suites create and delete real rows. `lib.js` refuses to run unless the database name contains `dev` or `test` (`E2E_DATABASE_URL` overrides the default). Every row a suite creates uses an `@w5.test` address or a `w5-` company address, and each suite removes what it made. If one is interrupted, delete the leftovers with `delete from "User" where email like '%@w5.test'` and `delete from "Organization" where slug like 'w5-%'` (company deletion needs the locked-assessment triggers disabled, which `lib.js` `cleanup()` does for you).

## The suites
| File | Covers |
|---|---|
| 01-assessments.api | Snapshot and full assessment, scoring checked against the database, save and resume, locking, history |
| 02-payments.api | Paystack checkout, signed webhooks, amount re-check, idempotent settlement |
| 03-subscriptions.api | Company plans, seats, renewals |
| 04-insights.api | Written insights from the fake Claude |
| 05-reports-and-badges.api | PDF reports, emailed reports, shareable badges and privacy |
| 06-company.api | Invitations, the privacy model, dashboards, exports, leaving and removal |
| 07-custom-assessments.api | Building, publishing, taking and exporting company assessments |
| 08-launch-flows.api | Email confirmation, account settings and deletion, roles, retake approval, scheduled jobs |
| 09-no-keys.api | A fresh install with no third-party keys: everything degrades politely |
| 10-payments-off.api | The payments master switch |
| 11-load.api | A company of 400 finished people: dashboard, people list, CSV export and invitations stay quick |
| 12-safe-retries.api | API versions, database guards against duplicates, Idempotency-Key replay, and the payment webhook log with replay |
| 13-admin-detail.api | Platform staff are kept out of the user side; one individual and one company open in full, without anyone's scores |
| 14-staff-actions.api | Staff unlock, reset, suspend and restore people and companies, and refund a payment (against a fake Paystack), with history and permissions |
| 15-company-admin.api | Company administrators and HR kept off the personal side; member detail, pause and restore, company profile |
| 16-plan-switch.api | Switching plans: today's price after the credit, full price on renewal, the new period starts today |
| 17-invite-account.api | Accounts created from an invitation cannot leave that company; existing accounts still can |
| 18-classes.api | Personality class and tier on free and full results, the free AI analysis, and the class on the public badge |
| 19-team-classes.api | The team grouped by class for administrators and HR, who can and cannot see it, the class on the people list and CSV |
| ui-01 to ui-13 | The same flows in a real browser: sign-up to results, company dashboard, reminders, custom assessments, invitation links, departments, admin payments, the polish pass, the launch flows, staff detail pages, and the staff and company-admin actions |

When a suite fails, run it alone (`node tests/e2e/run.js <name>`) and read the `FAIL` lines; each names the behaviour that broke.
