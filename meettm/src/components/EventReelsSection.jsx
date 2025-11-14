import React, { useState, useEffect, useRef } from "react";
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
  const videoRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  // Fetch events for selection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "issues"), (snap) => {
      setEvents(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  // Load selected event from localStorage if no eventId provided
  useEffect(() => {
    if (!eventId) {
      const savedEventId = localStorage.getItem("selectedEventForReels");
      if (savedEventId) {
        setSelectedEventId(savedEventId);
      }
    }
  }, [eventId]);

  // Fetch reels in real-time
  useEffect(() => {
    if (!selectedEventId) return;

    const q = query(
      collection(db, "issues", selectedEventId, "reels"),
      orderBy("created", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const reelData = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setReels(reelData);

      // Fetch comments for each reel
      reelData.forEach((reel) => {
        onSnapshot(
          query(
            collection(
              db,
              "issues",
              selectedEventId,
              "reels",
              reel.id,
              "comments"
            ),
            orderBy("created", "desc")
          ),
          (commentsSnap) => {
            setComments((prev) => ({
              ...prev,
              [reel.id]: commentsSnap.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
              })),
            }));
          }
        );
      });
    });

    return () => unsub();
  }, [selectedEventId]);

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

  // Stop recording
  const stopRecording = () => {
    if (recorderRef.current && recording) {
      recorderRef.current.stop();
      setRecording(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    }
  };

  // Handle file selection
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

  // Upload reel to Firebase
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
      // Get user profile data
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
        // fallback la displayName/email/photoURL
      }

      // Upload video to Storage
      const fileExtension = selectedFile
        ? selectedFile.name.split(".").pop()
        : "webm";
      const videoRefStorage = ref(
        storage,
        `reels/${selectedEventId}/${Date.now()}.${fileExtension}`
      );
      await uploadBytes(videoRefStorage, blobToUpload);
      const videoUrl = await getDownloadURL(videoRefStorage);

      // Save to Firestore
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

  // Handle like
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

  // Handle comment
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
        // fallback la displayName/email/photoURL
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

  const currentEvent = events.find((e) => e.id === selectedEventId);

  return (
    <div
      style={{
        height: "100vh",
        overflow: "hidden",
        position: "relative",
        background:
          "radial-gradient(circle at top, #1f2933 0, #020617 35%, #000 100%)",
        color: "#fff",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Top bar with event selector + title */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 70,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          zIndex: 1000,
          backdropFilter: "blur(16px)",
          background: "linear-gradient(90deg, rgba(15,23,42,0.92), rgba(2,6,23,0.92))",
          borderBottom: "1px solid rgba(148,163,184,0.25)",
        }}
      >
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          style={{
            background: "none",
            border: "none",
            color: "#e5e7eb",
            fontSize: 20,
            cursor: "pointer",
            marginRight: 12,
            padding: "8px",
            borderRadius: 8,
            transition: "background 0.2s ease",
          }}
          onMouseEnter={(e) => (e.target.style.background = "rgba(148,163,184,0.2)")}
          onMouseLeave={(e) => (e.target.style.background = "none")}
        >
          ←
        </button>

        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontSize: 11,
              letterSpacing: 1.2,
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

        {!eventId && (
          <div
            style={{
              flex: 1,
              maxWidth: 260,
              marginLeft: 12,
            }}
          >
            <select
              value={selectedEventId || ""}
              onChange={(e) => {
                const newEventId = e.target.value;
                setSelectedEventId(newEventId);
                localStorage.setItem("selectedEventForReels", newEventId);
              }}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid rgba(148,163,184,0.6)",
                fontSize: 13,
                background: "rgba(15,23,42,0.9)",
                color: "#e5e7eb",
                outline: "none",
                appearance: "none",
              }}
            >
              <option value="">Choose an event...</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title ||
                    event.description ||
                    `Event ${event.id}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Add Reel Floating Button */}
      {selectedEventId && (
        <button
          onClick={() => setShowRecorder(true)}
          style={{
            position: "fixed",
            bottom: 24,
            right: 20,
            width: 60,
            height: 60,
            borderRadius: "999px",
            background:
              "radial-gradient(circle at 30% 0, #f97316 0, #ea580c 30%, #b91c1c 70%, #7f1d1d 100%)",
            border: "none",
            color: "#fff",
            fontSize: 30,
            fontWeight: 500,
            cursor: "pointer",
            zIndex: 1000,
            boxShadow:
              "0 10px 30px rgba(0,0,0,0.4), 0 0 0 2px rgba(248,250,252,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = "scale(0.95)";
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          +
        </button>
      )}

      {/* Reels Feed */}
      <div
        style={{
          height: "100vh",
          paddingTop: 70,
          overflowY: "scroll",
          scrollSnapType: "y mandatory",
          scrollBehavior: "smooth",
        }}
      >
        {reels.length === 0 && selectedEventId && (
          <div
            style={{
              height: "calc(100vh - 70px)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              opacity: 0.8,
              padding: "0 24px",
            }}
          >
            <div
              style={{
                borderRadius: 999,
                padding: "8px 16px",
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: 1.4,
                background: "rgba(15,23,42,0.9)",
                border: "1px solid rgba(148,163,184,0.4)",
                marginBottom: 16,
              }}
            >
              No reels yet
            </div>
            <p style={{ fontSize: 16, marginBottom: 8 }}>
              Be the first to add a reel for this event.
            </p>
            <p style={{ fontSize: 14, color: "#9ca3af" }}>
              Tap the orange “+” button to upload a video or record one
              directly.
            </p>
          </div>
        )}

        {reels.map((reel) => (
          <div
            key={reel.id}
            style={{
              height: "calc(100vh - 70px)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              scrollSnapAlign: "start",
              position: "relative",
              padding: "16px 0",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                maxWidth: 420,
                height: "100%",
                borderRadius: 24,
                overflow: "hidden",
                boxShadow:
                  "0 20px 50px rgba(0,0,0,0.7), 0 0 0 1px rgba(148,163,184,0.4)",
                background: "#020617",
              }}
            >
              {/* Video */}
              <video
                src={reel.videoUrl}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
                controls={false}
                autoPlay
                muted
                loop
                playsInline
                onLoadedData={(e) => {
                  const target = e.target;
                  const observer = new IntersectionObserver(
                    (entries) => {
                      entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                          target.play().catch(() => {});
                        } else {
                          target.pause();
                        }
                      });
                    },
                    { threshold: 0.5 }
                  );
                  observer.observe(target);
                }}
              />

              {/* Gradient overlay bottom */}
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: "45%",
                  background:
                    "linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0.35), transparent)",
                  pointerEvents: "none",
                }}
              />

              {/* Creator info + date */}
              <div
                style={{
                  position: "absolute",
                  bottom: 108,
                  left: 16,
                  right: 80,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
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
                    src={reel.profilePicUrl || defaultProfile}
                    alt="avatar"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "999px",
                      objectFit: "cover",
                      border: "2px solid rgba(248,250,252,0.9)",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.7)",
                    }}
                  />
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 15,
                        textShadow: "0 2px 6px rgba(0,0,0,0.8)",
                      }}
                    >
                      {reel.displayName}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        opacity: 0.8,
                        textShadow: "0 2px 6px rgba(0,0,0,0.8)",
                      }}
                    >
                      {reel.created?.toDate
                        ? reel.created.toDate().toLocaleDateString()
                        : ""}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons - right side */}
              <div
                style={{
                  position: "absolute",
                  right: 14,
                  bottom: 120,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 18,
                }}
              >
                {/* Like */}
                <button
                  onClick={() => handleLike(reel.id, reel.likedBy)}
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "999px",
                    border: "none",
                    background:
                      "radial-gradient(circle at 30% 10%, #fb7185, #b91c1c)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    boxShadow:
                      "0 8px 20px rgba(0,0,0,0.6), 0 0 0 1px rgba(248,250,252,0.15)",
                    color: "#fff",
                    fontSize: 22,
                    textShadow: "0 2px 8px rgba(0,0,0,0.9)",
                  }}
                >
                  <span style={{ marginBottom: 2 }}>❤️</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
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
                    width: 52,
                    height: 52,
                    borderRadius: "999px",
                    border: "none",
                    background: "rgba(15,23,42,0.85)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    boxShadow:
                      "0 8px 20px rgba(0,0,0,0.6), 0 0 0 1px rgba(148,163,184,0.4)",
                    color: "#fff",
                    fontSize: 22,
                    textShadow: "0 2px 8px rgba(0,0,0,0.9)",
                  }}
                >
                  <span style={{ marginBottom: 2 }}>💬</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    {comments[reel.id]?.length || 0}
                  </span>
                </button>
              </div>

              {/* Comments bottom sheet */}
              {showComments === reel.id && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: "rgba(15,23,42,0.98)",
                    borderRadius: "20px 20px 0 0",
                    padding: 16,
                    maxHeight: "65%",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    zIndex: 1500,
                    boxShadow:
                      "0 -10px 30px rgba(0,0,0,0.7), 0 0 0 1px rgba(148,163,184,0.3)",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 4,
                      borderRadius: 999,
                      background: "rgba(148,163,184,0.6)",
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
                        color: "#f9fafb",
                        margin: 0,
                        fontSize: 15,
                        letterSpacing: 0.4,
                      }}
                    >
                      Comments
                    </h3>
                    <button
                      onClick={() => setShowComments(null)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#9ca3af",
                        fontSize: 22,
                        cursor: "pointer",
                      }}
                    >
                      ×
                    </button>
                  </div>

                  {/* Comments list */}
                  <div
                    style={{
                      flex: 1,
                      overflowY: "auto",
                      paddingRight: 4,
                      marginBottom: 8,
                    }}
                  >
                    {comments[reel.id] && comments[reel.id].length > 0 ? (
                      comments[reel.id].map((comment) => (
                        <div
                          key={comment.id}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            marginBottom: 10,
                            padding: 10,
                            borderRadius: 12,
                            background: "rgba(30,64,175,0.22)",
                            border: "1px solid rgba(129,140,248,0.35)",
                          }}
                        >
                          <img
                            src={comment.profilePicUrl || defaultProfile}
                            alt="avatar"
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: "999px",
                              objectFit: "cover",
                              marginRight: 10,
                              border: "1px solid rgba(248,250,252,0.8)",
                            }}
                          />
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                marginBottom: 3,
                              }}
                            >
                              <span
                                style={{
                                  color: "#e5e7eb",
                                  fontWeight: 600,
                                  fontSize: 13,
                                }}
                              >
                                {comment.displayName}
                              </span>
                              <span
                                style={{
                                  color: "#9ca3af",
                                  fontSize: 11,
                                }}
                              >
                                {comment.created?.toDate
                                  ? timeAgo(comment.created.toDate())
                                  : ""}
                              </span>
                            </div>
                            <p
                              style={{
                                color: "#f9fafb",
                                margin: 0,
                                fontSize: 13,
                                lineHeight: 1.4,
                              }}
                            >
                              {comment.text}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p
                        style={{
                          color: "#9ca3af",
                          fontSize: 13,
                          textAlign: "center",
                          marginTop: 16,
                        }}
                      >
                        No comments yet. Be the first to say something!
                      </p>
                    )}
                  </div>

                  {/* Add comment input */}
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
                      placeholder="Add a comment..."
                      style={{
                        flex: 1,
                        padding: "10px 14px",
                        borderRadius: 999,
                        border: "1px solid rgba(148,163,184,0.7)",
                        background: "rgba(15,23,42,0.95)",
                        color: "#e5e7eb",
                        fontSize: 13,
                        outline: "none",
                      }}
                      onKeyPress={(e) =>
                        e.key === "Enter" && handleComment(reel.id)
                      }
                    />
                    <button
                      onClick={() => handleComment(reel.id)}
                      style={{
                        padding: "10px 16px",
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
          </div>
        ))}
      </div>

      {/* Recorder Modal */}
      {showRecorder && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.95)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "rgba(15,23,42,0.98)",
              borderRadius: 24,
              padding: 18,
              width: "100%",
              maxWidth: 420,
              boxShadow:
                "0 20px 50px rgba(0,0,0,0.9), 0 0 0 1px rgba(148,163,184,0.4)",
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
                  Record live or upload a video from your device.
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
                      .forEach((track) => track.stop());
                  }
                }}
                style={{
                  background: "none",
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
                border: "1px solid rgba(148,163,184,0.4)",
                marginBottom: 14,
              }}
            >
              <video
                ref={videoRef}
                style={{
                  width: "100%",
                  height: 300,
                  background: "#020617",
                  display: "block",
                  objectFit: "cover",
                }}
                controls={!recording}
              />
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {/* File Upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background:
                    "linear-gradient(135deg, #f97316, #e11d48)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 999,
                  padding: "10px 16px",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <span>📁</span> Choose video file
              </button>

              {/* Recording Controls */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginTop: 2,
                }}
              >
                {!recording ? (
                  <button
                    onClick={startRecording}
                    style={{
                      flex: 1,
                      background:
                        "radial-gradient(circle at 20% 0, #4ade80, #16a34a)",
                      color: "#022c22",
                      border: "none",
                      borderRadius: 999,
                      padding: "10px 16px",
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 600,
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
                      color: "#fef2f2",
                      border: "none",
                      borderRadius: 999,
                      padding: "10px 16px",
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 600,
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

              {/* Upload Button */}
              {(videoBlob || selectedFile) && (
                <button
                  onClick={uploadReel}
                  disabled={uploading}
                  style={{
                    marginTop: 2,
                    background: uploading
                      ? "rgba(148,163,184,0.4)"
                      : "linear-gradient(135deg, #2563eb, #4f46e5)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 999,
                    padding: "10px 16px",
                    cursor: uploading ? "not-allowed" : "pointer",
                    fontSize: 14,
                    fontWeight: 600,
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
    </div>
  );
}

export default EventReelsSection;
