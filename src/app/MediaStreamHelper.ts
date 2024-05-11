// import { SelfieSegmentation } from '@mediapipe/selfie_segmentation'
// import { Camera } from '@mediapipe/camera_utils'

const CNAME = 'MediaStreamHelper';

export type MediaStreamInfo = {
  audio?: {
    capabilities: MediaTrackCapabilities,
    constraints: MediaTrackConstraints,
    settings: MediaTrackSettings
  },
  video?: {
    capabilities: MediaTrackCapabilities,
    constraints: MediaTrackConstraints,
    settings: MediaTrackSettings
  }
}

export class MediaStreamHelper {

  // Audio
  //
  public static disableAudio(mediaStream: MediaStream) {
    mediaStream.getAudioTracks().forEach((track: MediaStreamTrack) => { track.enabled = false; })
  }
  public static enableAudio(mediaStream: MediaStream) {
    mediaStream.getAudioTracks().forEach((track: MediaStreamTrack) => { track.enabled = true; })
  }
  public static isAudioEnabled(mediaStream: MediaStream): boolean {
    for (const track of mediaStream.getAudioTracks()) {
      if (track.enabled) return true;
    }
    return false;
  }

  // Video
  //
  public static disableVideo(mediaStream: MediaStream) {
    mediaStream.getVideoTracks().forEach((track: MediaStreamTrack) => { track.enabled = false; })
  }
  public static enableVideo(mediaStream: MediaStream) {
    mediaStream.getVideoTracks().forEach((track: MediaStreamTrack) => { track.enabled = true; })
  }
  public static isVideoEnabled(mediaStream: MediaStream): boolean {
    for (const track of mediaStream.getVideoTracks()) {
      if (track.enabled) return true;
    }
    return false;
  }

  public static getMediaStreamInfo(mediaStream: MediaStream): MediaStreamInfo {

    const audioTrack = mediaStream.getAudioTracks()[0];
    const videoTrack = mediaStream.getVideoTracks()[0];

    return {
      audio: audioTrack ? {
        capabilities: (typeof audioTrack.getCapabilities === 'function') ? audioTrack.getCapabilities() : {},
        constraints: (typeof audioTrack.getConstraints === 'function') ? audioTrack.getConstraints() : {},
        settings: (typeof audioTrack.getSettings === 'function') ? audioTrack.getSettings() : {},
      } : undefined,
      video: videoTrack ? {
        capabilities: (typeof videoTrack.getCapabilities === 'function') ? videoTrack.getCapabilities() : {},
        constraints: (typeof videoTrack.getConstraints === 'function') ? videoTrack.getConstraints() : {},
        settings: (typeof videoTrack.getSettings === 'function') ? videoTrack.getSettings() : {},
      } : undefined
    };
  }

  // TODO : maybe require to work as diff with currently applied constraints ?
  public static applyConstraints(mediaStream: MediaStream, constraints: MediaStreamConstraints) {
    const promises: Array<Promise<void>> = [];

    if (constraints.audio && typeof constraints.video === 'object') {
      mediaStream.getAudioTracks().forEach((track: MediaStreamTrack) => {
        promises.push(track.applyConstraints(constraints.audio as any))
      })
    }
    if (constraints.video && typeof constraints.video === 'object') {
      mediaStream.getVideoTracks().forEach((track: MediaStreamTrack) => {
        promises.push(track.applyConstraints(constraints.video as any))
      })
    }
    return Promise.all(promises);
  }

  // public static blur(mediaStream: MediaStream): MediaStream {

  //   const width = mediaStream.getVideoTracks()[0].getSettings().width;
  //   const height = mediaStream.getVideoTracks()[0].getSettings().height;

  //   const videoElement = document.createElement('video');
  //   videoElement.srcObject = mediaStream;
  //   videoElement.play();

  //   const canvasElement = document.createElement('canvas');
  //   const canvasCtx = canvasElement.getContext('2d');

  //   const selfieSegmentation = new SelfieSegmentation({
  //     locateFile: (file: any) => {
  //       return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
  //     }
  //   });
  //   selfieSegmentation.setOptions({
  //     modelSelection: 1,
  //   });
  //   if (canvasCtx) {
  //     selfieSegmentation.onResults((results: any) => {
  //       canvasCtx.save();
  //       canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  //       canvasCtx.drawImage(results.segmentationMask, 0, 0,
  //         canvasElement.width, canvasElement.height);

  //       // Only overwrite existing pixels.
  //       canvasCtx.globalCompositeOperation = 'source-in';
  //       canvasCtx.fillStyle = '#00FF00';
  //       canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);

  //       // Only overwrite missing pixels.
  //       canvasCtx.globalCompositeOperation = 'destination-atop';
  //       canvasCtx.drawImage(
  //         results.image, 0, 0, canvasElement.width, canvasElement.height);

  //       canvasCtx.restore();
  //     });

  //   } else {
  //     console.error("canvasCtx is null", canvasCtx)
  //   }

  //   const camera = new Camera(videoElement, {
  //     onFrame: async () => {
  //       await selfieSegmentation.send({ image: videoElement });
  //     },
  //     width: width,
  //     height: height
  //   });
  //   camera.start();

  //   return canvasElement.captureStream();
  // }
}