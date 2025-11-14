// src/AppWrapper.jsx
import React, { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import LandingPage from './components/LandingPage.jsx';
import Login from './components/Login.jsx';
import Signup from './components/Signup.jsx';
import Dashboard from './components/Dashboard.jsx';
import AddEvent from './components/AddEvent.jsx';
import Account from './components/Account.jsx';
import News from './components/News.jsx';
import EventDetails from './components/EventDetails.jsx';
import Notifications from './components/Notifications.jsx';
import './App.css';

function AppWrapper() {
  const location = useLocation();
  const isHome = location.pathname === "/";

  useEffect(() => {
    if (isHome) {
      document.body.classList.add("homepage-bg");
    } else {
      document.body.classList.remove("homepage-bg");
    }

    return () => document.body.classList.remove("homepage-bg");
  }, [isHome]);

  return (
    <div className="App">
      {/* Dacă vrei și VIDEO background pe homepage */}
      {isHome && (
        <video
          className="bg-video"
          autoPlay
          loop
          muted
          playsInline
        >
          <source src="/city-bg.mp4" type="video/mp4" />
        </video>
      )}

      <Navbar />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/report" element={<AddEvent />} />
        <Route path="/account" element={<Account />} />
        <Route path="/news" element={<News />} />
        <Route path="/issue/:id" element={<EventDetails />} />
        <Route path="/notifications" element={<Notifications />} />
      </Routes>
    </div>
  );
}

export default AppWrapper;
