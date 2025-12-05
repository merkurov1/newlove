"use client";

import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import * as random from 'maath/random/dist/maath-random.esm';

function GlitchParticles(props: any) {
  const ref = useRef<any>();
  const [sphere] = React.useState(() => {
    const data = new Float32Array(5000 * 3);
    return random.inSphere(data, { radius: 1.5 });
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
