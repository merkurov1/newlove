"use client";

import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';

// Local helper: fill a Float32Array with `count` points inside a sphere of given radius.
function fillRandomInSphere(array: Float32Array, radius = 1) {
  for (let i = 0; i < array.length; i += 3) {
    // Generate a random point uniformly inside a sphere.
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = radius * Math.cbrt(Math.random());
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);
    array[i] = x;
    array[i + 1] = y;
    array[i + 2] = z;
  }
  return array;
}

function GlitchParticles(props: any) {
  const ref = useRef<any>();
  const [sphere] = React.useState(() => {
    const data = new Float32Array(5000 * 3);
    return fillRandomInSphere(data, 1.5);
  });

  useFrame((state: any, delta: number) => {
    if (ref.current) {
      ref.current.rotation.x -= delta / 10;
      ref.current.rotation.y -= delta / 15;
      const t = state.clock.getElapsedTime();
      ref.current.scale.x = 1 + Math.sin(t * 10) * 0.02;
    }
  });

  return (
    <group rotation={[0, 0, Math.PI / 4]}>
      <Points ref={ref} positions={sphere} stride={3} frustumCulled={false} {...props}>
        <PointMaterial transparent color="#ff3333" size={0.005} sizeAttenuation depthWrite={false} />
      </Points>
    </group>
  );
}

export default function GlitchCanvas() {
  return (
    <Canvas camera={{ position: [0, 0, 1] }}>
      <GlitchParticles />
    </Canvas>
  );
}
