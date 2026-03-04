"use client";

import { useEffect, useState } from "react";
import { Droplet } from "lucide-react";

export default function LoadingScreen() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 10;
      });
    }, 150);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="loading-screen">
      <div className="loading-screen__icon-container">
        <div className="loading-screen__icon-ping" />
        <div className="loading-screen__icon-ping-2" />
        <div className="loading-screen__icon-bubble">
          <Droplet />
        </div>
      </div>

      <h1 className="loading-screen__title">PlantsIO</h1>
      <p className="loading-screen__subtitle">
        Système d&apos;irrigation intelligent pour les BGs qui veulent faire
        pousser leurs plantes sans se prendre la tête.
      </p>

      <div className="loading-screen__progress-bar">
        <div
          className="loading-screen__progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      <p className="loading-screen__status">
        Chargement en cours... {progress}%
      </p>
    </div>
  );
}
