import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";
import fs from "fs";

dotenv.config();

// -------- Firebase Admin init --------
const serviceAccount = JSON.parse(
  fs.readFileSync("./firebase-service-account.json", "utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// -------- Express app setup --------
const app = express();
app.use(cors());
app.use(express.json({ limit: "128kb" }));

const PORT = process.env.PORT || 4123;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_OAUTH_BEARER = process.env.GOOGLE_OAUTH_BEARER;
const MAX_RECOMMENDATIONS = parseInt(
  process.env.MAX_RECOMMENDATIONS || "8",
  10
);

// ========= GEMINI HELPERS =========

// Simple defensive parser: try to extract JSON object/array from model text
function extractJsonFromText(text) {
  if (!text || typeof text !== "string") return null;
  const objMatch = text.match(/(\{[\s\S]*\})/m);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[1]);
    } catch (e) {}
  }
  const arrMatch = text.match(/(\[[\s\S]*\])/m);
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[1]);
    } catch (e) {}
  }
  return null;
}

async function callGemini(prompt) {
  const baseUrl =
    "https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generateText";
  const url = GOOGLE_API_KEY
    ? `${baseUrl}?key=${encodeURIComponent(GOOGLE_API_KEY)}`
    : baseUrl;

  const headers = { "Content-Type": "application/json" };
  if (GOOGLE_OAUTH_BEARER) {
    headers["Authorization"] = `Bearer ${GOOGLE_OAUTH_BEARER}`;
  }

  const body = {
    prompt: { text: prompt },
    temperature: 0.1,
    maxOutputTokens: 256,
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Gemini API responded ${res.status}: ${t}`);
  }

  const json = await res.json();

  let textOutput = "";
  if (json.candidates && json.candidates.length) {
    textOutput =
      json.candidates[0].content ||
      json.candidates[0].output ||
      JSON.stringify(json.candidates[0]);
  } else if (json.output && Array.isArray(json.output) && json.output[0]) {
    textOutput = json.output[0].content || JSON.stringify(json.output[0]);
  } else if (json.result && json.result.output) {
    textOutput = json.result.output;
  } else {
    textOutput = JSON.stringify(json);
  }

  return textOutput;
}

// Build a short instruction prompt for the model given the interactions payload
function buildPrompt(interactions, maxResults = MAX_RECOMMENDATIONS) {
  const lines = [];
  lines.push("You are a recommendation assistant for a local events app.");
  lines.push(
    "Given a short list of events the user interacted with (liked/viewed), return a JSON object with a single array field 'recommendedIds' containing up to " +
      maxResults +
      " event ids, ordered from best to least relevant."
  );
  lines.push("Rules:");
  lines.push(
    "- Only return event ids that are NOT present in the input interactions list (prefer novel suggestions)."
  );
  lines.push(
    "- Prefer events from categories the user liked or viewed more often."
  );
  lines.push(
    '- Keep the output strictly as valid JSON, for example: { "recommendedIds": ["id1", "id2"] }'
  );
  lines.push("");
  lines.push("Input interactions (id | title | category | liked | viewed):");
  interactions.forEach((it) => {
    lines.push(
      `- ${it.id} | ${it.title || ""} | ${it.category || ""} | liked:${
        it.liked ? "1" : "0"
      } | viewed:${it.viewed ? "1" : "0"}`
    );
  });
  lines.push("");
  lines.push(
    "If there are not enough candidates, return an empty array. Do not include any explanatory text."
  );
  return lines.join("\n");
}

// Build prompt for night planning
function buildNightPlanPrompt(events, userPrefs) {
  const { nrPersoane, buget, mood, zona } = userPrefs;
  const lines = [];
  lines.push("You are an AI concierge for planning nights out in Bucharest.");
  lines.push(
    `User preferences: ${nrPersoane} people, budget: ${buget}, mood: ${mood}, zone: ${zona}.`
  );
  lines.push("Available events:");
  events.forEach((event, index) => {
    lines.push(
      `${index + 1}. ${
        event.title || event.description
      } - Category: ${event.category || "N/A"} - Location: ${
        event.location || "N/A"
      } - Time: ${event.time || "N/A"} - Price: ${event.price || "Free"}`
    );
  });
  lines.push("");
  lines.push(
    'Plan a night with 1-2 events. Return JSON: { "plan": [{"eventId": "id", "time": "HH:MM", "reason": "why this fits"}] }'
  );
  lines.push(
    "Order events logically (e.g., dinner then concert). Keep budget in mind. Output only valid JSON."
  );
  return lines.join("\n");
}

// ========= GEMINI ROUTES =========

app.post("/api/recommendations", async (req, res) => {
  try {
    const { interactions } = req.body || {};
    if (!Array.isArray(interactions)) {
      return res.status(400).json({ error: "interactions array required" });
    }

    const prompt = buildPrompt(interactions, MAX_RECOMMENDATIONS);
    let modelText;
    try {
      modelText = await callGemini(prompt);
    } catch (err) {
      console.error("Gemini call failed:", err.message || err);
      return res.status(503).json({ recommendedIds: [] });
    }

    const parsed = extractJsonFromText(modelText);
    if (parsed) {
      if (Array.isArray(parsed)) {
        return res.json({
          recommendedIds: parsed.slice(0, MAX_RECOMMENDATIONS),
        });
      }
      if (parsed.recommendedIds && Array.isArray(parsed.recommendedIds)) {
        return res.json({
          recommendedIds: parsed.recommendedIds.slice(
            0,
            MAX_RECOMMENDATIONS
          ),
        });
      }
      if (parsed.ids && Array.isArray(parsed.ids)) {
        return res.json({
          recommendedIds: parsed.ids.slice(0, MAX_RECOMMENDATIONS),
        });
      }
    }

    const arrMatch = modelText.match(/(\[[\s\S]*\])/m);
    if (arrMatch) {
      try {
        const arr = JSON.parse(arrMatch[1]);
        if (Array.isArray(arr)) {
          return res.json({
            recommendedIds: arr.slice(0, MAX_RECOMMENDATIONS),
          });
        }
      } catch (e) {}
    }

    console.warn(
      "Could not parse Gemini output as JSON:",
      modelText.slice(0, 800)
    );
    return res.status(503).json({ recommendedIds: [] });
  } catch (err) {
    console.error("Recommendations handler error:", err);
    return res.status(500).json({ recommendedIds: [] });
  }
});

app.post("/api/plan-night", async (req, res) => {
  try {
    const { nrPersoane, buget, mood, zona } = req.body;
    if (!nrPersoane || !buget || !mood || !zona) {
      return res
        .status(400)
        .json({
          error:
            "All fields required: nrPersoane, buget, mood, zona",
        });
    }

    const eventsRef = db.collection("issues");
    let q = eventsRef;

    if (zona !== "oricare") {
      q = q
        .where("location", ">=", zona)
        .where("location", "<=", zona + "\uf8ff");
    }
    const snapshot = await q.get();
    const events = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const filteredEvents = events.filter((event) => {
      if (event.price === "Free" || !event.price) return true;
      const price = parseFloat(event.price);
      return price <= parseFloat(buget);
    });

    if (filteredEvents.length === 0) {
      return res.json({ plan: [] });
    }

    const prompt = buildNightPlanPrompt(filteredEvents, req.body);
    let modelText;
    try {
      modelText = await callGemini(prompt);
    } catch (err) {
      console.error("Gemini call failed:", err.message || err);
      return res.status(503).json({ plan: [] });
    }

    const parsed = extractJsonFromText(modelText);
    if (parsed && parsed.plan && Array.isArray(parsed.plan)) {
      return res.json({ plan: parsed.plan.slice(0, 2) });
    }

    return res.status(503).json({ plan: [] });
  } catch (err) {
    console.error("Plan night handler error:", err);
    return res.status(500).json({ plan: [] });
  }
});

// ========= EVENT AURA ROUTES =========

app.post("/api/event/like", async (req, res) => {
  try {
    const { eventId, userId } = req.body;
    if (!eventId || !userId) {
      return res.status(400).json({ error: "eventId and userId required" });
    }

    const likeRef = db.collection("event_likes").doc(`${eventId}_${userId}`);
    await likeRef.set({
      eventId,
      userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Like event error:", err);
    res.status(500).json({ error: "Failed to record like" });
  }
});

app.post("/api/event/checkin", async (req, res) => {
  try {
    const { eventId, userId } = req.body;
    if (!eventId || !userId) {
      return res.status(400).json({ error: "eventId and userId required" });
    }

    const checkinRef = db
      .collection("event_checkins")
      .doc(`${eventId}_${userId}`);
    await checkinRef.set({
      eventId,
      userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Checkin event error:", err);
    res.status(500).json({ error: "Failed to record checkin" });
  }
});

app.post("/api/event/rate", async (req, res) => {
  try {
    const { eventId, userId, rating } = req.body;
    if (!eventId || !userId || rating < 1 || rating > 5) {
      return res
        .status(400)
        .json({ error: "eventId, userId, and rating (1-5) required" });
    }

    const ratingRef = db
      .collection("event_ratings")
      .doc(`${eventId}_${userId}`);
    await ratingRef.set({
      eventId,
      userId,
      rating,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Rate event error:", err);
    res.status(500).json({ error: "Failed to record rating" });
  }
});

app.post("/api/event/noise", async (req, res) => {
  try {
    const { eventId, userId, noiseLevel } = req.body;
    if (!eventId || !userId || typeof noiseLevel !== "number") {
      return res
        .status(400)
        .json({
          error:
            "eventId, userId, and noiseLevel (number) required",
        });
    }

    const noiseRef = db
      .collection("event_noise")
      .doc(`${eventId}_${userId}`);
    await noiseRef.set({
      eventId,
      userId,
      noiseLevel,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Noise event error:", err);
    res.status(500).json({ error: "Failed to record noise level" });
  }
});

app.get("/api/event/aura", async (req, res) => {
  try {
    const eventsSnapshot = await db.collection("issues").get();
    const events = eventsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const auraData = [];

    for (const event of events) {
      const eventId = event.id;

      const likesSnapshot = await db
        .collection("event_likes")
        .where("eventId", "==", eventId)
        .get();
      const likesCount = likesSnapshot.size;

      const checkinsSnapshot = await db
        .collection("event_checkins")
        .where("eventId", "==", eventId)
        .get();
      const checkinsCount = checkinsSnapshot.size;

      const ratingsSnapshot = await db
        .collection("event_ratings")
        .where("eventId", "==", eventId)
        .get();
      let avgRating = 0;
      if (!ratingsSnapshot.empty) {
        const totalRating = ratingsSnapshot.docs.reduce(
          (sum, doc) => sum + doc.data().rating,
          0
        );
        avgRating = totalRating / ratingsSnapshot.size;
      }

      const noiseSnapshot = await db
        .collection("event_noise")
        .where("eventId", "==", eventId)
        .get();
      let avgNoise = 0;
      if (!noiseSnapshot.empty) {
        const totalNoise = noiseSnapshot.docs.reduce(
          (sum, doc) => sum + doc.data().noiseLevel,
          0
        );
        avgNoise = totalNoise / noiseSnapshot.size;
      }

      const auraScore = Math.min(
        100,
        Math.max(
          0,
          likesCount * 5 +
            checkinsCount * 3.33 +
            avgRating * 20 +
            avgNoise * 2
        )
      );

      let color;
      if (event.category === "Art & Culture") {
        color = "#8a2be2";
      } else if (auraScore > 80) {
        color = "#ff0000";
      } else if (auraScore > 50) {
        color = "#ffff00";
      } else {
        color = "#0000ff";
      }

      auraData.push({
        eventId,
        lat: event.lat,
        lng: event.lng,
        auraScore,
        color,
        weight: Math.max(0.1, auraScore / 100),
      });
    }

    res.json({ auraData });
  } catch (err) {
    console.error("Aura calculation error:", err);
    res.status(500).json({ error: "Failed to calculate aura" });
  }
});

// ========= SPOTIFY INTEGRARE (cu refresh token) =========

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REFRESH_TOKEN,
} = process.env;

// ia access_token din refresh_token
async function getSpotifyAccessToken() {
  if (
    !SPOTIFY_CLIENT_ID ||
    !SPOTIFY_CLIENT_SECRET ||
    !SPOTIFY_REFRESH_TOKEN
  ) {
    throw new Error(
      "Missing Spotify env vars (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET / SPOTIFY_REFRESH_TOKEN)."
    );
  }

  const tokenUrl = "https://accounts.spotify.com/api/token";

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: SPOTIFY_REFRESH_TOKEN,
  });

  const basic = Buffer.from(
    `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Spotify token error: ${res.status} ${text}`);
  }

  const json = await res.json();
  return json.access_token;
}

function extractSpotifyTrackIdFromUrl(url) {
  if (!url) return null;

  const m = url.match(/track\/([a-zA-Z0-9]+)(\?|$|\/)/);
  if (m && m[1]) return m[1];

  const m2 = url.match(/spotify:track:([a-zA-Z0-9]+)/);
  if (m2 && m2[1]) return m2[1];

  return null;
}

function extractSpotifyPlaylistIdFromUrl(url) {
  if (!url) return null;

  const m = url.match(/playlist\/([a-zA-Z0-9]+)(\?|$|\/)/);
  if (m && m[1]) return m[1];

  const m2 = url.match(/spotify:playlist:([a-zA-Z0-9]+)/);
  if (m2 && m2[1]) return m2[1];

  return null;
}

async function getPlaylistIdForEvent(eventId) {
  const docRef = db.collection("issues").doc(eventId);
  const snap = await docRef.get();
  if (!snap.exists) return null;

  const data = snap.data();
  if (data.spotifyPlaylistUrl) {
    const pid = extractSpotifyPlaylistIdFromUrl(data.spotifyPlaylistUrl);
    if (pid) return pid;
  }
  if (data.spotifyPlaylistId) return data.spotifyPlaylistId;
  return null;
}

// ---- Add track to event playlist ----
app.post("/api/spotify/add-track/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;
    const { trackUrl } = req.body || {};

    if (!trackUrl) {
      return res.status(400).json({ error: "trackUrl is required" });
    }

    const trackId = extractSpotifyTrackIdFromUrl(trackUrl);
    if (!trackId) {
      return res.status(400).json({ error: "Invalid Spotify track URL" });
    }

    const playlistId = await getPlaylistIdForEvent(eventId);
    if (!playlistId) {
      return res.status(400).json({
        error:
          "This event has no spotifyPlaylistUrl / spotifyPlaylistId in Firestore",
      });
    }

    const accessToken = await getSpotifyAccessToken();

    const addRes = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uris: [`spotify:track:${trackId}`],
        }),
      }
    );

    if (!addRes.ok) {
      const text = await addRes.text().catch(() => "");
      console.error("Spotify add-track error:", addRes.status, text);
      return res
        .status(500)
        .json({ error: "Failed to add track to playlist" });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Add-track handler error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---- Get playlist tracks for event ----
app.get("/api/spotify/playlist/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;
    const playlistId = await getPlaylistIdForEvent(eventId);
    if (!playlistId) {
      return res
        .status(400)
        .json({ error: "This event has no Spotify playlist" });
    }

    const accessToken = await getSpotifyAccessToken();

    const r = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.error("Spotify playlist error:", r.status, text);
      return res
        .status(500)
        .json({ error: "Failed to fetch playlist tracks" });
    }

    const json = await r.json();
    const tracks = (json.items || []).map((item) => {
      const tr = item.track || {};
      return {
        id: tr.id,
        name: tr.name,
        artists: (tr.artists || []).map((a) => ({
          id: a.id,
          name: a.name,
        })),
        uri: tr.uri,
      };
    });

    return res.json({ tracks });
  } catch (err) {
    console.error("Playlist handler error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---- Simulated current track for event based on playlist + event time ----
app.get("/api/spotify/current-track/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;

    const docRef = db.collection("issues").doc(eventId);
    const snap = await docRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Event not found" });
    }
    const event = snap.data();

    const playlistId = await getPlaylistIdForEvent(eventId);
    if (!playlistId) {
      return res
        .status(400)
        .json({ error: "Event has no Spotify playlist" });
    }

    const accessToken = await getSpotifyAccessToken();

    const r = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.error("Spotify playlist error:", r.status, text);
      return res
        .status(500)
        .json({ error: "Failed to fetch playlist tracks" });
    }

    const json = await r.json();
    const tracks = (json.items || [])
      .map((item) => item.track)
      .filter(Boolean)
      .map((tr) => ({
        name: tr.name,
        artists: (tr.artists || []).map((a) => a.name),
        duration_ms: tr.duration_ms,
      }));

    if (tracks.length === 0) {
      return res.json({ currentTrack: null });
    }

    const now = new Date();
    const eventStart = new Date(`${event.dateStart}T${event.hourStart}`);
    const eventEnd = new Date(`${event.dateEnd}T${event.hourEnd}`);

    if (isNaN(eventStart.getTime()) || isNaN(eventEnd.getTime())) {
      return res.json({ currentTrack: null });
    }

    if (now < eventStart || now > eventEnd) {
      return res.json({ currentTrack: null, message: "Event not active" });
    }

    const elapsedMs = now - eventStart;
    const totalDuration = tracks.reduce(
      (sum, t) => sum + (t.duration_ms || 0),
      0
    );
    if (!totalDuration) {
      return res.json({ currentTrack: null });
    }

    const positionMs = elapsedMs % totalDuration;

    let cumulative = 0;
    let currentTrack = null;
    for (const tr of tracks) {
      if (
        positionMs >= cumulative &&
        positionMs < cumulative + (tr.duration_ms || 0)
      ) {
        currentTrack = tr;
        break;
      }
      cumulative += tr.duration_ms || 0;
    }

    return res.json({ currentTrack });
  } catch (err) {
    console.error("Current-track handler error:", err);
    return res.status(500).json({ currentTrack: null });
  }
});

// optional debug route
app.get("/api/spotify/test-token", async (req, res) => {
  try {
    const token = await getSpotifyAccessToken();
    res.json({ ok: true, tokenPresent: !!token });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ========= HEALTH + LISTEN =========
app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Recommendations server listening on port ${PORT}`);
});
