import React from "react";

// Reusable small badge used across News and EventDetails.
// Props:
// - status: "TRENDING" | "GAINING_HYPE" | "NONE"
// - views: optional number to show next to the badge
// - inline: if true, renders compact inline layout (default true)
export default function HypeBadge({ status, views, inline = true }) {
  // If neither a status nor views are provided, render nothing.
  if (status == null && typeof views !== "number") return null;
  const base = {
    marginLeft: 10,
    padding: "4px 8px",
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
    display: "inline-block",
  };

  const badge = (() => {
    // Explicitly render NONE when status === 'NONE'
    if (status === "Gaining Hype") {
      return (
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
    }
    if (status === "Trending") {
      return (
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
    }
    // For NONE or any other falsy/unknown status, show a neutral chip
    return (
      <span
        aria-label="No hype"
        style={{
          ...base,
          background: "#f0f2f5",
          color: "#333",
          border: "1px solid #e6e9ee",
          letterSpacing: 0.4,
          opacity: 0.9,
        }}
      >
        Not Rated Yet
      </span>
    );
  })();

    // Views element (always small and next to the badge)
  const viewsEl = typeof views === "number" ? (
    <span style={{ marginLeft: 8, fontSize: 13, color: '#444', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span role="img" aria-label="views">👀</span>
      <span>{views}</span>
    </span>
  ) : null;

  if (inline) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          {badge}
          {viewsEl}
        </span>
      );
  }

  // block layout fallback
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {badge}
      {viewsEl}
    </div>
  );
}
