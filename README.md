# Sergio Oliveira PT

A fitness coaching web application that connects personal trainers with their students. Trainers can build custom workout programs, track student progress, and leverage AI-powered workout suggestions — all from a clean, responsive dashboard.

## Features

- **Trainer Dashboard & Student Management** — Register, create, and manage student profiles (age, weight, fitness goals).
- **Workout Program Builder** — Design custom training programs with exercises, sets, reps, and rest times, then assign them to students.
- **Exercise Database** — Searchable exercise library categorized by body part (chest, back, legs, etc.).
- **Student Workout Logger** — Students view assigned workouts and log completed sets, reps, weights, and rest times.
- **Progress Tracking** — Visual charts for weight tracking and strength progression over time.
- **AI Workout Suggestions** — AI-powered tool that recommends workout plans based on a student's profile and goals.
- **Notification System** — Alerts for new workout assignments and completed sessions.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 15](https://nextjs.org/) (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| UI Components | Radix UI + shadcn/ui |
| Database | Firebase Firestore |
| Authentication | Firebase Auth |
| Hosting | Firebase App Hosting |
| AI | Google GenAI via Genkit |
| Charts | Recharts |
| Forms | React Hook Form + Zod |

## Getting Started

### Prerequisites

- Node.js 18+
- A Firebase project with Firestore and Authentication enabled
- A Google GenAI API key (for AI features)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd FitnessAPP

# Install dependencies
npm install

# Set up environment variables
# Create a .env.local file with your Firebase config and GenAI API key

# Run the development server
npm run dev
```

The app will be available at `http://localhost:9002`.

### Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (Turbopack, port 9002) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run genkit:dev` | Start Genkit AI dev server |

## Student Guide

Welcome, Students! Here's what you can do with Sergio Oliveira PT:

### Getting Started
1. **Sign Up**: Go to the login page and switch to the "Sign Up" tab. Enter your email and password.
2. **Verify Email**: After signing up, check your email and click the verification link sent to you.
3. **Complete Your Profile**: Navigate to "My Profile" and fill in your:
   - Personal information (name, photo)
   - Physical stats (age, sex, weight, height, body fat percentage)
   - Fitness goals (goal type: muscle gain, weight loss, endurance, or general; target weight)

### Using the App
- **Dashboard** (`/student/dashboard`): View your training status, current streak, last session date, and physical stats at a glance.
- **Workouts**: Access workouts assigned by your trainer. Click "Resume" to continue an active program.
- **Profile Management** (`/student/profile`): Keep your stats up to date so your trainer can tailor workouts effectively.
- **Progress Tracking**: Monitor your streak and see how you're progressing toward your goal weight.

### Tips
- Update your weight regularly for accurate progress tracking.
- Complete assigned workouts to maintain your streak.
- If you don't see a trainer linked, ask your trainer to add you to their roster.

---

## Teacher Guide

Welcome, Personal Trainers! Here's how to manage your students and create workout programs:

### Getting Started
1. **Log In**: Sign in with your trainer account credentials.
2. **Dashboard Overview** (`/dashboard`): Access your main control panel with:
   - Student count (portal and roster stats)
   - Team velocity (% of workouts completed this week)
   - Average student streak
   - Goal success percentage

### Managing Students
- **Student Directory** (`/students`): View all students, add new students to your roster, or manage existing ones.
- **Student Profiles**: Click on any student to view their detailed profile, progress, and add private coaching notes.
- **Roster Management**: Students can be added to your roster for assigned workout tracking.

### Creating Workouts
- **Workout Builder** (`/workouts/builder`): Design custom workout programs with:
  - Exercise selection from the database
  - Sets, reps, and weight configuration
  - Rest time between exercises
- **Exercise Database** (`/exercises`): Browse exercises categorized by body part (chest, back, legs, etc.) to include in your programs.
- **Assign Workouts**: Assign created programs to individual students with scheduled dates and times.

### Tracking Progress
- **Assignment Calendar**: View all workout assignments by date.
- **Workout Details**: Click on any assignment to view exercises, edit the workout, or delete it.
- **Student Progress**: Monitor each student's streak, completed sessions, and progress toward their goal weight.

### Tips
- Use the calendar view to plan weekly workout schedules.
- Add coaching notes to student profiles for private reference.
- Review team velocity to identify students who may need additional support.

---

## Project Structure

```
src/
├── ai/              # AI flows (Genkit + Google GenAI)
├── app/             # Next.js App Router pages
│   ├── dashboard/       # Trainer dashboard
│   ├── students/        # Student management
│   ├── workouts/        # Workout programs & builder
│   ├── exercises/       # Exercise database
│   ├── progress/        # Progress tracking
│   ├── student/         # Student portal
│   └── login/           # Authentication
├── components/      # Shared React components
│   └── ui/              # shadcn/ui components
├── firebase/        # Firebase config & hooks
├── hooks/           # Custom React hooks
└── lib/             # Utilities, types, and Firestore helpers
```

## License

All rights reserved.
