import React, { useState, useEffect, useRef } from "react";
import { getFirestore, collection, addDoc, getDocs, onSnapshot, query, orderBy, doc, updateDoc, arrayUnion, arrayRemove, serverTimestamp, deleteDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../firebase/config.jsx";
import { getAuth } from "firebase/auth";
import defaultProfile from "./img/default-profile.svg";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth();

function EventReelsSection({ eventId }) {
  const [reels, setReels] = useState([]);
  const [showRecorder, setShowRecorder] = useState(false);
  const [recording, setRecording] = useState(false);
  const [videoBlob, setVideoBlob] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(eventId);
  const [events, setEvents] = useState([]);
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
      const savedEventId = localStorage.getItem('selectedEventForReels');
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
      setReels(
        snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
      );
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
      videoRef.current.srcObject = stream;
      videoRef.current.play();

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
        videoRef.current.srcObject = null;
        videoRef.current.src = url;
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
    if (file && file.type.startsWith('video/')) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      videoRef.current.src = url;
      videoRef.current.load();
    } else {
      alert("Please select a valid video file.");
    }
  };

  // Upload reel to Firebase
  const uploadReel = async () => {
    const blobToUpload = videoBlob || selectedFile;
    if (!blobToUpload) return;
    setUploading(true);
    const user = auth.currentUser;
    if (!user) return alert("You must be logged in!");

    try {
      // Get user profile data
      let username = user.displayName || user.email;
      let profilePicUrl = user.photoURL || defaultProfile;
      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDocs(collection(db, "users")).then((snap) =>
          snap.docs.find((d) => d.id === user.uid)
        );
        if (userSnap) {
          const data = userSnap.data();
          if (data.username) username = data.username;
          if (data.profilePicUrl) profilePicUrl = data.profilePicUrl;
        }
      } catch {}

      // Upload video to Storage
      const fileExtension = selectedFile ? selectedFile.name.split('.').pop() : 'webm';
      const videoRef = ref(storage, `reels/${selectedEventId}/${Date.now()}.${fileExtension}`);
      await uploadBytes(videoRef, blobToUpload);
      const videoUrl = await getDownloadURL(videoRef);

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

    if (!isLiked) {
      await updateDoc(reelRef, {
        likes: (reels.find(r => r.id === reelId)?.likes || 0) + 1,
        likedBy: arrayUnion(user.uid),
      });
    } else {
      await updateDoc(reelRef, {
        likes: Math.max(0, (reels.find(r => r.id === reelId)?.likes || 1) - 1),
        likedBy: arrayRemove(user.uid),
      });
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "0 auto", padding: "1rem" }}>
      {/* Event Selection */}
      {!eventId && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
            Select Event for Reels:
          </label>
          <select
            value={selectedEventId || ""}
            onChange={(e) => {
              const newEventId = e.target.value;
              setSelectedEventId(newEventId);
              localStorage.setItem('selectedEventForReels', newEventId);
            }}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 8,
              border: "1px solid #ccc",
              fontSize: 16,
            }}
          >
            <option value="">Choose an event...</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title || event.description || `Event ${event.id}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Add Reel Button */}
      {selectedEventId && (
        <button
          onClick={() => setShowRecorder(true)}
          style={{
            background: "#1976d2",
            color: "#fff",
            border: "none",
            borderRadius: 20,
            padding: "10px 20px",
            fontWeight: 600,
            cursor: "pointer",
            marginBottom: 20,
            width: "100%",
          }}
        >
          Add Reel
        </button>
      )}

      {/* Recorder Modal */}
      {showRecorder && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: 20,
              borderRadius: 12,
              maxWidth: 400,
              width: "90%",
            }}
          >
            <video
              ref={videoRef}
              style={{
                width: "100%",
                height: 300,
                borderRadius: 8,
                background: "#000",
              }}
              controls={!recording}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
              {/* File Upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
              <button
                onClick={() => fileInputRef.current.click()}
                style={{
                  background: "#FF9800",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: 10,
                  cursor: "pointer",
                }}
              >
                📁 Choose Video File
              </button>

              {/* Recording Controls */}
              <div style={{ display: "flex", gap: 10 }}>
                {!recording ? (
                  <button
                    onClick={startRecording}
                    style={{
                      flex: 1,
                      background: "#4CAF50",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      padding: 10,
                      cursor: "pointer",
                    }}
                  >
                    🎥 Start Recording
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    style={{
                      flex: 1,
                      background: "#f44336",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      padding: 10,
                      cursor: "pointer",
                    }}
                  >
                    ⏹️ Stop Recording
                  </button>
                )}
              </div>

              {/* Upload Button */}
              {(videoBlob || selectedFile) && (
                <button
                  onClick={uploadReel}
                  disabled={uploading}
                  style={{
                    background: uploading ? "#ccc" : "#1976d2",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: 10,
                    cursor: uploading ? "not-allowed" : "pointer",
                  }}
                >
                  {uploading ? "⏳ Uploading..." : "📤 Upload Reel"}
                </button>
              )}

              {/* Cancel Button */}
              <button
                onClick={() => {
                  setShowRecorder(false);
                  setVideoBlob(null);
                  setSelectedFile(null);
                  if (streamRef.current) {
                    streamRef.current.getTracks().forEach((track) => track.stop());
                  }
                }}
                style={{
                  background: "#ccc",
                  color: "#000",
                  border: "none",
                  borderRadius: 8,
                  padding: 10,
                  cursor: "pointer",
                }}
              >
                ❌ Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reels Feed */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {reels.map((reel) => (
          <div
            key={reel.id}
            style={{
              background: "#fff",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", padding: 12 }}>
              <img
                src={reel.profilePicUrl || defaultProfile}
                alt="avatar"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  objectFit: "cover",
                  marginRight: 12,
                }}
              />
              <div>
                <div style={{ fontWeight: 600 }}>{reel.displayName}</div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  {reel.created?.toDate
                    ? reel.created.toDate().toLocaleDateString()
                    : ""}
                </div>
              </div>
            </div>

            {/* Video */}
            <video
              src={reel.videoUrl}
              style={{ width: "100%", height: 400, objectFit: "cover" }}
              controls
              preload="metadata"
            />

            {/* Actions */}
            <div style={{ padding: 12 }}>
              <button
                onClick={() => handleLike(reel.id, reel.likedBy)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 18,
                  marginRight: 20,
                }}
              >
                ❤️ {reel.likes || 0}
              </button>
              <span style={{ fontSize: 18 }}>💬</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default EventReelsSection;
