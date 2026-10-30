// 类型声明：src/domain/webm.cjs（内置 WebM 复用器，运行时仍是 CommonJS）
export interface WebmFrame {
  /** VP8 关键帧负载 */
  data: Uint8Array;
  /** 相对起始的毫秒时间码（0..32767） */
  timestampMs: number;
}

export interface WebmOptions {
  width: number;
  height: number;
  fps: number;
  frames: WebmFrame[];
  /** 容器格式排查用变体开关 */
  noDuration?: boolean;
  omitInfo?: boolean;
  docTypeV4?: boolean;
  unknownSegment?: boolean;
}

/** 返回独立 ArrayBuffer 支撑的 Uint8Array（可直接作为 BlobPart） */
export function buildWebM(opts: WebmOptions): Uint8Array<ArrayBuffer>;
