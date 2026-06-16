# SplitTrack

Personal expense tracker with split tracking, CSV import from Chase, and AI categorization.

## Deploy to Vercel (5 minutes)

1. Push this repo to GitHub
2. Go to vercel.com → New Project → Import your repo
3. Add environment variable: `ANTHROPIC_API_KEY` = your key from console.anthropic.com
4. Deploy → done

## Local development

```bash
npm install
ANTHROPIC_API_KEY=your_key npm start
```

## How to import Chase transactions

1. Go to chase.com → sign in
2. Click your account → Activity
3. Download → CSV → select date range
4. Drop the CSV file into SplitTrack

## Tech stack

- React (frontend)
- Vercel serverless functions (AI categorization)
- PapaParse (CSV parsing)
- Claude Sonnet (merchant categorization)
