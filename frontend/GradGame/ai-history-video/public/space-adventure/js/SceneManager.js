import { SCENES, resolveVideoUrl, QUIZ_MAX_POINTS, isDemoFallbackUrl } from "./config.js";
import { VideoPlayer } from "./VideoPlayer.js";
import { mountQuiz } from "./Quiz.js";

export class SceneManager {
  /** @param {(scene: object) => string} [resolveSceneVideoUrl] Per-scene video URL (e.g. Sora manifest from sessionStorage). */
  constructor(rootEl, scoreSystem, ui, resolveSceneVideoUrl) {
    this.root = rootEl;
    this.score = scoreSystem;
    this.ui = ui;
    this.resolveSceneVideoUrl =
      typeof resolveSceneVideoUrl === "function"
        ? resolveSceneVideoUrl
        : function (scene) {
            return resolveVideoUrl(scene.videoUrl);
          };
    this.index = 0;
    this.btnNext = null;
    this.videoPlayer = null;
    this._videoHandled = false;
    this._skipRowEl = null;
  }

  start() {
    this.score.reset();
    this.index = 0;
    this.destroyPlayer();
    this.render();
  }

  destroyPlayer() {
    if (this.videoPlayer) {
      this.videoPlayer.destroy();
      this.videoPlayer = null;
    }
  }

  render() {
    this.destroyPlayer();

    const scene = SCENES[this.index];
    this.ui.setTitle(scene.title);
    this.ui.setGuide(scene.guideText);
    var pct = (this.index / (SCENES.length - 1)) * 100;
    this.ui.setProgress(pct);

    this.root.innerHTML = "";
    if (scene.key === "finale") {
      this.renderFinale();
      return;
    }

    var main = document.createElement("div");
    main.className = "sa-scene-main";

    var videoArea = document.createElement("div");
    videoArea.className = "sa-video-area";
    main.appendChild(videoArea);

    var skipRow = document.createElement("div");
    skipRow.className = "sa-video-skip-row";
    var btnSkip = document.createElement("button");
    btnSkip.type = "button";
    btnSkip.className = "sa-btn-skip";
    btnSkip.textContent = "Skip video";
    skipRow.appendChild(btnSkip);
    main.appendChild(skipRow);
    this._skipRowEl = skipRow;

    this.interactionArea = document.createElement("div");
    this.interactionArea.className = "sa-interaction-area";
    this.interactionArea.hidden = true;
    main.appendChild(this.interactionArea);

    var nav = document.createElement("div");
    nav.className = "sa-scene-nav";
    this.btnNext = document.createElement("button");
    this.btnNext.type = "button";
    this.btnNext.className = "sa-btn-next";
    this.btnNext.textContent = "Next scene";
    this.btnNext.disabled = true;
    var self = this;
    this.btnNext.addEventListener("click", function () {
      self.goNext();
    });
    nav.appendChild(this.btnNext);
    main.appendChild(nav);
    this.root.appendChild(main);

    this._videoHandled = false;
    function finishVideo() {
      if (self._videoHandled) return;
      self._videoHandled = true;
      if (self.videoPlayer && self.videoPlayer.video) {
        self.videoPlayer.video.pause();
      }
      self.afterVideo(scene);
    }
    btnSkip.addEventListener("click", finishVideo);

    var url = this.resolveSceneVideoUrl(scene);
    this.videoPlayer = new VideoPlayer();
    var vp = this.videoPlayer;
    vp.mount(videoArea, url).then(function () {
      if (isDemoFallbackUrl(url)) {
        var warn = document.createElement("p");
        warn.className = "sa-demo-notice";
        warn.setAttribute("role", "note");
        warn.textContent =
          "Placeholder test clip (not Sora). Close the lesson, scroll the welcome screen, and tap “Generate lesson videos (Sora)” — or ensure space_intro.mp4 … space_pair4.mp4 exist in output/final/ on the server.";
        videoArea.insertBefore(warn, videoArea.firstChild);
      }
      vp.onEnded(finishVideo);
    });
  }

  afterVideo(scene) {
    var self = this;
    if (this._skipRowEl) {
      this._skipRowEl.hidden = true;
      this._skipRowEl = null;
    }
    if (!scene.interaction) {
      this.btnNext.disabled = false;
      this.ui.setGuide("When you are ready, tap Next scene.");
      return;
    }
    this.interactionArea.hidden = false;
    var inter = scene.interaction;
    if (inter.type === "quiz") {
      mountQuiz(this.interactionArea, inter.questions, this.score, function () {
        self.btnNext.disabled = false;
        self.ui.setGuide("Nice! Tap Next scene to continue.");
      });
    }
  }

  goNext() {
    this.index++;
    this.render();
  }

  renderFinale() {
    var t = this.score.total;
    var max = QUIZ_MAX_POINTS;
    var msg = "Good job — keep exploring!";
    if (t >= Math.ceil(max * 0.75)) msg = "Amazing Space Explorer!";
    else if (t >= Math.ceil(max * 0.375)) msg = "Nice work — keep studying!";
    var wrap = document.createElement("div");
    wrap.className = "sa-finale";
    var h = document.createElement("h2");
    h.textContent = "Mission complete";
    wrap.appendChild(h);
    var p1 = document.createElement("p");
    p1.className = "sa-finale-score";
    p1.innerHTML = "Your stars: <strong>" + t + "</strong> / " + max;
    wrap.appendChild(p1);
    var p2 = document.createElement("p");
    p2.className = "sa-finale-msg";
    p2.textContent = msg;
    wrap.appendChild(p2);
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sa-btn-restart";
    btn.id = "saRestart";
    btn.textContent = "Start again";
    var self = this;
    btn.addEventListener("click", function () {
      self.start();
    });
    wrap.appendChild(btn);
    this.root.appendChild(wrap);
    this.ui.setProgress(100);
    this.ui.setGuide("Tap Start again to replay the lesson.");
  }
}
