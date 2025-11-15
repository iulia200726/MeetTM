import React, { useMemo, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4124";

const DEFAULT_FORM = {
  nrPersoane: "3",
  buget: "mic",
  mood: "chill",
  zona: "centru",
};

// 🔹 Fallback local: generează un plan simplu dacă API-ul pică
function buildFallbackPlan({ nrPersoane, buget, mood, zona }) {
  const nr = nrPersoane || "friends";
  let budgetText;
  if (buget === "mic") budgetText = "low budget";
  else if (buget === "mediu") budgetText = "medium budget";
  else if (buget === "mare") budgetText = "higher budget";
  else budgetText = "flexible budget";

  let moodText;
  switch (mood) {
    case "party":
      moodText = "party / clubbing vibe";
      break;
    case "cultural":
      moodText = "cultural vibe";
      break;
    case "live-music":
      moodText = "live music vibe";
      break;
    case "chill":
    default:
      moodText = "chill vibe";
      break;
  }

  const zonaText = zona && zona.trim().length > 0 ? zona : "central area";

  return {
    events: [
      {
        time: "19:00",
        title: "Warm-up & meeting point",
        location: `Cafenea cozy în zona ${zonaText}`,
        reason: `Întâlniți-vă toți ${nr} și aliniați-vă mood-ul pentru seară, într-un loc cu ${moodText} și ${budgetText}.`,
      },
      {
        time: "21:00",
        title:
          mood === "party"
            ? "Main party / club"
            : mood === "cultural"
            ? "Cultural event / expo"
            : mood === "live-music"
            ? "Live music bar"
            : "Main event of the night",
        location: `Loc recomandat în ${zonaText}, cu atmosferă potrivită pentru ${moodText}`,
        reason: `Segmentul principal al serii, unde stați cel puțin 2–3 ore, adaptat bugetului (${budgetText}) și mood-ului.`,
      },
      {
        time: "00:00",
        title: "Late snack & cool-down",
        location: `Loc cu mâncare deschis târziu în ${zonaText}`,
        reason:
          "Încheiați seara cu ceva de mâncare și un moment mai liniștit, ca să povestiți și să vă refaceți energia.",
      },
    ],
    _fallback: true,
  };
}

function AIConcierge() {
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const shareText = useMemo(() => {
    if (!plan?.events?.length) return "";
    const header = `Plan pentru ${formData.nrPersoane} persoane (${formData.mood}, buget ${formData.buget}, zona ${formData.zona})`;
    const events = plan.events
      .map(
        (event, idx) =>
          `${idx + 1}. ${event.time} - ${event.title} (${event.location})`
      )
      .join("\n");
    return `${header}\n${events}`;
  }, [plan, formData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setCopied(false);
    setPlan(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/plan-night`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      let data = null;
      try {
        data = await response.json();
      } catch (jsonErr) {
        console.warn("Nu am putut parsa JSON-ul de la server:", jsonErr);
      }

      if (!response.ok) {
        // În loc să aruncăm eroarea -> facem fallback local
        console.warn("AIConcierge backend error:", data);
        const fallback = buildFallbackPlan(formData);
        setPlan(fallback);
        setError("Nu am putut folosi Gemini, am generat un plan local.");
        return;
      }

      // Avem răspuns OK de la backend – încercăm să extragem events
      const events =
        (data && Array.isArray(data.events) && data.events) ||
        (data &&
          data.plan &&
          Array.isArray(data.plan.events) &&
          data.plan.events);

      if (!events || !Array.isArray(events) || events.length === 0) {
        // Dacă structura nu e cum ne așteptăm, tot nu blocăm – fallback
        console.warn("Răspuns invalid de la AI, folosesc fallback local:", data);
        const fallback = buildFallbackPlan(formData);
        setPlan(fallback);
        setError("Răspunsul AI nu a putut fi interpretat, am folosit un plan local.");
        return;
      }

      setPlan({ events });
    } catch (err) {
      console.error("Eroare fetch / rețea:", err);
      // Orice problemă -> fallback
      const fallback = buildFallbackPlan(formData);
      setPlan(fallback);
      setError("Serverul AI nu răspunde, dar ți-am generat un plan local.");
    } finally {
      setLoading(false);
    }
  };

  const handleShare = () => {
    if (!shareText) return;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(whatsappUrl, "_blank", "noopener");
  };

  const handleCopy = async () => {
    if (!shareText) return;
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error("copy failed", err);
      setCopied(false);
    }
  };

  const badgeStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 12px",
    borderRadius: "999px",
    background: "#e8f0fe",
    color: "#1a73e8",
    fontSize: "13px",
    fontWeight: 600,
  };

  return (
    <div
      style={{
        padding: "32px",
        maxWidth: "960px",
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <header style={{ marginBottom: "18px" }}>
        <div style={badgeStyle}>
          <span role="img" aria-label="sparkles">
            ✨
          </span>
          Gemini Concierge
        </div>
        <h1 style={{ margin: "12px 0 6px", fontSize: "32px" }}>
          AI Concierge - Plan my night
        </h1>
        <p
          style={{
            margin: 0,
            color: "#555",
            maxWidth: "760px",
            lineHeight: 1.5,
          }}
        >
          Scrie pe scurt cate persoane sunteti, bugetul si mood-ul, iar Gemini (sau
          fallback-ul nostru local) iti intoarce un traseu: warm-up, eveniment(e)
          principale si after, gata de trimis prietenilor.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        style={{
          marginBottom: "30px",
          padding: "20px",
          borderRadius: "12px",
          border: "1px solid #e0e0e0",
          boxShadow: "0 8px 20px rgba(0,0,0,0.04)",
          background: "#fafafa",
        }}
      >
        <div
          style={{
            display: "grid",
            gap: "16px",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          <div>
            <label style={{ fontWeight: 600 }}>Nr persoane</label>
            <input
              type="number"
              name="nrPersoane"
              value={formData.nrPersoane}
              onChange={handleChange}
              required
              min={1}
              style={{
                width: "100%",
                padding: "10px",
                marginTop: "6px",
                borderRadius: "8px",
                border: "1px solid #ccc",
                outline: "none",
              }}
            />
          </div>

          <div>
            <label style={{ fontWeight: 600 }}>Buget (per persoana)</label>
            <select
              name="buget"
              value={formData.buget}
              onChange={handleChange}
              required
              style={{
                width: "100%",
                padding: "10px",
                marginTop: "6px",
                borderRadius: "8px",
                border: "1px solid #ccc",
                outline: "none",
              }}
            >
              <option value="">Selecteaza buget</option>
              <option value="mic">Mic (sub 50 RON/persoana)</option>
              <option value="mediu">Mediu (50 - 150 RON/persoana)</option>
              <option value="mare">Mare (150+ RON/persoana)</option>
            </select>
          </div>

          <div>
            <label style={{ fontWeight: 600 }}>Mood</label>
            <select
              name="mood"
              value={formData.mood}
              onChange={handleChange}
              required
              style={{
                width: "100%",
                padding: "10px",
                marginTop: "6px",
                borderRadius: "8px",
                border: "1px solid #ccc",
                outline: "none",
              }}
            >
              <option value="">Alege mood</option>
              <option value="chill">Chill</option>
              <option value="party">Party / clubbing</option>
              <option value="cultural">Cultural</option>
              <option value="live-music">Live music</option>
            </select>
          </div>

          <div>
            <label style={{ fontWeight: 600 }}>Zona preferata</label>
            <input
              type="text"
              name="zona"
              value={formData.zona}
              onChange={handleChange}
              required
              placeholder="ex: Centru, Iosefin, Unirii, Oricare"
              style={{
                width: "100%",
                padding: "10px",
                marginTop: "6px",
                borderRadius: "8px",
                border: "1px solid #ccc",
                outline: "none",
              }}
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "12px",
            marginTop: "18px",
            flexWrap: "wrap",
          }}
        >
          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? "#9e9e9e" : "#1976d2",
              color: "#fff",
              border: "none",
              padding: "12px 24px",
              borderRadius: "999px",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "16px",
              fontWeight: 700,
            }}
          >
            {loading ? "Planific in derulare..." : "Plan my night"}
          </button>
          <div
            style={{ color: "#666", fontSize: "13px", lineHeight: "36px" }}
          >
            Exemplu: "Suntem 3, vrem ceva chill, muzica live, aproape de
            centru."
          </div>
        </div>
      </form>

      {error && (
        <div
          style={{
            color: "#d32f2f",
            marginBottom: "20px",
            padding: "12px 14px",
            borderRadius: "8px",
            background: "#ffebee",
            border: "1px solid #ffcdd2",
          }}
        >
          {error}
        </div>
      )}

      {plan && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "14px",
            }}
          >
            <h2 style={{ margin: 0 }}>Traseu recomandat</h2>
            <span style={badgeStyle}>
              {plan._fallback ? "Fallback local" : "Generat de Gemini"}
            </span>
          </div>

          <div
            style={{
              border: "1px solid #e0e0e0",
              padding: "20px",
              borderRadius: "12px",
              background: "#fff",
              boxShadow: "0 10px 24px rgba(0,0,0,0.04)",
            }}
          >
            {plan.events.map((event, index) => (
              <div
                key={`${event.title}-${index}`}
                style={{
                  marginBottom:
                    index === plan.events.length - 1 ? 0 : "18px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "14px",
                }}
              >
                <div
                  style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "50%",
                    background: "#1976d2",
                    color: "#fff",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {index + 1}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "16px" }}>
                    {event.time} - {event.title}
                  </div>
                  <div style={{ fontSize: "14px", color: "#555" }}>
                    {event.location}
                  </div>
                  <div
                    style={{
                      fontSize: "13px",
                      color: "#777",
                      marginTop: "4px",
                    }}
                  >
                    {event.reason}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              gap: "12px",
              marginTop: "16px",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={handleShare}
              style={{
                background: "#25d366",
                color: "#fff",
                border: "none",
                padding: "12px 20px",
                borderRadius: "10px",
                cursor: "pointer",
                fontSize: "15px",
                fontWeight: 700,
              }}
            >
              Trimite pe WhatsApp
            </button>
            <button
              onClick={handleCopy}
              style={{
                background: "#eef2ff",
                color: "#1a237e",
                border: "1px solid #c5cae9",
                padding: "12px 18px",
                borderRadius: "10px",
                cursor: "pointer",
                fontSize: "15px",
                fontWeight: 600,
              }}
            >
              {copied ? "Copiat!" : "Copiaza planul"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AIConcierge;
