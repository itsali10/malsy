/**
 * Drag stars to targets; lines + fun fact on complete.
 */
export function mountConstellationGame(container, scoreSystem, onComplete) {
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
  const SNAP = 48;

  container.innerHTML = `
    <div class="sa-const-wrap">
      <p class="sa-const-hint">Drag glowing stars onto the faint dots. Lines appear when you finish!</p>
      <div class="sa-const-row">
        <div class="sa-const-sky" id="saCSky">
          <svg class="sa-const-svg" id="saCSvg" xmlns="http://www.w3.org/2000/svg"></svg>
          <div class="sa-const-targets" id="saCTargets"></div>
        </div>
        <div class="sa-const-palette" id="saCPal"><span>Stars</span></div>
      </div>
    </div>
    <div class="sa-const-modal" id="saCModal" hidden>
      <div class="sa-const-modal-in">
        <h3>Orion, the Hunter</h3>
        <p>Three stars in a row are Orion's Belt. Humans have told stories about this pattern for thousands of years!</p>
        <button type="button" id="saCModalBtn">Awesome!</button>
      </div>
    </div>
  `;

  const sky = container.querySelector("#saCSky");
  const targetsEl = container.querySelector("#saCTargets");
  const palette = container.querySelector("#saCPal");
  const svg = container.querySelector("#saCSvg");
  const modal = container.querySelector("#saCModal");
  let placed = 0;
  let finished = false;

  function skyRect() {
    return sky.getBoundingClientRect();
  }

  targets.forEach((t, i) => {
    const dot = document.createElement("div");
    dot.className = "sa-const-dot";
    dot.style.left = t.x * 100 + "%";
    dot.style.top = t.y * 100 + "%";
    targetsEl.appendChild(dot);
  });

  function drawLines() {
    const rect = skyRect();
    const pts = targets.map((_, i) => {
      const el = sky.querySelector('.sa-const-star[data-slot="' + i + '"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left - rect.left + r.width / 2, y: r.top - rect.top + r.height / 2 };
    });
    if (placed < targets.length) {
      svg.innerHTML = "";
      return;
    }
    svg.setAttribute("viewBox", "0 0 " + rect.width + " " + rect.height);
    svg.setAttribute("width", rect.width);
    svg.setAttribute("height", rect.height);
    let d = "";
    linePairs.forEach(([a, b]) => {
      const pa = pts[a],
        pb = pts[b];
      if (pa && pb) d += "M " + pa.x + " " + pa.y + " L " + pb.x + " " + pb.y + " ";
    });
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "sa-const-line");
    svg.innerHTML = "";
    svg.appendChild(path);
  }

  function tryFinish() {
    if (placed < targets.length || finished) return;
    finished = true;
    scoreSystem.addGameComplete();
    requestAnimationFrame(() => {
      drawLines();
      modal.hidden = false;
    });
  }

  container.querySelector("#saCModalBtn").addEventListener("click", () => {
    modal.hidden = true;
    onComplete();
  });

  function makeStar(ix) {
    const star = document.createElement("div");
    star.className = "sa-const-drag";
    star.textContent = "✦";
    star.style.left = "10px";
    star.style.top = 30 + ix * 46 + "px";

    let dragging = false,
      sx,
      sy,
      ox,
      oy;

    star.addEventListener("pointerdown", (e) => {
      if (star.dataset.placed) return;
      e.preventDefault();
      dragging = true;
      star.setPointerCapture(e.pointerId);
      sx = e.clientX;
      sy = e.clientY;
      ox = star.offsetLeft;
      oy = star.offsetTop;
    });
    star.addEventListener("pointermove", (e) => {
      if (!dragging || star.dataset.placed) return;
      star.style.left = ox + (e.clientX - sx) + "px";
      star.style.top = oy + (e.clientY - sy) + "px";
    });
    function end(e) {
      if (!dragging || star.dataset.placed) return;
      dragging = false;
      try {
        star.releasePointerCapture(e.pointerId);
      } catch (_) {}
      const r = star.getBoundingClientRect();
      const cx = r.left + r.width / 2,
        cy = r.top + r.height / 2;
      const rect = skyRect();
      let best = -1,
        bd = Infinity;
      targets.forEach((t, i) => {
        if (sky.querySelector('.sa-const-star[data-slot="' + i + '"]')) return;
        const tx = rect.left + t.x * rect.width,
          ty = rect.top + t.y * rect.height;
        const d = Math.hypot(cx - tx, cy - ty);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      if (best >= 0 && bd < SNAP) {
        const t = targets[best];
        star.classList.remove("sa-const-drag");
        star.classList.add("sa-const-star");
        star.dataset.slot = String(best);
        star.dataset.placed = "1";
        star.style.left = t.x * 100 + "%";
        star.style.top = t.y * 100 + "%";
        star.style.transform = "translate(-50%, -50%)";
        sky.appendChild(star);
        placed++;
        tryFinish();
      }
    }
    star.addEventListener("pointerup", end);
    star.addEventListener("pointercancel", end);
    return star;
  }

  for (let i = 0; i < 5; i++) palette.appendChild(makeStar(i));
  window.addEventListener("resize", () => drawLines(), { passive: true });
}
