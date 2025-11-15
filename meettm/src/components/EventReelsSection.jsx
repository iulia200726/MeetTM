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
import "./EventReelsSection.css";

const HeartIcon = ({ filled }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="reel-action-svg"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 21s-6.2-3.4-9.6-8a6 6 0 0 1 9.2-7 6 6 0 0 1 9.2 7c-3.4 4.6-9.6 8-9.6 8Z" />
  </svg>
);

const ShareIcon = () => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="reel-action-svg"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 4h6v6" />
    <path d="M20 4 10 14" />
    <path d="M10 8H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4" />
  </svg>
);

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
  const [commentDragOffset, setCommentDragOffset] = useState(0);
  const [shareToastMessage, setShareToastMessage] = useState("");
  const [shareToastVisible, setShareToastVisible] = useState(false);
  const [shareDragOffset, setShareDragOffset] = useState(0);

  const videoRef = useRef(null); // recorder preview
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  const reelVideoRefs = useRef({}); // pentru play/pause pe fiecare reel
  const reelFeedRef = useRef(null);
  const magnetSnapTimeout = useRef(null);
  const commentDragStartY = useRef(0);
  const commentDragActiveReel = useRef(null);
  const commentDragOffsetRef = useRef(0);
  const shareToastTimeout = useRef(null);
  const shareToastDelayTimeout = useRef(null);
  const shareToastCleanupTimeout = useRef(null);
  const shareDragStartY = useRef(0);
  const shareDragOffsetRef = useRef(0);

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

  const handleCommentDragMove = useCallback((e) => {
    if (!commentDragActiveReel.current) return;
    const currentY =
      e.clientY ?? (e.touches && e.touches[0] && e.touches[0].clientY) ?? 0;
    const delta = currentY - commentDragStartY.current;
    const clamped = Math.max(0, delta);
    commentDragOffsetRef.current = clamped;
    setCommentDragOffset(clamped);
  }, []);

  const handleCommentDragEnd = useCallback(() => {
    if (!commentDragActiveReel.current) return;
    const shouldClose = commentDragOffsetRef.current > 90;
    if (shouldClose) {
      setShowComments(null);
    }
    commentDragOffsetRef.current = 0;
    setCommentDragOffset(0);
    commentDragActiveReel.current = null;
    window.removeEventListener("pointermove", handleCommentDragMove);
    window.removeEventListener("pointerup", handleCommentDragEnd);
  }, [handleCommentDragMove, setShowComments]);

  const handleCommentDragStart = useCallback(
    (e, reelId) => {
      if (showComments !== reelId) return;
      commentDragActiveReel.current = reelId;
      commentDragStartY.current =
        e.clientY ?? (e.touches && e.touches[0] && e.touches[0].clientY) ?? 0;
      commentDragOffsetRef.current = 0;
      setCommentDragOffset(0);
      window.addEventListener("pointermove", handleCommentDragMove, {
        passive: true,
      });
      window.addEventListener("pointerup", handleCommentDragEnd);
      if (e.target.setPointerCapture) {
        e.target.setPointerCapture(e.pointerId);
      }
    },
    [handleCommentDragEnd, handleCommentDragMove, showComments]
  );

  useEffect(() => {
    return () => {
      if (shareToastTimeout.current) clearTimeout(shareToastTimeout.current);
      if (shareToastDelayTimeout.current) clearTimeout(shareToastDelayTimeout.current);
      if (shareToastCleanupTimeout.current) clearTimeout(shareToastCleanupTimeout.current);
    };
  }, []);

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

  // Load selected event from localStorage if not provided via props
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

  // Fetch friends list (users) used for share
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

  const showShareToast = (message) => {
    if (shareToastTimeout.current) clearTimeout(shareToastTimeout.current);
    if (shareToastDelayTimeout.current) clearTimeout(shareToastDelayTimeout.current);
    if (shareToastCleanupTimeout.current) clearTimeout(shareToastCleanupTimeout.current);

    setShareToastVisible(false);
    setShareToastMessage(message);

    shareToastDelayTimeout.current = setTimeout(() => {
      setShareToastVisible(true);

      shareToastTimeout.current = setTimeout(() => {
        setShareToastVisible(false);
        shareToastCleanupTimeout.current = setTimeout(
          () => setShareToastMessage(""),
          260
        );
      }, 1500);
    }, 500);
  };

  const handleShareDragMove = useCallback((e) => {
    const currentY =
      e.clientY ?? (e.touches && e.touches[0] && e.touches[0].clientY) ?? 0;
    const delta = currentY - shareDragStartY.current;
    const clamped = Math.max(0, delta);
    shareDragOffsetRef.current = clamped;
    setShareDragOffset(clamped);
  }, []);

  const handleShareDragEnd = useCallback(() => {
    const shouldClose = shareDragOffsetRef.current > 90;
    if (shouldClose) {
      setShareReel(null);
      setSelectedFriendIds([]);
      setShareSearch("");
    }
    shareDragOffsetRef.current = 0;
    setShareDragOffset(0);
    window.removeEventListener("pointermove", handleShareDragMove);
    window.removeEventListener("pointerup", handleShareDragEnd);
  }, [handleShareDragMove]);

  const handleShareDragStart = useCallback(
    (e) => {
      if (!shareReel) return;
      shareDragStartY.current =
        e.clientY ?? (e.touches && e.touches[0] && e.touches[0].clientY) ?? 0;
      shareDragOffsetRef.current = 0;
      setShareDragOffset(0);
      window.addEventListener("pointermove", handleShareDragMove, {
        passive: true,
      });
      window.addEventListener("pointerup", handleShareDragEnd);
      if (e.target.setPointerCapture) {
        e.target.setPointerCapture(e.pointerId);
      }
    },
    [handleShareDragEnd, handleShareDragMove, shareReel]
  );

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handleCommentDragMove);
      window.removeEventListener("pointerup", handleCommentDragEnd);
      window.removeEventListener("pointermove", handleShareDragMove);
      window.removeEventListener("pointerup", handleShareDragEnd);
    };
  }, [handleCommentDragEnd, handleCommentDragMove, handleShareDragEnd, handleShareDragMove]);

  // SHARE: send reel to selected friends
  const handleSendReel = async () => {
    const user = auth.currentUser;
    if (!user) return showShareToast("Login required");
    if (!shareReel) return;
    if (selectedFriendIds.length === 0) {
      setShareReel(null);
      setSelectedFriendIds([]);
      setShareSearch("");
      return;
    }

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
      showShareToast("Sent");
    } catch (e) {
      console.error("Send reel error:", e);
      setShareSending(false);
      showShareToast("Failed to send");
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

  const shouldRenderToast = shareToastMessage || shareToastVisible;

  return (
    <div className="reels-page">
      {shouldRenderToast && (
        <div className={`share-toast ${shareToastVisible ? "show" : ""}`}>
          {shareToastMessage}
        </div>
      )}
      <header className="reels-header">
        <div className="reels-header-left">
          <button onClick={() => navigate(-1)} className="icon-btn">
            Back
          </button>
          <div className="reels-title-wrapper">
            <span className="reels-title-label">Event Reels</span>
            <span className="reels-event-title">
              {currentEvent
                ? currentEvent.title ||
                  currentEvent.description ||
                  `Event ${currentEvent.id}`
                : "Choose an event"}
            </span>
          </div>
        </div>

        {!eventId && (
          <div className="event-selector-wrapper">
            <select
              value={selectedEventId || ""}
              onChange={(e) => {
                const newId = e.target.value;
                setSelectedEventId(newId);
                localStorage.setItem("selectedEventForReels", newId);
              }}
              className="event-select"
            >
              <option value="">Choose an event...</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title || ev.description || `Event ${ev.id}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>       <main className="reels-main">         <div className="reels-backdrop" />

        <div className="reels-content">
          <div
            ref={reelFeedRef}
            className="reels-feed"
          >             {reels.length === 0 && selectedEventId && (
              <div className="reels-empty">
                <div className="reels-empty-badge">
                  No reels yet
                </div>
                <p className="reels-empty-title">Be the first to add a reel.</p>
                <p className="reels-empty-subtitle">Tap the orange "+" button in the bottom-right corner.</p>
              </div>
            )}             {reels.map((reel, index) => {
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
                  className={`reel-section ${index === 0 ? "first" : ""}`}
                >
                  <div
                    className={`reel-card ${isActive ? "active" : "inactive"}`}
                  >                     <video
                      ref={(el) => {
                        if (el) reelVideoRefs.current[reel.id] = el;
                      }}
                      src={reel.videoUrl}
                      className={`reel-video ${
                        isActive ? "active" : "inactive"
                      }`}
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
                    <div className="reel-gradient" />
                    <div className="reel-creator">
                      <img
                        src={reel.profilePicUrl || defaultProfile}
                        alt="avatar"
                        className="reel-avatar"
                      />
                      <div>
                        <div className="reel-creator-name">
                          {reel.displayName}
                        </div>
                        <div className="reel-creator-date">
                          {reel.created?.toDate
                            ? reel.created.toDate().toLocaleDateString()
                            : ""}
                        </div>
                      </div>
                    </div>

                    <div className="reel-actions">
                      <button
                        onClick={() => handleLike(reel.id, reel.likedBy)}
                        className={`reel-action-btn like ${
                          isLiked ? "liked" : ""
                        }`}
                      >
                        <span className="reel-action-icon">
                          <HeartIcon filled={isLiked} />
                        </span>
                        <span className="reel-action-count">
                          {reel.likes || 0}
                        </span>
                      </button>

                      <button
                        onClick={() =>
                          setShowComments(
                            showComments === reel.id ? null : reel.id
                          )
                        }
                        className="reel-action-btn comment"
                      >
                        <span className="reel-action-icon">
                          <img
                            src="/img/Comment_Icon.svg"
                            alt="Comments"
                            className="reel-action-svg"
                          />
                        </span>
                        <span className="reel-action-count">
                          {comments[reel.id]?.length || 0}
                        </span>
                      </button>

                      <button
                        onClick={() => {
                          setShareReel(reel);
                          setSelectedFriendIds([]);
                          setShareSearch("");
                        }}
                        className="reel-action-btn share"
                      >
                        <span className="reel-action-icon">
                          <ShareIcon />
                        </span>
                        <span className="reel-action-count">Share</span>
                      </button>
                    </div>

                    {showComments === reel.id && (
                      <div
                        className="comments-sheet"
                        style={{
                          transform:
                            commentDragOffset > 0 ? `translateY(${commentDragOffset}px)` : "translateY(0)",
                          transition:
                            commentDragOffset > 0 ? "none" : "transform 180ms ease",
                        }}
                      >
                        <div
                          className="comments-top-region"
                          onPointerDown={(e) => handleCommentDragStart(e, reel.id)}
                          role="presentation"
                        >
                          <div
                            className="comments-drag-handle"
                            role="button"
                            aria-label="Close comments"
                          />
                          <div className="comments-header">
                            <h3 className="comments-title">Comments</h3>
                           
                          </div>
                        </div>

                        <div className="comments-list">
                          {comments[reel.id] &&
                          comments[reel.id].length > 0 ? (
                            comments[reel.id].map((c) => (
                              <div
                                key={c.id}
                                className="comment-item"
                              >
                                <img
                                  src={c.profilePicUrl || defaultProfile}
                                  alt="avatar"
                                  className="comment-avatar"
                                />
                                <div className="comment-body">
                                  <div className="comment-meta">
                                    <span className="comment-name">
                                      {c.displayName}
                                    </span>
                                    <span className="comment-time">
                                      {c.created?.toDate
                                        ? timeAgo(c.created.toDate())
                                        : ""}
                                    </span>
                                  </div>
                                  <p className="comment-text">
                                    {c.text}
                                  </p>
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="comments-empty">
                              No comments yet. Be the first!
                            </p>
                          )}
                        </div>

                        <div className="comment-input-row">
                          <input
                            type="text"
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder="Add a comment..."
                            className="comment-input"
                            onKeyDown={(e) =>
                              e.key === "Enter" && handleComment(reel.id)
                            }
                          />
                          <button
                            onClick={() => handleComment(reel.id)}
                            className="comment-post-btn"
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
        </div>         {selectedEventId && (
          <button
            onClick={() => setShowRecorder(true)}
            className="add-reel-btn"
          >
            +
          </button>
        )}
      </main>       {showRecorder && (
        <div className="reel-modal-overlay">
          <div className="reel-modal">
            <div className="reel-modal-header">
              <div>
                <h2 className="reel-modal-title">Add a Reel</h2>
                <p className="reel-modal-subtitle">
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
                className="icon-btn icon-btn-muted"
              >
                X
              </button>
            </div>

            <div className="reel-preview">
              <video
                ref={videoRef}
                className="reel-preview-video"
                controls={!recording}
              />
            </div>

            <div className="reel-controls">
              <input
                type="file"
                accept="video/*"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden-file-input"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="file-btn"
              >
                Choose video file
              </button>

              <div className="record-row">
                {!recording ? (
                  <button
                    onClick={startRecording}
                    className="record-btn"
                  >
                    Start recording
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="stop-btn"
                  >
                    Stop
                  </button>
                )}
              </div>

              {(videoBlob || selectedFile) && (
                <button
                  onClick={uploadReel}
                  disabled={uploading}
                  className={`upload-btn ${uploading ? "disabled" : ""}`}
                >
                  {uploading ? "Uploading..." : "Upload reel"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {shareReel && (
        <div
          className="share-sheet"
          style={{
            transform: shareDragOffset > 0 ? `translateY(${shareDragOffset}px)` : "translateY(0)",
            transition: shareDragOffset > 0 ? "none" : "transform 180ms ease",
          }}
        >
          <div
            className="share-sheet-top"
            onPointerDown={(e) => handleShareDragStart(e)}
            role="presentation"
          >
            <div className="comments-drag-handle" />
            <div className="share-sheet-header">
              <h3 className="comments-title">Share reel</h3>
              <button
                onClick={() => {
                  setShareReel(null);
                  setSelectedFriendIds([]);
                  setShareSearch("");
                }}
                className="icon-btn icon-btn-muted"
              >
                X
              </button>
            </div>
          </div>

          <div className="share-preview">
            <div className="share-preview-video-wrapper">
              <video
                src={shareReel.videoUrl}
                className="share-preview-video"
                muted
                autoPlay
                loop
                playsInline
              />
            </div>
            <div className="share-preview-copy">
              <p className="share-preview-title">Send this reel to your friends.</p>
              <p className="share-preview-subtitle">Friends will receive it in their inbox.</p>
            </div>
          </div>

          <div className="share-search-wrapper">
            <input
              type="text"
              placeholder="Search friends..."
              value={shareSearch}
              onChange={(e) => setShareSearch(e.target.value)}
              className="share-search-input"
            />
          </div>

          <div className="share-friend-list">
            {friendsLoading ? (
              <p className="share-friend-status">Loading friends...</p>
            ) : filteredFriends.length === 0 ? (
              <p className="share-friend-status">No friends found.</p>
            ) : (
              filteredFriends.map((f) => {
                const isSelected = selectedFriendIds.includes(f.id);
                const displayName = f.username || f.displayName || f.email || "User";

                return (
                  <button
                    key={f.id}
                    onClick={() => toggleFriendSelect(f.id)}
                    className={`friend-item ${isSelected ? "selected" : ""}`}
                  >
                    <div className="friend-item-content">
                      <img
                        src={f.profilePicUrl || defaultProfile}
                        alt="avatar"
                        className="friend-avatar"
                      />
                      <span className="friend-name">{displayName}</span>
                    </div>
                    <div
                      className={`friend-check ${isSelected ? "selected" : ""}`}
                    >
                      {isSelected && "\u2713"}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <button
            onClick={handleSendReel}
            disabled={shareSending}
            className={`share-send-btn ${
              selectedFriendIds.length === 0 || shareSending ? "disabled" : ""
            }`}
          >
            {shareSending
              ? "Sending..."
              : selectedFriendIds.length === 0
              ? "Choose at least one friend"
              : `Send to ${selectedFriendIds.length} friend${
                  selectedFriendIds.length > 1 ? "s" : ""
                }`}
          </button>
        </div>
      )}
    </div>
  );
}

export default EventReelsSection;












