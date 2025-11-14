import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import "./Navbar.css";
import Logo from "./img/White_LogoMeetTM_Text.svg";
import defaultProfile from "./img/default-profile.svg";
import { getFirestore, doc, onSnapshot, collection, query, where } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { firebaseConfig } from "../firebase/config";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function Navbar() {
  const { isAuthenticated, logout, user } = useAuth();
  const navigate = useNavigate();
  const [profilePic, setProfilePic] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Poza de profil
  useEffect(() => {
    let unsub;
    const fetchProfilePic = async () => {
      if (user) {
        const userRef = doc(db, "users", user.uid);
        unsub = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists() && docSnap.data().profilePicUrl) {
            setProfilePic(docSnap.data().profilePicUrl);
          } else {
            setProfilePic(null);
          }
        });
      } else {
        setProfilePic(null);
      }
    };
    fetchProfilePic();
    return () => {
      if (unsub) unsub();
    };
  }, [user]);

  // Notificări necitite
  useEffect(() => {
    let unsub;
    if (user) {
      const q = query(
        collection(db, "notifications"),
        where("targetUid", "==", user.uid),
        where("read", "==", false)
      );
      unsub = onSnapshot(q, (snap) => {
        setUnreadCount(snap.size);
      });
    } else {
      setUnreadCount(0);
    }
    return () => {
      if (unsub) unsub();
    };
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="navStyle">
      {/* 🔹 Stânga: logo */}
      <div className="nav-left">
        <Link to="/">
          <img className="logo" src={Logo} alt="Logo" />
        </Link>
      </div>

      {/* 🔹 Centru: LastEvents (ul-ul tău) */}
      <div className="nav-center">
        {/* 
          Aici pui UL-ul tău de LastEvents.
          Dacă deja ai un <ul> cu ultimele evenimente, îl muți aici.
          Exemplu minimal:
        */}
        <ul className="last-events">
          <li>
            <Link to="/news">All Events</Link>
          </li>
          <li>
                <Link to="/dashboard">Open App</Link>
              </li>
          {/* Aici poți mappa ultimele evenimente:
              {lastEvents.map(e => (
                <li key={e.id}><Link to={`/events/${e.id}`}>{e.title}</Link></li>
              ))}
           */}
        </ul>
      </div>

      {/* 🔹 Dreapta: restul link-urilor / butoanelor */}
      <nav className="navbar nav-right">
        <ul>
          {isAuthenticated ? (
            <>
              

             

              <li style={{ position: "relative" }}>
                <Link
                  to="/notifications"
                  style={{ position: "relative", display: "inline-block" }}
                >
                  Notifications
                  {unreadCount > 0 && (
                    <span className="notif-badge">{unreadCount}</span>
                  )}
                </Link>
              </li>

              <li>
                <Link to="/account">
                  <img
                    src={profilePic || defaultProfile}
                    alt="Profil"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      objectFit: "cover",
                      border: "2px solid #ccc",
                    }}
                  />
                </Link>
              </li>

              {/* <li>
                <button onClick={handleLogout}>Log out</button>
              </li> */}
            </>
          ) : (
            <>
              <li>
                <Link to="/login">Login</Link>
              </li>
              <li>
                <Link to="/signup">Sign up</Link>
              </li>
            </>
          )}
        </ul>
      </nav>
    </div>
  );
}

export default Navbar;
