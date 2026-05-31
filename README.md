# Sergio Oliveira PT

A production gym-management web app that connects personal trainers with their students. Trainers manage rosters, programs, scheduling, billing, and progress from a bilingual dashboard; students log workouts, book sessions, and track goals from a dedicated portal.

Built with **Next.js 15**, **TypeScript**, and **Firebase**, deployed for a live coaching business.

## Features

### Trainer portal

- **Dashboard** — Roster stats, team velocity, attendance streaks, and goal progress at a glance.
- **Student management** — Roster profiles, coaching notes, body-composition trends, and private trainer settings.
- **Training programs** — Program library with weekly-cycle templates; assign sequences to students.
- **Workout builder** — Create and assign plans with exercises, sets, reps, rest times, and week scheduling.
- **Exercise library** — Searchable database by muscle group; Excel import/export for bulk coach-library updates.
- **Assignment calendar** — Plan and review workout assignments across the week.
- **Session scheduling** — Trainer availability, vacation blocks, and group session slots with attendance tracking.
- **Milestones** — Goal milestones with due dates and status tracking per student.
- **Shop & billing** — Gym shop catalog, student purchase logging, monthly payment records, and unpaid-period blocking (Europe/Lisbon billing window).
- **Progress views** — Charts for roster attendance, monthly sessions, and student performance.

### Student portal

- **Dashboard** — Streak, last session, physical stats, and training status.
- **Workouts** — View assigned programs, log sets/reps/weights, and finish sessions (including coach-led sessions).
- **Weekly scheduling** — Enroll in open session slots based on trainer availability.
- **Shop** — Log daily gym-shop purchases; charges roll into the monthly payment.
- **Billing** — View current plan, pending payments, and payment history.
- **Profile & history** — Update stats and goals; browse exercise and workout history.

### Platform

- **Bilingual UI** — English and Portuguese (`src/lib/i18n.tsx`).
- **Role-based access** — Separate trainer and student experiences with Firestore security rules.
- **Firebase Cloud Functions** — Scheduled billing enforcement and shop-billing sync (see `functions/`).
- **AI workout drafts (Genkit)** — Server-side flow using Google Gemini with schema-validated JSON output to suggest initial workout plans from student profile data (`src/ai/flows/ai-workout-plan-suggestion.ts`). Run locally via `npm run genkit:dev`.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 15](https://nextjs.org/) (App Router), React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS |
| UI | Radix UI + shadcn/ui |
| Database | Firebase Firestore |
| Auth | Firebase Auth |
| Storage | Firebase Storage (profile photos) |
| Backend jobs | Firebase Cloud Functions (scheduled billing) |
| Hosting | Firebase App Hosting |
| AI | [Genkit](https://firebase.google.com/docs/genkit) + Google Gemini 1.5 Flash |
| Charts | Recharts |
| Forms & validation | React Hook Form + Zod |
| Spreadsheets | ExcelJS / xlsx (coach library import/export) |

## Getting Started

### Prerequisites

- Node.js 18+
- A Firebase project with **Firestore**, **Authentication**, and **Storage** enabled
- Firebase CLI (for deploying rules, functions, and hosting)
- Google GenAI API key (optional — only needed for AI / Genkit dev flows)

### Installation

```bash
git clone <repo-url>
cd FitnessAPP
npm install
```

### Environment variables

Create `.env.local` in the project root:

```env
# Optional — overrides default bucket from src/firebase/config.ts
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app

# Optional — App Check / reCAPTCHA in production
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=

# Required for Genkit / AI flows
GOOGLE_GENAI_API_KEY=
```

Firebase web config is in `src/firebase/config.ts`. Point it at your Firebase project before running locally.

### Run locally

```bash
npm run dev
```

App: [http://localhost:9002](http://localhost:9002)

Genkit AI dev UI (optional):

```bash
npm run genkit:dev
```

### Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (port 9002) |
| `npm run dev:turbo` | Start dev server with Turbopack |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm run genkit:dev` | Start Genkit AI dev server |
| `npm run genkit:watch` | Genkit dev server with file watch |
| `npm run test:shop` | Shop billing unit tests |
| `npm run test:sequence` | Workout plan sequence tests |
| `npm run test:enrollment` | Session slot enrollment tests |
| `npm run test:excel` | Coach library Excel tests |

### Deploy

```bash
firebase deploy
```

Deploys Firestore rules, Storage rules, Cloud Functions, and Firebase App Hosting. See `firebase.json` for configuration.

## Student guide

1. **Sign up** at `/login` (Sign Up tab), then verify your email.
2. **Complete your profile** at `/student/profile` — name, photo, stats, and fitness goals.
3. **Dashboard** (`/student/dashboard`) — streak, last session, and progress summary.
4. **Workouts** (`/student/workouts`) — open assigned programs and log sessions.
5. **Scheduling** — enroll in open slots when your trainer publishes availability.
6. **Shop** (`/student/shop`) — log daily purchases; unpaid items are added to your monthly bill.
7. **Billing** (`/student/billing`) — view plan details and payment status.

If you are not linked to a trainer, ask your coach to add you to their roster.

## Trainer guide

1. **Sign in** with your trainer account at `/login`.
2. **Dashboard** (`/dashboard`) — roster overview, velocity, streaks, and milestones tabs.
3. **Students** (`/students`) — manage roster; open a student for notes, billing, scheduling, and assignments.
4. **Programs & workouts** (`/workouts`, `/workouts/builder`) — build programs and assign them.
5. **Exercises** (`/exercises`) — maintain the exercise library; import/export via Excel.
6. **Assignment calendar** (`/assignment-calendar`) — weekly assignment planning.
7. **Shop** (`/shop`) — manage catalog and review student shop logs.
8. **Progress** (`/progress`) — roster-wide progress and top performers.

Use coaching notes on student profiles for private reference. Review team velocity and streaks to spot students who need support.

## Project structure

```
src/
├── ai/                    # Genkit flows (Gemini structured output)
├── app/                   # Next.js App Router
│   ├── dashboard/         # Trainer dashboard
│   ├── students/          # Student roster & detail pages
│   ├── workouts/          # Programs & builder
│   ├── exercises/         # Exercise library
│   ├── assignment-calendar/
│   ├── progress/          # Trainer progress views
│   ├── shop/              # Trainer shop management
│   ├── profile/           # Trainer profile
│   ├── student/           # Student portal (dashboard, workouts, shop, billing, …)
│   └── login/
├── components/            # Shared UI (billing, scheduling, charts, …)
│   └── ui/                # shadcn/ui primitives
├── firebase/              # Firebase client config & hooks
├── hooks/                 # Custom React hooks
└── lib/                   # Domain logic, i18n, Firestore helpers, billing, scheduling

functions/                 # Firebase Cloud Functions (billing schedules, shop sync)
public/templates/          # Coach library Excel template
firestore.rules            # Firestore security rules
storage.rules              # Storage security rules
DATABASE_README.md         # Firestore data model reference
```

## Data model

See [DATABASE_README.md](./DATABASE_README.md) for Firestore collections, subcollections, and the security model.

## License

All rights reserved.
