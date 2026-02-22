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

Create or update the `.env` file in the project root:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<paste_your_local_anon_key_here>
```

Replace `<paste_your_local_anon_key_here>` with the `anon key` from Step 2.

### Step 4: Apply Database Migrations

This creates all the tables (corporate_groups, entities, leases):

```powershell
supabase db reset
```

You should see output confirming migrations were applied successfully.

### Step 5: Install Dependencies

```powershell
npm install
```

### Step 6: Start the Application

```powershell
npm run dev
```

The app will be available at: **http://localhost:8080**

---

## Daily Usage

Once everything is installed, your daily workflow is:

```powershell
# 1. Open Docker Desktop (or ensure it's running)

# 2. Start local Supabase
supabase start

# 3. Start the app
npm run dev

# 4. Open browser to http://localhost:8080
```

To stop everything:

```powershell
# Stop the app: Press Ctrl+C in the terminal

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
| `npm run dev` | Start the frontend dev server |
| `npm run build` | Build for production |

---

## Access Local Database Admin

Once Supabase is running locally, you can access the **Studio UI** (database admin panel) at:

**http://127.0.0.1:54323**

This lets you browse tables, run SQL queries, and manage data — all locally.

---

## Troubleshooting

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
