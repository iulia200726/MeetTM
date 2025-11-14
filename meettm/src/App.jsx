import React, { useEffect, useRef } from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import { LoadScript } from '@react-google-maps/api';
import Navbar from './components/Navbar.jsx';
import LandingPage from './components/LandingPage.jsx';
import Login from './components/Login.jsx';
import Signup from './components/Signup.jsx';
import Dashboard from './components/Dashboard.jsx';
import AddEvent from './components/AddEvent.jsx';
import { AuthProvider } from './AuthContext';
import Account from './components/Account.jsx';
import News from './components/News.jsx';
import EventDetails from './components/EventDetails.jsx';
import Notifications from './components/Notifications.jsx';
import EventReelsSection from './components/EventReelsSection.jsx';
import './App.css';

// 🔹 Background video doar pentru homepage
function HomeBackgroundVideo() {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      const videoEl = videoRef.current;
      videoEl.playbackRate = 0.8; // 🔹 50% mai lent
      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          /* ignore autoplay blocking errors */
        });
      }
    }
  }, []);

  return (
    <div className="bg-video-container">
      <video
        ref={videoRef}
        className="bg-video"
        autoPlay
        loop
        muted
        playsInline
      >
        <source src="/videos/BkVideo.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </video>
    </div>
  );
}


function AppWrapper() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === "/") {
      document.body.classList.add("homepage-bg");
    } else {
      document.body.classList.remove("homepage-bg");
    }
    return () => document.body.classList.remove("homepage-bg");
  }, [location.pathname]);

  return (
    <div className="App">
      {location.pathname === "/" && <HomeBackgroundVideo />}

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
        <Route path="/reels" element={<EventReelsSection />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <LoadScript googleMapsApiKey="AIzaSyDW5XKKX0zKaYfddYpTzaF3alj98xMD0fw">
          <AppWrapper />
        </LoadScript>
      </Router>
    </AuthProvider>
  );
}

export default App;
