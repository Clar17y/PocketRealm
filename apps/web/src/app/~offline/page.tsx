import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline — PocketRealm",
};

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0c0a08",
        color: "#e8e8e0",
        fontFamily: "serif",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <img
        src="/icons/icon-96.png"
        alt="PocketRealm"
        width={96}
        height={96}
        style={{ filter: "grayscale(1) opacity(0.6)", marginBottom: "1rem" }}
      />
      <h1
        style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          color: "#d4a84b",
          marginBottom: "0.5rem",
        }}
      >
        You&apos;re Offline
      </h1>
      <p
        style={{
          fontSize: "1rem",
          color: "#8a8878",
          maxWidth: "20rem",
          lineHeight: 1.6,
          marginBottom: "1.5rem",
        }}
      >
        PocketRealm needs a connection to the server. Check your internet and try again.
      </p>
      <a
        href="/"
        style={{
          display: "inline-block",
          padding: "0.625rem 1.5rem",
          borderRadius: "0.5rem",
          backgroundColor: "#d4a84b",
          color: "#0c0a08",
          fontWeight: 600,
          fontSize: "0.875rem",
          textDecoration: "none",
          cursor: "pointer",
        }}
      >
        Retry
      </a>
    </div>
  );
}
