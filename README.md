# UK Wait Times Tracker

The repository contains the React frontend in `frontend/` and the FastAPI backend in `backend/`.

## Backend hosting

The backend can run on any container host using `backend/Dockerfile`. Copy
`backend/.env.example` into the host's protected environment settings and provide real values
there. Never commit production credentials.
