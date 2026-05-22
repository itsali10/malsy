/**
 * Space science mini-games: constellation matching + rocket launch puzzle.
 * Calm, discovery-focused — not a stressful test.
 */
(function () {
  function playSoftDing() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.value = 0.08;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      o.stop(ctx.currentTime + 0.16);
    } catch (_) {}
  }

  function playChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = freq;
        g.gain.value = 0.06;
        o.connect(g);
        g.connect(ctx.destination);
        const t = ctx.currentTime + i * 0.08;
        o.start(t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        o.stop(t + 0.36);
      });
    } catch (_) {}
  }

  /**
   * Orion-inspired pattern: 5 targets. Lines drawn on complete.
   */
  function mountConstellation(container) {
    const targets = [
      { x: 0.38, y: 0.22 },
      { x: 0.22, y: 0.48 },
      { x: 0.38, y: 0.5 },
      { x: 0.54, y: 0.48 },
      { x: 0.38, y: 0.78 },
    ];
    const linePairs = [
      [0, 2],
      [1, 2],
      [2, 3],
      [2, 4],
    ];

    container.innerHTML = `
      <div class="sg-constellation-wrap">
        <p class="sg-hint">Drag the glowing stars onto the faint dots. When each one fits, it will glow ✨</p>
        <div class="sg-constellation-row">
          <div class="sg-sky" id="sgSky">
            <svg class="sg-lines" id="sgLines" xmlns="http://www.w3.org/2000/svg"></svg>
            <div class="sg-targets" id="sgTargets"></div>
          </div>
          <div class="sg-palette" id="sgPalette"><span class="sg-palette-label">Stars to place</span></div>
        </div>
      </div>
      <div class="sg-modal" id="sgStoryModal" hidden>
        <div class="sg-modal-inner">
          <h3>Orion, the Hunter</h3>
          <p id="sgStoryText"></p>
          <button type="button" class="sg-modal-close" id="sgStoryClose">Lovely ✨</button>
        </div>
      </div>
    `;

    const sky = container.querySelector("#sgSky");
    const targetsEl = container.querySelector("#sgTargets");
    const palette = container.querySelector("#sgPalette");
    const svgLines = container.querySelector("#sgLines");
    const modal = container.querySelector("#sgStoryModal");
    const storyText = container.querySelector("#sgStoryText");

    const story =
      "This is <strong>Orion</strong>, one of the brightest and best-known constellations. " +
      "Ancient sky-watchers imagined a mighty hunter in these stars. " +
      "The three stars in a row are <strong>Orion’s Belt</strong>. " +
      "On a clear winter night, look up — people have told stories about Orion for thousands of years.";

    const SNAP = 48;
    let placed = 0;

    function skyRect() {
      return sky.getBoundingClientRect();
    }

    targets.forEach((t, i) => {
      const dot = document.createElement("div");
      dot.className = "sg-target-dot";
      dot.dataset.index = String(i);
      dot.style.left = `${t.x * 100}%`;
      dot.style.top = `${t.y * 100}%`;
      targetsEl.appendChild(dot);
    });

    function updateLines() {
      const rect = skyRect();
      const placedStars = targets.map((_, i) => {
        const el = sky.querySelector(`.sg-star-placed[data-slot="${i}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left - rect.left + r.width / 2, y: r.top - rect.top + r.height / 2 };
      });
      if (placed < targets.length) {
        svgLines.innerHTML = "";
        return;
      }
      svgLines.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
      svgLines.setAttribute("width", rect.width);
      svgLines.setAttribute("height", rect.height);
      let d = "";
      linePairs.forEach(([a, b]) => {
        const pa = placedStars[a];
        const pb = placedStars[b];
        if (pa && pb) d += `M ${pa.x} ${pa.y} L ${pb.x} ${pb.y} `;
      });
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("class", "sg-const-line");
      svgLines.innerHTML = "";
      svgLines.appendChild(path);
    }

    function tryComplete() {
      if (placed < targets.length) return;
      playChime();
      requestAnimationFrame(() => {
        updateLines();
        storyText.innerHTML = story;
        modal.hidden = false;
      });
    }

    function makeDraggableStar(index) {
      const star = document.createElement("div");
      star.className = "sg-star-drag";
      star.textContent = "✦";
      star.style.touchAction = "none";
      star.style.left = "12px";
      star.style.top = `${36 + index * 48}px`;

      let startX = 0,
        startY = 0,
        origLeft = 0,
        origTop = 0,
        dragging = false;

      star.addEventListener("pointerdown", (e) => {
        if (star.dataset.placed === "1") return;
        e.preventDefault();
        dragging = true;
        star.setPointerCapture(e.pointerId);
        startX = e.clientX;
        startY = e.clientY;
        origLeft = star.offsetLeft;
        origTop = star.offsetTop;
      });

      star.addEventListener("pointermove", (e) => {
        if (!dragging || star.dataset.placed === "1") return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        star.style.left = `${origLeft + dx}px`;
        star.style.top = `${origTop + dy}px`;
      });

      function endDrag(e) {
        if (!dragging || star.dataset.placed === "1") return;
        dragging = false;
        try {
          star.releasePointerCapture(e.pointerId);
        } catch (_) {}

        const sRect = star.getBoundingClientRect();
        const cx = sRect.left + sRect.width / 2;
        const cy = sRect.top + sRect.height / 2;
        const rect = skyRect();

        let best = -1;
        let bestD = Infinity;
        targets.forEach((t, i) => {
          if (sky.querySelector(`.sg-star-placed[data-slot="${i}"]`)) return;
          const tx = rect.left + t.x * rect.width;
          const ty = rect.top + t.y * rect.height;
          const d = Math.hypot(cx - tx, cy - ty);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });

        if (best >= 0 && bestD < SNAP) {
          star.dataset.placed = "1";
          const t = targets[best];
          star.classList.remove("sg-star-drag");
          star.classList.add("sg-star-placed", "sg-glow");
          star.dataset.slot = String(best);
          star.style.left = `${t.x * 100}%`;
          star.style.top = `${t.y * 100}%`;
          star.style.transform = "translate(-50%, -50%)";
          sky.appendChild(star);
          playSoftDing();
          placed++;
          tryComplete();
        }
      }

      star.addEventListener("pointerup", endDrag);
      star.addEventListener("pointercancel", endDrag);

      return star;
    }

    for (let i = 0; i < 5; i++) palette.appendChild(makeDraggableStar(i));

    container.querySelector("#sgStoryClose").addEventListener("click", () => {
      modal.hidden = true;
    });

    window.addEventListener(
      "resize",
      () => {
        updateLines();
      },
      { passive: true }
    );
  }

  function mountRocket(container) {
    container.innerHTML = `
      <p class="sg-hint">Set <strong>Fuel</strong>, <strong>Power</strong>, and <strong>Launch angle</strong>, then press Launch. Find the sweet spot for orbit 🚀</p>
      <div class="sg-rocket-stage">
        <div class="sg-rocket-viz" id="sgRocketViz">
          <div class="sg-rocket-body" id="sgRocketBody">🚀</div>
          <div class="sg-launchpad"></div>
        </div>
        <div class="sg-controls">
          <label>Fuel ⛽ <span id="sgFuelVal">50</span>%<input type="range" id="sgFuel" min="0" max="100" value="50" /></label>
          <label>Power 🔥 <span id="sgPowerVal">50</span>%<input type="range" id="sgPower" min="0" max="100" value="50" /></label>
          <label>Angle 📐 <span id="sgAngleVal">55</span>°<input type="range" id="sgAngle" min="30" max="85" value="55" /></label>
          <button type="button" class="sg-launch-btn" id="sgLaunch">Launch!</button>
          <p class="sg-launch-msg" id="sgLaunchMsg" aria-live="polite"></p>
        </div>
      </div>
    `;

    const fuel = container.querySelector("#sgFuel");
    const power = container.querySelector("#sgPower");
    const angle = container.querySelector("#sgAngle");
    const fuelVal = container.querySelector("#sgFuelVal");
    const powerVal = container.querySelector("#sgPowerVal");
    const angleVal = container.querySelector("#sgAngleVal");
    const btn = container.querySelector("#sgLaunch");
    const msg = container.querySelector("#sgLaunchMsg");
    const rocket = container.querySelector("#sgRocketBody");

    function sync() {
      fuelVal.textContent = fuel.value;
      powerVal.textContent = power.value;
      angleVal.textContent = angle.value;
    }
    [fuel, power, angle].forEach((el) => el.addEventListener("input", sync));
    sync();

    btn.addEventListener("click", () => {
      msg.textContent = "";
      rocket.classList.remove("sg-fly");
      void rocket.offsetWidth;
      const f = Number(fuel.value);
      const p = Number(power.value);
      const a = Number(angle.value);

      const ok = f >= 45 && p >= 45 && a >= 48 && a <= 68;
      rocket.classList.add("sg-fly");

      setTimeout(() => {
        if (ok) {
          msg.textContent = "You made it to orbit! 🌌 The mission was smooth — great teamwork with your rocket.";
          msg.className = "sg-launch-msg sg-ok";
          playChime();
        } else if (f < 40) {
          msg.textContent = "Not enough fuel to reach orbit. Add more fuel and try again!";
          msg.className = "sg-launch-msg sg-warn";
        } else if (p < 40) {
          msg.textContent = "Engines need more power! Turn up the power slider.";
          msg.className = "sg-launch-msg sg-warn";
        } else {
          msg.textContent = "Trajectory was tricky — adjust the angle (try between 48° and 68°) and balance fuel & power.";
          msg.className = "sg-launch-msg sg-warn";
        }
      }, 600);
    });
  }

  function mount(root) {
    root.innerHTML = `
      <div class="sg-games">
        <section class="sg-card">
          <h3>✨ Constellation matching</h3>
          <div id="sgMountConst"></div>
        </section>
        <section class="sg-card">
          <h3>🚀 Rocket launch puzzle</h3>
          <div id="sgMountRocket"></div>
        </section>
      </div>
    `;
    mountConstellation(root.querySelector("#sgMountConst"));
    mountRocket(root.querySelector("#sgMountRocket"));
  }

  window.SpaceGames = { mount };
})();
