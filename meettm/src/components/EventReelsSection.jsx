import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../firebase/config.jsx";
import { getAuth } from "firebase/auth";
import defaultProfile from "./img/default-profile.svg";

// Helper function to format time ago
function timeAgo(date) {
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "now";
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth();

function EventReelsSection({ eventId }) {
  const navigate = useNavigate();

  const [reels, setReels] = useState([]);
  const [showRecorder, setShowRecorder] = useState(false);
  const [recording, setRecording] = useState(false);
  const [videoBlob, setVideoBlob] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const [selectedEventId, setSelectedEventId] = useState(eventId);
  const [events, setEvents] = useState([]);

  const [showComments, setShowComments] = useState(null);
  const [newComment, setNewComment] = useState("");
  const [comments, setComments] = useState({});

  // SHARE state
  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [shareSearch, setShareSearch] = useState("");
  const [shareSending, setShareSending] = useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = useState([]);
  const [shareReel, setShareReel] = useState(null);
  const [activeReelIndex, setActiveReelIndex] = useState(0);

  const videoRef = useRef(null); // recorder preview
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  const reelVideoRefs = useRef({}); // pentru play/pause pe fiecare reel
  const reelFeedRef = useRef(null);
  const magnetSnapTimeout = useRef(null);

  const snapToReel = useCallback(
    (index, { instant = false } = {}) => {
      if (!reels.length) {
        setActiveReelIndex(0);
        return;
      }

      const safeIndex = Math.max(0, Math.min(index, reels.length - 1));
      setActiveReelIndex((prev) => (prev === safeIndex ? prev : safeIndex));

      const container = reelFeedRef.current;
      if (!container) return;

      const target = container.querySelector(
        `[data-reel-index="${safeIndex}"]`
      );
      if (!target) return;

      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const targetTop =
        targetRect.top - containerRect.top + container.scrollTop;

      if (Math.abs(container.scrollTop - targetTop) < 1) return;

      container.scrollTo({
        top: targetTop,
        behavior: instant ? "auto" : "smooth",
      });
    },
    [reels.length]
  );

  useEffect(() => {
    setActiveReelIndex(0);
    const container = reelFeedRef.current;
    if (container) {
      container.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [selectedEventId]);

  useEffect(() => {
    if (!reels.length) {
      setActiveReelIndex(0);
      return;
    }

    if (activeReelIndex > reels.length - 1) {
      snapToReel(reels.length - 1, { instant: true });
    }
  }, [activeReelIndex, reels.length, snapToReel]);

  useEffect(() => {
    const container = reelFeedRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (magnetSnapTimeout.current) {
        clearTimeout(magnetSnapTimeout.current);
      }

      magnetSnapTimeout.current = setTimeout(() => {
        const sections = container.querySelectorAll("[data-reel-index]");
        if (!sections.length) return;

        const containerMid = container.scrollTop + container.clientHeight / 2;
        let closestIndex = 0;
        let smallestDistance = Number.POSITIVE_INFINITY;

        sections.forEach((section, idx) => {
          const sectionMid = section.offsetTop + section.clientHeight / 2;
          const distance = Math.abs(sectionMid - containerMid);
          if (distance < smallestDistance) {
            smallestDistance = distance;
            closestIndex = idx;
          }
        });

        snapToReel(closestIndex);
      }, 20);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (magnetSnapTimeout.current) {
        clearTimeout(magnetSnapTimeout.current);
      }
    };
  }, [snapToReel, reels.length]);

  // Fetch events pentru selector
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "issues"), (snap) => {
      setEvents(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  // Load selected event din localStorage dacă nu primim eventId din props
  useEffect(() => {
    if (!eventId) {
      const savedEventId = localStorage.getItem("selectedEventForReels");
      if (savedEventId) setSelectedEventId(savedEventId);
    }
  }, [eventId]);

  // Fetch reels + comments realtime
  useEffect(() => {
    if (!selectedEventId) return;

    const qReels = query(
      collection(db, "issues", selectedEventId, "reels"),
      orderBy("created", "desc")
    );

    const unsubReels = onSnapshot(qReels, (snap) => {
      const reelData = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setReels(reelData);

      reelData.forEach((reel) => {
        const qComments = query(
          collection(
            db,
            "issues",
            selectedEventId,
            "reels",
            reel.id,
            "comments"
          ),
          orderBy("created", "desc")
        );
        onSnapshot(qComments, (commentsSnap) => {
          setComments((prev) => ({
            ...prev,
            [reel.id]: commentsSnap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
            })),
          }));
        });
      });
    });

    return () => unsubReels();
  }, [selectedEventId]);

  // Fetch friends list (users) – folosit la share
  useEffect(() => {
    const fetchFriends = async () => {
      try {
        setFriendsLoading(true);
        const snap = await getDocs(collection(db, "users"));
        const currentUid = auth.currentUser?.uid;
        const list = snap.docs
          .filter((d) => d.id !== currentUid)
          .map((d) => ({ id: d.id, ...d.data() }));
        setFriends(list);
      } catch (e) {
        console.error("Error loading friends:", e);
      } finally {
        setFriendsLoading(false);
      }
    };

    fetchFriends();
  }, []);

  // Start recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp9",
      });
      recorderRef.current = recorder;

      const chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        setVideoBlob(blob);
        const url = URL.createObjectURL(blob);
        if (videoRef.current) {
          videoRef.current.srcObject = null;
          videoRef.current.src = url;
        }
      };

      recorder.start();
      setRecording(true);
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Unable to access camera. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recording) {
      recorderRef.current.stop();
      setRecording(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    }
  };

  // File din device
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith("video/")) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.src = url;
        videoRef.current.load();
      }
    } else {
      alert("Please select a valid video file.");
    }
  };

  // Upload reel in Firebase
  const uploadReel = async () => {
    const blobToUpload = videoBlob || selectedFile;
    if (!blobToUpload || !selectedEventId) return;

    setUploading(true);
    const user = auth.currentUser;
    if (!user) {
      alert("You must be logged in!");
      setUploading(false);
      return;
    }

    try {
      let username = user.displayName || user.email;
      let profilePicUrl = user.photoURL || defaultProfile;

      try {
        const userSnap = await getDocs(collection(db, "users")).then((snap) =>
          snap.docs.find((d) => d.id === user.uid)
        );
        if (userSnap) {
          const data = userSnap.data();
          if (data.username) username = data.username;
          if (data.profilePicUrl) profilePicUrl = data.profilePicUrl;
        }
      } catch {
        // fallback
      }

      const fileExtension = selectedFile
        ? selectedFile.name.split(".").pop()
        : "webm";

      const videoRefStorage = ref(
        storage,
        `reels/${selectedEventId}/${Date.now()}.${fileExtension}`
      );

      await uploadBytes(videoRefStorage, blobToUpload);
      const videoUrl = await getDownloadURL(videoRefStorage);

      await addDoc(collection(db, "issues", selectedEventId, "reels"), {
        videoUrl,
        uid: user.uid,
        displayName: username,
        profilePicUrl,
        created: serverTimestamp(),
        likes: 0,
        likedBy: [],
      });

      setVideoBlob(null);
      setSelectedFile(null);
      setShowRecorder(false);
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to upload reel. Please try again.");
    }
    setUploading(false);
  };

  // Like / unlike
  const handleLike = async (reelId, likedBy = []) => {
    const user = auth.currentUser;
    if (!user) return alert("You must be logged in!");

    const reelRef = doc(db, "issues", selectedEventId, "reels", reelId);
    const isLiked = likedBy.includes(user.uid);
    const currentLikes = reels.find((r) => r.id === reelId)?.likes || 0;

    if (!isLiked) {
      await updateDoc(reelRef, {
        likes: currentLikes + 1,
        likedBy: arrayUnion(user.uid),
      });
    } else {
      await updateDoc(reelRef, {
        likes: Math.max(0, currentLikes - 1),
        likedBy: arrayRemove(user.uid),
      });
    }
  };

  // Comentariu nou
  const handleComment = async (reelId) => {
    if (!newComment.trim()) return;
    const user = auth.currentUser;
    if (!user) return alert("You must be logged in!");

    try {
      let username = user.displayName || user.email;
      let profilePicUrl = user.photoURL || defaultProfile;

      try {
        const userSnap = await getDocs(collection(db, "users")).then((snap) =>
          snap.docs.find((d) => d.id === user.uid)
        );
        if (userSnap) {
          const data = userSnap.data();
          if (data.username) username = data.username;
          if (data.profilePicUrl) profilePicUrl = data.profilePicUrl;
        }
      } catch {
        // ignore
      }

      await addDoc(
        collection(db, "issues", selectedEventId, "reels", reelId, "comments"),
        {
          text: newComment,
          uid: user.uid,
          displayName: username,
          profilePicUrl,
          created: serverTimestamp(),
        }
      );

      setNewComment("");
    } catch (err) {
      console.error("Comment error:", err);
      alert("Failed to add comment. Please try again.");
    }
  };

  // SHARE: toggle select friend
  const toggleFriendSelect = (id) => {
    setSelectedFriendIds((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  // SHARE: send reel to selected friends
  const handleSendReel = async () => {
    const user = auth.currentUser;
    if (!user) return alert("You must be logged in!");
    if (!shareReel || selectedFriendIds.length === 0) return;

    setShareSending(true);
    try {
      // Get user profile info
      let username = user.displayName || user.email;
      let profilePicUrl = user.photoURL || defaultProfile;

      try {
        const userSnap = await getDocs(collection(db, "users")).then((snap) =>
          snap.docs.find((d) => d.id === user.uid)
        );
        if (userSnap) {
          const data = userSnap.data();
          if (data.username) username = data.username;
          if (data.profilePicUrl) profilePicUrl = data.profilePicUrl;
        }
      } catch {
        // fallback
      }

      await Promise.all(
        selectedFriendIds.map(async (friendId) => {
          // Add to inboxReels
          await addDoc(collection(db, "users", friendId, "inboxReels"), {
            fromUid: user.uid,
            fromDisplayName: username,
            reelId: shareReel.id,
            eventId: selectedEventId,
            videoUrl: shareReel.videoUrl,
            created: serverTimestamp(),
          });

          // Create notification
          await addDoc(collection(db, "notifications"), {
            type: "reelShared",
            targetUid: friendId,
            actorUid: user.uid,
            actorUsername: username,
            actorProfilePicUrl: profilePicUrl,
            reelId: shareReel.id,
            eventId: selectedEventId,
            read: false,
            created: serverTimestamp(),
          });
        })
      );

      setShareSending(false);
      setShareReel(null);
      setSelectedFriendIds([]);
      setShareSearch("");
      alert("Reel sent to your friends ✅");
    } catch (e) {
      console.error("Send reel error:", e);
      setShareSending(false);
      alert("Failed to send reel. Try again.");
    }
  };

  const currentEvent = events.find((e) => e.id === selectedEventId);
  const userUid = auth.currentUser?.uid;

  const filteredFriends =
    shareSearch.trim().length > 0
      ? friends.filter((f) => {
          const target =
            (f.username || "") +
            " " +
            (f.displayName || "") +
            " " +
            (f.email || "");
          return target.toLowerCase().includes(shareSearch.toLowerCase());
        })
      : friends;

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        backgroundColor: "#000",
        color: "#fff",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* TOP BAR – stil Instagram web */}
      <header
        style={{
          height: 64,
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(55,65,81,0.6)",
          background:
            "linear-gradient(90deg, rgba(15,23,42,0.96), rgba(15,23,42,0.9))",
          zIndex: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: "transparent",
              border: "none",
              color: "#e5e7eb",
              fontSize: 22,
              cursor: "pointer",
              padding: 6,
              borderRadius: 999,
            }}
          >
            ←
          </button>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              style={{
                fontSize: 11,
                letterSpacing: 1.8,
                textTransform: "uppercase",
                color: "#9ca3af",
              }}
            >
              Event Reels
            </span>
            <span
              style={{
                fontSize: 16,
                fontWeight: 600,
                maxWidth: 260,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {currentEvent
                ? currentEvent.title ||
                  currentEvent.description ||
                  `Event ${currentEvent.id}`
                : "Choose an event"}
            </span>
          </div>
        </div>

        {!eventId && (
          <div style={{ maxWidth: 280, width: "100%" }}>
            <select
              value={selectedEventId || ""}
              onChange={(e) => {
                const newId = e.target.value;
                setSelectedEventId(newId);
                localStorage.setItem("selectedEventForReels", newId);
              }}
              style={{
                width: "100%",
                padding: "8px 14px",
                borderRadius: 999,
                border: "1px solid rgba(148,163,184,0.7)",
                background: "rgba(15,23,42,0.98)",
                color: "#e5e7eb",
                fontSize: 13,
                outline: "none",
                appearance: "none",
              }}
            >
              <option value="">Choose an event…</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title || ev.description || `Event ${ev.id}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {/* MAIN – centru ca pe Instagram web Reels */}
      <main
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "stretch",
          position: "relative",
          overflow: "hidden",
          minHeight: "100vh",
        }}
      >
        {/* fundal „vignetting” */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at top, rgba(15,23,42,0.8) 0, #000 40%, #000 100%)",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            height: "100%",
            width: "100%",
            maxWidth: 900,
            margin: "0 auto",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            ref={reelFeedRef}
            style={{
              height: "100%",
              width: "100%",
              overflowY: "auto",
              scrollSnapType: "y mandatory",
              scrollBehavior: "smooth",
              scrollPadding: "10vh 0",
              padding: "12px 0 48px",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              overscrollBehaviorY: "contain",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {/* mesaj când nu sunt reels */}
            {reels.length === 0 && selectedEventId && (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  gap: 10,
                  color: "#e5e7eb",
                }}
              >
                <div
                  style={{
                    padding: "8px 16px",
                    borderRadius: 999,
                    border: "1px solid rgba(148,163,184,0.6)",
                    fontSize: 11,
                    letterSpacing: 1.8,
                    textTransform: "uppercase",
                    color: "#9ca3af",
                  }}
                >
                  No reels yet
                </div>
                <p style={{ fontSize: 16 }}>Be the first to add a reel.</p>
                <p style={{ fontSize: 13, color: "#9ca3af" }}>
                  Tap the orange “+” button in the bottom-right corner.
                </p>
              </div>
            )}

            {/* fiecare reel */}
            {reels.map((reel, index) => {
              const isLiked =
                userUid && reel.likedBy && reel.likedBy.includes(userUid);
              const isActive = index === activeReelIndex;
              const scale = isActive ? 1 : 0.93;
              const cardOpacity = isActive ? 1 : 0.35;
              const cardShadow = isActive
                ? "0 45px 110px rgba(2,6,23,0.98), 0 0 0 1px rgba(248,250,252,0.18)"
                : "0 25px 80px rgba(2,6,23,0.55)";

              return (
                <section
                  key={reel.id}
                  data-reel-index={index}
                  style={{
                    height: "100vh",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: index === 0 ? "flex-start" : "center",
                    scrollSnapAlign: "start",
                    scrollSnapStop: "always",
                    paddingTop: index === 0 ? 12 : 48,
                    paddingBottom: 48,
                    boxSizing: "border-box",
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      width:
                        "min(calc((100vh - 64px) * 9 / 16), calc(100vw - 32px))",
                      height:
                        "min(calc(100vh - 64px), calc((100vw - 32px) * 16 / 9))",
                      maxWidth: "min(560px, calc(100vw - 32px))",
                      maxHeight: "calc(100vh - 24px)",
                      borderRadius: "clamp(18px, 4vw, 32px)",
                      overflow: "hidden",
                      backgroundColor: "#020617",
                      transform: `scale(${scale})`,
                      opacity: cardOpacity,
                      boxShadow: cardShadow,
                      transition:
                        "transform 0.22s cubic-bezier(0.28,0.9,0.4,1.1), opacity 0.2s ease, box-shadow 0.24s ease, filter 0.24s ease",
                      filter: isActive ? "none" : "brightness(0.7) saturate(0.85)",
                      pointerEvents: isActive ? "auto" : "none",
                    }}
                  >
                    {/* VIDEO – click pentru play/pause ca pe Insta */}
                    <video
                      ref={(el) => {
                        if (el) reelVideoRefs.current[reel.id] = el;
                      }}
                      src={reel.videoUrl}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                        cursor: "pointer",
                        borderRadius: "inherit",
                        transition: "filter 0.18s ease",
                        filter: isActive ? "none" : "brightness(0.75)",
                      }}
                      autoPlay
                      muted
                      loop
                      playsInline
                      onClick={() => {
                        const v = reelVideoRefs.current[reel.id];
                        if (!v) return;
                        if (v.paused) v.play();
                        else v.pause();
                      }}
                      onLoadedData={(e) => {
                        const video = e.target;
                        const observer = new IntersectionObserver(
                          (entries) => {
                            entries.forEach((entry) => {
                              if (entry.isIntersecting) {
                                video
                                  .play()
                                  .catch(() => {/* ignore */});
                              } else {
                                video.pause();
                              }
                            });
                          },
                          { threshold: 0.6 }
                        );
                        observer.observe(video);
                      }}
                    />

                    {/* gradient jos */}
                    <div
                      style={{
                        position: "absolute",
                        insetInline: 0,
                        bottom: 0,
                        height: "40%",
                        background:
                          "linear-gradient(to top, rgba(0,0,0,0.95), rgba(0,0,0,0.4), transparent)",
                      }}
                    />

                    {/* info creator */}
                    <div
                      style={{
                        position: "absolute",
                        left: "clamp(14px, 4vw, 30px)",
                        bottom: "clamp(64px, 14vh, 128px)",
                        right: "clamp(90px, 22vw, 152px)",
                        display: "flex",
                        alignItems: "center",
                        gap: "clamp(8px, 2vw, 16px)",
                      }}
                    >
                      <img
                        src={reel.profilePicUrl || defaultProfile}
                        alt="avatar"
                        style={{
                          width: "clamp(40px, 5vw, 54px)",
                          height: "clamp(40px, 5vw, 54px)",
                          borderRadius: "999px",
                          objectFit: "cover",
                          border: "2px solid rgba(248,250,252,0.96)",
                          boxShadow: "0 4px 16px rgba(0,0,0,0.9)",
                        }}
                      />
                      <div>
                        <div
                          style={{
                            fontSize: "clamp(14px, 3.5vw, 18px)",
                            fontWeight: 600,
                            textShadow: "0 2px 8px rgba(0,0,0,0.9)",
                          }}
                        >
                          {reel.displayName}
                        </div>
                        <div
                          style={{
                            fontSize: "clamp(11px, 2.4vw, 14px)",
                            color: "#d1d5db",
                            textShadow: "0 2px 8px rgba(0,0,0,0.85)",
                          }}
                        >
                          {reel.created?.toDate
                            ? reel.created.toDate().toLocaleDateString()
                            : ""}
                        </div>
                      </div>
                    </div>

                    {/* coloană acțiuni – like / comment / share */}
                    <div
                      style={{
                        position: "absolute",
                        right: "clamp(10px, 3vw, 28px)",
                        bottom: "clamp(60px, 14vh, 128px)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "clamp(10px, 2vh, 18px)",
                      }}
                    >
                      {/* Like */}
                      <button
                        onClick={() => handleLike(reel.id, reel.likedBy)}
                        style={{
                          width: "clamp(48px, 6vw, 66px)",
                          height: "clamp(48px, 6vw, 66px)",
                          borderRadius: "999px",
                          border: "none",
                          background: isLiked
                            ? "radial-gradient(circle at 30% 0, #fb7185, #be123c)"
                            : "radial-gradient(circle at 30% 0, #fecaca, #b91c1c)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          boxShadow:
                            "0 10px 26px rgba(0,0,0,0.9), 0 0 0 1px rgba(248,250,252,0.18)",
                          color: "#fff",
                          transition: "transform 0.12s ease",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "clamp(20px, 4vw, 26px)",
                            marginBottom: 2,
                          }}
                        >
                          {isLiked ? "\u{1F49C}" : "\u{1F90D}"}
                        </span>
                        <span
                          style={{
                            fontSize: "clamp(11px, 2vw, 14px)",
                            fontWeight: 600,
                            marginTop: -3,
                          }}
                        >
                          {reel.likes || 0}
                        </span>
                      </button>

                      {/* Comments */}
                      <button
                        onClick={() =>
                          setShowComments(
                            showComments === reel.id ? null : reel.id
                          )
                        }
                        style={{
                          width: "clamp(48px, 6vw, 66px)",
                          height: "clamp(48px, 6vw, 66px)",
                          borderRadius: "999px",
                          border: "none",
                          background: "rgba(17,24,39,0.96)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          boxShadow:
                            "0 10px 26px rgba(0,0,0,0.9), 0 0 0 1px rgba(148,163,184,0.6)",
                          color: "#fff",
                          transition: "transform 0.12s ease",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "clamp(18px, 3.2vw, 24px)",
                            marginBottom: 2,
                          }}
                        >
                          {"\u{1F4AC}"}
                        </span>
                        <span
                          style={{
                            fontSize: "clamp(11px, 2vw, 14px)",
                            fontWeight: 600,
                            marginTop: -3,
                          }}
                        >
                          {comments[reel.id]?.length || 0}
                        </span>
                      </button>

                      {/* Share */}
                      <button
                        onClick={() => {
                          setShareReel(reel);
                          setSelectedFriendIds([]);
                          setShareSearch("");
                        }}
                        style={{
                          width: "clamp(48px, 6vw, 66px)",
                          height: "clamp(48px, 6vw, 66px)",
                          borderRadius: "999px",
                          border: "none",
                          background:
                            "radial-gradient(circle at 30% 0, #fbbf24, #f97316)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          boxShadow:
                            "0 10px 26px rgba(0,0,0,0.9), 0 0 0 1px rgba(251,191,36,0.6)",
                          color: "#fff",
                          transition: "transform 0.12s ease",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "clamp(18px, 3.2vw, 24px)",
                            marginBottom: 2,
                          }}
                        >
                          {"\u{1F4E4}"}
                        </span>
                        <span
                          style={{
                            fontSize: "clamp(11px, 2vw, 14px)",
                            fontWeight: 600,
                            marginTop: -3,
                          }}
                        >
                          Share
                        </span>
                      </button>
                    </div>

                    {/* Sheet comentarii */}
                    {showComments === reel.id && (
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: "rgba(15,23,42,0.98)",
                          borderRadius: "18px 18px 0 0",
                          padding: 14,
                          maxHeight: "65%",
                          display: "flex",
                          flexDirection: "column",
                          boxShadow:
                            "0 -16px 40px rgba(0,0,0,0.9), 0 0 0 1px rgba(148,163,184,0.4)",
                          zIndex: 10,
                        }}
                      >
                        <div
                          style={{
                            width: 36,
                            height: 4,
                            borderRadius: 999,
                            background: "rgba(148,163,184,0.7)",
                            margin: "0 auto 8px",
                          }}
                        />
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 6,
                          }}
                        >
                          <h3
                            style={{
                              margin: 0,
                              fontSize: 15,
                              color: "#f9fafb",
                              letterSpacing: 0.4,
                            }}
                          >
                            Comments
                          </h3>
                          <button
                            onClick={() => setShowComments(null)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#9ca3af",
                              fontSize: 22,
                              cursor: "pointer",
                            }}
                          >
                            ×
                          </button>
                        </div>

                        <div
                          style={{
                            flex: 1,
                            overflowY: "auto",
                            paddingRight: 4,
                            marginBottom: 8,
                          }}
                        >
                          {comments[reel.id] &&
                          comments[reel.id].length > 0 ? (
                            comments[reel.id].map((c) => (
                              <div
                                key={c.id}
                                style={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  marginBottom: 10,
                                  padding: 8,
                                  borderRadius: 12,
                                  background: "rgba(30,64,175,0.25)",
                                  border:
                                    "1px solid rgba(129,140,248,0.35)",
                                }}
                              >
                                <img
                                  src={c.profilePicUrl || defaultProfile}
                                  alt="avatar"
                                  style={{
                                    width: 30,
                                    height: 30,
                                    borderRadius: "999px",
                                    objectFit: "cover",
                                    marginRight: 8,
                                    border:
                                      "1px solid rgba(248,250,252,0.9)",
                                  }}
                                />
                                <div style={{ flex: 1 }}>
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      marginBottom: 2,
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: 13,
                                        fontWeight: 600,
                                        color: "#e5e7eb",
                                      }}
                                    >
                                      {c.displayName}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: 11,
                                        color: "#9ca3af",
                                      }}
                                    >
                                      {c.created?.toDate
                                        ? timeAgo(c.created.toDate())
                                        : ""}
                                    </span>
                                  </div>
                                  <p
                                    style={{
                                      margin: 0,
                                      fontSize: 13,
                                      color: "#f9fafb",
                                    }}
                                  >
                                    {c.text}
                                  </p>
                                </div>
                              </div>
                            ))
                          ) : (
                            <p
                              style={{
                                textAlign: "center",
                                color: "#9ca3af",
                                fontSize: 13,
                                marginTop: 12,
                              }}
                            >
                              No comments yet. Be the first!
                            </p>
                          )}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <input
                            type="text"
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder="Add a comment…"
                            style={{
                              flex: 1,
                              padding: "8px 12px",
                              borderRadius: 999,
                              border:
                                "1px solid rgba(148,163,184,0.7)",
                              background: "rgba(15,23,42,0.96)",
                              color: "#e5e7eb",
                              fontSize: 13,
                              outline: "none",
                            }}
                            onKeyDown={(e) =>
                              e.key === "Enter" && handleComment(reel.id)
                            }
                          />
                          <button
                            onClick={() => handleComment(reel.id)}
                            style={{
                              padding: "8px 14px",
                              borderRadius: 999,
                              border: "none",
                              background:
                                "linear-gradient(135deg, #2563eb, #4f46e5)",
                              color: "#fff",
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Post
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        {/* buton + reel */}
        {selectedEventId && (
          <button
            onClick={() => setShowRecorder(true)}
            style={{
              position: "fixed",
              right: 28,
              bottom: 28,
              width: 64,
              height: 64,
              borderRadius: "999px",
              border: "none",
              background:
                "radial-gradient(circle at 30% 0, #f97316, #ea580c 40%, #b91c1c 80%)",
              color: "#fff",
              fontSize: 32,
              fontWeight: 500,
              cursor: "pointer",
              boxShadow:
                "0 18px 40px rgba(0,0,0,0.95), 0 0 0 2px rgba(248,250,252,0.12)",
              zIndex: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            +
          </button>
        )}
      </main>

      {/* MODAL recorder / upload */}
      {showRecorder && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.96)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "rgba(15,23,42,0.98)",
              borderRadius: 22,
              width: "100%",
              maxWidth: 430,
              padding: 18,
              boxShadow:
                "0 24px 70px rgba(0,0,0,0.95), 0 0 0 1px rgba(148,163,184,0.45)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 16,
                    color: "#f9fafb",
                  }}
                >
                  Add a Reel
                </h2>
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: "#9ca3af",
                  }}
                >
                  Record with your camera or upload a video file.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowRecorder(false);
                  setVideoBlob(null);
                  setSelectedFile(null);
                  if (streamRef.current) {
                    streamRef.current
                      .getTracks()
                      .forEach((t) => t.stop());
                  }
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#9ca3af",
                  fontSize: 22,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                borderRadius: 18,
                overflow: "hidden",
                background: "#020617",
                border: "1px solid rgba(148,163,184,0.45)",
                marginBottom: 12,
              }}
            >
              <video
                ref={videoRef}
                style={{
                  width: "100%",
                  height: 320,
                  objectFit: "cover",
                  background: "#020617",
                  display: "block",
                }}
                controls={!recording}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                type="file"
                accept="video/*"
                ref={fileInputRef}
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background:
                    "linear-gradient(135deg, #f97316, #e11d48)",
                  border: "none",
                  borderRadius: 999,
                  padding: "10px 16px",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <span>📁</span> Choose video file
              </button>

              <div style={{ display: "flex", gap: 10 }}>
                {!recording ? (
                  <button
                    onClick={startRecording}
                    style={{
                      flex: 1,
                      background:
                        "radial-gradient(circle at 20% 0, #4ade80, #16a34a)",
                      border: "none",
                      borderRadius: 999,
                      padding: "10px 16px",
                      color: "#022c22",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    🎥 Start recording
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    style={{
                      flex: 1,
                      background:
                        "radial-gradient(circle at 20% 0, #fecaca, #b91c1c)",
                      border: "none",
                      borderRadius: 999,
                      padding: "10px 16px",
                      color: "#fef2f2",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    ⏹️ Stop
                  </button>
                )}
              </div>

              {(videoBlob || selectedFile) && (
                <button
                  onClick={uploadReel}
                  disabled={uploading}
                  style={{
                    background: uploading
                      ? "rgba(148,163,184,0.5)"
                      : "linear-gradient(135deg, #2563eb, #4f46e5)",
                    border: "none",
                    borderRadius: 999,
                    padding: "10px 16px",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: uploading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  {uploading ? "⏳ Uploading..." : "📤 Upload reel"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SHARE MODAL – trimite reel la prieteni, ca Insta */}
      {shareReel && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 420,
              borderRadius: 20,
              background: "rgba(15,23,42,0.98)",
              boxShadow:
                "0 24px 70px rgba(0,0,0,0.95), 0 0 0 1px rgba(75,85,99,0.8)",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              maxHeight: "90vh",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 16,
                  color: "#f9fafb",
                }}
              >
                Share reel
              </h2>
              <button
                onClick={() => {
                  setShareReel(null);
                  setSelectedFriendIds([]);
                  setShareSearch("");
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#9ca3af",
                  fontSize: 22,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>

            {/* preview mic al reel-ului */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 70,
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "#020617",
                  border: "1px solid rgba(75,85,99,0.9)",
                  flexShrink: 0,
                }}
              >
                <video
                  src={shareReel.videoUrl}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                  muted
                  autoPlay
                  loop
                  playsInline
                />
              </div>
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: "#e5e7eb",
                  }}
                >
                  Send this reel to your friends.
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: 11,
                    color: "#9ca3af",
                  }}
                >
                  Friends will receive it in their inbox.
                </p>
              </div>
            </div>

            {/* search friends */}
            <div style={{ marginBottom: 8 }}>
              <input
                type="text"
                placeholder="Search friends…"
                value={shareSearch}
                onChange={(e) => setShareSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: "1px solid rgba(148,163,184,0.7)",
                  background: "rgba(15,23,42,0.96)",
                  color: "#e5e7eb",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>

            {/* friends list */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                paddingRight: 4,
                marginBottom: 10,
                borderRadius: 14,
                border: "1px solid rgba(55,65,81,0.9)",
                background: "rgba(15,23,42,0.85)",
              }}
            >
              {friendsLoading ? (
                <p
                  style={{
                    fontSize: 13,
                    color: "#9ca3af",
                    padding: 10,
                    textAlign: "center",
                  }}
                >
                  Loading friends…
                </p>
              ) : filteredFriends.length === 0 ? (
                <p
                  style={{
                    fontSize: 13,
                    color: "#9ca3af",
                    padding: 10,
                    textAlign: "center",
                  }}
                >
                  No friends found.
                </p>
              ) : (
                filteredFriends.map((f) => {
                  const isSelected = selectedFriendIds.includes(f.id);
                  const displayName =
                    f.username || f.displayName || f.email || "User";

                  return (
                    <button
                      key={f.id}
                      onClick={() => toggleFriendSelect(f.id)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 10px",
                        background: "transparent",
                        border: "none",
                        borderBottom:
                          "1px solid rgba(55,65,81,0.8)",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <img
                          src={f.profilePicUrl || defaultProfile}
                          alt="avatar"
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "999px",
                            objectFit: "cover",
                            border:
                              "1px solid rgba(248,250,252,0.8)",
                          }}
                        />
                        <span
                          style={{
                            fontSize: 13,
                            color: "#e5e7eb",
                          }}
                        >
                          {displayName}
                        </span>
                      </div>
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: "999px",
                          border: isSelected
                            ? "none"
                            : "1px solid rgba(148,163,184,0.9)",
                          background: isSelected
                            ? "linear-gradient(135deg,#2563eb,#4f46e5)"
                            : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          color: "#fff",
                        }}
                      >
                        {isSelected && "✓"}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* send btn */}
            <button
              onClick={handleSendReel}
              disabled={selectedFriendIds.length === 0 || shareSending}
              style={{
                padding: "9px 14px",
                borderRadius: 999,
                border: "none",
                background:
                  selectedFriendIds.length === 0 || shareSending
                    ? "rgba(148,163,184,0.4)"
                    : "linear-gradient(135deg, #2563eb, #4f46e5)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor:
                  selectedFriendIds.length === 0 || shareSending
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {shareSending
                ? "Sending…"
                : selectedFriendIds.length === 0
                ? "Choose at least one friend"
                : `Send to ${selectedFriendIds.length} friend${
                    selectedFriendIds.length > 1 ? "s" : ""
                  }`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default EventReelsSection;

