import React from "react";

// Reusable small badge used across News and EventDetails.
// Props:
// - status: free-form string (we match case-insensitively: 'trending', 'gaining_hype', 'Gaining Hype', etc.)
// - views: optional number to show next to the badge
// - inline: if true, renders compact inline layout (default true)
export default function HypeBadge({ status, views, details = null, inline = true }) {
  // If neither a status nor views are provided, render nothing.
  if ((status == null || status === "") && typeof views !== "number" && !details) return null;

  // normalize status for tolerant matching
  const norm = (status || "").toString().trim().toLowerCase().replace(/[_\-]+/g, " ");

  const base = {
    marginLeft: 10,
    padding: "4px 8px",
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
    display: "inline-block",
  };

  // Decide which label to render by tolerant matching
  let badgeEl = null;
  if (norm.includes("trend")) {
    badgeEl = (
      <span
        aria-label="Trending"
        style={{
          ...base,
          background: "#ffe6f0",
          color: "#c2185b",
          border: "1px solid #ffb3d0",
          letterSpacing: 0.4,
        }}
      >
        Trending
      </span>
    );
  } else if (norm.includes("gain") || norm.includes("hype")) {
    badgeEl = (
      <span
        aria-label="Gaining hype"
        style={{
          ...base,
          background: "#fff4e5",
          color: "#b36b00",
          border: "1px solid #ffdca8",
          letterSpacing: 0.4,
        }}
      >
        Gaining Hype
      </span>
    );
  } else {
    // neutral fallback
    badgeEl = (
      <span
        aria-label="No hype"
        style={{
          ...base,
          background: "#f0f2f5",
          color: "#333",
          border: "1px solid #e6e9ee",
          letterSpacing: 0.4,
          opacity: 0.95,
        }}
      >
        Not Rated Yet
      </span>
    );
  }

  const viewsEl = typeof views === "number" ? (
    <span style={{ marginLeft: 8, fontSize: 13, color: '#444', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span role="img" aria-label="views">👀</span>
      <span>{views}</span>
    </span>
  ) : null;

  // Build a small title/tooltip from details if available
  let title = undefined;
  if (details && typeof details === 'object') {
    const s = typeof details.score === 'number' ? details.score.toFixed(2) : '';
    const vph = typeof details.viewsPerHour === 'number' ? details.viewsPerHour.toFixed(2) : '';
    const uph = typeof details.upvotesPerHour === 'number' ? details.upvotesPerHour.toFixed(2) : '';
    title = `Hype score: ${s}${vph || uph ? ` — v/h: ${vph} up/h: ${uph}` : ''}`;
  }

  if (inline) {
    return (
      <span title={title} data-hype-score={details?.score ?? ''} style={{ display: 'inline-flex', alignItems: 'center' }}>
        {badgeEl}
        {viewsEl}
      </span>
    );
  }

  return (
    <div title={title} data-hype-score={details?.score ?? ''} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {badgeEl}
      {viewsEl}
    </div>
  );
}
