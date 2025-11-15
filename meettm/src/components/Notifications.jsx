import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth } from "firebase/auth";
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, updateDoc, addDoc, orderBy, serverTimestamp } from "firebase/firestore";
import defaultProfile from "./img/default-profile.svg";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../firebase/config";

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

function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [messages, setMessages] = useState([]);
  const [friends, setFriends] = useState([]);
  const [activeTab, setActiveTab] = useState("notifications");
  const [replyModal, setReplyModal] = useState(null);
  const [replyText, setReplyText] = useState("");
  const user = getAuth().currentUser;
  const markedAsRead = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    markedAsRead.current = false; // Resetăm flag-ul la schimbarea userului
    const q = query(
      collection(db, "notifications"),
      where("targetUid", "==", user.uid)
    );
    const unsub = onSnapshot(q, async (snap) => {
      const notifs = snap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (b.created?.toMillis?.() || 0) - (a.created?.toMillis?.() || 0));
      setNotifications(notifs);

      // Marchează ca citite doar la prima încărcare
      if (!markedAsRead.current) {
        markedAsRead.current = true;
        snap.docs.forEach((docu) => {
          if (docu.exists() && docu.data().read === false) {
            updateDoc(doc(db, "notifications", docu.id), { read: true });
          }
        });
      }
    });
    return () => unsub();
  }, [user]);

  // Fetch messages (inboxReels and privateMessages) and aggregate friends
  useEffect(() => {
    if (!user) return;

    const qReels = query(
      collection(db, "users", user.uid, "inboxReels"),
      orderBy("created", "desc")
    );
    const unsubReels = onSnapshot(qReels, (snap) => {
      const reels = snap.docs.map((doc) => ({ id: doc.id, type: 'reel', ...doc.data() }));
      setMessages((prev) => {
        const others = prev.filter(m => m.type !== 'reel');
        return [...reels, ...others].sort((a, b) => (b.created?.toMillis?.() || 0) - (a.created?.toMillis?.() || 0));
      });
    });

    const qPrivate = query(
      collection(db, "users", user.uid, "privateMessages"),
      orderBy("created", "desc")
    );
    const unsubPrivate = onSnapshot(qPrivate, (snap) => {
      const privMsgs = snap.docs.map((doc) => ({ id: doc.id, type: 'message', ...doc.data() }));
      setMessages((prev) => {
        const others = prev.filter(m => m.type !== 'message');
        return [...privMsgs, ...others].sort((a, b) => (b.created?.toMillis?.() || 0) - (a.created?.toMillis?.() || 0));
      });
    });

    return () => {
      unsubReels();
      unsubPrivate();
    };
  }, [user]);

  // Aggregate friends from messages
  useEffect(() => {
    if (!messages.length) return;

    const friendMap = new Map();
    messages.forEach((msg) => {
      let friendUid, friendName, friendPic, lastMessage, lastTime;
      if (msg.type === 'reel') {
        friendUid = msg.fromUid;
        friendName = msg.fromDisplayName;
        friendPic = msg.fromProfilePicUrl;
        lastMessage = `Shared a reel`;
        lastTime = msg.created;
      } else if (msg.type === 'message') {
        friendUid = msg.fromUid === user.uid ? msg.toUid : msg.fromUid;
        friendName = msg.fromUid === user.uid ? msg.toDisplayName : msg.fromDisplayName;
        friendPic = msg.fromUid === user.uid ? msg.toProfilePicUrl : msg.fromProfilePicUrl;
        lastMessage = msg.text;
        lastTime = msg.created;
      }

      if (friendUid && friendUid !== user.uid) {
        if (!friendMap.has(friendUid) || (lastTime?.toMillis?.() || 0) > (friendMap.get(friendUid).lastTime?.toMillis?.() || 0)) {
          friendMap.set(friendUid, {
            uid: friendUid,
            name: friendName,
            pic: friendPic,
            lastMessage,
            lastTime,
          });
        }
      }
    });

    const friendsList = Array.from(friendMap.values()).sort((a, b) => (b.lastTime?.toMillis?.() || 0) - (a.lastTime?.toMillis?.() || 0));
    setFriends(friendsList);
  }, [messages, user]);

  // Grupare notificări după zi/lună
  const grouped = { Today: [], Yesterday: [], "This month": [], Earlier: [] };
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  notifications.forEach((n) => {
    const d = n.created?.toDate ? n.created.toDate() : null;
    if (!d) return;
    if (d.toDateString() === now.toDateString()) grouped.Today.push(n);
    else if (d.toDateString() === yesterday.toDateString()) grouped.Yesterday.push(n);
    else if (
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    )
      grouped["This month"].push(n);
    else grouped.Earlier.push(n);
  });

  // Handle reply
  const handleReply = async () => {
    if (!replyText.trim() || !replyModal) return;
    const user = getAuth().currentUser;
    if (!user) return;

    try {
      // Send to friend's collection
      await addDoc(collection(db, "users", replyModal.fromUid, "privateMessages"), {
        fromUid: user.uid,
        fromDisplayName: user.displayName || user.email,
        fromProfilePicUrl: user.photoURL || defaultProfile,
        toUid: replyModal.fromUid,
        toDisplayName: replyModal.fromDisplayName,
        toProfilePicUrl: replyModal.fromProfilePicUrl || defaultProfile,
        text: replyText,
        created: serverTimestamp(),
      });

      // Send to own collection for full history
      await addDoc(collection(db, "users", user.uid, "privateMessages"), {
        fromUid: user.uid,
        fromDisplayName: user.displayName || user.email,
        fromProfilePicUrl: user.photoURL || defaultProfile,
        toUid: replyModal.fromUid,
        toDisplayName: replyModal.fromDisplayName,
        toProfilePicUrl: replyModal.fromProfilePicUrl || defaultProfile,
        text: replyText,
        created: serverTimestamp(),
      });

      setReplyText("");
      setReplyModal(null);
      alert("Reply sent!");
    } catch (e) {
      console.error("Reply error:", e);
      alert("Failed to send reply.");
    }
  };

  // Handle accept friend request
  const handleAcceptFriendRequest = async (requestId, fromUid, fromUsername) => {
    if (!user) return;
    try {
      // Update request status
      await updateDoc(doc(db, "friendRequests", requestId), { status: "accepted" });

      // Add to friends collection
      await addDoc(collection(db, "friends"), {
        users: [user.uid, fromUid],
        createdAt: new Date(),
      });

      // Create notification for sender
      await addDoc(collection(db, "notifications"), {
        type: "friendAccepted",
        actorUid: user.uid,
        actorUsername: user.displayName || user.email,
        targetUid: fromUid,
        text: `${user.displayName || user.email} accepted your friend request`,
        read: false,
        created: new Date(),
      });

      alert("Friend request accepted!");
    } catch (e) {
      console.error("Accept request error:", e);
      alert("Error accepting request");
    }
  };

  // Handle decline friend request
  const handleDeclineFriendRequest = async (requestId) => {
    try {
      await updateDoc(doc(db, "friendRequests", requestId), { status: "declined" });
      alert("Friend request declined!");
    } catch (e) {
      console.error("Decline request error:", e);
      alert("Error declining request");
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "2rem 0", background: "#fff", borderRadius: 16 }}>
      {/* Tabs */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 20 }}>
          <button
            onClick={() => setActiveTab("notifications")}
            style={{
              background: "transparent",
              border: "none",
              fontSize: 18,
              fontWeight: activeTab === "notifications" ? 600 : 400,
              color: activeTab === "notifications" ? "#222" : "#888",
              cursor: "pointer",
              padding: "8px 0",
              borderBottom: activeTab === "notifications" ? "2px solid #1976d2" : "none",
            }}
          >
            Notifications
          </button>
          <button
            onClick={() => setActiveTab("messages")}
            style={{
              background: "transparent",
              border: "none",
              fontSize: 18,
              fontWeight: activeTab === "messages" ? 600 : 400,
              color: activeTab === "messages" ? "#222" : "#888",
              cursor: "pointer",
              padding: "8px 0",
              borderBottom: activeTab === "messages" ? "2px solid #1976d2" : "none",
            }}
          >
            Messages ({friends.length})
          </button>
        </div>
      </div>

      {/* Notifications Tab */}
      {activeTab === "notifications" && (
        <>
          {["Today", "Yesterday", "This month", "Earlier"].map((section) =>
            grouped[section].length > 0 ? (
              <div key={section} style={{ marginBottom: 18 }}>
                <div style={{ color: "#888", fontWeight: 600, fontSize: 15, margin: "18px 0 8px 0" }}>{section}</div>
                {grouped[section].map((notif) => (
                  <NotifItem
                    key={notif.id}
                    notif={notif}
                    onAcceptFriendRequest={handleAcceptFriendRequest}
                    onDeclineFriendRequest={handleDeclineFriendRequest}
                  />
                ))}
                <hr style={{ border: "none", borderTop: "1px solid #eee", margin: "18px 0" }} />
              </div>
            ) : null
          )}
        </>
      )}

      {/* Messages Tab */}
      {activeTab === "messages" && (
        <>
          {friends.length === 0 ? (
            <div style={{ textAlign: "center", color: "#888", padding: "2rem" }}>
              No messages yet.
            </div>
          ) : (
            friends.map((friend) => (
              <FriendItem
                key={friend.uid}
                friend={friend}
                onClick={() => navigate(`/messages/${friend.uid}`)}
              />
            ))
          )}
        </>
      )}

      {/* Reply Modal */}
      {replyModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 20,
              width: "90%",
              maxWidth: 400,
            }}
          >
            <h3 style={{ margin: "0 0 16px 0" }}>Reply to {replyModal.fromDisplayName}</h3>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Type your message..."
              style={{
                width: "100%",
                height: 100,
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: 12,
                fontSize: 14,
                resize: "none",
                outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button
                onClick={handleReply}
                style={{
                  flex: 1,
                  background: "#1976d2",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Send
              </button>
              <button
                onClick={() => {
                  setReplyModal(null);
                  setReplyText("");
                }}
                style={{
                  flex: 1,
                  background: "#eee",
                  color: "#222",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NotifItem({ notif, onAcceptFriendRequest, onDeclineFriendRequest }) {
  // Tipuri: upvote, comment, reelShared, friendRequest
  let text = "";
  let actionButton = null;
  if (notif.type === "upvote") {
    text = (
      <>
        <b>{notif.actorUsername}</b> upvoted your post.
      </>
    );
  } else if (notif.type === "comment") {
    text = (
      <>
        <b>{notif.actorUsername}</b> commented: "{notif.commentText}"
      </>
    );
  } else if (notif.type === "reelShared") {
    text = (
      <>
        <b>{notif.actorUsername}</b> shared a reel with you.
      </>
    );
  } else if (notif.type === "friendRequest") {
    text = (
      <>
        <b>{notif.actorUsername}</b> sent you a friend request.
      </>
    );
    actionButton = (
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={() => onAcceptFriendRequest(notif.requestId, notif.actorUid, notif.actorUsername)}
          style={{
            background: "#4caf50",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "6px 12px",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Accept
        </button>
        <button
          onClick={() => onDeclineFriendRequest(notif.requestId)}
          style={{
            background: "#f44336",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "6px 12px",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Decline
        </button>
      </div>
    );
  } else {
    text = notif.text || "";
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
      <img
        src={notif.actorProfilePicUrl || defaultProfile}
        alt="avatar"
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          objectFit: "cover",
          border: "2px solid #eee",
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ color: "#222", fontSize: 15 }}>{text}</div>
        <div style={{ color: "#888", fontSize: 13, marginTop: 2 }}>{timeAgo(notif.created?.toDate?.())}</div>
      </div>
      {actionButton}
      {notif.type === "follow" ? (
        <button
          style={{
            background: notif.isFollowing ? "#222" : "#1976d2",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "6px 18px",
            fontWeight: 600,
            fontSize: 15,
            cursor: "pointer",
            minWidth: 80,
          }}
        >
          {notif.isFollowing ? "Following" : "Follow"}
        </button>
      ) : null}
    </div>
  );
}

function FriendItem({ friend, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        marginBottom: 12,
        padding: "12px",
        border: "1px solid #eee",
        borderRadius: 12,
        cursor: "pointer",
        background: "#fff",
      }}
    >
      <img
        src={friend.pic || defaultProfile}
        alt="avatar"
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          objectFit: "cover",
          border: "2px solid #eee",
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ color: "#222", fontSize: 15, fontWeight: 600 }}>{friend.name}</div>
        <div style={{ color: "#555", fontSize: 14, marginTop: 2 }}>{friend.lastMessage}</div>
        <div style={{ color: "#888", fontSize: 13, marginTop: 2 }}>{timeAgo(friend.lastTime?.toDate?.())}</div>
      </div>
    </div>
  );
}

export default Notifications;
