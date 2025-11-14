# MeetTM Recommendations Server

This is a small Express server that accepts a compact interactions payload from the frontend and calls the Google Generative Language API (Gemini / text-bison) to produce a JSON list of recommended event IDs.

Important: keep your API key or bearer token secret and set it in environment variables (do not commit .env with secrets).

## Env vars
- `GOOGLE_API_KEY` - optional; an API key to attach as query param when calling the Google Generative Language endpoint (useful for simple testing). OR
- `GOOGLE_OAUTH_BEARER` - optional; Bearer token (recommended for production/service-account flows).
- `PORT` - optional server port (defaults to 4123)
- `MAX_RECOMMENDATIONS` - optional default 8

## Install

From the `server` directory:

```powershell
npm install
# or
npm ci
```

## Run

```powershell
# copy .env.example to .env and set your key/token
node index.js
# or for development with autoreload (if you have nodemon):
npm run dev
```

## Contract
POST /api/recommendations
Content-Type: application/json
Body: { interactions: [{ id, title, category, liked: boolean, viewed: boolean }, ...] }

Response (success): { recommendedIds: ['id1','id2', ...] }

If the LLM call fails, the server returns status 503 and { recommendedIds: [] }.

## Notes
- The server attempts to parse JSON out of the generative model output. Because model outputs can vary, the parsing is somewhat defensive: it will look for JSON objects/arrays embedded in the text.
- You can extend the prompt and parsing logic to include more signals (e.g., event upvotes, views) if you want a stronger model response.
