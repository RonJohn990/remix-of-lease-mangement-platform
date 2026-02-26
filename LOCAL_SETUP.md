# Local Installation Guide – EasyLease (Windows 11)

This guide will help you run the entire application (frontend + database) locally on your Windows 11 machine without any internet dependency after initial setup.

---

## Prerequisites

### 1. Install Node.js (v18 or higher)

- Download from: https://nodejs.org/ (choose **LTS** version)
- Run the installer, accept defaults
- Verify installation:
  ```powershell
  node --version
  npm --version
  ```

### 2. Install Git

- Download from: https://git-scm.com/download/win
- Run the installer, accept defaults
- Verify installation:
  ```powershell
  git --version
  ```

### 3. Install Docker Desktop

- Download from: https://www.docker.com/products/docker-desktop/
- Run the installer
- **Important:** During installation, ensure **WSL 2** backend is selected (recommended)
- Restart your computer if prompted
- Open Docker Desktop and wait for it to fully start (whale icon in system tray should be stable)
- Verify installation:
  ```powershell
  docker --version
  docker compose version
  ```

### 4. Install Supabase CLI

```powershell
npm install -g supabase
```

Verify installation:
```powershell
supabase --version
```

---

## Installation Steps

### Step 1: Clone the Repository

```powershell
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
```

### Step 2: Start Local Supabase

Make sure **Docker Desktop is running**, then:

```powershell
supabase start
```

> ⏳ The first run will download Docker images (~2-5 minutes depending on your internet speed). After this, no internet is needed.

Once complete, the CLI will display output like this:

```
         API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
  S3 Storage URL: http://127.0.0.1:54321/storage/v1/s3
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
        Inbucket URL: http://127.0.0.1:54324
          anon key: eyJhb....<long_string>
  service_role key: eyJhb....<long_string>
```

**Save the `API URL` and `anon key` values** — you'll need them in the next step.

### Step 3: Configure Environment Variables

The repository ships with a `.env.example` template. **You must create your own `.env` file — do not skip this step.** Using the wrong values here is the most common reason the admin-creation screen never appears.

```powershell
copy .env.example .env
```

Open the new `.env` file and set the two values using the output from Step 2:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<paste_your_local_anon_key_here>
```

> ⚠️ **Do not use the cloud URL** (e.g. `https://uimvfdvfubyzmhvvlwci.supabase.co`). That URL points to a shared database that already has admin users, which will prevent the first-time setup screen from appearing.

### Step 4: Apply Database Migrations

This creates all the tables (corporate_groups, entities, leases, user_roles):

```powershell
supabase db reset
```

You should see output confirming migrations were applied successfully.

### Step 5: Install Dependencies

```powershell
npm install
```

### Step 6: Serve Edge Functions

The app relies on Supabase Edge Functions (e.g. `bootstrap-admin`). Open a **second PowerShell window** in the project directory and run:

```powershell
supabase functions serve
```

Leave this window open while you use the app. Without this step the admin-creation screen will not appear.

### Step 7: Start the Application

Back in your first PowerShell window:

```powershell
npm run dev
```

The app will be available at: **http://localhost:8080**

Navigate there and you should see **"Create your admin account to get started"** — the one-time admin setup screen.

---

## Daily Usage

Once everything is installed, your daily workflow is:

```powershell
# 1. Open Docker Desktop (or ensure it's running)

# 2. Start local Supabase
supabase start

# 3. Serve edge functions (in a separate terminal window)
supabase functions serve

# 4. Start the app (in your main terminal)
npm run dev

# 5. Open browser to http://localhost:8080
```

To stop everything:

```powershell
# Stop the app: Press Ctrl+C in the terminal running npm run dev

# Stop edge functions: Press Ctrl+C in the terminal running supabase functions serve

# Stop Supabase
supabase stop
```

---

## Useful Commands

| Command | Description |
|---------|-------------|
| `supabase start` | Start local database & API services |
| `supabase stop` | Stop all local services |
| `supabase db reset` | Reset database and reapply all migrations |
| `supabase status` | Check status and show connection details |
| `supabase functions serve` | Serve all edge functions locally |
| `npm run dev` | Start the frontend dev server |
| `npm run build` | Build for production |

---

## Access Local Database Admin

Once Supabase is running locally, you can access the **Studio UI** (database admin panel) at:

**http://127.0.0.1:54323**

This lets you browse tables, run SQL queries, and manage data — all locally.

---

## Troubleshooting

### Admin creation screen not appearing (shows login instead)

This is the most common first-run problem. It has three causes:

**Cause A: Edge functions are not running**

The app calls the `bootstrap-admin` edge function on startup to decide whether to show the setup screen or the login screen. If the function is not running, the call fails silently and the login screen is shown.

Fix: make sure `supabase functions serve` is running in a separate terminal (see Step 6).

**Cause B: `.env` is pointing at the wrong Supabase instance**

If your `.env` still contains the original cloud URL (`https://uimvfdvfubyzmhvvlwci.supabase.co`) the app connects to the shared database which already has admin users, so it shows the login screen.

Fix: update `.env` to use your local Supabase URL (`http://127.0.0.1:54321`) and local anon key (see Step 3).

**Cause C: A previous run left an admin in your local database**

If you created an admin in a previous session, that admin still exists in the local database. Clear it directly via SQL in Supabase Studio (**http://127.0.0.1:54323** → SQL Editor):

```sql
DELETE FROM user_roles WHERE role = 'admin';
```

Then refresh the app — the admin creation screen will appear.

Alternatively, run `supabase db reset` to wipe and recreate the entire local database from scratch.

### Docker Desktop not starting
- Ensure **Virtualization** is enabled in BIOS
- Ensure **WSL 2** is installed: `wsl --install` in PowerShell (admin)

### Port conflicts
- If port 54321 or 8080 is in use, check with: `netstat -ano | findstr :54321`
- Stop conflicting services or change ports in `supabase/config.toml`

### Supabase start fails
- Make sure Docker Desktop is fully running (not just starting)
- Try `supabase stop` then `supabase start` again

### Database tables missing
- Run `supabase db reset` to reapply migrations

---

## Data Privacy

- ✅ All data stays on your local machine
- ✅ No data is sent to Lovable Cloud or any external server
- ✅ The local and cloud databases are completely independent
- ✅ After initial Docker image download, no internet is required
