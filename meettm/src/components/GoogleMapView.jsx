import React, { useState } from "react";
import { GoogleMap, LoadScript, Marker, Circle, InfoWindow } from "@react-google-maps/api";

const containerStyle = {
  width: "100%",
  height: "clamp(280px, 45vh, 420px)"
};

const CATEGORY_COLORS = {
  "Music": "#c21e56",
  "Art & Culture": "#8a2be2",
  "Education": "#1e3a8a",
  "Community & Volunteering": "#40e0d0",
  "Sport": "#ff9322",
  "Food & Drink": "#ffd707",
  "Party & Fun": "#ff1493",
  "Shopping": "#9c27b0",
  "Nature": "#228b22",
  "Business": "#a1887f",
  "Family & Animals": "#4f9d9d",
  "Other": "#ffdab9"
};

function getMarkerColor(issue) {
  return CATEGORY_COLORS[issue.category] || "#ffdab9";
}

function getCircleOptions(issue) {
  return {
    fillOpacity: 0.85,
    strokeOpacity: 1,
    radius: 20,
    strokeWeight: 2,
    zIndex: 2,
    fillColor: getMarkerColor(issue),
    strokeColor: "#fff",
  };
}

function GoogleMapView({ markers = [] }) {
  const [selectedCoords, setSelectedCoords] = useState(null);
  const now = new Date();

  // Filtrează markerii să fie doar evenimente active
  const activeMarkers = markers.filter(m => {
    if (!m.endDateTime) return true;
    return new Date(m.endDateTime) > now;
  });

  const center = { lat: 45.75372, lng: 21.22571 }; // Timisoara centru

  // Limitează harta la zona Timișoara (bounding box)
  const mapOptions = {
    restriction: {
      latLngBounds: {
        north: 45.810,
        south: 45.690,
        east: 21.320,
        west: 21.140,
      },
      strictBounds: true,
    },
    styles: [
      {
        featureType: "poi.business",
        stylers: [{ visibility: "off" }]
      },
      {
        featureType: "poi.park",
        elementType: "labels.text",
        stylers: [{ visibility: "off" }]
      },
      {
        featureType: "road",
        elementType: "labels.icon",
        stylers: [{ visibility: "off" }]
      },
      {
        featureType: "transit",
        stylers: [{ visibility: "off" }]
      },
      {
        featureType: "water",
        stylers: [{ color: "#aadaff" }]
      },
      {
        featureType: "landscape",
        stylers: [{ color: "#f2f2f2" }]
      },
      {
        elementType: "labels.text.fill",
        stylers: [{ color: "#444444" }]
      },
      {
        featureType: "administrative",
        elementType: "labels.text.fill",
        stylers: [{ color: "#888888" }]
      }
    ]
  };

  // Problemele de la coordonatele selectate (cu toleranță)
  const selectedIssues = selectedCoords
    ? markers.filter(
        (m) =>
          Math.abs(m.lat - selectedCoords.lat) < 0.0001 &&
          Math.abs(m.lng - selectedCoords.lng) < 0.0001
      )
    : [];

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={13}
      options={mapOptions}
    >
      {activeMarkers.map((m, idx) => (
        <Circle
          key={idx}
          center={{ lat: m.lat, lng: m.lng }}
          options={{
            ...getCircleOptions(m),
            clickable: true,
          }}
          onClick={() => setSelectedCoords({ lat: m.lat, lng: m.lng })}
        />
      ))}
      {selectedCoords && (
        <InfoWindow
          position={selectedCoords}
          onCloseClick={() => setSelectedCoords(null)}
          disableAutoPan={true}
        >
          <div style={{ minWidth: 220 }}>
            <h3>
              Events at:{" "}
              {selectedIssues[0] && selectedIssues[0].address
                ? selectedIssues[0].address.charAt(0).toUpperCase() +
                  selectedIssues[0].address.slice(1)
                : ""}
            </h3>
            <ul>
              {selectedIssues.map((issue, i) => (
                <li key={i}>
                  <b>{issue.title}</b>
                  <br />
                  {issue.desc}
                  <br />
                  <span style={{
                    color: "#fff",
                    background: getMarkerColor(issue),
                    borderRadius: 8,
                    padding: "2px 10px",
                    fontSize: 13,
                    fontWeight: 600,
                    display: "inline-block",
                    marginTop: 2
                  }}>
                    {issue.category || "Other"}
                  </span>
                </li>
              ))}
            </ul>
            {selectedIssues.length === 0 && <p>No events here</p>}
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}

export default GoogleMapView;
