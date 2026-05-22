/**
 * SubjectCarousel — swipe / drag stack, one focused subject, arrows + dots.
 * Depends: progress bar ids (englishCardPct, etc.) rendered inside cards.
 */
window.SubjectCarousel = (function () {
    const SPEECH = {
        english: "Great choice! Let's start English 📚",
        science: "Awesome — Science time! Let's experiment 🔬",
        socialStudies: "Love it! Social Studies — history & geography await 🌍"
    };

    let root;
    let viewport;
    let stack;
    let cards;
    let dots;
    let prevBtn;
    let nextBtn;
    let count = 0;
    let active = 0;
    let dragging = false;
    let startX = 0;
    let dragX = 0;
    let onChangeCb = null;

    function wrapDiff(i, center, n) {
        let d = i - center;
        if (d > n / 2) d -= n;
        if (d < -n / 2) d += n;
        return d;
    }

    function applyLayout(animate) {
        if (!stack || !cards.length) return;

        const w = viewport.getBoundingClientRect().width;
        const peek = Math.min(140, Math.max(64, w * 0.2));

        cards.forEach((card, i) => {
            const d = wrapDiff(i, active, count);
            const isActive = d === 0;
            const isPeek = Math.abs(d) === 1;

            card.classList.toggle("is-active", isActive);
            card.classList.toggle("is-peek", isPeek);
            card.classList.toggle("is-hidden", Math.abs(d) > 1);

            let tx = 0;
            let sc = 1;
            let op = 1;
            let z = 10;

            if (d === 0) {
                tx = dragX;
                sc = 1 - Math.min(0.08, Math.abs(dragX) / 900);
                z = 30;
                op = 1;
            } else if (d === 1) {
                tx = peek + dragX * 0.35;
                sc = 0.88;
                z = 20;
                op = 0.93;
            } else if (d === -1) {
                tx = -peek + dragX * 0.35;
                sc = 0.88;
                z = 20;
                op = 0.93;
            } else {
                tx = d > 0 ? peek * 2.2 : -peek * 2.2;
                sc = 0.75;
                z = 5;
                op = 0;
            }

            if (dragging) {
                card.classList.add("sc-dragging");
            } else {
                card.classList.remove("sc-dragging");
            }

            card.style.zIndex = String(z);
            card.style.opacity = String(op);
            card.style.transform = `translateX(${tx}px) scale(${sc})`;
        });

        if (dots) {
            dots.querySelectorAll(".sc-dot").forEach((dot, i) => {
                const on = i === active;
                dot.classList.toggle("is-active", on);
                dot.setAttribute("aria-selected", on ? "true" : "false");
                dot.tabIndex = on ? 0 : -1;
            });
        }
    }

    function announceSubject() {
        const key = cards[active].dataset.subject;
        if (typeof onChangeCb === "function") {
            onChangeCb(key, active);
        }
        const msg = SPEECH[key];
        if (msg && typeof window.flashTeacherMessage === "function") {
            window.flashTeacherMessage(msg, 6500);
        }
    }

    function navigateTo(index, animate, withSpeech) {
        const idx = ((index % count) + count) % count;
        const changed = idx !== active;
        active = idx;
        dragX = 0;
        applyLayout(animate);
        if (withSpeech && changed) {
            announceSubject();
        }
    }

    function go(delta, animate = true) {
        const next = (active + delta + count) % count;
        if (next === active) return;
        navigateTo(next, animate, true);
    }

    function endDrag() {
        if (!dragging) return;
        dragging = false;
        const threshold = 56;
        const vx = dragX;
        if (vx < -threshold) {
            go(1, true);
        } else if (vx > threshold) {
            go(-1, true);
        } else {
            dragX = 0;
            applyLayout(true);
        }
    }

    function onDown(clientX) {
        dragging = true;
        startX = clientX;
        dragX = 0;
        cards.forEach((c) => c.classList.add("sc-dragging"));
    }

    function onMove(clientX) {
        if (!dragging) return;
        dragX = clientX - startX;
        applyLayout(false);
    }

    function bindPointer() {
        viewport.addEventListener(
            "pointerdown",
            (e) => {
                if (e.button !== 0) return;
                if (e.target.closest(".sc-start")) return;
                if (e.target.closest("button")) return;
                viewport.setPointerCapture(e.pointerId);
                onDown(e.clientX);
            },
            { passive: true }
        );

        viewport.addEventListener("pointermove", (e) => {
            if (!dragging) return;
            onMove(e.clientX);
        });

        viewport.addEventListener("pointerup", (e) => {
            if (viewport.hasPointerCapture(e.pointerId)) {
                viewport.releasePointerCapture(e.pointerId);
            }
            endDrag();
        });

        viewport.addEventListener("pointercancel", () => {
            dragging = false;
            dragX = 0;
            cards.forEach((c) => c.classList.remove("sc-dragging"));
            applyLayout(true);
        });
    }

    function init(opts) {
        root = (opts && opts.root) || document.getElementById("subjectCarousel");
        if (!root) return;

        viewport = root.querySelector(".sc-viewport");
        stack = root.querySelector(".sc-stack");
        prevBtn = root.querySelector(".sc-nav--prev");
        nextBtn = root.querySelector(".sc-nav--next");
        dots = root.querySelector(".sc-dots");
        cards = Array.from(root.querySelectorAll(".sc-card"));
        count = cards.length;
        onChangeCb = opts && opts.onSubjectChange;

        if (!viewport || !stack || count === 0) return;

        navigateTo(Math.min(Math.max(0, opts.startIndex || 0), count - 1), false, false);

        if (prevBtn) {
            prevBtn.addEventListener("click", () => go(-1, true));
        }
        if (nextBtn) {
            nextBtn.addEventListener("click", () => go(1, true));
        }

        if (dots) {
            dots.querySelectorAll(".sc-dot").forEach((dot) => {
                dot.addEventListener("click", () => {
                    const idx = parseInt(dot.dataset.go, 10);
                    if (Number.isNaN(idx) || idx === active) return;
                    navigateTo(idx, true, true);
                });
            });
        }

        cards.forEach((card) => {
            const start = card.querySelector(".sc-start");
            if (start) {
                start.addEventListener("click", (e) => {
                    e.stopPropagation();
                    window.location.href = `subject.html?subject=${encodeURIComponent(card.dataset.subject)}`;
                });
            }
        });

        bindPointer();

        window.addEventListener("resize", () => {
            dragX = 0;
            applyLayout(false);
        });

        /* keyboard when viewport focused */
        root.tabIndex = 0;
        root.addEventListener("keydown", (e) => {
            if (e.key === "ArrowLeft") {
                e.preventDefault();
                go(-1, true);
            } else if (e.key === "ArrowRight") {
                e.preventDefault();
                go(1, true);
            }
        });
    }

    return { init, go: (d) => go(d, true), navigateTo };
})();
