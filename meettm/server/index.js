import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "128kb" }));

const PORT = process.env.PORT || 4123;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_OAUTH_BEARER = process.env.GOOGLE_OAUTH_BEARER;
const MAX_RECOMMENDATIONS = parseInt(process.env.MAX_RECOMMENDATIONS || "8", 10);

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

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Recommendations server listening on port ${PORT}`);
});
