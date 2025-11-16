import React, { useState, useEffect } from "react";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  deleteDoc,
} from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../firebase/config";
import defaultProfile from "./img/default-profile.svg";
import AppNavigation from "./appnavigation.jsx";
import "./Friends.css";

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
    document.body.classList.add("friends-bg");
    return () => document.body.classList.remove("friends-bg");
  }, []);

  useEffect(() => {
    if (!user) return;
    const friendsQuery = query(collection(db, "friends"), where("users", "array-contains", user.uid));
    const unsubFriends = onSnapshot(friendsQuery, async (snap) => {
      const friendsList = [];
      for (const docSnap of snap.docs) {
        const friendData = docSnap.data();
        const friendUid = friendData.users.find((uid) => uid !== user.uid);
        if (friendUid) {
          const friendDoc = await getDoc(doc(db, "users", friendUid));
          if (friendDoc.exists()) {
            friendsList.push({
              id: docSnap.id,
              uid: friendUid,
              ...friendDoc.data(),
              ...friendData,
            });
          }
        }
      }
      setFriends(friendsList);
    });

    const incomingQuery = query(
      collection(db, "friendRequests"),
      where("toUid", "==", user.uid),
      where("status", "==", "pending")
    );
    const unsubIncoming = onSnapshot(incomingQuery, (snap) => {
      const requests = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setFriendRequests(requests);
    });

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
      const usersQuery = query(collection(db, "users"), where("username", "==", searchUsername.trim()));
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
      const existingFriend = friends.find((f) => f.users.includes(searchResult.uid));
      const existingRequest =
        friendRequests.find((r) => r.fromUid === searchResult.uid) ||
        sentRequests.find((r) => r.toUid === searchResult.uid);
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

      await addDoc(collection(db, "notifications"), {
        type: "friendRequest",
        actorUid: user.uid,
        actorUsername: user.displayName || user.email,
        actorProfilePicUrl: user.photoURL || defaultProfile,
        targetUid: searchResult.uid,
        requestId: requestId,
        text: `${user.displayName || user.email} sent you a friend request`,
      });

      alert("Request sent");
    } catch (e) {
      console.error("Send request error:", e);
      alert("Error sending request");
    }
  };

  const handleAcceptRequest = async (requestId, fromUid, fromUsername) => {
    if (!user) return;
    try {
      await setDoc(doc(db, "friends", requestId), {
        users: [user.uid, fromUid],
        createdAt: new Date(),
        lastInteraction: new Date(),
      });
      await updateDoc(doc(db, "friendRequests", requestId), { status: "accepted" });

      await addDoc(collection(db, "notifications"), {
        type: "friendAccepted",
        actorUid: user.uid,
        actorUsername: user.displayName || user.email,
        actorProfilePicUrl: user.photoURL || defaultProfile,
        targetUid: fromUid,
        created: new Date(),
        text: `${user.displayName || user.email} accepted your friend request`,
      });

      alert("Friend added!");
    } catch (e) {
      console.error("Accept request error:", e);
      alert("Error accepting request");
    }
  };

  const handleDeclineRequest = async (requestId) => {
    try {
      await updateDoc(doc(db, "friendRequests", requestId), { status: "declined" });
      alert("Request declined");
    } catch (e) {
      console.error("Decline request error:", e);
      alert("Error declining request");
    }
  };

  const handleUnfriend = async (friendDocId, friendUid) => {
    if (!window.confirm("Are you sure you want to unfriend this user?")) return;
    try {
      await deleteDoc(doc(db, "friends", friendDocId));

      await addDoc(collection(db, "notifications"), {
        type: "unfriend",
        actorUid: user.uid,
        actorUsername: user.displayName || user.email,
        actorProfilePicUrl: user.photoURL || defaultProfile,
        targetUid: friendUid,
        created: new Date(),
        text: `${user.displayName || user.email} removed you from friends`,
      });
    } catch (e) {
      console.error("Unfriend error:", e);
      alert("Error removing friend");
    }
  };

  const requestsCount = friendRequests.length;
  const sentCount = sentRequests.length;
  const friendsCount = friends.length;

  return (
    <div className="friends-page">
      <div className="friends-glow glow-left" aria-hidden="true" />
      <div className="friends-glow glow-right" aria-hidden="true" />

      <header className="friends-hero">
        <p className="eyebrow">Comunitatea MeetTM</p>
        <h1>Gestioneaza-ti prietenii si conexiunile</h1>
        <p className="lede">
          Cauta utilizatori, trimite cereri si ramani la curent cu prieteniile tale.
        </p>
        <div className="insights-grid">
          <div className="insight-card">
            <p className="insight-label">Cereri primite</p>
            <div className="insight-value">{requestsCount}</div>
            <p className="insight-meta">in asteptare</p>
          </div>
          <div className="insight-card">
            <p className="insight-label">Cereri trimise</p>
            <div className="insight-value">{sentCount}</div>
            <p className="insight-meta">in curs</p>
          </div>
          <div className="insight-card">
            <p className="insight-label">Prieteni</p>
            <div className="insight-value">{friendsCount}</div>
            <p className="insight-meta">conexiuni active</p>
          </div>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Cauta</p>
            <h3>Gaseste prieteni</h3>
          </div>
        </div>
        <div className="field-row">
          <input
            type="text"
            value={searchUsername}
            onChange={(e) => setSearchUsername(e.target.value)}
            placeholder="Introdu username"
            className="input"
          />
          <button className="primary-btn" type="button" onClick={handleSearch}>
            Cauta
          </button>
        </div>
        {searchResult && (
          <div className="friend-card">
            <img src={searchResult.profilePicUrl || defaultProfile} alt="profile" className="avatar" />
            <div className="friend-info">
              <div className="friend-name">{searchResult.username}</div>
              <div className="friend-meta">{searchResult.email}</div>
            </div>
            <button className="primary-btn ghost" type="button" onClick={handleSendRequest}>
              Trimite cerere
            </button>
          </div>
        )}
      </section>

      {friendRequests.length > 0 && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Cereri primite</p>
              <h3>Confirma prietenii</h3>
            </div>
          </div>
          <div className="card-list">
            {friendRequests.map((req) => (
              <div key={req.id} className="friend-card">
                <img src={req.fromProfilePicUrl || defaultProfile} alt="profile" className="avatar" />
                <div className="friend-info">
                  <div className="friend-name">{req.fromUsername}</div>
                  <div className="friend-meta">Vrea sa te adauge</div>
                </div>
                <div className="friend-actions">
                  <button
                    className="pill-btn success"
                    onClick={() => handleAcceptRequest(req.id, req.fromUid, req.fromUsername)}
                  >
                    Accepta
                  </button>
                  <button className="pill-btn danger" onClick={() => handleDeclineRequest(req.id)}>
                    Respinge
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {sentRequests.length > 0 && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Cereri trimise</p>
              <h3>In asteptare</h3>
            </div>
          </div>
          <div className="card-list">
            {sentRequests.map((req) => (
              <div key={req.id} className="friend-card">
                <img src={req.toProfilePicUrl || defaultProfile} alt="profile" className="avatar" />
                <div className="friend-info">
                  <div className="friend-name">{req.toUsername}</div>
                  <div className="friend-meta">Pending</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Lista de prieteni</p>
            <h3>Conexiuni ({friends.length})</h3>
          </div>
        </div>
        {friends.length === 0 ? (
          <div className="empty-state">
            <p className="empty-title">Nu ai prieteni inca.</p>
            <p className="empty-subtitle">Trimite cereri pentru a incepe.</p>
          </div>
        ) : (
          <div className="card-list">
            {friends.map((friend) => (
              <div key={friend.id} className="friend-card">
                <img src={friend.profilePicUrl || defaultProfile} alt="profile" className="avatar" />
                <div className="friend-info">
                  <div className="friend-name">{friend.username || "Friend"}</div>
                </div>
                <button className="pill-btn danger" onClick={() => handleUnfriend(friend.id, friend.uid)}>
                  Unfriend
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <AppNavigation />
    </div>
  );
}

export default Friends;
