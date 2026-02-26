# Local Setup Guide

This app has a **Python/Flask backend** and a **React frontend**. Both must be running for the app to work.

## Prerequisites

- Node.js ≥ 18
- Python ≥ 3.10
- npm (or equivalent)

---

## 1. Install Frontend Dependencies

```bash
npm install
```

---

## 2. Install Backend Dependencies

```bash
pip3 install -r backend/requirements.txt
```

---

## 3. Configure the Backend (optional)

Copy the example env file and edit as needed:

```bash
cp backend/.env.example backend/.env
```

Key variables:

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET_KEY` | `change-me-in-production` | Secret for signing JWT tokens (change in prod!) |
| `DATABASE_URL` | `sqlite:///lease_management.db` | SQLite file path |
| `FLASK_PORT` | `5000` | Flask port |
| `FLASK_DEBUG` | `true` | Debug mode |
| `ALLOWED_ORIGINS` | `http://localhost:8080` | CORS allowed origins |

---

## 4. Start the Backend

```bash
python3 -m backend.run  # must be run from the project root directory
```

The Flask API will start on `http://localhost:5000`. The SQLite database file (`lease_management.db`) is created automatically on first run in the directory where you run the command.

---

## 5. Start the Frontend

In a separate terminal:

```bash
npm run dev
```

The React app will start on `http://localhost:8080` and automatically proxy `/api/*` requests to the Flask backend.

---

## 6. First-Run Bootstrap

On first launch (when no admin exists), the app will show a **setup screen** to create the initial admin account:

1. Open `http://localhost:8080`
2. Fill in Name, Email, and Password (min 8 characters)
3. Click **Create Admin & Sign In**

After the admin is created, the normal login screen will be shown on subsequent visits.

### If the setup screen does not appear
If you already have an admin in the SQLite DB (or you want to promote an existing user), you can manage admin status from the terminal:

```bash
# From the project root:
python3 -m backend.cli admin status

# Promote an existing user to admin (by email)
python3 -m backend.cli admin promote --email you@company.com
```

If you need to wipe and recreate the admin (destructive):

```bash
python3 -m backend.cli admin reset --email you@company.com --full-name "Admin User" --yes
```

---

## Project Structure

```
/
├── backend/                   Python/Flask backend
│   ├── app.py                 Flask app factory + SQLAlchemy models
│   ├── auth.py                Auth routes (/api/auth/*)
│   ├── routes.py              Data CRUD + compute routes (/api/*)
│   ├── computations.py        IFRS 16 / Ind AS 116 computation engine
│   ├── run.py                 Entry point
│   ├── requirements.txt       Python dependencies
│   └── .env.example           Environment variable template
│
├── src/                       React frontend
│   ├── lib/api.ts             API client (replaces Supabase client)
│   ├── lib/store.ts           Data access layer → calls Flask API
│   ├── hooks/useAuth.tsx      JWT-based auth provider
│   └── pages/                 All app pages
│
├── vite.config.ts             Dev proxy: /api → http://localhost:5000
└── LOCAL_SETUP.md             This file
```

---

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/bootstrap` | Check if admin exists or create first admin |
| POST | `/api/auth/login` | Login with email/password → JWT token |
| POST | `/api/auth/logout` | Logout (client drops token) |
| GET  | `/api/auth/me` | Get current user info |

### Data CRUD
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/groups` | Corporate groups |
| DELETE | `/api/groups/:id` | Delete group |
| GET/POST | `/api/entities` | Legal entities |
| DELETE | `/api/entities/:id` | Delete entity |
| GET/POST | `/api/leases` | Leases |
| GET/DELETE | `/api/leases/:id` | Single lease |
| GET/POST | `/api/lease-types` | Lease type config |
| GET/POST | `/api/asset-locations` | Asset location config |
| GET/POST | `/api/workflow-roles` | Workflow role config |
| GET | `/api/profiles` | User profiles |
| POST | `/api/users` | Create user (admin only) |
| PUT | `/api/users/:id/role` | Update user role |
| GET/POST | `/api/assignments` | User-entity assignments |
| DELETE | `/api/assignments/:id` | Remove assignment |

### Computations (Python)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/compute/lease` | Compute single lease |
| POST | `/api/compute/journals` | Generate journal entries |
| POST | `/api/compute/batch` | Batch compute multiple leases |
| POST | `/api/compute/disclosures` | Ind AS 116 disclosures |
| GET  | `/api/compute/dashboard` | Dashboard statistics |

---

## Running Tests

```bash
npm run test
```