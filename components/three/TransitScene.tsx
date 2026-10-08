"use client";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AdaptiveDpr, Html, Line, OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import { MISSION_DAYS, earthPos, marsPos, shipState } from "@/lib/engine";
import { planetTexture } from "./textures";
import { useInView } from "../ui";

const S = 2.4; // world units per AU
const w = (p: { x: number; y: number }): [number, number, number] => [p.x * S, 0, p.y * S];

function circle(r: number, n = 160): [number, number, number][] {
  return Array.from({ length: n + 1 }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * r * S, 0, Math.sin((i / n) * Math.PI * 2) * r * S]);
}
function path(from: number, to: number, step = 3): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let k = from; k < to; k += step) pts.push(w(shipState(k)));
  pts.push(w(shipState(to)));
  return pts;
}

function Planet({ kind, radius, position, atmosphere, spin = 0.25 }: { kind: "mars" | "earth"; radius: number; position: [number, number, number]; atmosphere: string; spin?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const map = useMemo(() => planetTexture(kind), [kind]);
  useEffect(() => () => map.dispose(), [map]);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * spin; });
  return (
    <group position={position}>
      <mesh ref={ref}>
        <sphereGeometry args={[radius, 48, 48]} />
        <meshStandardMaterial map={map} roughness={0.95} metalness={0} />
      </mesh>
      <mesh scale={1.14}>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshBasicMaterial color={atmosphere} transparent opacity={0.16} side={THREE.BackSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

function Sun() {
  return (
    <group>
      <mesh><sphereGeometry args={[0.3, 32, 32]} /><meshBasicMaterial color="#ffc27a" /></mesh>
      {[0.45, 0.7, 1.05].map((r, i) => (
        <mesh key={r}><sphereGeometry args={[r, 24, 24]} /><meshBasicMaterial color="#ff7a30" transparent opacity={0.16 / (i + 1)} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
      ))}
      <pointLight intensity={32} decay={1.5} color="#ffe0bd" />
    </group>
  );
}

function Craft({ day }: { day: number }) {
  const g = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const a = shipState(day), b = shipState(Math.min(MISSION_DAYS, day + 1)), c = shipState(Math.max(0, day - 1));
  const heading = Math.atan2((b.x - c.x) * S, (b.y - c.y) * S);
  useFrame(({ clock }) => {
    const t = (clock.elapsedTime % 2.2) / 2.2;
    if (ring.current) { ring.current.scale.setScalar(1 + t * 2.6); (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - t); }
  });
  return (
    <group ref={g} position={w(a)} rotation={[0, heading, 0]} scale={1.5}>
      <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.022, 0.026, 0.12, 16]} /><meshStandardMaterial color="#eceef2" metalness={0.5} roughness={0.35} /></mesh>
      <mesh position={[0, 0, 0.09]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.022, 0.06, 16]} /><meshStandardMaterial color="#ff4a2b" emissive="#ff4a2b" emissiveIntensity={0.5} /></mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.07, 0, -0.01]}><boxGeometry args={[0.1, 0.004, 0.06]} /><meshStandardMaterial color="#28408a" metalness={0.8} roughness={0.25} emissive="#162a66" emissiveIntensity={0.5} /></mesh>
      ))}
      <mesh position={[0, 0, -0.07]}><sphereGeometry args={[0.012, 12, 12]} /><meshBasicMaterial color="#ffb08a" /></mesh>
      <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[0.07, 0.078, 40]} /><meshBasicMaterial color="#ff4a2b" transparent depthWrite={false} side={THREE.DoubleSide} /></mesh>
      <Html center position={[0, 0.2, 0]} style={{ pointerEvents: "none" }}><span className="whitespace-nowrap rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-white shadow-lg">Ares-1</span></Html>
    </group>
  );
}

function Label({ children, position, offset = 0.3 }: { children: string; position: [number, number, number]; offset?: number }) {
  return (
    <Html center position={[position[0], position[1] + offset, position[2]]} style={{ pointerEvents: "none" }}>
      <span className="whitespace-nowrap rounded-full border border-line bg-bg/70 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">{children}</span>
    </Html>
  );
}

function Rig() {
  const { camera, size } = useThree();
  useEffect(() => {
    const k = size.width < 520 ? 1.5 : size.width < 900 ? 1.2 : 1;
    camera.position.set(0, 5.4 * k, 5.8 * k);
    camera.updateProjectionMatrix();
  }, [camera, size.width]);
  return null;
}

function World({ day }: { day: number }) {
  const e = w(earthPos(day)), m = w(marsPos(day)), s = w(shipState(day));
  const planned = useMemo(() => path(0, MISSION_DAYS, 4), []);
  const flown = useMemo(() => (day > 0 ? path(0, day, 3) : null), [day]);
  const rings = useMemo(() => [circle(1), circle(1.524)], []);
  return (
    <>
      <ambientLight intensity={0.35} />
      <Sun />
      <Line points={rings[0]} color="#ffffff" opacity={0.16} transparent lineWidth={1} />
      <Line points={rings[1]} color="#ffffff" opacity={0.16} transparent lineWidth={1} />
      <Line points={planned} color="#8c919e" opacity={0.6} transparent lineWidth={1.2} dashed dashSize={0.1} gapSize={0.08} />
      {flown && <Line points={flown} color="#ff4a2b" lineWidth={3} />}
      <Line points={[e, s]} color="#ff7a55" opacity={0.75} transparent lineWidth={1.4} dashed dashSize={0.06} gapSize={0.06} />
      <Planet kind="earth" radius={0.17} position={e} atmosphere="#5aa8ff" />
      <Label position={e} offset={0.32}>Earth</Label>
      <Planet kind="mars" radius={0.13} position={m} atmosphere="#ff8a50" spin={0.18} />
      <Label position={m} offset={0.28}>Mars</Label>
      <Craft day={day} />
      <Stars radius={55} depth={28} count={2200} factor={3.4} saturation={0} fade speed={0.4} />
    </>
  );
}

export default function TransitScene({ day }: { day: number }) {
  const [ref, visible] = useInView<HTMLDivElement>();
  const controls = useRef<{ domElement?: HTMLElement } | null>(null);
  useEffect(() => { if (controls.current?.domElement) controls.current.domElement.style.touchAction = "pan-y"; }, []);
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return (
    <div ref={ref} className="h-full w-full">
      <Canvas frameloop={visible ? "always" : "never"} dpr={[1, 1.75]} camera={{ fov: 42, near: 0.1, far: 200, position: [0, 5.4, 5.8] }} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }} performance={{ min: 0.5 }}>
        <Suspense fallback={null}>
          <Rig />
          <World day={day} />
          <OrbitControls ref={controls as never} makeDefault enablePan={false} enableDamping minDistance={3.5} maxDistance={13} maxPolarAngle={1.5} autoRotate={!reduce} autoRotateSpeed={0.35} />
          <AdaptiveDpr pixelated={false} />
        </Suspense>
      </Canvas>
    </div>
  );
}
