# ElevateFit

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
