import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  collection,
  deleteDoc,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  increment,
} from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../firebase/config.jsx";
import { getAuth } from "firebase/auth";
import defaultProfile from "./img/default-profile.svg";
import HypeBadge from "./HypeBadge.jsx";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth();

function capitalizeWords(str) {
  return str
    ? str
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
    : "";
}

const CATEGORY_COLORS = {
  Music: "#c21e56",
  "Art & Culture": "#8a2be2",
  Education: "#1e3a8a",
  "Community & Volunteering": "#40e0d0",
  Sport: "#ff9322",
  "Food & Drink": "#ffd707",
  "Party & Fun": "#ff1493",
  Shopping: "#9c27b0",
  Nature: "#228b22",
  Business: "#a1887f",
  "Family & Animals": "#4f9d9d",
  Other: "#ffdab9",
};

function EventDetails() {
  const { id } = useParams();
  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasUpvoted, setHasUpvoted] = useState(false);
  const [currentImg, setCurrentImg] = useState(0);

  // Comments
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);

  // Spotify event playlist (read-only)
  const [currentTrack, setCurrentTrack] = useState(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [playlistTracks, setPlaylistTracks] = useState([]);
  const [playlistLoading, setPlaylistLoading] = useState(false);

  // Song suggestions
  const [activeTab, setActiveTab] = useState("comments"); // "comments" | "songs"
  const [suggestionUrl, setSuggestionUrl] = useState("");
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [songSuggestions, setSongSuggestions] = useState([]);

  const user = getAuth().currentUser;
  const isAdmin = user && user.email === "admin@admin.com";

  const incrementedRef = useRef(false);

  useEffect(() => {
    const fetchIssue = async () => {
      const docRef = doc(db, "issues", id);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) return;
      const data = docSnap.data();
      setIssue({ id: docSnap.id, ...data });

      if (user && data.upvotedBy && data.upvotedBy.includes(user.uid)) {
        setHasUpvoted(true);
      } else {
        setHasUpvoted(false);
      }

      setCurrentImg(0);

      // views + guard
      try {
        const currentUser = auth.currentUser || user;
        const shouldCount = !currentUser || currentUser.uid !== data.uid;

        const TTL_MS = 3000;
        const viewerId = currentUser ? currentUser.uid : "anon";
        const viewedKey = `viewed_event_${id}_${viewerId}_last`;
        let alreadyViewed = false;
        try {
          const last = parseInt(sessionStorage.getItem(viewedKey) || "0", 10) || 0;
          const now = Date.now();
          if (now - last < TTL_MS) alreadyViewed = true;
        } catch (e) {
          alreadyViewed = false;
        }

        if (shouldCount && !incrementedRef.current && !alreadyViewed) {
          const now = Date.now();
          try {
            sessionStorage.setItem(viewedKey, String(now));
          } catch (e) {}
          incrementedRef.current = true;

          try {
            await updateDoc(docRef, { views: increment(1) });
            setIssue((prev) => ({
              ...(prev || {}),
              views: (prev?.views ?? data.views ?? 0) + 1,
            }));
          } catch (err) {
            try {
              sessionStorage.removeItem(viewedKey);
            } catch (e) {}
            incrementedRef.current = false;
            console.warn("Could not increment views (reverted guard):", err);
          }
        }
      } catch (err) {
        console.warn("Could not increment views:", err);
      }
    };
    fetchIssue();
    // eslint-disable-next-line
  }, [id, user]);

  // Comentarii realtime
  useEffect(() => {
    if (!id) return;
    const q = query(
      collection(db, "issues", id, "comments"),
      orderBy("created", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setComments(
        snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
      );
    });
    return () => unsub();
  }, [id]);

  // Song suggestions realtime
  useEffect(() => {
    if (!id) return;
    const q = query(
      collection(db, "issues", id, "songSuggestions"),
      orderBy("created", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setSongSuggestions(
        snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
      );
    });
    return () => unsub();
  }, [id]);

  // Spotify data pentru event (read-only)
  useEffect(() => {
    const fetchSpotifyData = async () => {
      if (!issue || !issue.spotifyPlaylistUrl) return;
      setTrackLoading(true);
      setPlaylistLoading(true);
      try {
        // current track
        const trackResponse = await fetch(
          `http://localhost:4123/api/spotify/current-track/${id}`
        );
        if (trackResponse.ok) {
          const trackData = await trackResponse.json();
          setCurrentTrack(trackData.currentTrack);
        }

        // playlist tracks
        const playlistResponse = await fetch(
          `http://localhost:4123/api/spotify/playlist/${id}`
        );
        if (playlistResponse.ok) {
          const playlistData = await playlistResponse.json();
          setPlaylistTracks(playlistData.tracks || []);
        }
      } catch (err) {
        console.error("Failed to fetch Spotify data:", err);
      } finally {
        setTrackLoading(false);
        setPlaylistLoading(false);
      }
    };
    fetchSpotifyData();
  }, [id, issue]);

  const handleUpvote = async () => {
    if (!user) return alert("You must be logged in to like!");
    setLoading(true);
    const issueRef = doc(db, "issues", id);
    if (!hasUpvoted) {
      await updateDoc(issueRef, {
        upvotes: (issue.upvotes || 0) + 1,
        upvotedBy: arrayUnion(user.uid),
      });
      setIssue((prev) => ({
        ...prev,
        upvotes: (prev.upvotes || 0) + 1,
        upvotedBy: [...(prev.upvotedBy || []), user.uid],
      }));
      setHasUpvoted(true);
    } else {
      await updateDoc(issueRef, {
        upvotes: (issue.upvotes || 1) - 1,
        upvotedBy: arrayRemove(user.uid),
      });
      setIssue((prev) => ({
        ...prev,
        upvotes: (prev.upvotes || 1) - 1,
        upvotedBy: (prev.upvotedBy || []).filter((uid) => uid !== user.uid),
      }));
      setHasUpvoted(false);
    }
    setLoading(false);

    // notificare upvote
    try {
      let actorUsername = user.displayName || user.email;
      let actorProfilePicUrl = user.photoURL || defaultProfile;
      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          if (data.username) actorUsername = data.username;
          if (data.profilePicUrl) actorProfilePicUrl = data.profilePicUrl;
        }
      } catch {}

      if (issue.uid && issue.uid !== user.uid) {
        await addDoc(collection(db, "notifications"), {
          type: "upvote",
          targetUid: issue.uid,
          actorUid: user.uid,
          actorUsername: actorUsername,
          actorProfilePicUrl: actorProfilePicUrl,
          issueId: issue.id,
          created: serverTimestamp(),
          read: false,
        });
      }
    } catch (err) {
      console.error("Eroare la trimiterea notificării:", err);
    }
  };

  const allImages = issue && issue.images ? issue.images.filter(Boolean) : [];

  const handlePrev = () => {
    if (!allImages.length) return;
    setCurrentImg((prev) => (prev === 0 ? allImages.length - 1 : prev - 1));
  };

  const handleNext = () => {
    if (!allImages.length) return;
    setCurrentImg((prev) =>
      prev === allImages.length - 1 ? 0 : prev + 1
    );
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this event?")) return;
    await deleteDoc(doc(db, "issues", id));
    window.location.href = "/news";
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!user) return alert("You must be logged in to comment!");
    if (!commentText.trim()) return;
    setCommentLoading(true);

    let username = user.displayName || user.email;
    let profilePicUrl = user.photoURL || defaultProfile;
    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        if (data.username) username = data.username;
        if (data.profilePicUrl) profilePicUrl = data.profilePicUrl;
      }
    } catch {}

    await addDoc(collection(db, "issues", id, "comments"), {
      text: commentText,
      created: serverTimestamp(),
      uid: user.uid,
      displayName: username,
      profilePicUrl: profilePicUrl,
    });
    setCommentText("");
    setCommentLoading(false);

    try {
      const actorUsername = user.displayName || user.email;
      const actorProfilePicUrl = user.photoURL || defaultProfile;

      await addDoc(collection(db, "notifications"), {
        type: "comment",
        targetUid: issue.uid,
        actorUid: user.uid,
        actorUsername: actorUsername,
        actorProfilePicUrl: actorProfilePicUrl,
        commentText: commentText,
        issueId: issue.id,
        created: serverTimestamp(),
        read: false,
      });
    } catch (err) {
      console.error("Eroare la trimiterea notificării:", err);
    }
  };

  const handleAddSuggestion = async (e) => {
    e.preventDefault();
    if (!user) return alert("You must be logged in to suggest songs!");
    const url = suggestionUrl.trim();
    if (!url) return;
    if (!url.includes("spotify.com/track") && !url.startsWith("spotify:track")) {
      return alert("Please paste a valid Spotify track URL.");
    }

    setSuggestionLoading(true);

    let username = user.displayName || user.email;
    let profilePicUrl = user.photoURL || defaultProfile;
    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        if (data.username) username = data.username;
        if (data.profilePicUrl) profilePicUrl = data.profilePicUrl;
      }
    } catch {}

    try {
      await addDoc(collection(db, "issues", id, "songSuggestions"), {
        trackUrl: url,
        created: serverTimestamp(),
        uid: user.uid,
        displayName: username,
        profilePicUrl: profilePicUrl,
      });
      setSuggestionUrl("");
    } catch (err) {
      console.error("Error adding song suggestion:", err);
      alert("Could not save suggestion.");
    } finally {
      setSuggestionLoading(false);
    }
  };

  if (!issue) return <div style={{ padding: 40 }}>Se încarcă...</div>;

  // hype score
  function computeHypeScore(issue) {
    const views = issue.views || 0;
    const upvotes = issue.upvotes || 0;

    let createdMs = 0;
    try {
      if (issue.created && typeof issue.created.toDate === "function") {
        createdMs = issue.created.toDate().getTime();
      } else {
        createdMs = new Date(issue.created).getTime();
      }
    } catch (e) {
      createdMs = 0;
    }
    const ageHours = Math.max(
      1,
      (Date.now() - (createdMs || Date.now())) / (1000 * 60 * 60)
    );

    const viewsPerHour = views / ageHours;
    const upvotesPerHour = upvotes / ageHours;

    const logViews = Math.log1p(views);
    const logUpvotes = Math.log1p(upvotes);

    const W_VPH = 0.6;
    const W_UPH = 1.2;
    const W_LOGV = 0.3;
    const W_LOGU = 0.5;
    const DECAY_AGE = 0.05;

    const score =
      W_VPH * viewsPerHour +
      W_UPH * upvotesPerHour +
      W_LOGV * logViews +
      W_LOGU * logUpvotes -
      DECAY_AGE * Math.sqrt(ageHours);
    return { score, viewsPerHour, upvotesPerHour, ageHours };
  }

  const calculateHypeStatus = () => {
    const { score } = computeHypeScore(issue);
    if (score >= 5) return "Trending";
    if (score >= 2) return "Gaining Hype";
    return "Not Rated Yet";
  };

  const hypeDetails = computeHypeScore(issue);
  const computedStatus =
    hypeDetails?.score != null
      ? hypeDetails.score >= 55
        ? "Trending"
        : hypeDetails.score >= 2
        ? "Gaining Hype"
        : "Not Rated Yet"
      : null;
  const hypeStatus = computedStatus || issue.hypeStatus || calculateHypeStatus();

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 0" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <img
          src={issue.profilePicUrl || defaultProfile}
          alt="avatar"
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            objectFit: "cover",
            border: "2px solid #eee",
            background: "#eee",
          }}
        />
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, color: "#222" }}>
            {issue.displayName || "Utilizator"}
          </div>
          <div style={{ color: "#888", fontSize: 13 }}>
            {issue.created
              ? new Date(issue.created).toLocaleDateString("ro-RO", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : ""}
          </div>
        </div>
      </div>

      {/* Galerie */}
      {allImages.length > 0 && (
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 220,
            marginBottom: 24,
          }}
        >
          <img
            src={allImages[currentImg]}
            alt={`cover-${currentImg}`}
            style={{
              width: "100%",
              height: 220,
              objectFit: "cover",
              borderRadius: 12,
              display: "block",
            }}
          />
          {allImages.length > 1 && (
            <>
              <button
                onClick={handlePrev}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: 10,
                  transform: "translateY(-50%)",
                  background: "rgba(255,255,255,0.7)",
                  border: "none",
                  borderRadius: "50%",
                  width: 36,
                  height: 36,
                  fontSize: 22,
                  cursor: "pointer",
                  zIndex: 2,
                }}
                aria-label="Imagine anterioară"
              >
                &#8592;
              </button>
              <button
                onClick={handleNext}
                style={{
                  position: "absolute",
                  top: "50%",
                  right: 10,
                  transform: "translateY(-50%)",
                  background: "rgba(255,255,255,0.7)",
                  border: "none",
                  borderRadius: "50%",
                  width: 36,
                  height: 36,
                  fontSize: 22,
                  cursor: "pointer",
                  zIndex: 2,
                }}
                aria-label="Imagine următoare"
              >
                &#8594;
              </button>
            </>
          )}
          {allImages.length > 1 && (
            <div
              style={{
                position: "absolute",
                bottom: 10,
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                gap: 6,
              }}
            >
              {allImages.map((_, idx) => (
                <span
                  key={idx}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: idx === currentImg ? "#1976d2" : "#ccc",
                    display: "inline-block",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* categorie + hype */}
      <div
        style={{
          color: "#fff",
          background: CATEGORY_COLORS[issue.category] || "#1976d2",
          fontWeight: 600,
          fontSize: 15,
          marginBottom: 8,
          display: "inline-block",
          borderRadius: 16,
          padding: "4px 14px",
          minWidth: 60,
          textAlign: "center",
          boxShadow: "0 1px 4px #0001",
          border: "none",
          letterSpacing: 0.5,
        }}
      >
        {issue.category || "Other"}
      </div>
      <HypeBadge status={hypeStatus} views={issue.views || 0} details={hypeDetails} />

      {/* titlu */}
      <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 8 }}>
        {issue.title}
      </div>

      {/* adresă */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          marginBottom: 12,
        }}
      >
        <span style={{ color: "#1976d2", fontSize: 15 }}>
          <span role="img" aria-label="locatie">
            📍
          </span>{" "}
          {capitalizeWords(issue.address)}
        </span>
      </div>

      {/* interval dată & oră */}
      {issue.dateStart &&
        issue.dateEnd &&
        issue.hourStart &&
        issue.hourEnd && (
          <div
            style={{
              margin: "10px 0 0 0",
              fontSize: 16,
              fontWeight: 500,
              color: "#1976d2",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <span>
              <b>Start date:</b>{" "}
              {new Date(issue.dateStart).toLocaleDateString("ro-RO", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}{" "}
              {issue.hourStart}
            </span>
            <span>
              <b>End date:</b>{" "}
              {new Date(issue.dateEnd).toLocaleDateString("ro-RO", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}{" "}
              {issue.hourEnd}
            </span>
          </div>
        )}

      <hr />

      {/* descriere */}
      <div style={{ margin: "18px 0" }}>
        <b>Description</b>
        <div style={{ color: "#444", marginTop: 6 }}>{issue.desc}</div>
      </div>

      <hr />

      {/* Spotify Playlist (read-only) */}
      {issue.spotifyPlaylistUrl && (
        <div style={{ margin: "18px 0" }}>
          <b>Spotify Playlist</b>
          <div style={{ marginTop: 6 }}>
            {(() => {
              const playlistIdMatch =
                issue.spotifyPlaylistUrl.match(/playlist\/([a-zA-Z0-9]+)/);
              const playlistId = playlistIdMatch ? playlistIdMatch[1] : null;
              return playlistId ? (
                <iframe
                  src={`https://open.spotify.com/embed/playlist/${playlistId}`}
                  width="100%"
                  height="380"
                  frameBorder="0"
                  allowTransparency="true"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                  style={{ borderRadius: 12 }}
                ></iframe>
              ) : (
                <a
                  href={issue.spotifyPlaylistUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "#1db954",
                    textDecoration: "none",
                    fontWeight: 500,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span role="img" aria-label="spotify">
                    🎵
                  </span>{" "}
                  Open in Spotify
                </a>
              );
            })()}
          </div>

          {/* Now playing */}
          {trackLoading ? (
            <div style={{ marginTop: 6, fontSize: 14, color: "#888" }}>
              Loading current track...
            </div>
          ) : currentTrack ? (
            <div style={{ marginTop: 6, fontSize: 14, color: "#444" }}>
              <b>Now Playing:</b> {currentTrack.name} by{" "}
              {currentTrack.artists?.map((a) => a.name).join(", ")}
            </div>
          ) : null}

        </div>
      )}

      {/* Upvote + tabs Comments / Song suggestions */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginTop: 24,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          style={{
            background: hasUpvoted ? "#1976d2" : "#f5f5f5",
            color: hasUpvoted ? "#fff" : "#222",
            border: "none",
            borderRadius: 20,
            padding: "10px 24px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
          onClick={handleUpvote}
          disabled={loading}
        >
          <span role="img" aria-label="upvote">
            ❤️
          </span>{" "}
          Like ({issue.upvotes || 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("comments")}
          style={{
            background: activeTab === "comments" ? "#1976d2" : "#f5f5f5",
            color: activeTab === "comments" ? "#fff" : "#222",
            border: "none",
            borderRadius: 20,
            padding: "8px 18px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
          }}
        >
          <span role="img" aria-label="comentarii">
            💬
          </span>{" "}
          Comments
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("songs")}
          style={{
            background: activeTab === "songs" ? "#1db954" : "#f5f5f5",
            color: activeTab === "songs" ? "#fff" : "#222",
            border: "none",
            borderRadius: 20,
            padding: "8px 18px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
          }}
        >
          <span role="img" aria-label="songs">
            🎵
          </span>{" "}
          Song suggestions
        </button>
      </div>

      {/* TAB: COMMENTS */}
      {activeTab === "comments" && (
        <>
          {/* form comentarii */}
          <form
            onSubmit={handleAddComment}
            style={{ marginTop: 18, display: "flex", gap: 8 }}
          >
            <input
              type="text"
              placeholder="Add a comment..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 20,
                border: "1px solid #ccc",
                fontSize: 15,
              }}
              disabled={commentLoading}
            />
            <button
              type="submit"
              style={{
                background: "#1976d2",
                color: "#fff",
                border: "none",
                borderRadius: 20,
                padding: "8px 18px",
                fontWeight: 600,
                cursor: commentLoading ? "not-allowed" : "pointer",
                opacity: commentLoading ? 0.7 : 1,
              }}
              disabled={commentLoading}
            >
              Post
            </button>
          </form>

          {/* lista comentarii */}
          <div style={{ marginTop: 24 }}>
            {comments.map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  marginBottom: 18,
                  borderBottom: "1px solid #eee",
                  paddingBottom: 12,
                }}
              >
                <img
                  src={c.profilePicUrl || defaultProfile}
                  alt="avatar"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "1px solid #eee",
                    background: "#eee",
                    marginTop: 2,
                  }}
                />
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 18,
                      color: "#222",
                    }}
                  >
                    {c.displayName || "Utilizator"}
                  </div>
                  <div
                    style={{
                      color: "#444",
                      fontSize: 15,
                      margin: "2px 0 0 0",
                    }}
                  >
                    {c.text}
                  </div>
                  <div
                    style={{
                      color: "#888",
                      fontSize: 13,
                      marginTop: 2,
                    }}
                  >
                    {c.created?.toDate
                      ? timeAgoOrDate(c.created.toDate())
                      : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* TAB: SONG SUGGESTIONS */}
      {activeTab === "songs" && (
        <>
          {/* input suggest song */}
          <form
            onSubmit={handleAddSuggestion}
            style={{ marginTop: 18, display: "flex", gap: 8, flexWrap: "wrap" }}
          >
            <input
              type="text"
              placeholder="Paste a Spotify track URL to suggest a song"
              value={suggestionUrl}
              onChange={(e) => setSuggestionUrl(e.target.value)}
              style={{
                flex: 1,
                minWidth: "220px",
                padding: "8px 12px",
                borderRadius: 20,
                border: "1px solid #ccc",
                fontSize: 15,
              }}
              disabled={suggestionLoading}
            />
            <button
              type="submit"
              style={{
                background: "#1db954",
                color: "#fff",
                border: "none",
                borderRadius: 20,
                padding: "8px 18px",
                fontWeight: 600,
                cursor: suggestionLoading ? "not-allowed" : "pointer",
                opacity: suggestionLoading ? 0.7 : 1,
              }}
              disabled={suggestionLoading}
            >
              Suggest
            </button>
          </form>

          {/* lista song suggestions */}
          <div style={{ marginTop: 24 }}>
            {songSuggestions.length === 0 && (
              <div style={{ color: "#777", fontSize: 14 }}>
                No song suggestions yet. Be the first to drop a track for this event 🎧
              </div>
            )}

            {songSuggestions.map((sugg) => {
              const trackId = extractSpotifyTrackIdFromUrl(sugg.trackUrl);
              return (
                <div
                  key={sugg.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    marginBottom: 18,
                    borderBottom: "1px solid #eee",
                    paddingBottom: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <img
                      src={sugg.profilePicUrl || defaultProfile}
                      alt="avatar"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        objectFit: "cover",
                        border: "1px solid #eee",
                        background: "#eee",
                      }}
                    />
                    <div>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 15,
                          color: "#222",
                        }}
                      >
                        {sugg.displayName || "Utilizator"}
                      </div>
                      <div
                        style={{
                          color: "#888",
                          fontSize: 12,
                          marginTop: 2,
                        }}
                      >
                        {sugg.created?.toDate
                          ? timeAgoOrDate(sugg.created.toDate())
                          : ""}
                      </div>
                    </div>
                  </div>

                  {trackId ? (
                    <iframe
                      src={`https://open.spotify.com/embed/track/${trackId}`}
                      width="100%"
                      height="80"
                      frameBorder="0"
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      loading="lazy"
                      style={{ borderRadius: 12 }}
                    ></iframe>
                  ) : (
                    <a
                      href={sugg.trackUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "#1db954",
                        fontSize: 14,
                        wordBreak: "break-all",
                      }}
                    >
                      Open suggested track in Spotify
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function timeAgoOrDate(date) {
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  const days = Math.floor(seconds / (60 * 60 * 24));
  if (days >= 7) {
    return date.toLocaleDateString("ro-RO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${days} d ago`;
}

// helper pt frontend
function extractSpotifyTrackIdFromUrl(url) {
  if (!url) return null;
  const m = url.match(/track\/([a-zA-Z0-9]+)(\?|$|\/)/);
  if (m && m[1]) return m[1];

  const m2 = url.match(/spotify:track:([a-zA-Z0-9]+)/);
  if (m2 && m2[1]) return m2[1];

  return null;
}

export default EventDetails;
