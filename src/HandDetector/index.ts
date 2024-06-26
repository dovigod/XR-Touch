import type { Hand, HandDetector as HandPoseDetector } from "@tensorflow-models/hand-pose-detection";
import { createDetector } from "../tensorflow/detector";
import { setBackendAndEnvFlags } from "../tensorflow/backend";
import { error } from "../utils/console";
import { Camera } from "../Camera";
import { GestureManager } from "../GestureManager";


export class HandDetector {

  private predictionId: number | null = null;
  public detector: HandPoseDetector | null = null;
  public camera: Camera | null = null;
  private initialized: boolean = false;
  public gestureManager: GestureManager

  constructor(gestureManager: GestureManager) {
    this.gestureManager = gestureManager
  }

  async initialize() {
    if (this.initialized) {
      error('Duplicate HandDetector initialization not allowed')
      return null;
    }
    //traps
    const detectorInterceptors = {
      get: (target: HandPoseDetector, prop: string) => {
        return Reflect.get(target, prop)
      },
      set: () => false
    }
    const cameraInterceptors = {
      get: (target: Camera, prop: string) => {
        return Reflect.get(target, prop)
      },
      set: () => false
    }

    // camera
    const camera = new Camera();
    this.camera = new Proxy(camera, cameraInterceptors);
    await Camera.setupCamera({ targetFPS: 60 });

    // wasm-backend
    await setBackendAndEnvFlags({}, '');

    //detector
    const detector = await createDetector();
    this.detector = new Proxy(detector, detectorInterceptors);

    this.initialized = true;
    return this
  }

  async startPrediction() {
    if (!this.initialized) {
      throw new Error('HandPost Detector not initialized')
    }

    const self = this;
    async function frameCb() {
      await self.predict();
      self.predictionId = requestAnimationFrame(frameCb);
    }

    frameCb();
  }

  async pausePrediction() {
    const predictionId = this.predictionId
    if (predictionId) {
      cancelAnimationFrame(predictionId)
      this.predictionId = null;
    }
  }


  private async predict() {
    const camera = this.camera;
    const detector = this.detector;
    if (!camera || !detector || !this.initialized) {
      throw new Error('HandPost Detector not initialized')
    }
    const hands = await detector?.estimateHands(
      camera.video,
      { flipHorizontal: false }
    ).catch(error => {
      return {
        error
      }
    })

    if (!(hands instanceof Array)) {
      detector?.dispose();
      this.detector = null;
      // camera off..
      throw (hands as { error: any }).error
    }
    this.gestureManager.gestures.forEach((gesture) => gesture.determinant(hands))
  }
}