import { SelfieSegmentation } from '@mediapipe/selfie_segmentation'
import { Camera } from '@mediapipe/camera_utils'

const CNAME = 'MediaStreamHelper';

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

  // TODO : maybe require to work as diff with currently applied constraints ?
  // TODO : return a Promise ?
  public static applyConstraints(mediaStream: MediaStream, constraints: MediaStreamConstraints) {
    if (constraints.audio && typeof constraints.video === 'object') {
      mediaStream.getAudioTracks().forEach((track: MediaStreamTrack) => {
        track.applyConstraints(constraints.audio as any)
          .catch(event => {
            if (globalThis.ephemeralVideoLogLevel.isWarnEnabled) {
              console.warn(`${CNAME}|applyConstraints audio error`, event)
            }
          });
      })
    }
    if (constraints.video && typeof constraints.video === 'object') {
      mediaStream.getVideoTracks().forEach((track: MediaStreamTrack) => {
        track.applyConstraints(constraints.video as any)
          .catch(event => {
            if (globalThis.ephemeralVideoLogLevel.isWarnEnabled) {
              console.warn(`${CNAME}|applyConstraints video error`, event)
            }
          });
      })
    }
  }


  public static blur(mediaStream: MediaStream): MediaStream {

    const width = mediaStream.getVideoTracks()[0].getSettings().width;
    const height = mediaStream.getVideoTracks()[0].getSettings().height;

    const videoElement = document.createElement('video');
    videoElement.srcObject = mediaStream;
    videoElement.play();

    const canvasElement = document.createElement('canvas');
    const canvasCtx = canvasElement.getContext('2d');
    //function onResults(results: any) 

    const selfieSegmentation = new SelfieSegmentation({
      locateFile: (file: any) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
      }
    });
    selfieSegmentation.setOptions({
      modelSelection: 1,
    });
    if (canvasCtx) {
      selfieSegmentation.onResults((results: any) => {
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        canvasCtx.drawImage(results.segmentationMask, 0, 0,
          canvasElement.width, canvasElement.height);

        // Only overwrite existing pixels.
        canvasCtx.globalCompositeOperation = 'source-in';
        canvasCtx.fillStyle = '#00FF00';
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);

        // Only overwrite missing pixels.
        //canvasCtx.globalCompositeOperation = 'destination-atop';
        //canvasCtx.drawImage(
        //  results.image, 0, 0, canvasElement.width, canvasElement.height);

        canvasCtx.restore();
      });

    } else {
      console.error("canvasCtx is null", canvasCtx)
    }

    const camera = new Camera(videoElement, {
      onFrame: async () => {
        await selfieSegmentation.send({ image: videoElement });
      },
      width: width,
      height: height
    });
    camera.start();

    return canvasElement.captureStream();
  }
}