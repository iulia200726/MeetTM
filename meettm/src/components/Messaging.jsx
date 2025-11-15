import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getAuth } from "firebase/auth";
import { getFirestore, collection, query, where, onSnapshot, addDoc, orderBy, serverTimestamp, doc, getDoc } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../firebase/config";
import defaultProfile from "./img/default-profile.svg";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function timeAgo(date) {
  if (!date) return "";
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}

function Messaging() {
  const { friendId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [friendData, setFriendData] = useState(null);
  const [newMessage, setNewMessage] = useState("");
  const user = getAuth().currentUser;
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!user || !friendId) return;

    // Fetch friend data
    const fetchFriendData = async () => {
      const friendDoc = await getDoc(doc(db, "users", friendId));
      if (friendDoc.exists()) {
        setFriendData(friendDoc.data());
      }
    };
    fetchFriendData();

    // Fetch messages between user and friend
    const q = query(
      collection(db, "users", user.uid, "privateMessages"),
      where("toUid", "==", friendId),
      orderBy("created", "asc")
    );
    const q2 = query(
      collection(db, "users", user.uid, "privateMessages"),
      where("fromUid", "==", friendId),
      orderBy("created", "asc")
    );

    // Fetch reel shares from this friend
    const qReels = query(
      collection(db, "users", user.uid, "inboxReels"),
      where("fromUid", "==", friendId),
      orderBy("created", "asc")
    );

    const unsub1 = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), direction: 'sent' }));
      setMessages(prev => {
        const others = prev.filter(m => m.direction !== 'sent');
        return [...others, ...msgs].sort((a, b) => a.created?.toMillis?.() - b.created?.toMillis?.());
      });
    });

    const unsub2 = onSnapshot(q2, (snap) => {
      const msgs = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), direction: 'received' }));
      setMessages(prev => {
        const others = prev.filter(m => m.direction !== 'received');
        return [...others, ...msgs].sort((a, b) => a.created?.toMillis?.() - b.created?.toMillis?.());
      });
    });

    // Fetch reel shares from this friend
    const unsub3 = onSnapshot(qReels, (snap) => {
      const reelMsgs = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), direction: 'received', type: 'reel' }));
      setMessages(prev => {
        const others = prev.filter(m => m.type !== 'reel' || m.direction !== 'received');
        return [...others, ...reelMsgs].sort((a, b) => a.created?.toMillis?.() - b.created?.toMillis?.());
      });
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [user, friendId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !friendData) return;

    try {
      // Send to friend's collection
      await addDoc(collection(db, "users", friendId, "privateMessages"), {
        fromUid: user.uid,
        fromDisplayName: user.displayName || user.email,
        fromProfilePicUrl: user.photoURL || defaultProfile,
        toUid: friendId,
        toDisplayName: friendData.displayName || friendData.email,
        toProfilePicUrl: friendData.photoURL || defaultProfile,
        text: newMessage,
        created: serverTimestamp(),
      });

      // Send to own collection
      await addDoc(collection(db, "users", user.uid, "privateMessages"), {
        fromUid: user.uid,
        fromDisplayName: user.displayName || user.email,
        fromProfilePicUrl: user.photoURL || defaultProfile,
        toUid: friendId,
        toDisplayName: friendData.displayName || friendData.email,
        toProfilePicUrl: friendData.photoURL || defaultProfile,
        text: newMessage,
        created: serverTimestamp(),
      });

      setNewMessage("");
    } catch (e) {
      console.error("Send message error:", e);
      alert("Failed to send message.");
    }
  };

  if (!friendData) {
    return <div style={{ textAlign: "center", padding: "2rem" }}>Loading...</div>;
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "2rem 0", background: "#fff", borderRadius: 16, minHeight: "80vh" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "1rem", borderBottom: "1px solid #eee" }}>
        <button
          onClick={() => navigate("/notifications")}
          style={{
            background: "transparent",
            border: "none",
            fontSize: 24,
            cursor: "pointer",
            color: "#888",
          }}
        >
          ←
        </button>
        <img
          src={friendData.photoURL || defaultProfile}
          alt="avatar"
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            objectFit: "cover",
            border: "2px solid #eee",
          }}
        />
        <div>
          <div style={{ fontWeight: 600, fontSize: 18 }}>{friendData.displayName || friendData.email}</div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ padding: "1rem", maxHeight: "60vh", overflowY: "auto" }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: "center", color: "#888", padding: "2rem" }}>
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: "flex",
                justifyContent: msg.direction === 'sent' ? 'flex-end' : 'flex-start',
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  maxWidth: "70%",
                  padding: "10px 14px",
                  borderRadius: 18,
                  background: msg.direction === 'sent' ? "#1976d2" : "#f1f1f1",
                  color: msg.direction === 'sent' ? "#fff" : "#222",
                  fontSize: 14,
                  cursor: msg.type === 'reel' ? 'pointer' : 'default',
                }}
                onClick={() => {
                  if (msg.type === 'reel') {
                    navigate('/reels');
                  }
                }}
              >
                {msg.type === 'reel' ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <video
                      src={msg.videoUrl}
                      style={{
                        width: 60,
                        height: 80,
                        objectFit: "cover",
                        borderRadius: 8,
                        border: "2px solid rgba(255,255,255,0.3)",
                      }}
                      muted
                      autoPlay
                      loop
                      playsInline
                    />
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Shared a reel</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Tap to view</div>
                    </div>
                  </div>
                ) : (
                  msg.text
                )}
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                  {timeAgo(msg.created?.toDate?.())}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "1rem", borderTop: "1px solid #eee", display: "flex", gap: 10 }}>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type a message..."
          style={{
            flex: 1,
            border: "1px solid #ddd",
            borderRadius: 20,
            padding: "10px 16px",
            fontSize: 14,
            outline: "none",
          }}
        />
        <button
          onClick={sendMessage}
          style={{
            background: "#1976d2",
            color: "#fff",
            border: "none",
            borderRadius: 20,
            padding: "10px 20px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default Messaging;
