# RappelConso – Vérificateur de reçus (Monoprix-style)

Parses receipts where **EAN is on one line** and **product name is on the next** (e.g., Monoprix invoices).

## Déploiement sur Vercel (100% via interface web)
1. Créez un dépôt GitHub (web) et uploadez le **contenu** du dossier `receipt-recall-monoprix/`.
2. Sur Vercel : **New Project → Import from GitHub** → choisissez votre dépôt.
3. Paramètres :
   - Framework : **Vite**
   - Build command : **npm run build**
   - Output : **dist**
4. Déployez ✅

Dév local (optionnel) :
```bash
npm i
npm run dev
```
