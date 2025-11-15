import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";
import SpotifyWebApi from "spotify-web-api-node";

dotenv.config();

import fs from "fs";
const serviceAccount = JSON.parse(fs.readFileSync("./firebase-service-account.json", "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json({ limit: "128kb" }));

const PORT = process.env.PORT || 4124;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_OAUTH_BEARER = process.env.GOOGLE_OAUTH_BEARER;
const MAX_RECOMMENDATIONS = parseInt(process.env.MAX_RECOMMENDATIONS || "8", 10);

// Spotify API setup
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

// Simple defensive parser: try to extract JSON object/array from model text
function extractJsonFromText(text) {
  if (!text || typeof text !== "string") return null;
  // Try to find a JSON object or array substring
  const objMatch = text.match(/(\{[\s\S]*\})/m);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[1]);
    } catch (e) {
      // ignore
    }
  }
  const arrMatch = text.match(/(\[[\s\S]*\])/m);
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[1]);
    } catch (e) {
      // ignore
    }
  }
  return null;
}

async function callGemini(prompt) {
  // Use Google Generative Language v1beta2 text generation endpoint for text-bison.
  // Endpoint: https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generateText
  // We either attach ?key=API_KEY or pass a Bearer token in Authorization header.

  const baseUrl = "https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generateText";
  const url = GOOGLE_API_KEY ? `${baseUrl}?key=${encodeURIComponent(GOOGLE_API_KEY)}` : baseUrl;
  const headers = { "Content-Type": "application/json" };
  if (GOOGLE_OAUTH_BEARER) headers["Authorization"] = `Bearer ${GOOGLE_OAUTH_BEARER}`;

  const body = {
    // "prompt" structure expected by the endpoint; keep it simple and readable
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

  // defensive extraction: model providers sometimes wrap generated text under different keys
  // try common shapes
  let textOutput = "";
  if (json.candidates && json.candidates.length) {
    textOutput = json.candidates[0].content || json.candidates[0].output || JSON.stringify(json.candidates[0]);
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
  // interactions: [{ id, title, category, liked, viewed }, ...]
  // We'll ask the model to return a JSON object: { "recommendedIds": ["id1","id2"] }
  const lines = [];
  lines.push("You are a recommendation assistant for a local events app.");
  lines.push("Given a short list of events the user interacted with (liked/viewed), return a JSON object with a single array field 'recommendedIds' containing up to " + maxResults + " event ids, ordered from best to least relevant.");
  lines.push("Rules:");
  lines.push("- Only return event ids that are NOT present in the input interactions list (prefer novel suggestions).");
  lines.push("- Prefer events from categories the user liked or viewed more often.");
  lines.push("- Keep the output strictly as valid JSON, for example: { \"recommendedIds\": [\"id1\", \"id2\"] }");
  lines.push("");
  lines.push("Input interactions (id | title | category | liked | viewed):");
  interactions.forEach((it) => {
    lines.push(`- ${it.id} | ${it.title || ''} | ${it.category || ''} | liked:${it.liked ? '1' : '0'} | viewed:${it.viewed ? '1' : '0'}`);
  });
  lines.push("");
  lines.push("If there are not enough candidates, return an empty array. Do not include any explanatory text.");
  return lines.join('\n');
}

app.post("/api/recommendations", async (req, res) => {
  try {
    const { interactions } = req.body || {};
    if (!Array.isArray(interactions)) {
      return res.status(400).json({ error: "interactions array required" });
    }

    // Build the prompt and call the model
    const prompt = buildPrompt(interactions, MAX_RECOMMENDATIONS);
    let modelText;
    try {
      modelText = await callGemini(prompt);
    } catch (err) {
      console.error("Gemini call failed:", err.message || err);
      // delegate to fallback: return empty recommendedIds so the frontend can apply its local fallback
      return res.status(503).json({ recommendedIds: [] });
    }

    // Try to parse model output as JSON
    const parsed = extractJsonFromText(modelText);
    if (parsed) {
      // If parsed is an object with recommendedIds, return it. If it's an array, assume it's the ids.
      if (Array.isArray(parsed)) {
        return res.json({ recommendedIds: parsed.slice(0, MAX_RECOMMENDATIONS) });
      }
      if (parsed.recommendedIds && Array.isArray(parsed.recommendedIds)) {
        return res.json({ recommendedIds: parsed.recommendedIds.slice(0, MAX_RECOMMENDATIONS) });
      }
      // Maybe the model returned { ids: [...] }
      if (parsed.ids && Array.isArray(parsed.ids)) {
        return res.json({ recommendedIds: parsed.ids.slice(0, MAX_RECOMMENDATIONS) });
      }
    }

    // As a last effort, try to find an array-like JSON string inside the raw text
    const arrMatch = modelText.match(/(\[[\s\S]*\])/m);
    if (arrMatch) {
      try {
        const arr = JSON.parse(arrMatch[1]);
        if (Array.isArray(arr)) return res.json({ recommendedIds: arr.slice(0, MAX_RECOMMENDATIONS) });
      } catch (e) {
        // ignore
      }
    }

    // If we get here, parsing failed. Return empty array and 503 so frontend can fallback locally.
    console.warn("Could not parse Gemini output as JSON:", modelText.slice(0, 800));
    return res.status(503).json({ recommendedIds: [] });
  } catch (err) {
    console.error("Recommendations handler error:", err);
    return res.status(500).json({ recommendedIds: [] });
  }
});

// Build prompt for night planning
function buildNightPlanPrompt(events, userPrefs) {
  const { nrPersoane, buget, mood, zona } = userPrefs;
  const lines = [];
  lines.push("You are an AI concierge for planning nights out in Bucharest.");
  lines.push(`User preferences: ${nrPersoane} people, budget: ${buget}, mood: ${mood}, zone: ${zona}.`);
  lines.push("Available events:");
  events.forEach((event, index) => {
    lines.push(`${index + 1}. ${event.title || event.description} - Category: ${event.category || 'N/A'} - Location: ${event.location || 'N/A'} - Time: ${event.time || 'N/A'} - Price: ${event.price || 'Free'}`);
  });
  lines.push("");
  lines.push("Plan a night with 1-2 events. Return JSON: { \"plan\": [{\"eventId\": \"id\", \"time\": \"HH:MM\", \"reason\": \"why this fits\"}] }");
  lines.push("Order events logically (e.g., dinner then concert). Keep budget in mind. Output only valid JSON.");
  return lines.join('\n');
}

app.post("/api/plan-night", async (req, res) => {
  try {
    const { nrPersoane, buget, mood, zona } = req.body;
    if (!nrPersoane || !buget || !mood || !zona) {
      return res.status(400).json({ error: "All fields required: nrPersoane, buget, mood, zona" });
    }

    // Fetch events from Firestore, filter by zona and buget
    const eventsRef = db.collection('issues');
    let query = eventsRef;
    // Assuming zona is a field, filter if possible
    if (zona !== 'oricare') {
      query = query.where('location', '>=', zona).where('location', '<=', zona + '\uf8ff'); // simple prefix match
    }
    const snapshot = await query.get();
    const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Filter by budget (assume price is a number or 'Free')
    const filteredEvents = events.filter(event => {
      if (event.price === 'Free' || !event.price) return true;
      const price = parseFloat(event.price);
      return price <= parseFloat(buget);
    });

    if (filteredEvents.length === 0) {
      return res.json({ plan: [] });
    }

    // Build prompt and call Gemini
    const prompt = buildNightPlanPrompt(filteredEvents, req.body);
    let modelText;
    try {
      modelText = await callGemini(prompt);
    } catch (err) {
      console.error("Gemini call failed:", err.message || err);
      return res.status(503).json({ plan: [] });
    }

    // Parse JSON
    const parsed = extractJsonFromText(modelText);
    if (parsed && parsed.plan && Array.isArray(parsed.plan)) {
      return res.json({ plan: parsed.plan.slice(0, 2) }); // max 2 events
    }

    return res.status(503).json({ plan: [] });
  } catch (err) {
    console.error("Plan night handler error:", err);
    return res.status(500).json({ plan: [] });
  }
});

// Event Aura endpoints
app.post("/api/event/like", async (req, res) => {
  try {
    const { eventId, userId } = req.body;
    if (!eventId || !userId) {
      return res.status(400).json({ error: "eventId and userId required" });
    }

    const likeRef = db.collection('event_likes').doc(`${eventId}_${userId}`);
    await likeRef.set({
      eventId,
      userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
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

    const checkinRef = db.collection('event_checkins').doc(`${eventId}_${userId}`);
    await checkinRef.set({
      eventId,
      userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
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
      return res.status(400).json({ error: "eventId, userId, and rating (1-5) required" });
    }

    const ratingRef = db.collection('event_ratings').doc(`${eventId}_${userId}`);
    await ratingRef.set({
      eventId,
      userId,
      rating,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
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
    if (!eventId || !userId || typeof noiseLevel !== 'number') {
      return res.status(400).json({ error: "eventId, userId, and noiseLevel (number) required" });
    }

    const noiseRef = db.collection('event_noise').doc(`${eventId}_${userId}`);
    await noiseRef.set({
      eventId,
      userId,
      noiseLevel,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Noise event error:", err);
    res.status(500).json({ error: "Failed to record noise level" });
  }
});

app.get("/api/event/aura", async (req, res) => {
  try {
    // Get all events
    const eventsSnapshot = await db.collection('issues').get();
    const events = eventsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const auraData = [];

    for (const event of events) {
      const eventId = event.id;

      // Get likes count
      const likesSnapshot = await db.collection('event_likes').where('eventId', '==', eventId).get();
      const likesCount = likesSnapshot.size;

      // Get checkins count
      const checkinsSnapshot = await db.collection('event_checkins').where('eventId', '==', eventId).get();
      const checkinsCount = checkinsSnapshot.size;

      // Get average rating
      const ratingsSnapshot = await db.collection('event_ratings').where('eventId', '==', eventId).get();
      let avgRating = 0;
      if (!ratingsSnapshot.empty) {
        const totalRating = ratingsSnapshot.docs.reduce((sum, doc) => sum + doc.data().rating, 0);
        avgRating = totalRating / ratingsSnapshot.size;
      }

      // Get average noise level
      const noiseSnapshot = await db.collection('event_noise').where('eventId', '==', eventId).get();
      let avgNoise = 0;
      if (!noiseSnapshot.empty) {
        const totalNoise = noiseSnapshot.docs.reduce((sum, doc) => sum + doc.data().noiseLevel, 0);
        avgNoise = totalNoise / noiseSnapshot.size;
      }

      // Calculate aura score (0-100)
      // Weights: likes 20%, checkins 30%, ratings 30%, noise 20%
      const auraScore = Math.min(100, Math.max(0,
        (likesCount * 5) +     // 20 likes = 100 points
        (checkinsCount * 3.33) + // 30 checkins = 100 points
        (avgRating * 20) +     // 5 rating = 100 points
        (avgNoise * 2)         // 50 noise = 100 points
      ));

      // Determine color based on aura and category
      let color;
      if (event.category === 'Art & Culture') {
        color = '#8a2be2'; // violet
      } else if (auraScore > 80) {
        color = '#ff0000'; // red
      } else if (auraScore > 50) {
        color = '#ffff00'; // yellow
      } else {
        color = '#0000ff'; // blue
      }

      auraData.push({
        eventId,
        lat: event.lat,
        lng: event.lng,
        auraScore,
        color,
        weight: Math.max(0.1, auraScore / 100) // Heatmap weight 0.1-1.0
      });
    }

    res.json({ auraData });
  } catch (err) {
    console.error("Aura calculation error:", err);
    res.status(500).json({ error: "Failed to calculate aura" });
  }
});

// Spotify playlist endpoint
app.get("/api/spotify/playlist/:playlistId", async (req, res) => {
  try {
    const { playlistId } = req.params;
    if (!playlistId) {
      return res.status(400).json({ error: "playlistId required" });
    }

    // Authenticate with Spotify
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body['access_token']);

    // Get playlist tracks
    const playlistData = await spotifyApi.getPlaylistTracks(playlistId, {
      limit: 50,
      fields: 'items(track(name,artists(name),duration_ms,external_urls))'
    });

    const tracks = playlistData.body.items.map(item => ({
      name: item.track.name,
      artists: item.track.artists.map(artist => artist.name).join(', '),
      duration_ms: item.track.duration_ms,
      spotify_url: item.track.external_urls.spotify
    }));

    res.json({ tracks });
  } catch (err) {
    console.error("Spotify playlist fetch error:", err.message || err);
    res.status(500).json({ error: "Failed to fetch playlist tracks" });
  }
});

// Get current playing track for an event (simulated based on event time)
app.get("/api/spotify/current-track/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;
    if (!eventId) {
      return res.status(400).json({ error: "eventId required" });
    }

    // Get event data from Firestore
    const eventDoc = await db.collection('issues').doc(eventId).get();
    if (!eventDoc.exists) {
      return res.status(404).json({ error: "Event not found" });
    }

    const event = eventDoc.data();
    if (!event.spotifyPlaylistUrl) {
      return res.status(400).json({ error: "Event has no Spotify playlist" });
    }

    // Extract playlist ID from URL
    const playlistIdMatch = event.spotifyPlaylistUrl.match(/playlist\/([a-zA-Z0-9]+)/);
    if (!playlistIdMatch) {
      return res.status(400).json({ error: "Invalid Spotify playlist URL" });
    }
    const playlistId = playlistIdMatch[1];

    // Authenticate with Spotify
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body['access_token']);

    // Get playlist tracks
    const playlistData = await spotifyApi.getPlaylistTracks(playlistId, {
      limit: 50,
      fields: 'items(track(name,artists(name),duration_ms,external_urls))'
    });

    const tracks = playlistData.body.items.filter(item => item.track).map(item => ({
      name: item.track.name,
      artists: item.track.artists.map(artist => artist.name).join(', '),
      duration_ms: item.track.duration_ms,
      spotify_url: item.track.external_urls.spotify
    }));

    if (tracks.length === 0) {
      return res.status(404).json({ error: "No tracks found in playlist" });
    }

    // Calculate current track based on event start time
    const now = new Date();
    const eventStart = new Date(event.dateStart + 'T' + event.hourStart);
    const eventEnd = new Date(event.dateEnd + 'T' + event.hourEnd);

    if (now < eventStart || now > eventEnd) {
      return res.json({ currentTrack: null, message: "Event not currently active" });
    }

    const elapsedMs = now - eventStart;
    const totalDuration = tracks.reduce((sum, track) => sum + track.duration_ms, 0);
    const positionMs = elapsedMs % totalDuration;

    let cumulativeMs = 0;
    let currentTrack = null;
    for (const track of tracks) {
      if (positionMs >= cumulativeMs && positionMs < cumulativeMs + track.duration_ms) {
        currentTrack = track;
        break;
      }
      cumulativeMs += track.duration_ms;
    }

    res.json({ currentTrack });
  } catch (err) {
    console.error("Spotify current track fetch error:", err.message || err);
    res.status(500).json({ error: "Failed to fetch current track" });
  }
});

// Add track to event playlist
app.post("/api/spotify/add-track/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;
    const { trackUri } = req.body;
    if (!eventId || !trackUri) {
      return res.status(400).json({ error: "eventId and trackUri required" });
    }

    // Get event data from Firestore
    const eventDoc = await db.collection('issues').doc(eventId).get();
    if (!eventDoc.exists) {
      return res.status(404).json({ error: "Event not found" });
    }

    const event = eventDoc.data();
    if (!event.spotifyPlaylistUrl) {
      return res.status(400).json({ error: "Event has no Spotify playlist" });
    }

    // Extract playlist ID from URL
    const playlistIdMatch = event.spotifyPlaylistUrl.match(/playlist\/([a-zA-Z0-9]+)/);
    if (!playlistIdMatch) {
      return res.status(400).json({ error: "Invalid Spotify playlist URL" });
    }
    const playlistId = playlistIdMatch[1];

    // Authenticate with Spotify
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body['access_token']);

    // Add track to playlist
    await spotifyApi.addTracksToPlaylist(playlistId, [trackUri]);

    res.json({ success: true });
  } catch (err) {
    console.error("Spotify add track error:", err.message || err);
    res.status(500).json({ error: "Failed to add track to playlist" });
  }
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Recommendations server listening on port ${PORT}`);
});
