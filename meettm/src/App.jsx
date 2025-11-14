import React, { useEffect } from 'react';
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
import './App.css';

function AppWrapper() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === "/") {
      document.body.classList.add("homepage-bg");
    } else {
      document.body.classList.remove("homepage-bg");
    }
    // curățare dacă navighezi rapid între pagini
    return () => document.body.classList.remove("homepage-bg");
  }, [location.pathname]);

  return (
    <div className="App">
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
