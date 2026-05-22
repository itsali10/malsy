export function mountRocketPuzzle(container, scoreSystem, onComplete) {
  container.innerHTML =
    '<div class="sa-rocket-game">' +
    '<p class="sa-rocket-hint">Set fuel and angle for a smooth ride to <strong>Earth orbit</strong>!</p>' +
    '<div class="sa-rocket-stage">' +
    '<div class="sa-rocket-viz" id="saRkViz"><div class="sa-rocket-sprite" id="saRkBody">🚀</div><div class="sa-launchpad"></div></div>' +
    '<div class="sa-rocket-controls">' +
    '<label>Fuel <span id="saRkFuelV">55</span>% <input type="range" id="saRkFuel" min="0" max="100" value="55" /></label>' +
    '<p class="sa-angle-label">Launch angle</p><div class="sa-angle-btns" id="saRkAngles"></div>' +
    '<button type="button" class="sa-btn-launch" id="saRkLaunch">Launch!</button>' +
    '<p class="sa-rocket-msg" id="saRkMsg"></p></div></div></div>';

  const angles = [35, 45, 55, 65];
  let selectedAngle = 55;
  const fuel = container.querySelector("#saRkFuel");
  const fuelV = container.querySelector("#saRkFuelV");
  const body = container.querySelector("#saRkBody");
  const msg = container.querySelector("#saRkMsg");
  const angleWrap = container.querySelector("#saRkAngles");

  angles.forEach((a) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sa-angle-btn" + (a === selectedAngle ? " active" : "");
    b.textContent = a + "\u00b0";
    b.addEventListener("click", () => {
      selectedAngle = a;
      angleWrap.querySelectorAll(".sa-angle-btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
    });
    angleWrap.appendChild(b);
  });

  fuel.addEventListener("input", () => {
    fuelV.textContent = fuel.value;
  });

  let done = false;
  container.querySelector("#saRkLaunch").addEventListener("click", () => {
    if (done) return;
    msg.textContent = "";
    msg.className = "sa-rocket-msg";
    body.classList.remove("sa-shake", "sa-fly");
    void body.offsetWidth;
    const f = Number(fuel.value);
    const ok = f >= 45 && f <= 85 && selectedAngle >= 45 && selectedAngle <= 60;
    if (ok) {
      let n = 3;
      msg.textContent = "Countdown\u2026";
      const t = setInterval(() => {
        msg.textContent = n > 0 ? String(n) : "Liftoff!";
        if (n === 0) {
          clearInterval(t);
          body.classList.add("sa-fly");
          scoreSystem.addGameComplete();
          done = true;
          setTimeout(() => onComplete(), 1200);
        }
        n--;
      }, 700);
    } else {
      body.classList.add("sa-shake");
      msg.textContent = "Try more fuel (45-85%) and angle 45-60 degrees!";
      msg.className = "sa-rocket-msg sa-bad";
    }
  });
}
