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
  const [showAccountMenu, setShowAccountMenu] = useState(false); // 👈 nou

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
    setShowAccountMenu(false);
    logout();
    navigate("/");
  };

  const handleOpenAccount = () => {
    setShowAccountMenu(false);
    navigate("/account");
  };

  const handleAccountClick = (e) => {
    e.preventDefault(); // nu mai navigăm direct la /account
    setShowAccountMenu((prev) => !prev);
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
        <ul className="last-events">
          {/* aici vei pune ultimele evenimente */}
        </ul>
      </div>

      {/* 🔹 Dreapta: restul link-urilor / butoanelor */}
      <nav className="navbar nav-right">
        <ul>
          {isAuthenticated ? (
            <>
              <li>
                <Link to="/dashboard">Open App</Link>
              </li>

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
                <Link to="/news">All Events</Link>
              </li>

              {/* 🔹 Account (avatar) + pop-up */}
              <li className="account-li">
                <Link
                  to="/account"
                  className="account-link"
                  onClick={handleAccountClick}
                >
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

                {showAccountMenu && (
                  <div className="account-popup">
                    <button
                      type="button"
                      className="account-popup-item"
                      onClick={handleOpenAccount}
                    >
                      Open your account
                    </button>
                    <button
                      type="button"
                      className="account-popup-item account-popup-logout"
                      onClick={handleLogout}
                    >
                      Log out
                    </button>
                  </div>
                )}
              </li>
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
