import { NgClass, NgStyle } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';

export const VIDEO_ROUNDED_CORNERS = { borderRadius: '4px', overflow: 'hidden' };

export type VideoInfo = {
  element: {
    aspectRatio: number,
    width: number,
    height: number
  }
  video: {
    aspectRatio: number,
    width: number,
    height: number
  }
};

const CNAME = 'StreamVideo';

@Component({
  selector: 'app-stream-video',
  templateUrl: './stream-video.component.html',
  styleUrls: ['./stream-video.component.css'],
  standalone: true,
  imports: [NgStyle, NgClass]
})
export class StreamVideoComponent implements AfterViewInit { //implements AfterViewInit, OnDestroy

  @ViewChild("video") videoRef: ElementRef<HTMLVideoElement> | undefined;

  // https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver
  private observer: ResizeObserver | undefined;

  _mediaStream: MediaStream | undefined;
  @Input() set mediaStream(mediaStream: MediaStream | undefined) {
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|mediaStream`, mediaStream, mediaStream?.getTracks().length);
    }
    this._mediaStream = mediaStream;
    // if (this.videoRef) {
    //   this.videoRef.nativeElement.srcObject = mediaStream;
    // }
  }

  _videoStyle: { [klass: string]: any; } = {
    // minHeight: '100%', minWidth: '100%',
    // width: '99vw', height: '75vw',
    //  maxWidth: '133.34vh', maxHeight: '100vh',
    'object-fit': 'contain',
    ...VIDEO_ROUNDED_CORNERS
  };
  @Input() set videoStyle(style: { [klass: string]: any; }) {
    this._videoStyle = { ...this._videoStyle, ...style };
  }

  _muted = false;
  @Input() set muted(muted: boolean) {
    this._muted = muted;
    // if (this.videoRef) {
    //   this.videoRef.nativeElement.muted = this._muted;
    // }
  }

  _mirror = false;
  @Input() set mirror(mirror: boolean) {
    this._mirror = mirror;
  }

  _fullscreen = false;
  @Input() set fullscreen(fullscreen: boolean) {
    this._fullscreen = fullscreen;
  }

  _sinkId: string;
  @Input() set sinkId(id: string) {
    if (id) {
      this._sinkId = id;
      if (this.videoRef) {
        (this.videoRef.nativeElement as any).setSinkId(id)
      }
    }
  }

  @Output() onInfo = new EventEmitter<VideoInfo>();

  constructor() { }

  ngAfterViewInit() {
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|ngAfterViewInit`, this.videoRef);
    }
    // remote stream is attached to DOM during ngAfterViewInit because @ViewChild is not bound before this stage
    // this.doAttach();

    if (this.videoRef) {

      const videoElement = this.videoRef.nativeElement;

      this.observer = new ResizeObserver((_entries) => {
        const { videoHeight: height, videoWidth: width } = videoElement;
        this.onInfo.emit({
          element: {
            aspectRatio: videoElement.clientWidth / videoElement.clientHeight,
            width: videoElement.clientWidth,
            height: videoElement.clientHeight
          },
          video: { aspectRatio: videoElement.videoWidth / videoElement.videoHeight, width, height }
        })
      });
      this.observer.observe(videoElement);

      const onLoadedData = (ev: Event) => {
        const { videoHeight: height, videoWidth: width } = videoElement;
        if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
          console.debug(`${CNAME}|onLoadedData ${ev.type}`, { height, width }, videoElement, this._mediaStream);
        }
        this.onInfo.emit({
          element: {
            aspectRatio: videoElement.clientWidth / videoElement.clientHeight,
            width: videoElement.clientWidth,
            height: videoElement.clientHeight
          },
          video: { aspectRatio: videoElement.videoWidth / videoElement.videoHeight, width, height }
        })
      }

      videoElement.addEventListener("loadeddata", onLoadedData);
      videoElement.addEventListener("loadedmetadata", onLoadedData);
      videoElement.addEventListener("ratechange", onLoadedData);
      videoElement.addEventListener("resize", onLoadedData);
    }
  }

  // ngOnDestroy(): void {
  //   if (globalThis.logLevel.isDebugEnabled) {
  //     console.debug(`${CNAME}|ngOnDestroy`, this.videoRef);
  //   }
  //   // throw new Error('Method not implemented.');
  //   if (this.videoRef) {
  //     this.videoRef.nativeElement.srcObject = undefined;
  //   }
  // }

  // doAttach() {
  //   if (this.videoRef) {
  //     const video = this.videoRef.nativeElement;
  //     video.srcObject = this._mediaStream;
  //   }
  // }
}