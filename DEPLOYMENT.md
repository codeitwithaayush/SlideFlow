# PPTBUILDER Deployment Guide (Railway & Vercel)

This guide walks you through deploying the AI PowerPoint Builder presentation generator stack. 

- **Backend (FastAPI)** is deployed on **Railway** (along with a PostgreSQL database).
- **Frontend (Next.js & React)** is deployed on **Vercel**.

---

## What We Configured For Production
1. **Dynamic Backend API**: Configured the React app in [page.tsx](file:///Users/aaryankhanna/Downloads/PPTBUILDER/frontend/app/page.tsx#L87) to read from `process.env.NEXT_PUBLIC_API_URL` instead of hardcoding `localhost:8000`.
2. **CORS credentials fix**: Updated [main.py](file:///Users/aaryankhanna/Downloads/PPTBUILDER/backend/main.py#L31-L38) to disable credentials since the backend is stateless, preventing browser CORS blocks.
3. **Database URL Normalizer**: Added a fallback in [config.py](file:///Users/aaryankhanna/Downloads/PPTBUILDER/backend/config.py#L17-L19) to translate legacy `postgres://` connection strings into `postgresql://` (required by SQLAlchemy).
4. **Railway Configuration**: Created [railway.json](file:///Users/aaryankhanna/Downloads/PPTBUILDER/backend/railway.json) inside the `backend` folder to automate building and launching the FastAPI service.

---

## Step 1: Deploy Backend & Database on Railway

1. Go to [Railway.app](https://railway.app) and log in.
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Select your repository `Aaryan-336/PPTBUILDER`.
4. In the service setup box:
   - Click **Variables** and add:
     - `GROQ_API_KEY`: Your Groq Cloud API Key.
     - `GROQ_MODEL`: `llama-3.3-70b-versatile`
   - Click **Settings** and set:
     - **Root Directory**: `backend`
5. Click **Close** and go back to your Railway project canvas.
6. Now, add the database:
   - Click **+ New** at the top right of the canvas and select **Database** -> **Add PostgreSQL**.
7. Railway will automatically link the database. It injects a `DATABASE_URL` environment variable directly into your backend web service!
8. Click on your `pptbuilder` backend service box in the canvas, go to **Settings**, scroll down to **Public Networking**, and click **Generate Domain**.
9. Copy your generated public domain URL (e.g. `https://pptbuilder-production.up.railway.app`).

---

## Step 2: Deploy Frontend on Vercel

1. Log into your [Vercel Dashboard](https://vercel.com/).
2. Click **Add New** and select **Project**.
3. Import your GitHub repository `Aaryan-336/PPTBUILDER`.
4. In the Project configuration:
   - Set the **Root Directory** to `frontend`.
   - Leave the **Framework Preset** as **Next.js**.
   - Expand the **Environment Variables** section and add:
     - **Name**: `NEXT_PUBLIC_API_URL`
     - **Value**: Your Railway backend domain URL (e.g. `https://pptbuilder-production.up.railway.app`). Ensure there is **no trailing slash** at the end.
5. Click **Deploy**.
6. Once deployed, open your Vercel website link. The application is now live and will work seamlessly from any computer!
