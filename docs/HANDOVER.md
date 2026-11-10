# Handing Pittig Finances over to your friend

This guide is for **you (Johan)**. It covers how to build the installer, put it on
her PC, show her the app, keep her data safe and ship updates later. A short
cheat sheet for her is at the end. You can print it or send it to her.

The app is in **English** by default. She can switch to Dutch at any time under
**Settings → Language** (English / Nederlands); the choice is saved with her data.

---

## 1. Before the handover (once, about 30 minutes)

### 1.1 Decide how updates reach her

The installed app looks for new versions on the GitHub Releases page of
`kaalkoen51/Pittig-Finances`. **That only works if the releases are public.**
Pick one option:

| Option | What to do | Updates |
|---|---|---|
| **A. Make the repo public** (simplest) | GitHub → Settings → General → Danger zone → Change visibility. The code contains no personal data; her data never leaves her PC. | Automatic: she gets a "Restart to update" prompt |
| **B. Public releases-only repo** | Create an empty public repo, e.g. `pittig-finances-releases`. Change `publish.repo` in `electron-builder.yml` to that repo. Add a `RELEASES_TOKEN` secret (a fine-grained PAT with Contents: write on that repo) and use it as `GH_TOKEN` in `release-windows.yml`. | Automatic |
| **C. Keep everything private** | Nothing to do. | Manual: you send her a new `Setup.exe` (section 5.2) |

Never put a GitHub token inside the app itself.

### 1.2 Build the installer

The installer is built by GitHub Actions on a real Windows machine. It is not
built on your own PC.

1. Merge the pull request.
2. Create a version tag:
   ```bash
   git checkout main && git pull
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. Under **Actions → Windows installer**, wait until the run is green (about 5 to 8 minutes).
4. Go to **Releases → v1.0.0** and download `Pittig-Finances-Setup-1.0.0.exe`.

To try a build without making a release, go to **Actions → Windows installer →
Run workflow**. The `.exe` is then attached to the run under "Artifacts".

You can also release without touching git: in the same **Run workflow** box, type
a version such as `1.0.1` in the "Version" field. The workflow then builds the
installer and publishes it as Release `v1.0.1`, exactly like a tag would.

### 1.3 Test it on your own Windows PC first

Install it, then run through this checklist:
- Click **Settings → Load demo data** and look around.
  On a brand-new install the Overview also offers **Try it with demo data**.
- Add a sale.
- Close and reopen the app.
- Export to Excel.
- Then **Settings → Erase all data**.

You need to see the SmartScreen warning described below for yourself, so you
can tell her what to expect.

---

## 2. Installing on her PC (10 minutes, ideally sitting next to her)

1. Copy `Pittig-Finances-Setup-x.y.z.exe` to her PC, using a USB stick, email or
   a WeTransfer link.
2. Double-click it.
3. **Windows SmartScreen** will show "Windows protected your PC". This happens
   because the app is not code-signed. Click **More info**, then **Run anyway**.
   This only happens once per version.
4. The installer runs by itself in a few seconds:
   - No admin password is needed.
   - It installs for her user only.
   - It puts a **Pittig Finances** shortcut on the desktop and in the Start menu.
   - It opens the app when it finishes.
5. Right-click the taskbar icon and choose **Pin to taskbar**.

> Want to get rid of the SmartScreen warning? You need a code-signing
> certificate. The cheapest option is **Azure Trusted Signing** (about
> $10/month). After setting it up, add the signing settings to the `win:` section
> of `electron-builder.yml`. This is optional; the warning is harmless.

---

## 3. First session with her (15 minutes)

Do this together, using her own real data:

The app is in English; the button labels below are given exactly as she sees
them. If she prefers Dutch, choose **Nederlands** under **Settings → Language**.

1. **Settings**: fill in **Business name**. **Language** is already English.
2. **Batches → Add first product** (later: **Add product** at the bottom of the
   Batches screen): add each product with its **Unit** (for example "jar") and
   its normal price (**Default price**).
3. **Batches → + Batch**: add the current batch of each product, with the number
   of units made (**Quantity made**). Products and batches are optional: she
   can also start with a sale straight away.
4. **Sales → + Sale** (sheet "New sale"): add one real sale.
   - She can type a new client name directly in the **Client** field.
   - Turn on **Already paid** if the money is already in.
5. **Expenses → + Expense** (sheet "New expense"): add one real purchase.
   - Choose a category and, if it belongs to a batch, pick it under **Belongs to batch**.
   - Turn off **Already paid** if she still has to pay it. It then shows up under
     **To pay** (suppliers / what she owes).
6. Show her **Overview**. That is her home screen.
7. Optional: on her bank's website, export her transactions to CSV or Excel.
   Then use **Expenses → Import bank statement** (the same button is on the
   **To sort** screen once there are rows) and sort a few rows together.
   Each row needs one choice: **Payment from client**, **Expense**, **Already
   in my books** (already added; for an open bill the button reads **Mark bill
   as paid**) or **Ignore**.
8. Closing a half-filled form asks **Discard changes?** — **Keep editing** keeps
   the form, **Discard** throws it away.

Amounts can be typed as `12.50` or `12,50`; dates show as "9 Nov 2026".

Tell her two things:
- She cannot really break anything, because there are automatic backups (section 4).
- Archiving a client or product hides it without losing history.

---

## 4. Her data and backups

| What | Where |
|---|---|
| Live data file | `%APPDATA%\Pittig Finances\pittig-data.json` |
| Automatic backups | `Documents\Pittig Finances\Backups\` |

- **Saving is automatic.** Every change is saved within a second. On close, the
  app waits until saving has finished.
- **Daily backup:** the first time she uses the app each day, it makes a backup.
  It keeps the last 30.
- **Extra backups** are made automatically before every import, every restore
  and every update of the data format.
- **Uninstalling** the app does **not** delete her data.
- **If the data file is ever damaged**, the app opens in recovery mode. It offers
  to restore the latest backup and never overwrites anything by itself.

### Make sure there is a copy off the PC

Her PC can break or get stolen, so pick one of these:

- **Easiest:** turn on OneDrive "PC folder backup" for **Documents**. The
  Backups folder is then copied to the cloud automatically. This is why the
  backups live in Documents while the live file does not: OneDrive can lock live
  files.
- **Or:** once a month, do **Settings → Save backup file** to a USB stick or
  to email.

### Restoring

- **From an automatic backup:** Settings → **Backups on this device** →
  choose a date → **Restore**.
- **From a backup file:** Settings → **Restore from file**.
- **On a new PC:**
  1. Install the app.
  2. Settings → **Restore from file**.
  3. Pick the newest file from `Documents\Pittig Finances\Backups` (via OneDrive) or from the USB stick.

---

## 5. Updates

### 5.1 Option A or B (automatic)

1. Make your changes, merge them, then tag and push:
   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```
2. GitHub Actions builds and publishes the release.
3. Her app checks for updates every time it starts. It downloads the update
   quietly and shows "Version x.y.z is ready." with **Restart now** / **Later**.
   Her data is kept.

She can also check by hand under **Settings → Check for updates**.

### 5.2 Option C (manual)

1. Build as in section 1.2.
2. Send her the new `Setup.exe`.
3. She runs it over the existing install. Data is kept.

Always bump the version number. The tag sets the version automatically.

### Developing

```bash
npm ci
npm run dev            # web version in the browser, http://localhost:5173
npm run electron:dev   # desktop window with live reload
npm test               # unit tests
npm run e2e            # end-to-end tests (Playwright)
npm run typecheck
```

Tips:
- To try new code against her real data, ask her for a backup file and restore
  it in your dev copy. Never edit her live file by hand.
- If you change `src/domain/types.ts`, add a migration in `src/domain/migrate.ts`
  and bump the data `version`.

---

## 6. On her phone (optional, limited)

The app works on a phone too: the same screens, with a bottom tab bar. But
**phone data is separate from the PC**. There is no sync in this version.

- Hosting it needs GitHub Pages (enable it under Settings → Pages → Source:
  "GitHub Actions"). Run **Actions → Web app (GitHub Pages)** by hand.
  Pages on a private repo needs a paid GitHub plan.
- On her phone, she opens the link and chooses "Add to Home screen".
- Recommended use: a quick lookup, or a demo. For real bookkeeping, use the PC
  only, so there is a single source of truth.
- Moving data between PC and phone: **Save backup file** on one,
  **Restore from file** on the other.

Syncing PC and phone is a possible next step. It would need a small online
storage service.

---

## 7. Cheat sheet for her

**Pittig Finances – how it works**

- **Made a sale?**
  1. Go to **Sales** and click **+ Sale**.
  2. Pick the client (or type a new name), the product and the quantity. Leave **Client** empty for a walk-in sale (market, shop).
  3. Paid right away? Turn on **Already paid**. Click **Save**.
- **Money came in from a client?** Go to **Clients**, open the client and click **Record payment**.
- **Bought something?**
  1. Go to **Expenses** and click **+ Expense**.
  2. Fill in the amount and pick a category.
  3. Is it for a batch? Pick the batch under **Belongs to batch**.
  4. Not paid yet? Turn off **Already paid**. Click **Save**.
- **Paid a bill?** Go to **To pay**, pick the supplier and click **Mark as paid**.
- **Made a new batch?** Go to **Batches** and click **+ Batch**. That screen also shows the costs, revenue and profit of each batch. Add a new product at the bottom with **Add product**.
- **Sorting your bank statements?**
  1. Download a CSV or Excel file from your bank.
  2. Go to **Expenses** and click **Import bank statement**. Choose the file and click **Import … rows**.
  3. Go to **To sort** and pick one for each line: **Payment from client**, **Expense**, **Already in my books** or **Ignore**.
- **Closed a form by accident?** The app first asks **Discard changes?** Choose **Keep editing** to carry on.
- **Need it in Excel?** Go to **Settings** and click **Export everything to Excel**.
- **Backups** happen by themselves, every day, in `Documents\Pittig Finances\Backups`. Lost something? Go to **Settings → Backups on this device** and click **Restore**.
- **Rather have the app in Dutch?** Go to **Settings → Language** and choose **Nederlands**.
- **Need help?** Call or text Johan 🙂
