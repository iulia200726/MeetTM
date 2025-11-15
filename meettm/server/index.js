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

const PORT = process.env.PORT || 4124;
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

// Build prompt for night planning (Gemini must select only from provided events)
function buildNightPlanPrompt(events, userPrefs) {
  const { nrPersoane, buget, mood, zona } = userPrefs;
  const lines = [];
  lines.push('Esti "AI Concierge" pentru viata de noapte din Bucuresti / Timisoara.');
  lines.push("Alegi doar din lista de evenimente de mai jos, nu inventezi alte locuri.");
  lines.push(
    `Preferinte user: ${nrPersoane} persoane, buget=${buget} (mic/mediu/mare), mood=${mood} (chill/party/cultural/live-music), zona=${zona}.`
  );
  lines.push("");
  lines.push(
    'Returneaza DOAR JSON valid: { "events": [ { "eventId": "<id din lista>", "time": "HH:MM", "title": "Titlu", "location": "Adresa/Zona", "reason": "De ce il recomanzi (1-2 fraze)" } ] }'
  );
  lines.push("Include 3-4 pasi: warm-up, 1-2 principale, after. Pastreaza ordinea cronologica.");
  lines.push("Evenimente disponibile (alege DOAR de aici):");
  events.forEach((event, index) => {
    lines.push(
      `${index + 1}. [${event.id}] ${event.title || "Fara titlu"} | cat=${
        event.category || event.type || "N/A"
      } | zona=${event.address || event.location || "N/A"} | ${event.dateStart || ""} ${
        event.hourStart || ""
      } -> ${event.dateEnd || ""} ${event.hourEnd || ""}`
    );
  });
  return lines.join("\n");
}

function buildFallbackPlanFromEvents(events, userPrefs = {}) {
  const safeEvents = Array.isArray(events) ? events.filter(Boolean) : [];
  if (!safeEvents.length) return [];

  const mood = userPrefs.mood || "";
  const reasonByMood = {
    party: "Energie buna si muzica potrivita mood-ului tau.",
    "live-music": "Are muzica live si vibe relaxat.",
    cultural: "Activitate culturala accesibila si prietenoasa.",
    chill: "Atmosfera cozy pentru discutii si social.",
  };

  return safeEvents.slice(0, 4).map((ev, idx) => ({
    eventId: ev.id,
    time:
      ev.hourStart ||
      ev.time ||
      (idx === 0 ? "19:30" : idx === 1 ? "21:00" : "23:00"),
    title: ev.title || "Eveniment",
    location: ev.address || ev.location || "Locatie nedefinita",
    reason: ev.description || reasonByMood[mood] || "Recomandat in functie de preferintele tale.",
  }));
}

async function fetchConciergeIssues(limit = 50) {
  try {
    const snap = await db
      .collection("issues")
      .orderBy("created", "desc")
      .limit(limit)
      .get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.warn(
      "Failed to order issues by created, fallback to simple fetch:",
      err.message || err
    );
    const snap = await db.collection("issues").limit(limit).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }
}

function matchesZone(event, zona) {
  if (!zona || zona === "oricare") return true;
  const hay = `${event.address || ""} ${event.location || ""}`.toLowerCase();
  return hay.includes(zona.toLowerCase());
}

function matchesBudget(event, buget) {
  if (!buget) return true;
  const maxPrice = buget === "mic" ? 60 : buget === "mediu" ? 150 : 99999;
  const price = Number(
    event.price || event.ticketPrice || event.cost || event.entryFee
  );
  if (!price || Number.isNaN(price)) return true;
  return price <= maxPrice;
}

function buildGenericFallback(userPrefs = {}) {
  const { zona, mood } = userPrefs;
  const zoneLabel = {
    centru: "Centru",
    "old-town": "Lipscani / Old Town",
    bellu: "Bellu",
    dorobanti: "Dorobanti",
  }[zona] || "zona centrala";

  const mainByMood = {
    party: {
      time: "21:30",
      title: "Club / DJ set",
      location: `${zoneLabel} - club/loc cu DJ local`,
      reason: "Energie buna pentru dans si socializare.",
    },
    "live-music": {
      time: "21:00",
      title: "Pub cu muzica live",
      location: `${zoneLabel} - scena live`,
      reason: "Concert mic pentru vibe live si bauturi.",
    },
    cultural: {
      time: "20:00",
      title: "Teatru / expozitie de seara",
      location: `${zoneLabel} - locatie indoor`,
      reason: "Activitate culturala accesibila in zona.",
    },
    chill: {
      time: "21:00",
      title: "Wine bar / terasa chill",
      location: `${zoneLabel} - terasa cu muzica soft`,
      reason: "Setting relaxat pentru conversatii linistite.",
    },
  };

  const main = mainByMood[mood] || {
    time: "21:00",
    title: "Eveniment principal",
    location: `${zoneLabel} - spatiu popular seara`,
    reason: "Optiune versatila potrivita preferintelor.",
  };

  return [
    {
      time: "19:30",
      title: "Warm-up la bistro/bar cozy",
      location: `${zoneLabel} - usor de gasit pentru tot grupul`,
      reason: "Punct de intalnire si planificare a serii.",
    },
    main,
    {
      time: "23:30",
      title: "After & social",
      location: `${zoneLabel} - lounge/pub deschis pana tarziu`,
      reason: "Pentru a continua seara intr-un ritm lejer.",
    },
  ];
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
    const { nrPersoane, buget, mood, zona } = req.body || {};
    if (!nrPersoane || !buget || !mood || !zona) {
      return res.status(400).json({
        error: "All fields required: nrPersoane, buget, mood, zona",
      });
    }

    // Fetch events from Firestore (same list shown in News/EventDetails)
    const issues = await fetchConciergeIssues(60);
    const filteredEvents = issues.filter(
      (ev) => matchesZone(ev, zona) && matchesBudget(ev, buget)
    );

    const prompt = buildNightPlanPrompt(
      filteredEvents.length ? filteredEvents : issues,
      req.body
    );
    let modelText = "";
    try {
      modelText = await callGemini(prompt);
    } catch (err) {
      console.error("Gemini call failed:", err.message || err);
    }

    const parsed = extractJsonFromText(modelText);
    let events = [];
    if (parsed) {
      if (Array.isArray(parsed.events)) events = parsed.events;
      else if (Array.isArray(parsed.plan)) events = parsed.plan;
      else if (Array.isArray(parsed)) events = parsed;
    }

    const allowedEvents = filteredEvents.length ? filteredEvents : issues;
    const allowedById = allowedEvents.reduce(
      (acc, ev) => {
        acc[ev.id] = ev;
        return acc;
      },
      {}
    );

    const fallback = buildFallbackPlanFromEvents(allowedEvents, req.body);

    const normalized = [];
    (Array.isArray(events) ? events : []).forEach((ev, idx) => {
      const candidateId = ev?.eventId || ev?.id;
      if (!candidateId) return;
      const allowed = allowedById[candidateId];
      if (!allowed) return; // ignore any hallucinated event

      normalized.push({
        eventId: allowed.id,
        time: ev.time || allowed.hourStart || allowed.hourEnd || fallback[idx % fallback.length]?.time || "20:00",
        title: allowed.title || ev.title || "Eveniment",
        location: allowed.address || allowed.location || ev.location || "Locatie",
        reason: ev.reason || allowed.description || "Potrivit cu preferintele tale.",
      });
    });

    const finalEvents =
      normalized.length > 0
        ? normalized
        : fallback.length > 0
        ? fallback
        : buildGenericFallback(req.body);

    return res.json({ events: finalEvents });
  } catch (err) {
    console.error("Plan night handler error:", err);
    return res.status(500).json({ events: buildGenericFallback() });
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
