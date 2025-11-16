import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { useAuth } from "../AuthContext";
import { firebaseConfig } from "../firebase/config";
import "./Signup.css";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const auth = getAuth();
  const { login } = useAuth();

  useEffect(() => {
    document.body.classList.add("signup-bg");
    return () => document.body.classList.remove("signup-bg");
  }, []);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, "users", cred.user.uid), {
        username,
        email,
        phone,
        createdAt: new Date().toISOString(),
      });
      login();
      navigate("/news");
    } catch (err) {
      setError("The account could not be created. Please check the details and try again.");
    }
  };

  return (
    <div className="signup-page">
      <div className="signup-glow " aria-hidden="true" />
      <div className="signup-glow glow-right" aria-hidden="true" />

      <div className="signup-card">
        <div className="signup-head">
          <p className="eyebrow">Create your MeetTM account</p>
          <h1>Join the Timisoara vibe</h1>
          <p className="lede">
          Join the community, add events and see what's happening live in the city.
          </p>
        </div>

        {error && <div className="form-error">{error}</div>}

        <form className="signup-form" onSubmit={handleSignup}>
          <label className="field">
            <span>Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Full Name"
              required
            />
          </label>

          <label className="field">
            <span>Phone number</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07xx xxx xxx"
              required
            />
          </label>

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              required
            />
          </label>

          <button type="submit" className="primary-btn full colortxt">
           Create account
          </button>
        </form>

        <div className="signup-footer">
          <span className="muted">Do you already have an account?</span>
          <Link to="/login" className="secondary-link">
           Log in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Signup;
