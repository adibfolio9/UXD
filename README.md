# Strata — Candidate & Project Status Tracker

A React + Vite + TypeScript + Tailwind CSS SaaS workspace for managing candidate submissions and project workflows across **List / Table View**, **Kanban Board**, **Status Pipeline**, and **Flow Analytics**, with built-in drag-and-drop import for **Excel (`.xlsx`, `.xls`, `.ods`), CSV, and Google Sheets (`.html`)** files.

## Local Development

```bash
npm install
npm run dev
```

The app runs at `http://localhost:3000`.

## Production Build

```bash
npm install
npm run build
```

The production-ready static bundle is generated inside the `dist/` directory.

## Push to GitHub

1. Create a new empty repository on [GitHub](https://github.com/new) (do **not** initialize with a README or `.gitignore`).
2. Inside this project folder, run:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

## Deploy to Hosting

- **Vercel / Netlify / Cloudflare Pages**: Connect your GitHub repository with:
  - **Build command**: `npm run build`
  - **Output directory**: `dist`
- **cPanel / Apache / Static Hosting**: Run `npm run build` locally and upload everything inside `dist/` to your `public_html/` folder.
