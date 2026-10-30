// 类型声明：src/domain/magnify.cjs（运行时仍是 CommonJS，本文件仅提供契约）
export interface MagnifyOptions {
  /** 放大倍数 */
  gain: number;
  /** 快时间常数（一阶低通 alpha，∈(0,1]），默认 0.6 */
  alphaFast?: number;
  /** 慢时间常数，默认 0.1 */
  alphaSlow?: number;
}

export function lowpass(series: Float32Array, alpha: number): Float32Array;
export function magnifyPixel(series: Float32Array, opts: MagnifyOptions): Float32Array;
export function magnify(frames: Float32Array[], W: number, H: number, opts: MagnifyOptions): Float32Array[];
export function alphaForCyclePeriod(T: number): number;
