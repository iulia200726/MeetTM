import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, query, where, onSnapshot, addDoc, orderBy, serverTimestamp, doc, getDoc, deleteDoc, getDocs } from "firebase/firestore";
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
  const auth = getAuth();
  const [authUser, setAuthUser] = useState(() => getAuth().currentUser);
  const [messages, setMessages] = useState([]);
  const [friendData, setFriendData] = useState(null);
  const [newMessage, setNewMessage] = useState("");
  const [menuOpenFor, setMenuOpenFor] = useState(null);
  const messagesEndRef = useRef(null);
  const pendingMapRef = useRef(new Map());
  const cacheKey = friendId ? `msgs-${authUser?.uid || "anon"}-${friendId}` : null;

  // Keep user in sync on refresh
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => setAuthUser(u));
    return () => unsubAuth();
  }, [auth]);

  useEffect(() => {
    if (!authUser || !friendId) return;

    const fetchFriendData = async () => {
      const friendDoc = await getDoc(doc(db, "users", friendId));
      if (friendDoc.exists()) {
        setFriendData(friendDoc.data());
      }
    };
    fetchFriendData();

    const qSent = query(
      collection(db, "users", authUser.uid, "privateMessages"),
      where("toUid", "==", friendId),
      orderBy("created", "asc")
    );

    const qReceived = query(
      collection(db, "users", authUser.uid, "privateMessages"),
      where("fromUid", "==", friendId),
      orderBy("created", "asc")
    );

    const qReels = query(
      collection(db, "users", authUser.uid, "inboxReels"),
      where("fromUid", "==", friendId),
      orderBy("created", "asc")
    );

    const unsub1 = onSnapshot(qSent, (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data(), direction: "sent" }));
      setMessages((prev) => {
        const map = new Map();
        prev.forEach((m) => map.set(m.id, m));
        msgs.forEach((m) => map.set(m.id, m));
        // drop pending temp if replaced by real id
        pendingMapRef.current.forEach((pending, tempId) => {
          if (pending?.realId && map.has(pending.realId)) {
            map.delete(tempId);
            pendingMapRef.current.delete(tempId);
          }
        });
        return Array.from(map.values()).sort(
          (a, b) => (a.created?.toMillis?.() || a.created?.getTime?.() || 0) - (b.created?.toMillis?.() || b.created?.getTime?.() || 0)
        );
      });
    });

    const unsub2 = onSnapshot(qReceived, (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data(), direction: "received" }));
      setMessages((prev) => {
        const map = new Map();
        prev.forEach((m) => map.set(m.id, m));
        msgs.forEach((m) => map.set(m.id, m));
        return Array.from(map.values()).sort(
          (a, b) => (a.created?.toMillis?.() || a.created?.getTime?.() || 0) - (b.created?.toMillis?.() || b.created?.getTime?.() || 0)
        );
      });
    });

    const unsub3 = onSnapshot(qReels, (snap) => {
      const reelMsgs = snap.docs.map((d) => ({ id: d.id, ...d.data(), direction: "received", type: "reel" }));
      setMessages((prev) => {
        const map = new Map();
        prev.forEach((m) => map.set(m.id, m));
        reelMsgs.forEach((m) => map.set(m.id, m));
        return Array.from(map.values()).sort(
          (a, b) => (a.created?.toMillis?.() || a.created?.getTime?.() || 0) - (b.created?.toMillis?.() || b.created?.getTime?.() || 0)
        );
      });
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [authUser, friendId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load cached messages on first render for this conversation
  useEffect(() => {
    if (!cacheKey) return;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const restored = parsed.map((m) => ({
          ...m,
          created: m.createdMillis ? new Date(m.createdMillis) : m.created,
        }));
        setMessages((prev) => {
          if (prev.length === 0) return restored;
          // merge cached + existing (keep existing to prefer fresher snapshot)
          const map = new Map();
          restored.forEach((m) => map.set(m.id, m));
          prev.forEach((m) => map.set(m.id, m));
          return Array.from(map.values()).sort(
            (a, b) => (a.created?.toMillis?.() || a.created?.getTime?.() || 0) - (b.created?.toMillis?.() || b.created?.getTime?.() || 0)
          );
        });
      } catch {
        /* ignore parse errors */
      }
    }
  }, [cacheKey]);

  // Persist messages locally so refresh keeps the feed until Firestore syncs
  useEffect(() => {
    if (!cacheKey || messages.length === 0) return;
    const toStore = messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      text: m.text,
      type: m.type,
      createdMillis: m.created?.toMillis?.() || m.created?.getTime?.() || null,
    }));
    localStorage.setItem(cacheKey, JSON.stringify(toStore));
  }, [cacheKey, messages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !authUser || !friendData) return;

    const clientId = crypto.randomUUID ? crypto.randomUUID() : `c-${Date.now()}-${Math.random()}`;
    const tempId = `temp-${Date.now()}`;
    const optimistic = {
      id: tempId,
      direction: "sent",
      text: newMessage,
      created: new Date(),
      fromUid: authUser.uid,
      toUid: friendId,
      pending: true,
      clientId,
    };
    // add optimistic message immediately
    setMessages((prev) =>
      [...prev, optimistic].sort(
        (a, b) => (a.created?.toMillis?.() || a.created?.getTime?.() || 0) - (b.created?.toMillis?.() || b.created?.getTime?.() || 0)
      )
    );
    pendingMapRef.current.set(tempId, { realId: null });

    try {
      await addDoc(collection(db, "users", friendId, "privateMessages"), {
        fromUid: authUser.uid,
        fromDisplayName: authUser.displayName || authUser.email,
        fromProfilePicUrl: authUser.photoURL || defaultProfile,
        toUid: friendId,
        toDisplayName: friendData.displayName || friendData.email,
        toProfilePicUrl: friendData.photoURL || defaultProfile,
        text: newMessage,
        created: serverTimestamp(),
        clientId,
      });

      const docRef = await addDoc(collection(db, "users", authUser.uid, "privateMessages"), {
        fromUid: authUser.uid,
        fromDisplayName: authUser.displayName || authUser.email,
        fromProfilePicUrl: authUser.photoURL || defaultProfile,
        toUid: friendId,
        toDisplayName: friendData.displayName || friendData.email,
        toProfilePicUrl: friendData.photoURL || defaultProfile,
        text: newMessage,
        created: serverTimestamp(),
        clientId,
      });

      pendingMapRef.current.set(tempId, { realId: docRef.id });
      // replace optimistic id with real id so snapshots dedupe
      setMessages((prev) => {
        const updated = prev.map((m) => (m.id === tempId ? { ...m, id: docRef.id, pending: false } : m));
        const map = new Map();
        updated.forEach((m) => map.set(m.id, m));
        return Array.from(map.values()).sort(
          (a, b) => (a.created?.toMillis?.() || a.created?.getTime?.() || 0) - (b.created?.toMillis?.() || b.created?.getTime?.() || 0)
        );
      });

      setNewMessage("");
    } catch (e) {
      console.error("Send message error:", e);
      // on failure, remove optimistic
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      pendingMapRef.current.delete(tempId);
    }
  };

  // Delete only for me
  const handleDeleteForMe = async (msg) => {
    if (!authUser) return;
    try {
      await deleteDoc(doc(db, "users", authUser.uid, "privateMessages", msg.id));
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      setMenuOpenFor(null);
    } catch (e) {
      console.error("Delete for me failed:", e);
    }
  };

  // Unsend for everyone (best-effort using clientId)
  const handleUnsend = async (msg) => {
    if (!authUser) return;
    try {
      // delete own copy
      await deleteDoc(doc(db, "users", authUser.uid, "privateMessages", msg.id));
      // delete friend copy matching clientId if available
      if (msg.clientId) {
        const qFriend = query(
          collection(db, "users", friendId, "privateMessages"),
          where("clientId", "==", msg.clientId)
        );
        const snap = await getDocs(qFriend);
        const deletions = snap.docs.map((d) => deleteDoc(d.ref));
        await Promise.all(deletions);
      }
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      setMenuOpenFor(null);
    } catch (e) {
      console.error("Unsend failed:", e);
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
              <div key={msg.id} className={`msg-line ${msg.direction === "sent" ? "msg-sent" : "msg-received"}`}>
                <div className={`msg-stack ${msg.direction === "sent" ? "messagesent" : "messagereceive"}`}>
                  <div className={msg.direction === "sent" ? "messagefunctionreceivesent" : "messagefunctionreceive"}>
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

                    <div className={`msg-actions ${msg.direction === "sent" ? "messagefunctionreceivesent" : "messagefunctionreceive"}`}>
                      <div className="menu-anchor">
                        <button
                          className="bubble-menu-btn"
                          aria-label="Open message menu"
                          onClick={() => setMenuOpenFor((prev) => (prev === msg.id ? null : msg.id))}
                        >
                          ⋯
                        </button>

                        {menuOpenFor === msg.id && (
                          <div className={`bubble-menu ${msg.direction === "sent" ? "anchor-left" : "anchor-right"}`}>
                            {msg.direction === "sent" && (
                              <button className="bubble-menu-item" onClick={() => handleUnsend(msg)}>
                                Unsend
                              </button>
                            )}
                            <button className="bubble-menu-item" onClick={() => handleDeleteForMe(msg)}>
                              Delete for me
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
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
