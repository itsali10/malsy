import { DEMO_VIDEO_URL } from "./config.js";

/**
 * Plays MP4/WebM. Falls back to demo if local URL fails to load.
 */

export class VideoPlayer {
  constructor() {
    this.video = null;
  }

  mount(container, url) {
    var self = this;
    container.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "sa-video-wrap";
    var v = document.createElement("video");
    v.className = "sa-video";
    v.playsInline = true;
    v.muted = true;
    v.controls = true;
    v.setAttribute("playsinline", "");
    v.preload = "metadata";
    v.src = url || DEMO_VIDEO_URL;

    v.addEventListener("error", function onErr() {
      v.removeEventListener("error", onErr);
      if (v.src.indexOf(DEMO_VIDEO_URL) !== -1) return;
      // Lesson URLs from this app — do not swap to the generic bunny clip
      if (String(v.src).includes("/api/video/")) {
        wrap.innerHTML = "";
        var err = document.createElement("p");
        err.className = "sa-video-missing";
        err.textContent =
          "This Sora clip is missing on the server (output/final/). Go back, tap “Generate lesson videos (Sora)”, or check the server terminal.";
        wrap.appendChild(err);
        return;
      }
      v.src = DEMO_VIDEO_URL;
      v.load();
    });

    wrap.appendChild(v);
    container.appendChild(wrap);
    this.video = v;

    return new Promise(function (resolve) {
      function tryPlay() {
        v.play().catch(function () {});
      }
      v.addEventListener(
        "canplay",
        function () {
          tryPlay();
          resolve(v);
        },
        { once: true }
      );
      v.addEventListener("loadeddata", tryPlay, { once: true });
    });
  }

  onEnded(cb) {
    if (!this.video) {
      cb();
      return;
    }
    this.video.addEventListener(
      "ended",
      function () {
        cb();
      },
      { once: true }
    );
  }

  destroy() {
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute("src");
      this.video.load();
    }
    this.video = null;
  }
}
