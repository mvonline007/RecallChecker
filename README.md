# RappelConso – Vérificateur de reçus (Monoprix-friendly build)

Updated parser to handle receipts where **EAN is on one line** and **product name is on the next** (e.g., Monoprix invoices).
Also adds small status messages while reading the PDF and checking recalls.

## Deploy on Vercel (GUI only)
1) Create a GitHub repo (web UI) and upload the **contents** of `receipt-recall-vercel-monoprix3/`.
2) Go to https://vercel.com/new → Import from GitHub → select the repo.
3) Framework: **Vite** · Build: **npm run build** · Output: **dist**.
4) Deploy.

Optional local dev:
```bash
npm i
npm run dev
```
