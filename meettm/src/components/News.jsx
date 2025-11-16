import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  getFirestore,
  collection,
  onSnapshot,
  updateDoc,
  arrayUnion,
  arrayRemove,
  doc,
  deleteDoc,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../firebase/config.jsx";
import { useNavigate } from "react-router-dom";
import { getAuth } from "firebase/auth";
import defaultProfile from "./img/default-profile.svg";
import HypeBadge from "./HypeBadge.jsx";
import AppNavigation from "./appnavigation.jsx";
import "./News.css";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const categories = [
  "Music",
  "Art & Culture",
  "Education",
  "Community & Volunteering",
  "Sport",
  "Food & Drink",
  "Party & Fun",
  "Shopping",
  "Nature",
  "Business",
  "Family & Animals",
  "Other",
];

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

const AI_CATEGORY_KEY = "__AI_FOR_YOU__";

function IssueCard({ issue }) {
  const navigate = useNavigate();
  const user = getAuth().currentUser;
  const isAdmin = user && user.email === "admin@admin.com";
  const isOwner = user && issue.uid === user.uid;

  const totalUpvotes = issue.upvotes || 0;
  const allImages = (issue.images || []).filter(Boolean);

  const [hasUpvoted, setHasUpvoted] = useState(
    user && issue.upvotedBy && issue.upvotedBy.includes(user.uid)
  );
  const [loading, setLoading] = useState(false);

  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);

  useEffect(() => {
    setHasUpvoted(user && issue.upvotedBy && issue.upvotedBy.includes(user.uid));
  }, [user, issue.upvotedBy]);

  const handleUpvote = async (e) => {
    e.stopPropagation();
    if (!user) {
      alert("Trebuie sa fii logat pentru a da upvote!");
      return;
    }
    setLoading(true);
    const issueRef = doc(db, "issues", issue.id);

    if (!hasUpvoted) {
      await updateDoc(issueRef, {
        upvotes: (issue.upvotes || 0) + 1,
        upvotedBy: arrayUnion(user.uid),
      });
      setHasUpvoted(true);

      try {
        if (issue.uid && issue.uid !== user.uid) {
          let actorUsername = user.displayName || user.email;
          let actorProfilePicUrl = user.photoURL || defaultProfile;
          try {
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              const data = userSnap.data();
              actorUsername = data.username || actorUsername;
              actorProfilePicUrl = data.profilePicUrl || actorProfilePicUrl;
            }
          } catch {}

          await addDoc(collection(db, "notifications"), {
            type: "upvote",
            targetUid: issue.uid,
            actorUid: user.uid,
            actorUsername,
            actorProfilePicUrl,
            issueId: issue.id,
            created: serverTimestamp(),
            read: false,
          });
        }
      } catch (err) {
        console.error("Error in sending notification:", err);
      }
    } else {
      await updateDoc(issueRef, {
        upvotes: (issue.upvotes || 1) - 1,
        upvotedBy: arrayRemove(user.uid),
      });
      setHasUpvoted(false);
    }
    setLoading(false);
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!isAdmin && !isOwner) return;
    if (!window.confirm("Esti sigur ca vrei sa stergi acest eveniment?")) return;
    await deleteDoc(doc(db, "issues", issue.id));
  };

  const handleNavigate = () => {
    navigate(`/issue/${issue.id}`);
  };

  const issueCategoryColor = CATEGORY_COLORS[issue.category] || "#1976d2";

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!user) {
      alert("Trebuie sa fii logat pentru a comenta!");
      return;
    }
    if (!commentText.trim()) return;
    setCommentLoading(true);
    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      let displayName = user.displayName || user.email;
      let profilePicUrl = user.photoURL || defaultProfile;

      if (userSnap.exists()) {
        const data = userSnap.data();
        if (data.username) displayName = data.username;
        profilePicUrl = data.profilePicUrl ? data.profilePicUrl : defaultProfile;
      }

      await addDoc(collection(db, "issues", issue.id, "comments"), {
        text: commentText.trim(),
        created: new Date().toISOString(),
        uid: user.uid,
        displayName,
        profilePicUrl,
      });
      setCommentText("");
      setShowCommentInput(false);
    } catch (err) {
      alert("Eroare la comentariu: " + err.message);
    }
    setCommentLoading(false);
  };

  return (
    <div
      className="issue-card"
      onClick={handleNavigate}
      role="button"
      tabIndex={0}
      onKeyPress={(e) => e.key === "Enter" && handleNavigate()}
    >
      <div className="issue-card__header">
        <div className="issue-card__meta">
          <span
            className="issue-card__category"
            style={{
              backgroundColor: issueCategoryColor + "22",
              color: "#fff",
              borderColor: issueCategoryColor,
            }}
          >
            {issue.category}
          </span>
          <HypeBadge upvotes={totalUpvotes} />
        </div>
        {(isAdmin || isOwner) && (
          <button className="issue-card__delete" onClick={handleDelete}>
            ×
          </button>
        )}
      </div>

      <h3 className="issue-card__title">{issue.title}</h3>
      {issue.address && <p className="issue-card__address">{issue.address}</p>}
      {issue.desc && <p className="issue-card__desc">{issue.desc}</p>}

      {allImages.length > 0 && (
        <div className="issue-card__gallery">
          {allImages.slice(0, 3).map((img, idx) => (
            <img key={idx} src={img} alt={`pic-${idx}`} />
          ))}
        </div>
      )}

      <div className="issue-card__footer">
        <div className="issue-card__author">
          <img src={issue.profilePicUrl || defaultProfile} alt="avatar" />
          <span>{issue.displayName || "Anonim"}</span>
        </div>
        <div className="issue-card__actions">
          <button
            className={`pill-btn ${hasUpvoted ? "active" : ""}`}
            onClick={handleUpvote}
            disabled={loading}
          >
            {hasUpvoted ? "Upvoted" : "Upvote"} ({totalUpvotes})
          </button>
          <button
            className="link-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowCommentInput((v) => !v);
            }}
          >
            Comenteaza
          </button>
        </div>
      </div>

      {showCommentInput && (
        <form
          className="issue-card__comment"
          onSubmit={handleSubmitComment}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            placeholder="Scrie un comentariu..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
          />
          <button type="submit" disabled={commentLoading}>
            Trimite
          </button>
        </form>
      )}
    </div>
  );
}

function News() {
  const [issues, setIssues] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [recommendedIssues, setRecommendedIssues] = useState([]);
  const [geminiRecommended, setGeminiRecommended] = useState([]);
  const [recLoading, setRecLoading] = useState(false);

  const user = getAuth().currentUser;

  useEffect(() => {
    document.body.classList.add("news-bg");
    return () => document.body.classList.remove("news-bg");
  }, []);

  useEffect(() => {
    const q = query(collection(db, "issues"), orderBy("created", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      setIssues(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const loadRecommendations = useCallback(async () => {
    if (!user) return;
    setRecLoading(true);
    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      const likedCats =
        userSnap.exists() && Array.isArray(userSnap.data().preferredCategories)
          ? userSnap.data().preferredCategories
          : [];
      const recs = issues.filter((iss) => likedCats.includes(iss.category));
      setRecommendedIssues(recs.slice(0, 5));
    } catch (err) {
      console.error(err);
    }
    setRecLoading(false);
  }, [issues, user]);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  const filteredIssues = useMemo(() => {
    let list = issues;
    if (selectedCategory && selectedCategory !== AI_CATEGORY_KEY) {
      list = list.filter((i) => i.category === selectedCategory);
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (i) =>
          (i.title && i.title.toLowerCase().includes(s)) ||
          (i.address && i.address.toLowerCase().includes(s)) ||
          (i.category && i.category.toLowerCase().includes(s))
      );
    }
    return list;
  }, [issues, selectedCategory, search]);

  const liveCount = useMemo(() => {
    const now = new Date();
    return issues.filter((m) => {
      if (!m.endDateTime) return true;
      const end = new Date(m.endDateTime);
      return !Number.isNaN(end.getTime()) && end >= now;
    }).length;
  }, [issues]);

  const latestCount = filteredIssues.length;

  return (
    <div className="news-page">
      <div className="news-glow" aria-hidden="true" />
      <div className="news-glow glow-right" aria-hidden="true" />

      <header className="news-hero">
        <p className="eyebrow">Live pe MeetTM</p>
        <h1>Descopera evenimentele din Timisoara</h1>
        <p className="lede">
          Filtreaza rapid, vezi recomandarile AI si interactioneaza cu cele mai noi evenimente din oras.
        </p>
        <div className="insights-grid">
          <div className="insight-card">
            <p className="insight-label">Evenimente live</p>
            <div className="insight-value">{liveCount}</div>
            <p className="insight-meta">In desfasurare sau programate</p>
          </div>
          <div className="insight-card">
            <p className="insight-label">Total listate</p>
            <div className="insight-value">{issues.length}</div>
            <p className="insight-meta">baza curenta</p>
          </div>
          <div className="insight-card">
            <p className="insight-label">Rezultate filtrate</p>
            <div className="insight-value">{latestCount}</div>
            <p className="insight-meta">conform cautarii</p>
          </div>
        </div>
      </header>

      <section className="panel filters-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Filtre</p>
            <h3>Gaseste evenimentul potrivit</h3>
          </div>
        </div>
        <div className="filter-grid">
          <div className="field">
            <label>Cauta</label>
            <input
              type="text"
              placeholder="Cauta dupa nume, locatie sau categorie..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Categorii</label>
            <div className="chips">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`chip ${selectedCategory === cat ? "active" : ""}`}
                  onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                >
                  {cat}
                </button>
              ))}
              <button
                type="button"
                className={`chip ${selectedCategory === AI_CATEGORY_KEY ? "active" : ""}`}
                onClick={() =>
                  setSelectedCategory(selectedCategory === AI_CATEGORY_KEY ? null : AI_CATEGORY_KEY)
                }
              >
                AI For You
              </button>
              {selectedCategory && (
                <button type="button" className="chip reset" onClick={() => setSelectedCategory(null)}>
                  Reseteaza filtrul
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {selectedCategory === AI_CATEGORY_KEY && (
        <section className="panel ai-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Recomandari AI</p>
              <h3>Evenimente pentru tine</h3>
            </div>
          </div>
          {recLoading && geminiRecommended.length === 0 && recommendedIssues.length === 0 && (
            <p className="muted">Se incarca recomandarile...</p>
          )}
          {geminiRecommended && geminiRecommended.length > 0 && (
            <div className="cards-grid">
              {geminiRecommended.map((issue) => (
                <IssueCard key={`gem-${issue.id}`} issue={issue} />
              ))}
            </div>
          )}
          {geminiRecommended.length === 0 && recommendedIssues && recommendedIssues.length > 0 && (
            <div className="cards-grid">
              {recommendedIssues.map((issue) => (
                <IssueCard key={`rec-${issue.id}`} issue={issue} />
              ))}
            </div>
          )}
        </section>
      )}

      <section className="panel results-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Feed</p>
            <h3>Evenimente</h3>
          </div>
        </div>
        <div className="cards-grid">
          {filteredIssues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
          {filteredIssues.length === 0 && <p className="muted">Nu exista evenimente dupa filtrele selectate.</p>}
        </div>
      </section>
      <AppNavigation />
    </div>
  );
}

export default News;
