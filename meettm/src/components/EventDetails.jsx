import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getFirestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, getDocs, deleteDoc, addDoc, serverTimestamp, onSnapshot, query, orderBy } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../firebase/config.jsx";
import { getAuth } from "firebase/auth";
import defaultProfile from "./img/default-profile.svg";

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
  "Music": "#c21e56",
  "Art & Culture": "#8a2be2",
  "Education": "#1e3a8a",
  "Community & Volunteering": "#40e0d0",
  "Sport": "#ff9322",
  "Food & Drink": "#ffd707",
  "Party & Fun": "#ff1493",
  "Shopping": "#9c27b0",
  "Nature": "#228b22",
  "Business": "#a1887f",
  "Family & Animals": "#4f9d9d",
  "Other": "#ffdab9"
};

function EventDetails() {
  const { id } = useParams();
  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasUpvoted, setHasUpvoted] = useState(false);
  const [currentImg, setCurrentImg] = useState(0);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const user = getAuth().currentUser;
  const isAdmin = user && user.email === "admin@admin.com";

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
    };
    fetchIssue();
    // eslint-disable-next-line
  }, [id, user]);

  // Comentarii realtime
  useEffect(() => {
    if (!id) return;
    const q = query(
      collection(db, "issues", id, "comments"),
      orderBy("created", "desc") // <-- ordonează descrescător după data creării
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

    // Trimite notificare la utilizatorul care a creat issue-ul
    try {
      // Ia username-ul și poza reală din Firestore
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

  // Galerie: funcții pentru navigare
  const allImages = (issue && issue.images ? issue.images.filter(Boolean) : []);
  const handlePrev = () => {
    if (!allImages.length) return;
    setCurrentImg((prev) => (prev === 0 ? allImages.length - 1 : prev - 1));
  };
  const handleNext = () => {
    if (!allImages.length) return;
    setCurrentImg((prev) => (prev === allImages.length - 1 ? 0 : prev + 1));
  };

  // Șterge raportarea curentă
  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this event?")) return;
    await deleteDoc(doc(db, "issues", id));
    window.location.href = "/news";
  };

  // Adaugă comentariu
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!user) return alert("You must be logged in to comment!");
    if (!commentText.trim()) return;
    setCommentLoading(true);

    // Ia username-ul și poza reală din Firestore
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

    // Trimite notificare la utilizatorul care a creat issue-ul
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

  if (!issue) return <div style={{ padding: 40 }}>Se încarcă...</div>;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 0" }}>
      {/* Header cu poza de profil și username */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
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
        {/* Eliminat statusul */}
      </div>
      {/* Galerie de imagini */}
      {allImages.length > 0 && (
        <div style={{ position: "relative", width: "100%", height: 220, marginBottom: 24 }}>
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
          {/* Săgeți galerie */}
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
          {/* Buline galerie */}
          {allImages.length > 1 && (
            <div style={{
              position: "absolute",
              bottom: 10,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              gap: 6,
            }}>
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
      {/* Categorie */}
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
      {/* Titlu */}
      <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 8 }}>
        {issue.title}
      </div>
      {/* Adresă */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 12 }}>
        <span style={{ color: "#1976d2", fontSize: 15 }}>
          <span role="img" aria-label="locatie">📍</span>{" "}
          {capitalizeWords(issue.address)}
        </span>
      </div>
      {/* Interval dată și oră */}
      {issue.dateStart && issue.dateEnd && issue.hourStart && issue.hourEnd && (
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
            {new Date(issue.dateStart).toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "numeric" })}
            {" "}
            {issue.hourStart}
          </span>
          <span>
            <b>End date:</b>{" "}
            {new Date(issue.dateEnd).toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "numeric" })}
            {" "}
            {issue.hourEnd}
          </span>
        </div>
      )}
      <hr />
      {/* Descriere */}
      <div style={{ margin: "18px 0" }}>
        <b>Description</b>
        <div style={{ color: "#444", marginTop: 6 }}>{issue.desc}</div>
      </div>
      <hr />
      {/* Buton Upvote și Comentarii */}
      <div style={{ display: "flex", gap: 16, marginTop: 24, alignItems: "center" }}>
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
          <span role="img" aria-label="upvote">❤️</span> Like ({issue.upvotes || 0})
        </button>
        <span style={{ fontSize: 18, display: "flex", alignItems: "center", gap: 6 }}>
          <span role="img" aria-label="comentarii">💬</span> Comments
        </span>
      </div>
      {/* Formular comentariu */}
      <form
        onSubmit={handleAddComment}
        style={{ marginTop: 18, display: "flex", gap: 8 }}
      >
        <input
          type="text"
          placeholder="Add a comment..."
          value={commentText}
          onChange={e => setCommentText(e.target.value)}
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
      {/* Lista comentarii */}
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
              <div style={{ fontWeight: 700, fontSize: 18, color: "#222" }}>
                {c.displayName || "Utilizator"}
              </div>
              <div style={{ color: "#444", fontSize: 15, margin: "2px 0 0 0" }}>
                {c.text}
              </div>
              <div style={{ color: "#888", fontSize: 13, marginTop: 2 }}>
                {c.created?.toDate
                  ? timeAgoOrDate(c.created.toDate())
                  : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Helper pentru afișare timp relativ sau dată exactă dacă > 7 zile
function timeAgoOrDate(date) {
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  const days = Math.floor(seconds / (60 * 60 * 24));
  if (days >= 7) {
    // Dacă au trecut peste 7 zile, afișează data exactă
    return date.toLocaleDateString("ro-RO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${days} d ago`;
}

export default EventDetails;