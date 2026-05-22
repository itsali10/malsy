export function mountSoraPromptPanel(container, scene, onContinue) {
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "sa-sora-panel";
  const h = document.createElement("h3");
  h.className = "sa-sora-title";
  h.textContent = "Sora prompt for this scene";
  const p = document.createElement("p");
  p.className = "sa-sora-hint";
  p.textContent =
    "Paste this into OpenAI Sora to generate your clip. When ready, tap Continue lesson.";
  const pre = document.createElement("pre");
  pre.className = "sa-sora-pre";
  pre.textContent = scene.soraPrompt || "";
  const row = document.createElement("div");
  row.className = "sa-sora-actions";
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "sa-btn-copy";
  copyBtn.textContent = "Copy prompt";
  copyBtn.addEventListener("click", function () {
    const text = scene.soraPrompt || "";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          copyBtn.textContent = "Copied!";
          setTimeout(function () {
            copyBtn.textContent = "Copy prompt";
          }, 2000);
        },
        function () {}
      );
    }
  });
  const cont = document.createElement("button");
  cont.type = "button";
  cont.className = "sa-btn-continue";
  cont.textContent = "Continue lesson";
  cont.addEventListener("click", function () {
    onContinue();
  });
  row.appendChild(copyBtn);
  row.appendChild(cont);
  wrap.appendChild(h);
  wrap.appendChild(p);
  wrap.appendChild(pre);
  wrap.appendChild(row);
  container.appendChild(wrap);
}
