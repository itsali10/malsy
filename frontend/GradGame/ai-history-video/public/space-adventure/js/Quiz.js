export function mountQuiz(container, questions, scoreSystem, onAllDone) {
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "sa-quiz";
  let idx = 0;
  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }
  function next() {
    if (idx >= questions.length) {
      onAllDone();
      return;
    }
    const item = questions[idx];
    wrap.innerHTML = "";
    const pq = document.createElement("p");
    pq.className = "sa-quiz-q";
    pq.innerHTML = esc(item.q);
    const opts = document.createElement("div");
    opts.className = "sa-quiz-opts";
    const fb = document.createElement("p");
    fb.className = "sa-quiz-feedback";
    fb.hidden = true;
    item.options.forEach((opt, j) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sa-quiz-btn";
      b.textContent = opt;
      b.addEventListener("click", () => {
        if (b.disabled) return;
        opts.querySelectorAll("button").forEach((x) => (x.disabled = true));
        const ok = j === item.correctIndex;
        fb.hidden = false;
        if (ok) {
          fb.className = "sa-quiz-feedback sa-ok";
          fb.textContent = "Great job!";
          scoreSystem.addQuizCorrect();
        } else {
          fb.className = "sa-quiz-feedback sa-bad";
          fb.textContent = "Not quite — " + (item.hint || "Keep going!");
        }
        setTimeout(() => {
          idx++;
          next();
        }, ok ? 900 : 1400);
      });
      opts.appendChild(b);
    });
    wrap.appendChild(pq);
    wrap.appendChild(opts);
    wrap.appendChild(fb);
  }
  next();
  container.appendChild(wrap);
}
