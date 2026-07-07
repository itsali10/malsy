'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { VisemeFrame } from '../lib/lesson-audio';
import type { RpmVisemeId, RpmVisemeWeights } from '../lib/viseme-lipsync';

// RPM viseme id → morph target name(s).
//
// This avatar.glb was authored for Unity's Oculus LipSync, so its mouth morph
// targets use the bare Oculus viseme names (`aa`, `PP`, `ih`, …) — NOT the
// Ready-Player-Me `viseme_*` names. We list BOTH so the widget works whether
// the loaded mesh uses Oculus names or RPM names; `setMorph` only writes the
// names that actually exist on the mesh.
//
// Oculus's vowel visemes are `ih`/`oh`/`ou`, which correspond to our RPM
// `I`/`O`/`U`. PP is the lip-together (p/b/m) shape and is mapped on its own so
// the lips truly meet.
const VISEME_NAMES: Record<RpmVisemeId, string[]> = {
  sil: ['sil', 'viseme_sil'],
  PP:  ['PP',  'viseme_PP'],
  FF:  ['FF',  'viseme_FF'],
  TH:  ['TH',  'viseme_TH'],
  DD:  ['DD',  'viseme_DD'],
  kk:  ['kk',  'viseme_kk'],
  CH:  ['CH',  'viseme_CH'],
  SS:  ['SS',  'viseme_SS'],
  nn:  ['nn',  'viseme_nn'],
  RR:  ['RR',  'viseme_RR'],
  aa:  ['aa',  'viseme_aa'],
  E:   ['E',   'viseme_E'],
  I:   ['ih',  'viseme_I'],
  O:   ['oh',  'viseme_O'],
  U:   ['ou',  'viseme_U'],
};

const RPM_IDS: RpmVisemeId[] = ['sil','PP','FF','TH','DD','kk','CH','SS','nn','RR','aa','E','I','O','U'];
const RPM_VOWELS: RpmVisemeId[] = ['aa','E','I','O','U'];
// Per-shape output scaling so clamped morphs read naturally.
const RPM_SCALE: Record<RpmVisemeId, number> = {
  sil: 0,
  PP: 1.0, FF: 0.85, TH: 0.7, DD: 0.6, kk: 0.6, CH: 0.8, SS: 0.85,
  nn: 0.6, RR: 0.7,
  aa: 0.95, E: 0.9, I: 0.85, O: 0.9, U: 0.85,
};

function poseArmsDown(model: THREE.Group) {
  const byName: Record<string, THREE.Bone> = {};
  model.traverse((obj) => {
    const b = obj as THREE.Bone;
    if (b.isBone) byName[b.name] = b;
  });
  model.updateMatrixWorld(true);
  const LEAN = THREE.MathUtils.degToRad(15);
  const sinL = Math.sin(LEAN), cosL = Math.cos(LEAN);
  for (const { upper, hand } of [
    { upper: byName['LeftArm'],  hand: byName['LeftHand']  },
    { upper: byName['RightArm'], hand: byName['RightHand'] },
  ]) {
    if (!upper || !hand) continue;
    const upperPos = new THREE.Vector3(), handPos = new THREE.Vector3();
    upper.getWorldPosition(upperPos);
    hand.getWorldPosition(handPos);
    const current = handPos.clone().sub(upperPos).normalize();
    if (current.lengthSq() < 0.0001) continue;
    const outward = upperPos.x >= 0 ? sinL : -sinL;
    const target  = new THREE.Vector3(outward, -cosL, 0).normalize();
    const worldDelta = new THREE.Quaternion().setFromUnitVectors(current, target);
    const curWorldQ  = new THREE.Quaternion();
    upper.getWorldQuaternion(curWorldQ);
    const newWorldQ  = worldDelta.multiply(curWorldQ);
    if (upper.parent) {
      const parentWorldQ = new THREE.Quaternion();
      upper.parent.getWorldQuaternion(parentWorldQ);
      upper.quaternion.copy(parentWorldQ.invert().multiply(newWorldQ));
    }
    model.updateMatrixWorld(true);
  }
}

const BLINK_SHAPES = ['eyeBlinkLeft','eyeBlinkRight','EyeBlink_L','EyeBlink_R','blink_L','blink_R','blink','Blink'];

// All mouth morph targets we may set — listed so closeMouth() can zero them all.
// Covers Oculus viseme names (this avatar), RPM `viseme_*` names, and the jaw
// morphs. Names that don't exist on the mesh are simply ignored.
const ALL_MOUTH = [
  // Oculus viseme blendshapes (present on this avatar)
  'aa','E','ih','oh','ou','PP','FF','TH','DD','kk','CH','SS','nn','RR','sil',
  // Ready-Player-Me viseme blendshapes (other avatars)
  'viseme_aa','viseme_E','viseme_I','viseme_O','viseme_U',
  'viseme_PP','viseme_FF','viseme_TH','viseme_DD','viseme_kk',
  'viseme_CH','viseme_SS','viseme_nn','viseme_RR','viseme_sil',
  // Jaw / generic mouth-open morphs
  'jawOpen','mouthOpen','Mouth_Open','jaw_open','mouthClose',
];

export default function AvatarWidget({ variant }: { variant?: 'lesson' | 'dashboard' }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isTalkingRef = useRef(false);
  // Target viseme values received from dispatchSpeaking
  const targetRef = useRef<Partial<VisemeFrame> & { amp: number; rpm?: RpmVisemeWeights }>({ amp: 0 });
  // Smoothed viseme values (lerped toward target each frame)
  const smoothRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animId = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let alive = true;

    const W = container.clientWidth;
    const H = container.clientHeight;

    function onTTSEvent(e: Event) {
      const d = (e as CustomEvent<{
        speaking: boolean;
        amplitude?: number;
        visemes?: Partial<VisemeFrame>;
        rpm?: RpmVisemeWeights;
      }>).detail;

      isTalkingRef.current = d.speaking;
      if (!d.speaking) {
        targetRef.current = { amp: 0 };
      } else {
        targetRef.current = {
          amp: d.amplitude ?? 0,
          rpm: d.rpm,
          ...d.visemes,
        };
      }
    }
    window.addEventListener('malsy-tts', onTTSEvent);

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block;';
    container.appendChild(canvas);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff5e8, 0x334455, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(0.8, 2.2, 2.0);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xcce4ff, 0.6);
    fill.position.set(-1.2, 1.0, 0.8);
    scene.add(fill);

    const isDashboard = variant === 'dashboard';
    const camera = new THREE.PerspectiveCamera(isDashboard ? 28 : 35, W / H, 0.01, 100);
    if (isDashboard) {
      // Head-and-shoulders framing for the welcome banner card, full face + hair included
      camera.position.set(0, 1.78, 1.16);
      camera.lookAt(new THREE.Vector3(0, 1.70, 0));
    } else {
      camera.position.set(0, 1.78, 1.38);
      camera.lookAt(new THREE.Vector3(0, 1.70, 0));
    }

    const morphMeshes: THREE.Mesh[] = [];
    let headBone:  THREE.Bone | null = null;
    let spineBone: THREE.Bone | null = null;

    let blinkTimer = 1.5 + Math.random() * 2;
    let blinkPhase = 0, blinkT = 0;
    let idleTime = 0, talkTime = 0;

    function setMorph(name: string, value: number) {
      for (const mesh of morphMeshes) {
        const dict = mesh.morphTargetDictionary as Record<string, number> | undefined;
        const infl = mesh.morphTargetInfluences;
        if (!dict || !infl) continue;
        const i = dict[name];
        if (i !== undefined) infl[i] = Math.max(0, Math.min(1, value));
      }
    }
    function applyBlink(t: number) { for (const n of BLINK_SHAPES) setMorph(n, t); }
    function closeMouth() { for (const n of ALL_MOUTH) setMorph(n, 0); }
    function setViseme(id: RpmVisemeId, value: number) {
      for (const n of VISEME_NAMES[id]) setMorph(n, value);
    }

    const loader = new GLTFLoader();
    loader.load(
      '/avatar.glb',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (gltf: any) => {
        if (!alive) return;
        const model: THREE.Group = gltf.scene;
        scene.add(model);
        model.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
            morphMeshes.push(mesh);
          }
          const bone = obj as THREE.Bone;
          if (bone.isBone) {
            const n = bone.name.toLowerCase();
            if (!headBone  && (n === 'head'  || /mixamorig:head$/.test(n)))  headBone  = bone;
            if (!spineBone && (n === 'spine' || /mixamorig:spine$/.test(n))) spineBone = bone;
          }
        });
        poseArmsDown(model);
        if (isDashboard) model.position.y = 0.14;
      },
      undefined,
      (err: unknown) => console.error('[AvatarWidget] GLB load error', err),
    );

    let lastTs = 0;
    function tick(ts: number) {
      if (!alive) return;
      animId = requestAnimationFrame(tick);

      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      idleTime += dt;

      // ── Blink ──────────────────────────────────────────────
      blinkTimer -= dt;
      if (blinkTimer <= 0 && blinkPhase === 0) { blinkPhase = 1; blinkT = 0; blinkTimer = 3 + Math.random() * 5; }
      if (blinkPhase === 1) { blinkT = Math.min(blinkT + dt / 0.07, 1); applyBlink(blinkT); if (blinkT >= 1) { blinkPhase = 2; blinkT = 0; } }
      else if (blinkPhase === 2) { blinkT = Math.min(blinkT + dt / 0.10, 1); applyBlink(1 - blinkT); if (blinkT >= 1) { blinkPhase = 0; applyBlink(0); } }

      // ── Idle motion ────────────────────────────────────────
      if (headBone) {
        headBone.rotation.y = Math.sin(idleTime * 0.38) * 0.018;
        headBone.rotation.x = Math.sin(idleTime * 0.27 + 1.1) * 0.008;
      }
      if (spineBone) spineBone.rotation.x = Math.sin(idleTime * 1.25) * 0.006;

      // ── Lip sync ───────────────────────────────────────────
      const speaking = isTalkingRef.current;
      const target   = targetRef.current;
      const smooth   = smoothRef.current;

      // Attack (rising): fast so the mouth opens with the first audio frame.
      // Release (falling): faster shut so the mouth does not lag after speech ends.
      const ATK = Math.min(1, dt * 32);
      const REL = Math.min(1, dt * 24);

      const hasRpm = Boolean(target.rpm && Object.keys(target.rpm).length > 0);
      const hasLegacy = (target.aa ?? 0) > 0 || (target.jaw ?? 0) > 0 || (target.FF ?? 0) > 0;

      if (speaking && (target.amp ?? 0) > 0.02 && (hasRpm || hasLegacy)) {
        talkTime += dt;

        if (hasRpm) {
        const rpm = target.rpm!;

        // Smooth every RPM viseme weight + jaw toward target.
        for (const id of RPM_IDS) {
          const tgt = (rpm[id] ?? 0) as number;
          const cur = smooth[id] ?? 0;
          smooth[id] = cur + (tgt > cur ? ATK : REL) * (tgt - cur);
        }
        const jawTgt = rpm.jaw ?? 0;
        smooth.jaw = (smooth.jaw ?? 0) + (jawTgt > (smooth.jaw ?? 0) ? ATK : REL) * (jawTgt - (smooth.jaw ?? 0));

        // closeLevel: how strongly the lips are pressed (bilabial PP).
        const closeLvl = Math.min(1, smooth.PP ?? 0);

        // Apply each viseme. Open shapes (vowels) are suppressed while a
        // closure is active so the lips can actually meet for m/p/b.
        for (const id of RPM_IDS) {
          if (id === 'sil') continue;
          let v = (smooth[id] ?? 0) * (RPM_SCALE[id] ?? 0.7);
          if (RPM_VOWELS.includes(id)) v *= (1 - closeLvl);
          setViseme(id, v);
        }
        // Ensure the lip-together shape reaches full strength.
        setViseme('PP', closeLvl);

        // Jaw is cancelled during a closure so the mouth doesn't hang open.
        const outJaw = (smooth.jaw ?? 0) * (1 - closeLvl);
        // The vowel visemes already open the mouth, so the jaw morph only adds
        // a little extra motion (avoids an exaggerated gape).
        setMorph('jawOpen',    outJaw * 0.35);
        setMorph('mouthOpen',  outJaw * 0.35);
        setMorph('jaw_open',   outJaw * 0.35);
        setMorph('Mouth_Open', outJaw * 0.35);

        } else {
          // Legacy {aa,E,O,FF,SS,jaw} frame fallback.
          const aa = target.aa ?? 0;
          const ee = Math.max(target.E ?? 0, 0);
          const oo = Math.max(target.O ?? 0, 0);
          const ff = target.FF ?? 0;
          const ss = target.SS ?? 0;
          const jaw = target.jaw ?? 0;
          setViseme('aa', aa);
          setViseme('E', ee);
          setViseme('I', ee * 0.85);
          setViseme('O', oo);
          setViseme('U', oo * 0.85);
          setViseme('FF', ff);
          setViseme('SS', ss);
          setMorph('jawOpen', jaw * 0.35);
          setMorph('mouthOpen', jaw * 0.35);
        }

      } else {
        // Smoothly close mouth when silent — fast release to avoid frozen/delayed mouth.
        talkTime = 0;
        const REL_FAST = Math.min(1, dt * 24);
        let maxV = 0;
        for (const id of RPM_IDS) {
          const v = (smooth[id] ?? 0) * (1 - REL_FAST);
          smooth[id] = v;
          if (v > maxV) maxV = v;
        }
        smooth.jaw = (smooth.jaw ?? 0) * (1 - REL_FAST);

        if ((smooth.jaw ?? 0) < 0.005 && maxV < 0.005) {
          closeMouth();
          smoothRef.current = {};
        } else {
          const closeLvl = Math.min(1, smooth.PP ?? 0);
          for (const id of RPM_IDS) {
            if (id === 'sil') continue;
            let v = (smooth[id] ?? 0) * (RPM_SCALE[id] ?? 0.7);
            if (RPM_VOWELS.includes(id)) v *= (1 - closeLvl);
            setViseme(id, v);
          }
          const outJaw = (smooth.jaw ?? 0) * (1 - closeLvl);
          setMorph('jawOpen',    outJaw * 0.35);
          setMorph('mouthOpen',  outJaw * 0.35);
          setMorph('jaw_open',   outJaw * 0.35);
          setMorph('Mouth_Open', outJaw * 0.35);
        }
      }

      renderer!.render(scene, camera);
    }

    animId = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(animId);
      renderer?.dispose();
      renderer = null;
      window.removeEventListener('malsy-tts', onTTSEvent);
      while (container.firstChild) container.removeChild(container.firstChild);
    };
  }, [variant]);

  const inline = variant === 'lesson' || variant === 'dashboard';
  const className =
    variant === 'dashboard' ? 'dashboard-avatar teacher-avatar avatar-widget-embedded'
    : variant === 'lesson' ? 'avatar-widget-embedded'
    : undefined;

  return (
    <div
      ref={containerRef}
      className={className}
      style={inline ? undefined : {
        position: 'fixed', bottom: 0, right: 24, width: 320, height: 420,
        pointerEvents: 'none', zIndex: 100,
      }}
    />
  );
}
