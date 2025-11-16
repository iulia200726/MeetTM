import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getAuth } from "firebase/auth";
import { getFirestore, collection, query, where, onSnapshot, doc, updateDoc, addDoc, orderBy, serverTimestamp } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../firebase/config";
import defaultProfile from "./img/default-profile.svg";
import AppNavigation from "./appnavigation.jsx";
import "./Notifications.css";

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
  const location = useLocation();

  // switch tab if query tab=messages
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab");
    if (tab === "messages") {
      setActiveTab("messages");
    }
  }, [location.search]);

  useEffect(() => {
    if (!user) return;
    markedAsRead.current = false; // ResetÄƒm flag-ul la schimbarea userului
    const q = query(
      collection(db, "notifications"),
      where("targetUid", "==", user.uid)
    );
    const unsub = onSnapshot(q, async (snap) => {
      const notifs = snap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (b.created?.toMillis?.() || 0) - (a.created?.toMillis?.() || 0));
      setNotifications(notifs);

      // MarcheazÄƒ ca citite doar la prima Ã®ncÄƒrcare
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

  // Grupare notificÄƒri dupÄƒ zi/lunÄƒ
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
    <div className="notifications-page">
      <div className="notifications-card">
        <div className="notifications-tabs">
          <div className="tab-group">
            <button
              onClick={() => setActiveTab("notifications")}
              className={`tab-btn ${activeTab === "notifications" ? "active" : ""}`}
            >
              <span>Notifications</span>
            </button>
            <button
              onClick={() => setActiveTab("messages")}
              className={`tab-btn ${activeTab === "messages" ? "active" : ""}`}
            >
              <span>Messages</span>
              <span className="tab-pill">{friends.length}</span>
            </button>
          </div>
        </div>

        {activeTab === "notifications" && (
          <div className="notifications-list">
            {["Today", "Yesterday", "This month", "Earlier"].map((section) =>
              grouped[section].length > 0 ? (
                <div key={section} className="notif-section">
                  <div className="section-heading">
                    <span className="section-title">{section}</span>
                    <span className="section-count">{grouped[section].length}</span>
                  </div>
                  <div className="section-items">
                    {grouped[section].map((notif) => (
                      <NotifItem
                        key={notif.id}
                        notif={notif}
                        onAcceptFriendRequest={handleAcceptFriendRequest}
                        onDeclineFriendRequest={handleDeclineFriendRequest}
                      />
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
        )}

        {activeTab === "messages" && (
          <div className="messages-list">
            {friends.length === 0 ? (
              <div className="empty-state">
                <p className="empty-title">No messages yet</p>
                <p className="empty-subtitle">Conversations will appear here once you start chatting.</p>
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
          </div>
        )}
      </div>

      {replyModal && (
        <div className="reply-backdrop">
          <div className="reply-modal">
            <div className="reply-header">
              <div>
                <p className="reply-label">Reply to</p>
                <h3 className="reply-name">{replyModal.fromDisplayName}</h3>
              </div>
              <button
                className="icon-btn ghost"
                onClick={() => {
                  setReplyModal(null);
                  setReplyText("");
                }}
                aria-label="Close reply modal"
              >
                x
              </button>
            </div>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Type your message..."
              className="reply-input"
            />
            <div className="reply-actions">
              <button onClick={handleReply} className="primary-btn">
                Send
              </button>
              <button
                className="ghost-btn"
                onClick={() => {
                  setReplyModal(null);
                  setReplyText("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <AppNavigation />
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
      <div className="notif-actions">
        <button
          onClick={() => onAcceptFriendRequest(notif.requestId, notif.actorUid, notif.actorUsername)}
          className="pill-btn success"
        >
          Accept
        </button>
        <button
          onClick={() => onDeclineFriendRequest(notif.requestId)}
          className="pill-btn danger"
        >
          Decline
        </button>
      </div>
    );
  } else {
    text = notif.text || "";
  }
  return (
    <div className="notif-item">
      <div className="avatar-ring">
        <img
          src={notif.actorProfilePicUrl || defaultProfile}
          alt="avatar"
          className="avatar-img"
        />
      </div>
      <div className="notif-body">
        <div className="notif-text">{text}</div>
        <div className="notif-meta">
          <span className="notif-time">{timeAgo(notif.created?.toDate?.())}</span>
        </div>
        {actionButton}
      </div>
      {notif.type === "follow" ? (
        <button className={`pill-btn ${notif.isFollowing ? "neutral" : "primary"}`}>
          {notif.isFollowing ? "Following" : "Follow"}
        </button>
      ) : null}
    </div>
  );
}

function FriendItem({ friend, onClick }) {
  return (
    <div onClick={onClick} className="friend-item">
      <div className="avatar-ring">
        <img
          src={friend.pic || defaultProfile}
          alt="avatar"
          className="avatar-img"
        />
      </div>
      <div className="friend-body">
        <div className="friend-name">{friend.name}</div>
        <div className="friend-message">{friend.lastMessage}</div>
        <div className="friend-time">{timeAgo(friend.lastTime?.toDate?.())}</div>
      </div>
      <span className="friend-cta">Open</span>
    </div>
  );
}

export default Notifications;




