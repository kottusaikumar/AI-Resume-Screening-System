# NeuralRecruit free showcase deployment

This repository is a monorepo:

- `neuralrecruit-frontend`: TanStack Start frontend deployed to Vercel
- `recruitiq-backend`: FastAPI API deployed to Render

The free services are appropriate for a public portfolio/showcase. Render's
free web service sleeps when idle and its filesystem is ephemeral, so local
SQLite history and settings are intentionally not treated as durable data.

## 1. Deploy the backend on Render

1. In Render, choose **New > Blueprint**.
2. Connect this GitHub repository.
3. Render reads `render.yaml` and creates `neuralrecruit-api`.
4. When prompted, initially set:
   - `ALLOWED_HOSTS`: the generated hostname only, for example
     `neuralrecruit-api.onrender.com`
   - `ALLOWED_ORIGINS`: a temporary HTTPS origin; replace it with the exact
     Vercel production URL after step 2.
5. Confirm `https://<render-host>/api/health` returns `"status": "ok"`.

The Render profile deliberately disables neural-model downloads, spaCy, and
image-only PDF OCR so the API can fit the free 512 MB instance. Text-based PDF,
DOCX, and TXT resumes remain supported.

## 2. Deploy the frontend on Vercel

1. Import the same GitHub repository into Vercel.
2. Set **Root Directory** to `neuralrecruit-frontend`.
3. Select **TanStack Start** as the framework preset.
4. Use `npm run build` as the build command.
5. Add these production environment variables:

   ```text
   VITE_API_URL=https://<render-host>
   NITRO_PRESET=vercel
   ```

6. Deploy and copy the final `https://<project>.vercel.app` production URL.

## 3. Complete CORS configuration

In Render, update:

```text
ALLOWED_ORIGINS=https://<project>.vercel.app
ALLOWED_HOSTS=<render-host>
```

Do not add trailing slashes. Redeploy the Render service, then redeploy Vercel
if `VITE_API_URL` changed.

## 4. Production smoke test

1. Open the Vercel URL in a private browser window.
2. Confirm the public landing page renders before the backend is contacted.
3. Select **Open Resume Review** and verify no login is shown.
4. Upload a text-based PDF, DOCX, or TXT resume.
5. Test Job Match and one Match Lab comparison.
6. Confirm browser developer tools show no CORS, mixed-content, or 5xx errors.

Never commit `.env` files, access tokens, candidate resumes, or generated
SQLite databases.

