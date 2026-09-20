// Lifted from LocalMode-AI/LocalMode @ 3ef8bc4 — apps/ui/registry/localmode/local-first/capability-gate/capability-gate.tsx
// (MIT, Copyright (c) 2025 LocalMode).
// Changes: 'use client' and the @/ import aliases removed; shadcn/amber tokens remapped to the carbon identity; the
// default fallback sentence no longer recommends a browser brand; `crossOriginisolated` and `opfs` added to the gateable
// capabilities (this app's two real requirements: threads need isolation, the model cache needs OPFS).
import type { ReactNode } from 'react';
import { useCapabilities } from './use-environment';

import { cn } from './utils';

/**
 * A device feature a {@link CapabilityGate} can require.
 *
 * `camera` / `microphone` gate on media-input AVAILABILITY (secure context +
 * `getUserMedia` present + `enumerateDevices()` reports a device of that
 * kind — detection never prompts). Runtime permission denial is deliberately
 * NOT gated: handle a `getUserMedia` rejection as a recoverable in-app error.
 */
export type GateCapability =
  | 'webgpu'
  | 'wasm'
  | 'webnn'
  | 'simd'
  | 'threads'
  | 'indexeddb'
  | 'opfs'
  | 'webworkers'
  | 'sharedarraybuffer'
  | 'crossOriginisolated'
  | 'camera'
  | 'microphone';

/** Props for {@link CapabilityGate}. */
export interface CapabilityGateProps {
  /** The device capability the children require. */
  requires: GateCapability;
  /** Rendered only when the capability is supported. */
  children: ReactNode;
  /**
   * Rendered when the capability is unsupported. Defaults to a themed notice
   * explaining the requirement.
   */
  fallback?: ReactNode;
  /** Rendered while detection is in flight. Defaults to a muted placeholder. */
  pending?: ReactNode;
  /** Additional class names merged onto the default fallback notice. */
  className?: string;
}

const LABELS: Record<GateCapability, string> = {
  webgpu: 'WebGPU',
  wasm: 'WebAssembly',
  webnn: 'WebNN',
  simd: 'WebAssembly SIMD',
  threads: 'WebAssembly threads',
  indexeddb: 'IndexedDB',
  opfs: 'Private file storage (OPFS)',
  webworkers: 'Web Workers',
  sharedarraybuffer: 'SharedArrayBuffer',
  crossOriginisolated: 'Cross-origin isolation',
  camera: 'Camera',
  microphone: 'Microphone',
};

/**
 * Media-input capabilities get a hardware-oriented fallback sentence (the
 * feature exists in every modern browser — what's missing is the device).
 */
const MEDIA_CAPABILITIES: ReadonlySet<GateCapability> = new Set(['camera', 'microphone']);

/**
 * A true gate: renders its children only when the device meets the stated
 * requirement (via `useCapabilities`), otherwise a `fallback` slot with
 * guidance. Local models have hard device requirements, so gating prevents a
 * broken experience and gives a clear explanation instead.
 *
 * @example
 * ```tsx
 * <CapabilityGate requires="webgpu" fallback={<p>WebGPU required.</p>}>
 *   <FastWebGPUModel />
 * </CapabilityGate>
 * ```
 */
export function CapabilityGate({
  requires,
  children,
  fallback,
  pending,
  className,
}: CapabilityGateProps) {
  const { capabilities, isDetecting } = useCapabilities();
  const label = LABELS[requires];

  if (isDetecting || capabilities == null) {
    return (
      <>
        {pending ?? (
          <div
            role="status"
            aria-busy="true"
            className={cn('ff text-sm text-base-content/70', className)}
          >
            Checking {label} support
          </div>
        )}
      </>
    );
  }

  const supported = Boolean(capabilities.features[requires]);

  if (supported) return <>{children}</>;

  return (
    <>
      {fallback ?? (
        <div
          role="status"
          className={cn('notice notice-warn flex flex-col gap-1 text-sm', className)}
        >
          <span className="font-semibold">{label} is required</span>
          <span className="text-base-content/80">
            {MEDIA_CAPABILITIES.has(requires)
              ? `This feature needs ${label.toLowerCase()} access, but no ${label.toLowerCase()} was detected on this device (or the page is not a secure context).`
              : `This feature needs ${label}, which this browser or device does not provide. A current Chromium, Firefox or Safari release on a recent device does.`}
          </span>
        </div>
      )}
    </>
  );
}
