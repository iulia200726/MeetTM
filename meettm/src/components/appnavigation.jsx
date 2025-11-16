import React from "react";
import { Link, useLocation } from "react-router-dom";
import "./appnavigation.css";

const NAV_LINKS = [
  {
    label: "Dashboard",
    to: "/dashboard",
    icon: (
      <path
        d="M12 3.172 3.172 12h2.658v6h5.34v-4h4.66v4h5.34v-6h2.658L12 3.172Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    ),
  },
  {
    label: "Exploreaza",
    to: "/news",
    icon: (
      <path
        d="M12 4a8 8 0 1 0 .001 16.001A8 8 0 0 0 12 4Zm0 2.2 1.2 3.6H17l-3 2.2 1.2 3.6L12 13.4 8.8 15.6 10 12 7 9.8h3.8L12 6.2Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    ),
  },
  {
    label: "Adauga",
    to: "/report",
    icon: (
      <path
        d="M11 6h2v5h5v2h-5v5h-2v-5H6v-2h5V6Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    ),
  },
  {
    label: "Reels",
    to: "/reels",
    icon: (
      <>
        <path
          d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
          fill="currentColor"
          fillOpacity="0.12"
        />
        <path
          d="M10 8.5 16 12l-6 3.5v-7Z"
          fill="currentColor"
          fillRule="evenodd"
        />
      </>
    ),
  },
  {
    label: "Notificari",
    to: "/notifications",
    icon: (
      <path
        d="M12 19.5a2.5 2.5 0 0 1-2.45-2h4.9A2.5 2.5 0 0 1 12 19.5Zm6-5.5V11a6 6 0 1 0-12 0v3l-1.5 2v1h15v-1L18 14Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    ),
  },
  {
    label: "Prieteni",
    to: "/friends",
    icon: (
      <path
        d="M9.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm9 0a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM5 12h4a3 3 0 0 1 3 3v2H2v-2a3 3 0 0 1 3-3Zm10 0h4a3 3 0 0 1 3 3v2h-9v-2a3 3 0 0 1 3-3Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    ),
  },
  {
    label: "Profil",
    to: "/account",
    icon: (
      <path
        d="M12 12.2a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Zm0 2c-3.04 0-5.5 1.6-5.5 3.6V19h11v-1.2c0-2-2.46-3.6-5.5-3.6Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    ),
  },
];

function AppNavigation() {
  const location = useLocation();
  const isActive = (path) => location.pathname.startsWith(path);

  return (
    <div className="app-nav" role="navigation" aria-label="Navigatie rapida">
      <div className="app-nav__shell">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            aria-label={link.label}
            className={`app-nav__pill ${isActive(link.to) ? "is-active" : ""}`}
          >
            <svg className="app-nav__icon" viewBox="0 0 24 24" aria-hidden="true">
              {link.icon}
            </svg>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default AppNavigation;
