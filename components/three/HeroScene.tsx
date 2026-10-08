"use client";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AdaptiveDpr, Environment, Float, Lightformer, OrbitControls, RoundedBox, Stars } from "@react-three/drei";
import * as THREE from "three";
import { planetTexture } from "./textures";
import { useInView } from "../ui";

const SUIT = { color: "#eceef2", roughness: 0.5, metalness: 0.05 } as const;

export function Astronaut({ tint = "#ff4a2b" }: { tint?: string }) {
  const arm = (side: 1 | -1, lift: number) => (
    <group position={[side * 0.43, 0.2, 0.02]} rotation={[0, 0, side * lift]}>
      <mesh position={[0, -0.2, 0]}><cylinderGeometry args={[0.1, 0.11, 0.46, 20]} /><meshStandardMaterial {...SUIT} /></mesh>
      <mesh position={[0, -0.47, 0]}><sphereGeometry args={[0.12, 20, 20]} /><meshStandardMaterial color="#d3d7de" roughness={0.6} /></mesh>
    </group>
  );
  const leg = (side: 1 | -1, bend: number) => (
    <group position={[side * 0.18, -0.46, 0]} rotation={[bend, 0, side * 0.1]}>
      <mesh position={[0, -0.26, 0]}><cylinderGeometry args={[0.13, 0.14, 0.56, 20]} /><meshStandardMaterial {...SUIT} /></mesh>
      <mesh position={[0, -0.58, 0.05]}><boxGeometry args={[0.24, 0.16, 0.34]} /><meshStandardMaterial color="#c3c8d0" roughness={0.6} /></mesh>
    </group>
  );
  return (
    <group scale={1.15}>
      <RoundedBox args={[0.62, 0.78, 0.4]} radius={0.18} smoothness={5}><meshStandardMaterial {...SUIT} /></RoundedBox>
      <RoundedBox args={[0.54, 0.7, 0.26]} radius={0.1} smoothness={4} position={[0, 0.02, -0.32]}><meshStandardMaterial color="#cfd3da" roughness={0.55} /></RoundedBox>
      <mesh position={[0, 0.06, 0.205]}><boxGeometry args={[0.3, 0.18, 0.02]} /><meshStandardMaterial color="#14161c" emissive={tint} emissiveIntensity={0.55} /></mesh>
      <mesh position={[-0.08, 0.06, 0.218]}><circleGeometry args={[0.025, 16]} /><meshBasicMaterial color={tint} /></mesh>
      <mesh position={[0, 0.66, 0.02]}><sphereGeometry args={[0.36, 48, 48]} /><meshStandardMaterial {...SUIT} /></mesh>
      <mesh position={[0, 0.66, 0.15]} scale={[0.82, 0.66, 0.62]}>
        <sphereGeometry args={[0.32, 48, 48]} />
        <meshPhysicalMaterial color="#10162b" metalness={1} roughness={0.06} clearcoat={1} envMapIntensity={1.6} />
      </mesh>
      <mesh position={[0, 0.4, 0.04]}><torusGeometry args={[0.2, 0.05, 16, 40]} /><meshStandardMaterial color="#b8bdc7" /></mesh>
      {arm(1, 1.2)}{arm(-1, 0.7)}
      {leg(1, 0.28)}{leg(-1, -0.18)}
    </group>
  );
}

function Studio({ tint }: { tint: string }) {
  return (
    <Environment resolution={256}>
      <Lightformer form="rect" intensity={3.2} color="#fff1e6" position={[3, 3, 4]} scale={[5, 3, 1]} />
      <Lightformer form="rect" intensity={2} color={tint} position={[-4, 0, -2]} scale={[4, 6, 1]} />
      <Lightformer form="ring" intensity={1.5} color="#6f8cff" position={[0, -4, 3]} scale={4} />
    </Environment>
  );
}

function MarsBackdrop() {
  const ref = useRef<THREE.Mesh>(null);
  const map = useMemo(() => planetTexture("mars", 512, 256), []);
  useEffect(() => () => map.dispose(), [map]);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.05; });
  return (
    <group position={[1.5, -0.7, -3.2]} rotation={[0.3, 0, -0.35]}>
      <mesh ref={ref}><sphereGeometry args={[2.1, 64, 64]} /><meshStandardMaterial map={map} roughness={1} /></mesh>
      <mesh scale={1.06}><sphereGeometry args={[2.1, 48, 48]} /><meshBasicMaterial color="#ff7a45" transparent opacity={0.14} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
      <mesh rotation={[1.25, 0.2, 0]}><torusGeometry args={[2.9, 0.012, 12, 160]} /><meshBasicMaterial color="#ff4a2b" transparent opacity={0.65} /></mesh>
    </group>
  );
}

function Rig({ base }: { base: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const narrow = size.width < 520;
    camera.position.set(narrow ? 0 : -0.4, narrow ? 0.1 : 0.2, narrow ? base * 1.25 : base);
    camera.updateProjectionMatrix();
  }, [camera, size.width, base]);
  return null;
}

export default function HeroScene() {
  const [ref, visible] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className="h-full w-full">
      <Canvas frameloop={visible ? "always" : "never"} dpr={[1, 1.75]} camera={{ fov: 38, position: [-0.4, 0.2, 5.4] }} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }} performance={{ min: 0.5 }}>
        <Suspense fallback={null}>
          <Rig base={5.4} />
          <ambientLight intensity={0.25} />
          <directionalLight position={[3, 2, 4]} intensity={2.2} color="#fff0e0" />
          <directionalLight position={[-4, 1, -2]} intensity={1.2} color="#ff5a3a" />
          <Studio tint="#ff4a2b" />
          <MarsBackdrop />
          <Float speed={1.3} rotationIntensity={0.55} floatIntensity={1.1} floatingRange={[-0.12, 0.12]}>
            <group rotation={[0.15, -0.5, 0.25]} position={[-0.35, 0.1, 0]}><Astronaut /></group>
          </Float>
          <Stars radius={30} depth={20} count={900} factor={2.6} saturation={0} fade speed={0.3} />
          <AdaptiveDpr pixelated={false} />
        </Suspense>
      </Canvas>
    </div>
  );
}

/** Draggable astronaut for crew pages; the rim light takes the readiness status colour. */
export function AstronautViewer({ tint }: { tint: string }) {
  const [ref, visible] = useInView<HTMLDivElement>();
  const controls = useRef<{ domElement?: HTMLElement } | null>(null);
  useEffect(() => { if (controls.current?.domElement) controls.current.domElement.style.touchAction = "pan-y"; }, []);
  return (
    <div ref={ref} className="h-full w-full">
      <Canvas frameloop={visible ? "always" : "never"} dpr={[1, 1.75]} camera={{ fov: 36, position: [0, 0.3, 5.6] }} gl={{ antialias: true, alpha: true }} performance={{ min: 0.5 }}>
        <Suspense fallback={null}>
          <ambientLight intensity={0.3} />
          <directionalLight position={[3, 2, 4]} intensity={2} color="#fff0e0" />
          <pointLight position={[-3, 0.5, -2]} intensity={40} color={tint} />
          <Studio tint={tint} />
          <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.7} floatingRange={[-0.08, 0.08]}>
            <group position={[0, -0.1, 0]}><Astronaut tint={tint} /></group>
          </Float>
          <OrbitControls ref={controls as never} enablePan={false} enableZoom={false} enableDamping autoRotate autoRotateSpeed={1.1} minPolarAngle={1.2} maxPolarAngle={1.9} />
          <AdaptiveDpr pixelated={false} />
        </Suspense>
      </Canvas>
    </div>
  );
}
