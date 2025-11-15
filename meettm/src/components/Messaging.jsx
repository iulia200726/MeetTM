import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getAuth } from "firebase/auth";
import { getFirestore, collection, query, where, onSnapshot, addDoc, orderBy, serverTimestamp, doc, getDoc } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../firebase/config";
import defaultProfile from "./img/default-profile.svg";
import "./Messaging.css";

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

    const fetchFriendData = async () => {
      const friendDoc = await getDoc(doc(db, "users", friendId));
      if (friendDoc.exists()) {
        setFriendData(friendDoc.data());
      }
    };
    fetchFriendData();

    const qSent = query(
      collection(db, "users", user.uid, "privateMessages"),
      where("toUid", "==", friendId),
      orderBy("created", "asc")
    );

    const qReceived = query(
      collection(db, "users", user.uid, "privateMessages"),
      where("fromUid", "==", friendId),
      orderBy("created", "asc")
    );

    const qReels = query(
      collection(db, "users", user.uid, "inboxReels"),
      where("fromUid", "==", friendId),
      orderBy("created", "asc")
    );

    const unsub1 = onSnapshot(qSent, (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data(), direction: "sent" }));
      setMessages((prev) => {
        const others = prev.filter((m) => m.direction !== "sent");
        return [...others, ...msgs].sort((a, b) => (a.created?.toMillis?.() || 0) - (b.created?.toMillis?.() || 0));
      });
    });

    const unsub2 = onSnapshot(qReceived, (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data(), direction: "received" }));
      setMessages((prev) => {
        const others = prev.filter((m) => m.direction !== "received");
        return [...others, ...msgs].sort((a, b) => (a.created?.toMillis?.() || 0) - (b.created?.toMillis?.() || 0));
      });
    });

    const unsub3 = onSnapshot(qReels, (snap) => {
      const reelMsgs = snap.docs.map((d) => ({ id: d.id, ...d.data(), direction: "received", type: "reel" }));
      setMessages((prev) => {
        const others = prev.filter((m) => m.type !== "reel" || m.direction !== "received");
        return [...others, ...reelMsgs].sort((a, b) => (a.created?.toMillis?.() || 0) - (b.created?.toMillis?.() || 0));
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
    }
  };

  const peerName = friendData?.displayName || friendData?.email || "Conversation";
  const peerAvatar = friendData?.photoURL || defaultProfile;

  return (
    <div className="messaging-page">
      <div className="messaging-card">
        <div className="msg-header">
          <button
            className="icon-btn ghost"
            onClick={() => navigate(-1)}
            aria-label="Back"
          >
            ←
          </button>
          <div className="msg-peer">
            <div className="avatar-ring">
              <img src={peerAvatar} alt="avatar" className="avatar-img" />
            </div>
            <div className="peer-meta">
              <div className="peer-name">{peerName}</div>
              <div className="peer-sub">Direct messages</div>
            </div>
          </div>
          <button className="ghost-btn small" onClick={() => navigate("/notifications")}>Notifications</button>
        </div>

        <div className="msg-feed">
          {messages.length === 0 ? (
            <div className="msg-empty">
              <p className="empty-title">No messages yet</p>
              <p className="empty-subtitle">Start the conversation and keep it going.</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`msg-row ${msg.direction === "sent" ? "sent" : "received"}`}
              >
                <div
                  className={`msg-bubble ${msg.direction === "sent" ? "sent" : "received"} ${msg.type === "reel" ? "reel" : ""}`}
                  onClick={() => {
                    if (msg.type === "reel") navigate("/reels");
                  }}
                  role={msg.type === "reel" ? "button" : undefined}
                >
                  {msg.type === "reel" ? (
                    <div className="reel-share">
                      <div className="reel-thumb">
                        {msg.videoUrl ? (
                          <video src={msg.videoUrl} muted autoPlay loop playsInline />
                        ) : (
                          <div className="reel-placeholder">Reel</div>
                        )}
                      </div>
                      <div className="reel-details">
                        <div className="reel-title">Shared a reel</div>
                        <div className="reel-sub">Tap to view</div>
                      </div>
                    </div>
                  ) : (
                    <div className="bubble-text">{msg.text}</div>
                  )}
                  <div className="bubble-meta">{timeAgo(msg.created?.toDate?.())}</div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="msg-input-bar">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Type a message..."
            className="msg-input"
          />
          <button onClick={sendMessage} className="primary-btn">Send</button>
        </div>
      </div>
    </div>
  );
}

export default Messaging;
