import React from "react";

export default function RocketGuide({ message, compact }) {
  return (
    <div className={`rocket-guide ${compact ? "rocket-guide--compact" : ""}`}>
      <div className="rocket-guide__ship" aria-hidden="true">
        🚀
      </div>
      <div className="rocket-guide__bubble">
        <p>{message}</p>
      </div>
    </div>
  );
}
