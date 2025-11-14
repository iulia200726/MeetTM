import React from "react";
import { LoadScript } from "@react-google-maps/api";

const GOOGLE_API_KEY = "AIzaSyDW5XKKX0zKaYfddYpTzaF3alj98xMD0fw"; // Înlocuiește cu cheia ta reală

function GoogleMapsWrapper({ children }) {
  return (
    <LoadScript googleMapsApiKey={GOOGLE_API_KEY}>
      {children}
    </LoadScript>
  );
}

export default GoogleMapsWrapper;