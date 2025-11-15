import React, { useState, useEffect } from "react";
import { getAuth } from "firebase/auth";
import { getFirestore, collection, query, where, getDocs, addDoc, doc, getDoc, setDoc, updateDoc, onSnapshot, orderBy, deleteDoc } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../firebase/config";
import defaultProfile from "./img/default-profile.svg";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function Friends() {
  const [searchUsername, setSearchUsername] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const user = getAuth().currentUser;

  useEffect(() => {
    if (!user) return;

    // Fetch friends with user details
    const friendsQuery = query(
      collection(db, "friends"),
      where("users", "array-contains", user.uid)
    );
    const unsubFriends = onSnapshot(friendsQuery, async (snap) => {
      const friendsList = [];
      for (const docSnap of snap.docs) {
        const friendData = docSnap.data();
        const friendUid = friendData.users.find(uid => uid !== user.uid);
        if (friendUid) {
          const friendDoc = await getDoc(doc(db, "users", friendUid));
          if (friendDoc.exists()) {
            friendsList.push({
              id: docSnap.id,
              uid: friendUid,
              ...friendDoc.data(),
              ...friendData
            });
          }
        }
      }
      setFriends(friendsList);
    });

    // Fetch incoming friend requests
    const incomingQuery = query(
      collection(db, "friendRequests"),
      where("toUid", "==", user.uid),
      where("status", "==", "pending")
    );
    const unsubIncoming = onSnapshot(incomingQuery, (snap) => {
      const requests = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setFriendRequests(requests);
    });

    // Fetch sent friend requests
    const sentQuery = query(
      collection(db, "friendRequests"),
      where("fromUid", "==", user.uid),
      where("status", "==", "pending")
    );
    const unsubSent = onSnapshot(sentQuery, (snap) => {
      const requests = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setSentRequests(requests);
    });

    return () => {
      unsubFriends();
      unsubIncoming();
      unsubSent();
    };
  }, [user]);

  const handleSearch = async () => {
    if (!searchUsername.trim()) return;
    try {
      const usersQuery = query(
        collection(db, "users"),
        where("username", "==", searchUsername.trim())
      );
      const snap = await getDocs(usersQuery);
      if (!snap.empty) {
        const userData = snap.docs[0].data();
        setSearchResult({ uid: snap.docs[0].id, ...userData });
      } else {
        setSearchResult(null);
        alert("User not found");
      }
    } catch (e) {
      console.error("Search error:", e);
      alert("Error searching user");
    }
  };

  const handleSendRequest = async () => {
    if (!searchResult || !user) return;
    try {
      // Check if already friends or request exists
      const existingFriend = friends.find(f => f.users.includes(searchResult.uid));
      const existingRequest = friendRequests.find(r => r.fromUid === searchResult.uid) || sentRequests.find(r => r.toUid === searchResult.uid);
      if (existingFriend || existingRequest) {
        alert("Already friends or request pending");
        return;
      }

      const requestRef = await addDoc(collection(db, "friendRequests"), {
        fromUid: user.uid,
        fromUsername: user.displayName || user.email,
        fromProfilePicUrl: user.photoURL || defaultProfile,
        toUid: searchResult.uid,
        toUsername: searchResult.username,
        toProfilePicUrl: searchResult.profilePicUrl || defaultProfile,
        status: "pending",
        createdAt: new Date(),
      });
      const requestId = requestRef.id;

      // Create notification for receiver
      await addDoc(collection(db, "notifications"), {
        type: "friendRequest",
        actorUid: user.uid,
        actorUsername: user.displayName || user.email,
        actorProfilePicUrl: user.photoURL || defaultProfile,
        targetUid: searchResult.uid,
        requestId: requestId,
        text: `${user.displayName || user.email} sent you a friend request`,
        read: false,
        created: new Date(),
      });

      alert("Friend request sent!");
      setSearchResult(null);
      setSearchUsername("");
    } catch (e) {
      console.error("Send request error:", e);
      alert("Error sending request");
    }
  };

  const handleAcceptRequest = async (requestId, fromUid, fromUsername) => {
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

  const handleDeclineRequest = async (requestId) => {
    try {
      await updateDoc(doc(db, "friendRequests", requestId), { status: "declined" });
      alert("Friend request declined!");
    } catch (e) {
      console.error("Decline request error:", e);
      alert("Error declining request");
    }
  };

  const handleUnfriend = async (friendId, friendUid) => {
    if (!user) return;
    try {
      // Delete the friend document
      await deleteDoc(doc(db, "friends", friendId));

      // Create notification for the friend
      await addDoc(collection(db, "notifications"), {
        type: "unfriend",
        actorUid: user.uid,
        actorUsername: user.displayName || user.email,
        targetUid: friendUid,
        text: `${user.displayName || user.email} removed you from friends`,
        read: false,
        created: new Date(),
      });

      alert("Friend removed!");
    } catch (e) {
      console.error("Unfriend error:", e);
      alert("Error removing friend");
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "2rem 1rem" }}>
      <h2>Friends</h2>

      {/* Search for users */}
      <div style={{ marginBottom: "2rem" }}>
        <h3>Find Friends</h3>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <input
            type="text"
            placeholder="Enter username"
            value={searchUsername}
            onChange={(e) => setSearchUsername(e.target.value)}
            style={{ flex: 1, padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
          />
          <button
            onClick={handleSearch}
            style={{ padding: "10px 20px", background: "#1976d2", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}
          >
            Search
          </button>
        </div>
        {searchResult && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 12, border: "1px solid #eee", borderRadius: 12, background: "#f9f9f9" }}>
            <img
              src={searchResult.profilePicUrl || defaultProfile}
              alt="profile"
              style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{searchResult.username}</div>
              <div style={{ color: "#666", fontSize: 14 }}>{searchResult.email}</div>
            </div>
            <button
              onClick={handleSendRequest}
              style={{ padding: "8px 16px", background: "#4caf50", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}
            >
              Send Request
            </button>
          </div>
        )}
      </div>

      {/* Friend Requests */}
      {friendRequests.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <h3>Friend Requests</h3>
          {friendRequests.map((req) => (
            <div key={req.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: 12, border: "1px solid #eee", borderRadius: 12, marginBottom: 10 }}>
              <img
                src={req.fromProfilePicUrl || defaultProfile}
                alt="profile"
                style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{req.fromUsername}</div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => handleAcceptRequest(req.id, req.fromUid, req.fromUsername)}
                  style={{ padding: "8px 16px", background: "#4caf50", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}
                >
                  Accept
                </button>
                <button
                  onClick={() => handleDeclineRequest(req.id)}
                  style={{ padding: "8px 16px", background: "#f44336", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sent Requests */}
      {sentRequests.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <h3>Sent Requests</h3>
          {sentRequests.map((req) => (
            <div key={req.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: 12, border: "1px solid #eee", borderRadius: 12, marginBottom: 10 }}>
              <img
                src={req.toProfilePicUrl || defaultProfile}
                alt="profile"
                style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{req.toUsername}</div>
                <div style={{ color: "#666", fontSize: 14 }}>Pending</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Friends List */}
      <div>
        <h3>Your Friends ({friends.length})</h3>
        {friends.length === 0 ? (
          <div style={{ textAlign: "center", color: "#888", padding: "2rem" }}>
            No friends yet. Send some friend requests!
          </div>
        ) : (
          friends.map((friend) => {
            return (
              <div key={friend.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: 12, border: "1px solid #eee", borderRadius: 12, marginBottom: 10 }}>
                <img
                  src={friend.profilePicUrl || defaultProfile}
                  alt="profile"
                  style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{friend.username || "Friend"}</div>
                </div>
                <button
                  onClick={() => handleUnfriend(friend.id, friend.uid)}
                  style={{ padding: "8px 16px", background: "#f44336", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}
                >
                  Unfriend
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default Friends;
