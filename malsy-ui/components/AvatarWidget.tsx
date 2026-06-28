'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { VisemeFrame } from '../lib/lesson-audio';

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
const ALL_MOUTH = [
  'viseme_aa','viseme_E','viseme_I','viseme_O','viseme_U',
  'viseme_PP','viseme_FF','viseme_TH','viseme_DD','viseme_kk',
  'viseme_CH','viseme_SS','viseme_nn','viseme_RR','viseme_sil',
  'mouthOpen','jawOpen','Mouth_Open','jaw_open',
];

export default function AvatarWidget() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isTalkingRef = useRef(false);
  // Target viseme values received from dispatchSpeaking
  const targetRef = useRef<Partial<VisemeFrame> & { amp: number }>({ amp: 0 });
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
      }>).detail;

      isTalkingRef.current = d.speaking;
      if (!d.speaking) {
        targetRef.current = { amp: 0 };
      } else {
        targetRef.current = {
          amp: d.amplitude ?? 0,
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

    const camera = new THREE.PerspectiveCamera(35, W / H, 0.01, 100);
    camera.position.set(0, 1.60, 0.90);
    camera.lookAt(new THREE.Vector3(0, 1.55, 0));

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

      if (speaking && (target.amp ?? 0) > 0.02) {
        talkTime += dt;

        // Lerp smoothed values toward targets.
        // Attack (rising): fast so the mouth opens promptly with the audio.
        // Release (falling): slower so consonants and short gaps don't snap shut.
        const ATK = Math.min(1, dt * 28); // ~35 ms rise time
        const REL = Math.min(1, dt * 10); // ~100 ms fall time

        const keys: Array<keyof VisemeFrame> = ['aa','E','O','FF','SS','jaw'];
        for (const k of keys) {
          const tgt = (target[k] ?? 0) as number;
          const cur = smooth[k] ?? 0;
          const alpha = tgt > cur ? ATK : REL;
          smooth[k] = cur + alpha * (tgt - cur);
        }

        const aa  = smooth.aa  ?? 0;
        const E   = smooth.E   ?? 0;
        const O   = smooth.O   ?? 0;
        const FF  = smooth.FF  ?? 0;
        const SS  = smooth.SS  ?? 0;
        const jaw = smooth.jaw ?? 0;

        // Open vowel — jaw drops, lips open wide
        setMorph('viseme_aa',   aa  * 0.95);

        // Front vowel — lips spread, moderate jaw
        setMorph('viseme_E',    E   * 0.85);
        setMorph('viseme_I',    E   * 0.50);   // close front vowel, subtle

        // Round vowel — lips round, moderate jaw
        setMorph('viseme_O',    O   * 0.80);
        setMorph('viseme_U',    O   * 0.55);   // close round vowel

        // Fricatives
        setMorph('viseme_FF',   FF  * 0.70);
        setMorph('viseme_SS',   SS  * 0.80);
        setMorph('viseme_CH',   SS  * 0.50);

        // Overall jaw & mouth open (controls jaw bone / general opening)
        setMorph('jawOpen',     jaw * 0.80);
        setMorph('mouthOpen',   jaw * 0.75);
        setMorph('jaw_open',    jaw * 0.80);
        setMorph('Mouth_Open',  jaw * 0.75);

      } else {
        // Smoothly close mouth when silent
        talkTime = 0;
        const REL = Math.min(1, dt * 10);
        for (const k of ['aa','E','O','FF','SS','jaw']) {
          smooth[k] = (smooth[k] ?? 0) * (1 - REL);
        }
        const jaw = smooth.jaw ?? 0;
        if (jaw < 0.01) {
          closeMouth();
          smoothRef.current = {};
        } else {
          setMorph('jawOpen',    jaw * 0.80);
          setMorph('mouthOpen',  jaw * 0.75);
          setMorph('jaw_open',   jaw * 0.80);
          setMorph('Mouth_Open', jaw * 0.75);
          setMorph('viseme_aa',  (smooth.aa ?? 0) * 0.95);
          setMorph('viseme_E',   (smooth.E  ?? 0) * 0.85);
          setMorph('viseme_O',   (smooth.O  ?? 0) * 0.80);
          setMorph('viseme_FF',  (smooth.FF ?? 0) * 0.70);
          setMorph('viseme_SS',  (smooth.SS ?? 0) * 0.80);
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
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ position:'fixed', bottom:0, right:24, width:320, height:420, pointerEvents:'none', zIndex:100 }}
    />
  );
}
