import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase/config.jsx";
import { useAuth } from "../AuthContext";
import "./Login.css";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    document.body.classList.add("login-bg");
    return () => document.body.classList.remove("login-bg");
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    setError("");
    signInWithEmailAndPassword(auth, email, password)
      .then(() => {
        login();
        navigate("/news");
      })
      .catch(() => {
        setError("Incorrect email or password. Please try again.");
      });
  };

  return (
    <div className="login-page">
      <div className="login-glow" aria-hidden="true" />
      <div className="login-glow glow-right" aria-hidden="true" />

      <div className="login-card">
        <div className="login-head">
          <p className="eyebrow">Welcome to MeetTM</p>
          <h1>Connect to events</h1>
          <p className="lede">
            Log in and continue discovering the electric vibe of Timisoara.
          </p>
        </div>

        <form className="login-form" onSubmit={handleLogin}>
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

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="primary-btn full">
            Login
          </button>
        </form>

        <div className="login-footer">
          <span className="muted">Don't have an account?</span>
          <Link to="/signup" className="secondary-link">
            Create one
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Login;
