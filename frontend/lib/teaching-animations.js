// Educational animation clip library — ported from test2/teachingAnimations.js
// Each clip is a pure function of elapsed time returning gestureSmoothed offset keys.

function _smooth(t) { return t * t * (3 - 2 * t); }
function _c(v) { return Math.max(0, Math.min(1, v)); }
function _ramp(t, start, dur) { return _c((t - start) / dur); }
function _arc(t, rDur, fallStart, fDur) {
  return _smooth(_ramp(t, 0, rDur)) * (1 - _smooth(_ramp(t, fallStart, fDur)));
}

export const TEACHING_CLIPS = {

  explaining: {
    loop: true,
    update(t) {
      const cycle = t * 1.40;
      const sway = Math.sin(cycle) * 0.18;
      const elbowPulse = 0.05 + Math.sin(cycle * 0.5) * 0.04;
      const wristL =  Math.sin(cycle + 0.4) * 0.10;
      const wristR = -Math.sin(cycle + 0.4) * 0.10;
      const lIdx  = _c(0.20 + Math.sin(t * 0.90 + 0.0) * 0.10);
      const lMid  = _c(0.16 + Math.sin(t * 1.00 + 0.7) * 0.08);
      const lRing = _c(0.12 + Math.sin(t * 1.20 + 1.4) * 0.07);
      const lPink = _c(0.09 + Math.sin(t * 0.80 + 2.0) * 0.06);
      const rIdx  = _c(0.20 + Math.sin(t * 0.90 + Math.PI + 0.0) * 0.10);
      const rMid  = _c(0.16 + Math.sin(t * 1.00 + Math.PI + 0.7) * 0.08);
      const rRing = _c(0.12 + Math.sin(t * 1.20 + Math.PI + 1.4) * 0.07);
      const rPink = _c(0.09 + Math.sin(t * 0.80 + Math.PI + 2.0) * 0.06);
      return {
        lArmZ: sway, rArmZ: -sway,
        lForeX: elbowPulse, rForeX: elbowPulse,
        lHandX: wristL, rHandX: wristR,
        lHandZ: Math.sin(t * 0.70) * 0.05,
        rHandZ: Math.sin(t * 0.70 + Math.PI) * 0.05,
        lFingerCurl: 0.08, rFingerCurl: 0.08,
        lIndexOpen: lIdx, rIndexOpen: rIdx,
        lMiddleOpen: lMid, rMiddleOpen: rMid,
        lRingOpen: lRing, rRingOpen: rRing,
        lPinkyOpen: lPink, rPinkyOpen: rPink,
        mouthOpen: 0.05 + Math.abs(Math.sin(t * 2.80)) * 0.09,
        countHeadNod: Math.sin(t * 0.65) * 0.028,
      };
    },
  },

  asking: {
    loop: true,
    update(t) {
      const pulse = Math.sin(t * 1.80) * 0.06;
      const spreadCyc = Math.sin(t * 1.20) * 0.05;
      const elbowReach = 0.10 + pulse * 0.50;
      const fBase = 0.22 + Math.sin(t * 1.10) * 0.08;
      const lIdx  = _c(fBase);
      const lMid  = _c(fBase - 0.03);
      const lRing = _c(fBase - 0.06);
      const lPink = _c(fBase - 0.09);
      return {
        lArmZ: 0.10 + pulse, rArmZ: -0.10 - pulse,
        lForeX: elbowReach, rForeX: elbowReach,
        lHandX: 0.18 + pulse * 0.40, rHandX: 0.18 + pulse * 0.40,
        lHandZ: spreadCyc * 0.30, rHandZ: -spreadCyc * 0.30,
        lFingerCurl: 0.06, rFingerCurl: 0.06,
        lIndexOpen: lIdx, rIndexOpen: lIdx,
        lMiddleOpen: lMid, rMiddleOpen: lMid,
        lRingOpen: lRing, rRingOpen: lRing,
        lPinkyOpen: lPink, rPinkyOpen: lPink,
        mouthOpen: 0.06 + Math.abs(Math.sin(t * 2.00)) * 0.11,
        countHeadNod: Math.sin(t * 0.80) * 0.035,
      };
    },
  },

  emphasis: {
    loop: false, duration: 1.8,
    update(t) {
      const arc = Math.sin((t / 1.8) * Math.PI);
      const lift = arc * 0.40;
      return {
        lArmZ: lift, rArmZ: -lift,
        lForeX: arc * 0.35, rForeX: arc * 0.35,
        lHandX: arc * 0.22, rHandX: arc * 0.22,
        lHandZ: arc * 0.12, rHandZ: -arc * 0.12,
        lFingerCurl: 0.04 + (1 - arc) * 0.08, rFingerCurl: 0.04 + (1 - arc) * 0.08,
        lIndexOpen: arc * 0.92, rIndexOpen: arc * 0.92,
        lMiddleOpen: arc * 0.88, rMiddleOpen: arc * 0.88,
        lRingOpen: arc * 0.82, rRingOpen: arc * 0.82,
        lPinkyOpen: arc * 0.75, rPinkyOpen: arc * 0.75,
        mouthOpen: arc * 0.28,
        countHeadNod: arc * 0.055,
      };
    },
  },

  pointing: {
    loop: false, duration: 2.0,
    update(t) {
      const ext = _arc(t, 0.5, 1.4, 0.6);
      return {
        rArmZ: -ext * 0.32, rForeX: ext * 0.42, rHandX: ext * 0.22,
        rFingerCurl: ext * 0.72,
        rIndexOpen: _smooth(_c(t / 0.45)) * (1 - _smooth(_ramp(t, 1.4, 0.6))),
        rMiddleOpen: 0, rRingOpen: 0, rPinkyOpen: 0,
        lForeX: 0.05, lHandX: 0.06, lFingerCurl: 0.07,
        lIndexOpen: 0.10, lMiddleOpen: 0.10, lRingOpen: 0.08, lPinkyOpen: 0.06,
        mouthOpen: ext * 0.12,
        countHeadNod: ext * 0.025,
      };
    },
  },

  counting: {
    loop: false, duration: 2.5,
    update(t) {
      const beat = Math.max(0, Math.sin(t * Math.PI * 1.6));
      return {
        lArmZ: beat * 0.12, lForeX: beat * 0.35, lHandX: beat * 0.12,
        lFingerCurl: 0.05 + (1 - beat) * 0.20,
        countHeadNod: beat * 0.030,
        mouthOpen: beat * 0.12,
      };
    },
  },

  list: {
    loop: true,
    update(t) {
      const pulse = Math.sin(t * 1.10) * 0.08;
      const wristBob = Math.sin(t * 0.60) * 0.04;
      const fOpen = _c(0.22 + Math.sin(t * 1.10) * 0.09);
      return {
        lArmZ: 0.18 + pulse, rArmZ: -0.18 - pulse,
        lForeX: 0.08 + pulse * 0.50, rForeX: 0.08 + pulse * 0.50,
        lHandX: 0.14 + wristBob, rHandX: 0.14 + wristBob,
        lHandZ: 0.06 + pulse * 0.30, rHandZ: -0.06 - pulse * 0.30,
        lFingerCurl: 0.04, rFingerCurl: 0.04,
        lIndexOpen: fOpen, rIndexOpen: fOpen,
        lMiddleOpen: fOpen - 0.02, rMiddleOpen: fOpen - 0.02,
        lRingOpen: fOpen - 0.05, rRingOpen: fOpen - 0.05,
        lPinkyOpen: fOpen - 0.09, rPinkyOpen: fOpen - 0.09,
        mouthOpen: 0.06 + Math.abs(Math.sin(t * 2.40)) * 0.08,
        countHeadNod: Math.sin(t * 0.50) * 0.025,
      };
    },
  },

  vocab: {
    loop: false, duration: 2.2,
    update(t) {
      const ext = _arc(t, 0.70, 1.30, 0.90);
      const fOpen = ext * 0.88;
      return {
        rArmZ: -ext * 0.38, rForeX: ext * 0.28, rHandX: ext * 0.28, rHandZ: -ext * 0.08,
        rFingerCurl: 0.04 + (1 - ext) * 0.10,
        rIndexOpen: fOpen, rMiddleOpen: fOpen, rRingOpen: fOpen * 0.90, rPinkyOpen: fOpen * 0.80,
        lForeX: 0.05, lHandX: 0.06, lFingerCurl: 0.08,
        lIndexOpen: 0.10, lMiddleOpen: 0.09, lRingOpen: 0.07, lPinkyOpen: 0.05,
        mouthOpen: ext * 0.16,
        countHeadNod: ext * 0.032,
      };
    },
  },
};
