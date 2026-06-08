/**
 * teachingAnimations.js — Educational Animation Clip Library
 *
 * Every entry in TEACHING_CLIPS is a self-contained procedural clip.
 * Clips are pure functions of elapsed time; they return an offset object
 * whose keys are smoothly lerped into gestureSmoothed by updateTeacherBodyAnimation().
 *
 * ─── Available offset keys (all optional, default 0) ───────────────────────
 *  lArmX / rArmX          – upper-arm local Euler X offset (rad)
 *  lArmY / rArmY          – upper-arm local Euler Y offset
 *  lArmZ / rArmZ          – upper-arm local Euler Z offset  ← lateral sway axis
 *  lForeX / rForeX        – forearm X = elbow bend (confirmed working)
 *  lHandX / rHandX        – wrist flex forward/back
 *  lHandZ / rHandZ        – wrist side tilt
 *  lFingerCurl / rFingerCurl  – 0 = flat open palm, 1 = full fist
 *  lIndexOpen / rIndexOpen    – 1 = index fully extended (overrides curl for index)
 *  lMiddleOpen / rMiddleOpen
 *  lRingOpen   / rRingOpen
 *  lPinkyOpen  / rPinkyOpen
 *  mouthOpen                  – jaw open 0–1 (drives mouth morph target)
 *  countHeadNod               – extra head-nod offset in radians (added to tgtHeadX)
 *
 * ─── Public API (available after avatar loads) ─────────────────────────────
 *  window.playAnimation("explaining" | "asking" | "emphasis" | "pointing" |
 *                        "counting"  | "list"   | "vocab")
 *  window.stopAnimation()
 *
 * ─── To tune a clip ────────────────────────────────────────────────────────
 *  Edit the numbers inside the clip's update() function below.
 *  No changes needed in app.js.
 *
 * ─── To test from DevTools console ────────────────────────────────────────
 *  window.playAnimation("explaining")
 *  window.playAnimation("counting", { countTo: 3 })
 *  window.stopAnimation()
 */

// ── Small math helpers (no Three.js dependency needed here) ─────────────────

/** Smooth ease-in-out curve: 0→0, 0.5→0.5, 1→1 */
function _smooth(t) { return t * t * (3 - 2 * t); }

/** Clamp value to [0, 1] */
function _c(v) { return Math.max(0, Math.min(1, v)); }

/** Ramp from 0→1 over `dur` seconds starting at `start` */
function _ramp(t, start, dur) { return _c((t - start) / dur); }

/** Ramp then release: rises over `rDur`, holds, falls after `fallStart` over `fDur` */
function _arc(t, rDur, fallStart, fDur) {
  return _smooth(_ramp(t, 0, rDur)) * (1 - _smooth(_ramp(t, fallStart, fDur)));
}

// ─────────────────────────────────────────────────────────────────────────────

const TEACHING_CLIPS = {

  // ══════════════════════════════════════════════════════════════════════════
  //  EXPLAINING  —  gentle looping arm sway, alive fingers, warm teacher energy
  //  Loop period ≈ 4.5 s
  // ══════════════════════════════════════════════════════════════════════════
  explaining: {
    loop: true,

    // HOW TO TUNE:
    //   Increase sway amplitude (0.18) for wider arm swing.
    //   Increase finger open values for more spread fingers.
    //   Change cycle frequency (1.40) to speed up / slow down the sway.
    update(t) {
      const cycle = t * 1.40;           // ~4.5 s per full sway cycle

      // ── Arms: gentle left-right alternating sway (Z = lateral axis) ──────
      const sway = Math.sin(cycle) * 0.18;

      // ── Forearm: slight elbow pulse with the sway ─────────────────────────
      const elbowPulse = 0.05 + Math.sin(cycle * 0.5) * 0.04;

      // ── Wrist: natural follow-through ─────────────────────────────────────
      const wristL =  Math.sin(cycle + 0.4)  * 0.10;
      const wristR = -Math.sin(cycle + 0.4)  * 0.10;   // opposite phase

      // ── Fingers: each has its own phase so hands look genuinely alive ──────
      // Values are open-override amounts (0 = full curl, 1 = fully extended).
      const lIdx  = _c(0.20 + Math.sin(t * 0.90 + 0.0)  * 0.10);
      const lMid  = _c(0.16 + Math.sin(t * 1.00 + 0.7)  * 0.08);
      const lRing = _c(0.12 + Math.sin(t * 1.20 + 1.4)  * 0.07);
      const lPink = _c(0.09 + Math.sin(t * 0.80 + 2.0)  * 0.06);

      // Right hand mirrors left but offset by half-cycle
      const rIdx  = _c(0.20 + Math.sin(t * 0.90 + Math.PI + 0.0)  * 0.10);
      const rMid  = _c(0.16 + Math.sin(t * 1.00 + Math.PI + 0.7)  * 0.08);
      const rRing = _c(0.12 + Math.sin(t * 1.20 + Math.PI + 1.4)  * 0.07);
      const rPink = _c(0.09 + Math.sin(t * 0.80 + Math.PI + 2.0)  * 0.06);

      return {
        // Arms
        lArmZ:        sway,
        rArmZ:       -sway,
        lForeX:       elbowPulse,
        rForeX:       elbowPulse,
        // Wrists
        lHandX:       wristL,
        rHandX:       wristR,
        lHandZ:       Math.sin(t * 0.70)            * 0.05,
        rHandZ:       Math.sin(t * 0.70 + Math.PI)  * 0.05,
        // Finger curl baseline (slight natural relaxation)
        lFingerCurl:  0.08,
        rFingerCurl:  0.08,
        // Per-finger organic spread
        lIndexOpen:   lIdx,   rIndexOpen:  rIdx,
        lMiddleOpen:  lMid,   rMiddleOpen: rMid,
        lRingOpen:    lRing,  rRingOpen:   rRing,
        lPinkyOpen:   lPink,  rPinkyOpen:  rPink,
        // Voice & head
        mouthOpen:    0.05 + Math.abs(Math.sin(t * 2.80)) * 0.09,
        countHeadNod: Math.sin(t * 0.65) * 0.028,    // ≈ 1.6° gentle nod
      };
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  ASKING  —  forward-reaching open palms, questioning pulse, ~3.5 s loop
  // ══════════════════════════════════════════════════════════════════════════
  asking: {
    loop: true,

    // HOW TO TUNE:
    //   pulse amplitude (0.06) — bigger = more visible forward push.
    //   fingerOpen baseline (0.22) — higher = more open "questioning" hands.
    update(t) {
      const pulse      = Math.sin(t * 1.80) * 0.06;
      const spreadCyc  = Math.sin(t * 1.20) * 0.05;

      // Slightly outward arm spread + elbows bent forward
      const elbowReach = 0.10 + pulse * 0.50;

      // Widely open fingers for an open, welcoming gesture
      const fBase  = 0.22 + Math.sin(t * 1.10) * 0.08;
      const lIdx   = _c(fBase);
      const lMid   = _c(fBase - 0.03);
      const lRing  = _c(fBase - 0.06);
      const lPink  = _c(fBase - 0.09);

      return {
        // Arms spread slightly outward and pulse forward
        lArmZ:        0.10 + pulse,
        rArmZ:       -0.10 - pulse,
        lForeX:       elbowReach,
        rForeX:       elbowReach,
        // Wrists tilt toward student (palms up / open)
        lHandX:       0.18 + pulse * 0.40,
        rHandX:       0.18 + pulse * 0.40,
        lHandZ:       spreadCyc * 0.30,
        rHandZ:      -spreadCyc * 0.30,
        // Relaxed open hands
        lFingerCurl:  0.06,
        rFingerCurl:  0.06,
        lIndexOpen:   lIdx,   rIndexOpen:  lIdx,
        lMiddleOpen:  lMid,   rMiddleOpen: lMid,
        lRingOpen:    lRing,  rRingOpen:   lRing,
        lPinkyOpen:   lPink,  rPinkyOpen:  lPink,
        // Speaking + slight questioning head tilt (headZ is driven by speechType="asking")
        mouthOpen:    0.06 + Math.abs(Math.sin(t * 2.00)) * 0.11,
        countHeadNod: Math.sin(t * 0.80) * 0.035,    // ≈ 2° nod
      };
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  EMPHASIS  —  both arms rise and spread, fingers fan open, 1.8 s one-shot
  // ══════════════════════════════════════════════════════════════════════════
  emphasis: {
    loop: false,
    duration: 1.8,

    // HOW TO TUNE:
    //   Change 0.40 for arm spread width.
    //   Change 0.90 for finger openness at peak.
    //   Change 0.055 for head nod strength (radians).
    update(t) {
      const arc  = Math.sin((t / 1.8) * Math.PI);   // 0 → 1 → 0 over 1.8 s
      const lift = arc * 0.40;                        // arms spread wide at peak

      return {
        // Symmetric spread on both sides
        lArmZ:        lift,
        rArmZ:       -lift,
        lForeX:       arc * 0.35,
        rForeX:       arc * 0.35,
        // Wrists extend (palms push outward/up)
        lHandX:       arc * 0.22,
        rHandX:       arc * 0.22,
        lHandZ:       arc * 0.12,
        rHandZ:      -arc * 0.12,
        // Fingers fan fully open at peak, close on return
        lFingerCurl:  0.04 + (1 - arc) * 0.08,
        rFingerCurl:  0.04 + (1 - arc) * 0.08,
        lIndexOpen:   arc * 0.92,   rIndexOpen:  arc * 0.92,
        lMiddleOpen:  arc * 0.88,   rMiddleOpen: arc * 0.88,
        lRingOpen:    arc * 0.82,   rRingOpen:   arc * 0.82,
        lPinkyOpen:   arc * 0.75,   rPinkyOpen:  arc * 0.75,
        // Strong mouth + nod at peak
        mouthOpen:    arc * 0.28,
        countHeadNod: arc * 0.055,  // ≈ 3.2° nod
      };
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  POINTING  —  right arm extends, only index points, 2.0 s one-shot
  // ══════════════════════════════════════════════════════════════════════════
  pointing: {
    loop: false,
    duration: 2.0,

    // HOW TO TUNE:
    //   ext amplitude (0.32/0.42) — how far the arm reaches out.
    //   rForeX (0.42) — elbow bend depth during point.
    //   rHandX (0.22) — wrist extension toward target.
    update(t) {
      // Rise 0–0.5 s, hold 0.5–1.4 s, release 1.4–2.0 s
      const ext = _arc(t, 0.5, 1.4, 0.6);

      return {
        // Right arm extends to side-forward
        rArmZ:       -ext * 0.32,
        rForeX:       ext * 0.42,
        rHandX:       ext * 0.22,
        // Right hand: index OUT, all others curl in
        rFingerCurl:  ext * 0.72,
        rIndexOpen:   _smooth(_c(t / 0.45)) * (1 - _smooth(_ramp(t, 1.4, 0.6))),
        rMiddleOpen:  0,
        rRingOpen:    0,
        rPinkyOpen:   0,
        // Left hand relaxed and natural
        lForeX:       0.05,
        lHandX:       0.06,
        lFingerCurl:  0.07,
        lIndexOpen:   0.10,
        lMiddleOpen:  0.10,
        lRingOpen:    0.08,
        lPinkyOpen:   0.06,
        // Subtle mouth + nod while pointing
        mouthOpen:    ext * 0.12,
        countHeadNod: ext * 0.025,
      };
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  COUNTING  —  rhythmic beat clip used by playCountingAnimation().
  //  The full fist→finger-opening sequence lives in playCountingAnimation();
  //  this clip just drives the arm BEAT rhythm for the counting phase.
  //  Duration 2.5 s (auto-stop when called directly from __testGesture).
  // ══════════════════════════════════════════════════════════════════════════
  counting: {
    loop: false,
    duration: 2.5,

    update(t) {
      const beat = Math.max(0, Math.sin(t * Math.PI * 1.6));
      return {
        lArmZ:        beat * 0.12,
        lForeX:       beat * 0.35,
        lHandX:       beat * 0.12,
        lFingerCurl:  0.05 + (1 - beat) * 0.20,
        countHeadNod: beat * 0.030,
        mouthOpen:    beat * 0.12,
      };
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  LIST  —  both hands present items outward repeatedly, ~4 s loop
  // ══════════════════════════════════════════════════════════════════════════
  list: {
    loop: true,

    // HOW TO TUNE:
    //   Base spread (0.18) — bigger = arms wider apart.
    //   pulse amplitude (0.08) — bigger = more energetic opening gesture.
    update(t) {
      const pulse    = Math.sin(t * 1.10) * 0.08;
      const wristBob = Math.sin(t * 0.60) * 0.04;

      // Presentation fingers spread wide and pulse together
      const fOpen = _c(0.22 + Math.sin(t * 1.10) * 0.09);

      return {
        // Both arms spread outward symmetrically
        lArmZ:        0.18 + pulse,
        rArmZ:       -0.18 - pulse,
        lForeX:       0.08 + pulse * 0.50,
        rForeX:       0.08 + pulse * 0.50,
        lHandX:       0.14 + wristBob,
        rHandX:       0.14 + wristBob,
        lHandZ:       0.06 + pulse * 0.30,
        rHandZ:      -0.06 - pulse * 0.30,
        // Open presentation hands
        lFingerCurl:  0.04,
        rFingerCurl:  0.04,
        lIndexOpen:   fOpen,       rIndexOpen:  fOpen,
        lMiddleOpen:  fOpen - 0.02, rMiddleOpen: fOpen - 0.02,
        lRingOpen:    fOpen - 0.05, rRingOpen:   fOpen - 0.05,
        lPinkyOpen:   fOpen - 0.09, rPinkyOpen:  fOpen - 0.09,
        mouthOpen:    0.06 + Math.abs(Math.sin(t * 2.40)) * 0.08,
        countHeadNod: Math.sin(t * 0.50) * 0.025,
      };
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  //  VOCAB  —  right arm lifts in presentation gesture, palm open, 2.2 s one-shot
  // ══════════════════════════════════════════════════════════════════════════
  vocab: {
    loop: false,
    duration: 2.2,

    // HOW TO TUNE:
    //   maxLift (0.38) — how high / wide the arm opens.
    //   rForeX (0.28)  — elbow bend for a natural raised gesture.
    //   rHandX (0.28)  — wrist extension (palm faces student at peak).
    update(t) {
      // Rise 0–0.7 s, hold 0.7–1.3 s, return 1.3–2.2 s
      const ext = _arc(t, 0.70, 1.30, 0.90);

      // Finger spread mirrors the arm arc
      const fOpen = ext * 0.88;

      return {
        rArmZ:       -ext * 0.38,      // arm opens outward-upward
        rForeX:       ext * 0.28,      // natural elbow bend
        rHandX:       ext * 0.28,      // palm opens toward student
        rHandZ:      -ext * 0.08,      // slight inward wrist tilt
        // Right hand opens fully
        rFingerCurl:  0.04 + (1 - ext) * 0.10,
        rIndexOpen:   fOpen,
        rMiddleOpen:  fOpen,
        rRingOpen:    fOpen * 0.90,
        rPinkyOpen:   fOpen * 0.80,
        // Left hand stays relaxed and natural
        lForeX:       0.05,
        lHandX:       0.06,
        lFingerCurl:  0.08,
        lIndexOpen:   0.10,
        lMiddleOpen:  0.09,
        lRingOpen:    0.07,
        lPinkyOpen:   0.05,
        // Mouth + head nod
        mouthOpen:    ext * 0.16,
        countHeadNod: ext * 0.032,
      };
    },
  },

};
